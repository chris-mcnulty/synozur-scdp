import { storage } from "../storage.js";
import { escapeQbo, buildInvoicePayload, buildBillPayload, type QboInvoiceInput, type QboInvoiceLine, type QboBillInput, type QboBillLine } from "./quickbooks-mapping.js";

// Re-export the pure mapping helpers so existing importers (routes) keep a
// single import surface.
export { escapeQbo, computeDueDateIso, buildInvoicePayload, buildBillPayload } from "./quickbooks-mapping.js";
export type { QboInvoiceInput, QboInvoiceLine, QboBillInput, QboBillLine } from "./quickbooks-mapping.js";

// Thin QuickBooks Online (Intuit) API client.
//
// Per the integration plan (docs/design/quickbooks-integration-plan.md), the
// server-side sync uses direct Intuit OAuth with per-tenant tokens stored in
// `quickbooks_connections.settings`. The method surface intentionally mirrors
// the QuickBooks MCP tool set (query / upsert / void) so an agentic assistant
// can be layered on later without changing callers.

const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const MINOR_VERSION = "70";

const TOKEN_ENDPOINT = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const PROD_API_BASE = "https://quickbooks.api.intuit.com";
const SANDBOX_API_BASE = "https://sandbox-quickbooks.api.intuit.com";

export const QBO_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
export const QBO_SCOPE = "com.intuit.quickbooks.accounting";
export const QBO_REVOKE_ENDPOINT = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";

export function getQuickbooksPlatformCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("QuickBooks platform credentials (QBO_CLIENT_ID / QBO_CLIENT_SECRET) are not configured");
  }
  return { clientId, clientSecret };
}

export function isQuickbooksPlatformConfigured(): boolean {
  return !!(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET);
}

interface QboContext {
  accessToken: string;
  realmId: string;
  apiBase: string;
}

export async function isQuickbooksConnected(tenantId: string): Promise<boolean> {
  const connection = await storage.getQuickbooksConnection(tenantId);
  const settings = (connection?.settings || {}) as Record<string, any>;
  return !!(connection?.realmId && settings.accessToken && settings.refreshToken);
}

async function refreshTokenIfNeeded(tenantId: string): Promise<string> {
  const connection = await storage.getQuickbooksConnection(tenantId);
  if (!connection) {
    throw new Error("QuickBooks is not configured for this organization");
  }
  const settings = (connection.settings || {}) as Record<string, any>;
  if (!settings.accessToken || !settings.refreshToken) {
    throw new Error("QuickBooks is not connected for this organization. Please connect via Organization Settings.");
  }

  if ((settings.expiresAt || 0) > Date.now() + REFRESH_BUFFER_MS) {
    return settings.accessToken;
  }

  console.log(`[QuickBooks] Refreshing token for tenant ${tenantId}`);
  const { clientId, clientSecret } = getQuickbooksPlatformCredentials();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: settings.refreshToken,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[QuickBooks] Token refresh failed for tenant ${tenantId}:`, errText);
    throw new Error("QuickBooks token refresh failed. Please reconnect in Organization Settings.");
  }

  const data = (await response.json()) as any;

  // Intuit rotates the refresh token; persist whichever it returns.
  await storage.upsertQuickbooksConnection({
    tenantId,
    realmId: connection.realmId,
    sandbox: connection.sandbox,
    settings: {
      ...settings,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || settings.refreshToken,
      expiresAt: Date.now() + (data.expires_in * 1000),
    },
  });

  return data.access_token;
}

async function getContext(tenantId: string): Promise<QboContext> {
  const connection = await storage.getQuickbooksConnection(tenantId);
  if (!connection?.realmId) {
    throw new Error("QuickBooks is not connected for this organization.");
  }
  const accessToken = await refreshTokenIfNeeded(tenantId);
  return {
    accessToken,
    realmId: connection.realmId,
    apiBase: connection.sandbox ? SANDBOX_API_BASE : PROD_API_BASE,
  };
}

/** Surface Intuit's structured fault as a readable error. */
function describeQboError(status: number, body: any): string {
  const fault = body?.Fault || body?.fault;
  const err = fault?.Error?.[0] || fault?.error?.[0];
  if (err) {
    const code = err.code || err.Code;
    const detail = err.Detail || err.detail || err.Message || err.message;
    if (code === "3100" || status === 403) {
      return `QuickBooks rejected the request (403/3100 ApplicationAuthorizationFailed). This usually means the connection is pointed at the wrong environment — check the sandbox vs. production setting. (${detail || ""})`;
    }
    return `QuickBooks error ${code || status}: ${detail || "unknown"}`;
  }
  return `QuickBooks request failed with HTTP ${status}`;
}

async function qboRequest(
  ctx: QboContext,
  method: string,
  path: string,
  body?: any,
  extraParams: Record<string, string> = {},
): Promise<any> {
  const url = new URL(`${ctx.apiBase}/v3/company/${ctx.realmId}/${path}`);
  url.searchParams.set("minorversion", MINOR_VERSION);
  for (const [k, v] of Object.entries(extraParams)) url.searchParams.set(k, v);

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let parsed: any = undefined;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }

  if (!response.ok) {
    throw new Error(describeQboError(response.status, parsed));
  }
  return parsed;
}

// ============================================================================
// Read paths (used by the mapping manager UI)
// ============================================================================

export async function queryQbo(tenantId: string, query: string): Promise<any[]> {
  const ctx = await getContext(tenantId);
  const result = await qboRequest(ctx, "GET", "query", undefined, { query });
  const response = result?.QueryResponse || {};
  // QueryResponse keys are entity names (Customer, Item, Account, ...).
  for (const key of Object.keys(response)) {
    if (Array.isArray(response[key])) return response[key];
  }
  return [];
}

export async function listQboCustomers(tenantId: string, search?: string): Promise<any[]> {
  const where = search ? ` WHERE DisplayName LIKE '%${escapeQbo(search)}%'` : "";
  return queryQbo(tenantId, `SELECT * FROM Customer${where} ORDERBY DisplayName MAXRESULTS 100`);
}

export async function listQboItems(tenantId: string): Promise<any[]> {
  return queryQbo(tenantId, "SELECT * FROM Item WHERE Active = true ORDERBY Name MAXRESULTS 200");
}

export async function listQboAccounts(tenantId: string): Promise<any[]> {
  return queryQbo(tenantId, "SELECT * FROM Account WHERE Active = true ORDERBY Name MAXRESULTS 200");
}

// ============================================================================
// Customer find-or-create
// ============================================================================

export async function findQboCustomerByName(tenantId: string, displayName: string): Promise<any | undefined> {
  const rows = await queryQbo(tenantId, `SELECT * FROM Customer WHERE DisplayName = '${escapeQbo(displayName)}'`);
  return rows[0];
}

export async function createQboCustomer(tenantId: string, fields: Record<string, any>): Promise<any> {
  const ctx = await getContext(tenantId);
  const result = await qboRequest(ctx, "POST", "customer", fields);
  return result?.Customer;
}

// ============================================================================
// Invoice create / void
// ============================================================================

export async function createQboInvoice(tenantId: string, input: QboInvoiceInput): Promise<any> {
  const ctx = await getContext(tenantId);
  const payload = buildInvoicePayload(input);
  const result = await qboRequest(ctx, "POST", "invoice", payload);
  return result?.Invoice;
}

/** Void (preferred over delete for audit trail) an existing QBO invoice. */
export async function voidQboInvoice(tenantId: string, invoiceId: string, syncToken: string): Promise<any> {
  const ctx = await getContext(tenantId);
  const result = await qboRequest(
    ctx,
    "POST",
    "invoice",
    { Id: invoiceId, SyncToken: syncToken },
    { operation: "void" },
  );
  return result?.Invoice;
}

export async function getQboInvoice(tenantId: string, invoiceId: string): Promise<any | undefined> {
  const ctx = await getContext(tenantId);
  const result = await qboRequest(ctx, "GET", `invoice/${invoiceId}`);
  return result?.Invoice;
}

// ============================================================================
// Vendor find-or-create  (A/P)
// ============================================================================

export async function findQboVendorByName(tenantId: string, displayName: string): Promise<any | undefined> {
  const rows = await queryQbo(tenantId, `SELECT * FROM Vendor WHERE DisplayName = '${escapeQbo(displayName)}'`);
  return rows[0];
}

export async function createQboVendor(tenantId: string, fields: Record<string, any>): Promise<any> {
  const ctx = await getContext(tenantId);
  const result = await qboRequest(ctx, "POST", "vendor", fields);
  return result?.Vendor;
}

// ============================================================================
// Bill create / void  (A/P)
// ============================================================================

export async function createQboBill(tenantId: string, input: QboBillInput): Promise<any> {
  const ctx = await getContext(tenantId);
  const payload = buildBillPayload(input);
  const result = await qboRequest(ctx, "POST", "bill", payload);
  return result?.Bill;
}

export async function getQboBill(tenantId: string, billId: string): Promise<any | undefined> {
  const ctx = await getContext(tenantId);
  const result = await qboRequest(ctx, "GET", `bill/${billId}`);
  return result?.Bill;
}

/** Bills cannot be "voided" like sales txns; delete is the reversal path. */
export async function deleteQboBill(tenantId: string, billId: string, syncToken: string): Promise<any> {
  const ctx = await getContext(tenantId);
  const result = await qboRequest(ctx, "POST", "bill", { Id: billId, SyncToken: syncToken }, { operation: "delete" });
  return result;
}
