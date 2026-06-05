import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import { storage } from "../storage";
import {
  QBO_AUTHORIZE_URL,
  QBO_SCOPE,
  QBO_REVOKE_ENDPOINT,
  getQuickbooksPlatformCredentials,
  isQuickbooksPlatformConfigured,
  isQuickbooksConnected,
  listQboCustomers,
  listQboItems,
  listQboAccounts,
  findQboCustomerByName,
  createQboCustomer,
  createQboInvoice,
  voidQboInvoice,
  getQboInvoice,
  computeDueDateIso,
  findQboVendorByName,
  createQboVendor,
  createQboBill,
  getQboBill,
  deleteQboBill,
  getQboAccountIdsByNumber,
  createQboJournalEntry,
  getQboJournalEntry,
  deleteQboJournalEntry,
  getQboReport,
  QBO_REPORT_SLUGS,
  type QboInvoiceLine,
  type QboBillLine,
  type QboJournalLine,
} from "../services/quickbooks-client.js";
import { syncBatchPaymentStatus, syncTenantPayments } from "../services/quickbooks-payment-sync.js";
import { payrollStorage } from "../storage/payroll.js";

interface QuickbooksRouteDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
}

function getUserTenantId(req: Request): string | undefined {
  return (req as any).user?.tenantId;
}

const STATE_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const STATE_TTL_MS = 10 * 60 * 1000;

function createSignedState(tenantId: string): string {
  const payload = JSON.stringify({ tenantId, exp: Date.now() + STATE_TTL_MS, nonce: crypto.randomBytes(16).toString("hex") });
  const hmac = crypto.createHmac("sha256", STATE_SECRET).update(payload).digest("hex");
  return Buffer.from(payload).toString("base64url") + "." + hmac;
}

function verifySignedState(state: string): { tenantId: string } | null {
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;
  const payload = Buffer.from(payloadB64, "base64url").toString();
  const expectedSig = crypto.createHmac("sha256", STATE_SECRET).update(payload).digest("hex");
  if (signature.length !== expectedSig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) return null;
  try {
    const data = JSON.parse(payload);
    if (data.exp < Date.now()) return null;
    return { tenantId: data.tenantId };
  } catch {
    return null;
  }
}

const usedStates = new Set<string>();
setInterval(() => { usedStates.clear(); }, STATE_TTL_MS);

export function registerQuickbooksRoutes(app: Express, deps: QuickbooksRouteDeps) {

  // ==========================================================================
  // OAuth
  // ==========================================================================

  app.get("/api/accounting/quickbooks/oauth/start", deps.requireAuth, deps.requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      if (!isQuickbooksPlatformConfigured()) {
        return res.status(500).json({ message: "QuickBooks platform credentials are not configured" });
      }
      const { clientId } = getQuickbooksPlatformCredentials();

      const protocol = req.get("x-forwarded-proto") || req.protocol;
      const redirectUri = `${protocol}://${req.get("host")}/api/accounting/quickbooks/oauth/callback`;

      const authorizeUrl = new URL(QBO_AUTHORIZE_URL);
      authorizeUrl.searchParams.set("client_id", clientId);
      authorizeUrl.searchParams.set("response_type", "code");
      authorizeUrl.searchParams.set("scope", QBO_SCOPE);
      authorizeUrl.searchParams.set("redirect_uri", redirectUri);
      authorizeUrl.searchParams.set("state", createSignedState(tenantId));

      res.json({ authorizeUrl: authorizeUrl.toString() });
    } catch (error: any) {
      console.error("[QBO] Error starting OAuth:", error);
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/accounting/quickbooks/oauth/callback", async (req: Request, res: Response) => {
    try {
      const { code, state, realmId } = req.query;
      if (!code || !state || typeof code !== "string" || typeof state !== "string") {
        return res.status(400).send("<html><body><h2>Invalid OAuth callback</h2><p>Missing code or state.</p></body></html>");
      }
      if (typeof realmId !== "string" || !realmId) {
        return res.status(400).send("<html><body><h2>Missing QuickBooks company (realmId)</h2><p>Please try connecting again.</p></body></html>");
      }
      if (usedStates.has(state)) {
        return res.status(400).send("<html><body><h2>OAuth state already used</h2><p>Please try connecting again from Organization Settings.</p></body></html>");
      }
      const stateData = verifySignedState(state);
      if (!stateData) {
        return res.status(400).send("<html><body><h2>Invalid or expired OAuth state</h2><p>Please try connecting again from Organization Settings.</p></body></html>");
      }
      usedStates.add(state);
      const { tenantId } = stateData;

      const { clientId, clientSecret } = getQuickbooksPlatformCredentials();
      const protocol = req.get("x-forwarded-proto") || req.protocol;
      const redirectUri = `${protocol}://${req.get("host")}/api/accounting/quickbooks/oauth/callback`;
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

      const tokenResponse = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          Authorization: `Basic ${basic}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenResponse.ok) {
        const errText = await tokenResponse.text();
        console.error("[QBO] OAuth token exchange failed:", errText);
        return res.status(400).send("<html><body><h2>Failed to connect QuickBooks</h2><p>Token exchange failed. Please try again.</p></body></html>");
      }

      const tokenData = (await tokenResponse.json()) as any;
      const existing = await storage.getQuickbooksConnection(tenantId);
      const existingSettings = (existing?.settings || {}) as Record<string, any>;

      await storage.upsertQuickbooksConnection({
        tenantId,
        realmId,
        sandbox: existing?.sandbox ?? false,
        isEnabled: true,
        settings: {
          ...existingSettings,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: Date.now() + (tokenData.expires_in * 1000),
          connectedAt: new Date().toISOString(),
        },
      });

      await storage.createQuickbooksSyncLog({ tenantId, action: "oauth_connected", status: "success" });

      res.send("<html><body><h2>QuickBooks Connected Successfully!</h2><p>You can close this window and return to Constellation.</p><script>window.close();</script></body></html>");
    } catch (error: any) {
      console.error("[QBO] OAuth callback error:", error);
      res.status(500).send("<html><body><h2>Connection Error</h2><p>An error occurred. Please try again.</p></body></html>");
    }
  });

  app.post("/api/accounting/quickbooks/oauth/disconnect", deps.requireAuth, deps.requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      const connection = await storage.getQuickbooksConnection(tenantId);
      const settings = (connection?.settings || {}) as Record<string, any>;

      if (settings.refreshToken && isQuickbooksPlatformConfigured()) {
        try {
          const { clientId, clientSecret } = getQuickbooksPlatformCredentials();
          const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
          await fetch(QBO_REVOKE_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Basic ${basic}` },
            body: JSON.stringify({ token: settings.refreshToken }),
          });
        } catch (e) {
          console.error("[QBO] Error revoking token:", e);
        }
      }

      const { accessToken, refreshToken, expiresAt, connectedAt, ...preserved } = settings;
      await storage.upsertQuickbooksConnection({
        tenantId,
        realmId: connection?.realmId ?? null,
        sandbox: connection?.sandbox ?? false,
        isEnabled: false,
        settings: preserved,
      });
      await storage.createQuickbooksSyncLog({ tenantId, action: "oauth_disconnected", status: "success" });

      res.json({ success: true });
    } catch (error: any) {
      console.error("[QBO] Error disconnecting:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ==========================================================================
  // Status & connection settings
  // ==========================================================================

  app.get("/api/accounting/quickbooks/status", deps.requireAuth, async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      const connection = await storage.getQuickbooksConnection(tenantId);
      const settings = (connection?.settings || {}) as Record<string, any>;
      const connected = await isQuickbooksConnected(tenantId);

      res.json({
        platformConfigured: isQuickbooksPlatformConfigured(),
        connected,
        isEnabled: connection?.isEnabled ?? false,
        sandbox: connection?.sandbox ?? false,
        realmId: connection?.realmId ?? null,
        syncDirection: connection?.syncDirection ?? "push",
        defaults: {
          defaultItemId: settings.defaultItemId ?? null,
          expenseItemId: settings.expenseItemId ?? null,
          defaultExpenseAccountId: settings.defaultExpenseAccountId ?? null,
          defaultBankAccountId: settings.defaultBankAccountId ?? null,
        },
        lastSyncAt: connection?.lastSyncAt ?? null,
        lastSyncStatus: connection?.lastSyncStatus ?? null,
        lastSyncError: connection?.lastSyncError ?? null,
      });
    } catch (error: any) {
      console.error("[QBO] Error fetching status:", error);
      res.status(500).json({ message: error.message });
    }
  });

  const connectionUpdateSchema = z.object({
    isEnabled: z.boolean().optional(),
    sandbox: z.boolean().optional(),
    syncDirection: z.enum(["push", "bidirectional"]).optional(),
    defaultItemId: z.string().nullable().optional(),
    expenseItemId: z.string().nullable().optional(),
    defaultExpenseAccountId: z.string().nullable().optional(),
    defaultBankAccountId: z.string().nullable().optional(),
  });

  app.put("/api/accounting/quickbooks/connection", deps.requireAuth, deps.requireRole(["admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });

      const body = connectionUpdateSchema.parse(req.body);
      const connection = await storage.getQuickbooksConnection(tenantId);
      const settings = (connection?.settings || {}) as Record<string, any>;

      const nextSettings = { ...settings };
      if (body.defaultItemId !== undefined) nextSettings.defaultItemId = body.defaultItemId;
      if (body.expenseItemId !== undefined) nextSettings.expenseItemId = body.expenseItemId;
      if (body.defaultExpenseAccountId !== undefined) nextSettings.defaultExpenseAccountId = body.defaultExpenseAccountId;
      if (body.defaultBankAccountId !== undefined) nextSettings.defaultBankAccountId = body.defaultBankAccountId;

      const updated = await storage.upsertQuickbooksConnection({
        tenantId,
        realmId: connection?.realmId ?? null,
        sandbox: body.sandbox ?? connection?.sandbox ?? false,
        isEnabled: body.isEnabled ?? connection?.isEnabled ?? false,
        syncDirection: body.syncDirection ?? connection?.syncDirection ?? "push",
        settings: nextSettings,
      });

      res.json({ success: true, isEnabled: updated.isEnabled, sandbox: updated.sandbox });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid request", errors: error.errors });
      console.error("[QBO] Error updating connection:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // ==========================================================================
  // Mapping manager reads
  // ==========================================================================

  async function requireEnabled(req: Request, res: Response): Promise<string | null> {
    const tenantId = getUserTenantId(req);
    if (!tenantId) { res.status(400).json({ message: "No active tenant" }); return null; }
    const connection = await storage.getQuickbooksConnection(tenantId);
    if (!connection?.isEnabled) { res.status(400).json({ message: "QuickBooks integration is not enabled for this organization" }); return null; }
    if (!(await isQuickbooksConnected(tenantId))) { res.status(400).json({ message: "QuickBooks is not connected. Please connect in Organization Settings." }); return null; }
    return tenantId;
  }

  app.get("/api/accounting/quickbooks/customers", deps.requireAuth, deps.requireRole(["admin", "billing-admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = await requireEnabled(req, res);
      if (!tenantId) return;
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const customers = await listQboCustomers(tenantId, q);
      res.json(customers.map((c: any) => ({ id: c.Id, displayName: c.DisplayName, email: c.PrimaryEmailAddr?.Address ?? null })));
    } catch (error: any) {
      res.status(502).json({ message: error.message });
    }
  });

  app.get("/api/accounting/quickbooks/items", deps.requireAuth, deps.requireRole(["admin", "billing-admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = await requireEnabled(req, res);
      if (!tenantId) return;
      const items = await listQboItems(tenantId);
      res.json(items.map((i: any) => ({ id: i.Id, name: i.Name, type: i.Type })));
    } catch (error: any) {
      res.status(502).json({ message: error.message });
    }
  });

  app.get("/api/accounting/quickbooks/accounts", deps.requireAuth, deps.requireRole(["admin", "billing-admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = await requireEnabled(req, res);
      if (!tenantId) return;
      const accounts = await listQboAccounts(tenantId);
      res.json(accounts.map((a: any) => ({ id: a.Id, name: a.Name, accountType: a.AccountType })));
    } catch (error: any) {
      res.status(502).json({ message: error.message });
    }
  });

  // Read-only financial reports surfaced in-app (Phase 4). Supported slugs:
  // aged-receivables, aged-payables, profit-and-loss. Date params (start_date,
  // end_date, date_macro) pass straight through to Intuit.
  app.get("/api/accounting/quickbooks/reports/:name", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "executive"]), async (req: Request, res: Response) => {
    try {
      const tenantId = await requireEnabled(req, res);
      if (!tenantId) return;
      const name = req.params.name;
      if (!QBO_REPORT_SLUGS.includes(name)) {
        return res.status(404).json({ message: `Unknown report '${name}'. Supported: ${QBO_REPORT_SLUGS.join(", ")}` });
      }
      const params: Record<string, string> = {};
      for (const key of ["start_date", "end_date", "date_macro"]) {
        const v = req.query[key];
        if (typeof v === "string" && v) params[key] = v;
      }
      const report = await getQboReport(tenantId, name, params);
      res.json(report);
    } catch (error: any) {
      res.status(502).json({ message: error.message });
    }
  });

  app.get("/api/accounting/quickbooks/mappings", deps.requireAuth, deps.requireRole(["admin", "billing-admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });
      const type = typeof req.query.type === "string" ? req.query.type : undefined;
      const mappings = await storage.getQuickbooksMappings(tenantId, type);
      res.json(mappings);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Link (or auto-create) a Constellation client to a QBO Customer.
  app.post("/api/accounting/quickbooks/clients/:clientId/link", deps.requireAuth, deps.requireRole(["admin", "billing-admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = await requireEnabled(req, res);
      if (!tenantId) return;
      const { clientId } = req.params;
      const { qboCustomerId } = (req.body || {}) as { qboCustomerId?: string };

      const client = await storage.getClient(clientId);
      if (!client || (client.tenantId && client.tenantId !== tenantId)) {
        return res.status(404).json({ message: "Client not found" });
      }

      let customer: any;
      if (qboCustomerId) {
        customer = { Id: qboCustomerId };
      } else {
        customer = await findQboCustomerByName(tenantId, client.name);
        if (!customer) {
          customer = await createQboCustomer(tenantId, { DisplayName: client.name });
        }
      }

      const mapping = await storage.upsertQuickbooksMapping({
        tenantId,
        localObjectType: "client",
        localObjectId: clientId,
        qboObjectType: "Customer",
        qboObjectId: String(customer.Id),
        status: "active",
        metadata: { displayName: customer.DisplayName ?? client.name },
      });

      res.json({ success: true, mapping });
    } catch (error: any) {
      console.error("[QBO] Error linking client:", error);
      res.status(502).json({ message: error.message });
    }
  });

  app.delete("/api/accounting/quickbooks/mappings/:id", deps.requireAuth, deps.requireRole(["admin", "billing-admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });
      await storage.deleteQuickbooksMapping(req.params.id, tenantId);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/accounting/quickbooks/sync-log", deps.requireAuth, deps.requireRole(["admin", "billing-admin"]), async (req: Request, res: Response) => {
    try {
      const tenantId = getUserTenantId(req);
      if (!tenantId) return res.status(400).json({ message: "No active tenant" });
      const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
      const logs = await storage.getQuickbooksSyncLogs(tenantId, limit);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ==========================================================================
  // Invoice push (A/R)  +  Cancel & Reissue
  // ==========================================================================

  // Resolve a QBO Customer id for a Constellation client, creating + mapping on demand.
  async function resolveCustomerId(tenantId: string, clientId: string, clientName: string): Promise<string> {
    const existing = await storage.getQuickbooksMappingByLocal(tenantId, "client", clientId);
    if (existing?.qboObjectId) return existing.qboObjectId;

    let customer = await findQboCustomerByName(tenantId, clientName);
    if (!customer) customer = await createQboCustomer(tenantId, { DisplayName: clientName });

    await storage.upsertQuickbooksMapping({
      tenantId,
      localObjectType: "client",
      localObjectId: clientId,
      qboObjectType: "Customer",
      qboObjectId: String(customer.Id),
      status: "active",
      metadata: { displayName: customer.DisplayName ?? clientName },
    });
    return String(customer.Id);
  }

  app.post("/api/invoice-batches/:batchId/push-qbo", deps.requireAuth, deps.requireRole(["admin", "billing-admin"]), async (req: Request, res: Response) => {
    const tenantId = await requireEnabled(req, res);
    if (!tenantId) return;
    const { batchId } = req.params;

    try {
      const batch = await storage.getInvoiceBatchDetails(batchId);
      if (!batch) return res.status(404).json({ message: "Invoice batch not found" });
      if (batch.tenantId && batch.tenantId !== tenantId) return res.status(403).json({ message: "Access denied" });
      if (batch.status !== "finalized") return res.status(400).json({ message: "Only finalized batches can be pushed to QuickBooks" });
      if (batch.exportedToQBO) {
        return res.status(409).json({ message: "This batch is already in QuickBooks. Use Cancel & Reissue to void it first, then push a corrected invoice." });
      }

      const connection = await storage.getQuickbooksConnection(tenantId);
      const settings = (connection?.settings || {}) as Record<string, any>;
      if (!settings.defaultItemId) {
        return res.status(400).json({ message: "No default QuickBooks Item is configured. Set a default Service item in Organization Settings → QuickBooks before pushing invoices." });
      }

      const lines = await storage.getInvoiceLinesForBatch(batchId);
      if (lines.length === 0) return res.status(400).json({ message: "No invoice lines found in batch" });

      const invoiceIso: string =
        batch.asOfDate ||
        (batch.finalizedAt ? new Date(batch.finalizedAt).toISOString().split("T")[0] : null) ||
        batch.endDate;

      // Group lines by client (one QBO Invoice per client, matching the CSV export).
      const groups = new Map<string, { client: any; lines: any[]; index: number }>();
      for (const line of lines) {
        const cid = line.client?.id;
        if (!cid) return res.status(400).json({ message: "Invoice line is missing client information" });
        if (!groups.has(cid)) groups.set(cid, { client: line.client, lines: [], index: groups.size + 1 });
        groups.get(cid)!.lines.push(line);
      }
      const multiClient = groups.size > 1;

      const created: Array<{ clientId: string; qboInvoiceId: string; docNumber: string | null }> = [];

      for (const [clientId, group] of groups) {
        const localObjectId = multiClient ? `${batchId}::${clientId}` : batchId;

        // Idempotency: if this client already has an active QBO invoice (e.g. a
        // prior multi-client push that partially succeeded, or a later local
        // write failed while exportedToQBO was still false), reuse it instead
        // of creating a duplicate.
        const existingMapping = await storage.getQuickbooksMappingByLocal(tenantId, "invoice_batch", localObjectId);
        if (existingMapping && existingMapping.status === "active") {
          created.push({
            clientId,
            qboInvoiceId: existingMapping.qboObjectId,
            docNumber: (existingMapping.metadata as any)?.docNumber ?? null,
          });
          continue;
        }

        const customerId = await resolveCustomerId(tenantId, clientId, group.client.name);
        const terms = group.client.paymentTerms || batch.paymentTerms || "Net 30";

        const qboLines: QboInvoiceLine[] = group.lines.map((line: any) => {
          const amount = parseFloat(line.billedAmount || line.amount || "0");
          const hasRate = line.rate && parseFloat(line.rate) > 0;
          const isExpense = line.type === "expense";
          const itemRef = (isExpense && settings.expenseItemId) ? settings.expenseItemId : settings.defaultItemId;

          let description: string;
          if (isExpense) {
            const label = line.expenseCategory ? line.expenseCategory.charAt(0).toUpperCase() + line.expenseCategory.slice(1) : "Expense";
            description = line.description ? `${label}: ${line.description}` : label;
          } else if (line.type === "time") {
            description = line.description || "Professional Services";
          } else {
            description = line.description || (line.project?.name ?? "");
          }

          return {
            description,
            amount,
            qty: hasRate ? parseFloat(line.quantity || "1") : undefined,
            unitPrice: hasRate ? parseFloat(line.rate) : undefined,
            itemRef: String(itemRef),
            serviceDate: invoiceIso,
          };
        });

        let docNumber: string | undefined;
        if (batch.glInvoiceNumber) {
          docNumber = multiClient ? `${batch.glInvoiceNumber}-C${group.index}` : batch.glInvoiceNumber;
        }

        const invoice = await createQboInvoice(tenantId, {
          customerId,
          docNumber,
          txnDate: invoiceIso,
          dueDate: computeDueDateIso(invoiceIso, terms),
          currencyCode: batch.quoteCurrency || undefined,
          customerMemo: batch.notes || undefined,
          lines: qboLines,
        });

        await storage.upsertQuickbooksMapping({
          tenantId,
          localObjectType: "invoice_batch",
          localObjectId,
          qboObjectType: "Invoice",
          qboObjectId: String(invoice.Id),
          qboSyncToken: String(invoice.SyncToken ?? "0"),
          status: "active",
          metadata: { docNumber: invoice.DocNumber ?? null, clientId, total: invoice.TotalAmt ?? null },
        });

        await storage.createQuickbooksSyncLog({
          tenantId,
          action: "invoice_pushed",
          localObjectType: "invoice_batch",
          localObjectId,
          qboObjectType: "Invoice",
          qboObjectId: String(invoice.Id),
          status: "success",
        });

        created.push({ clientId, qboInvoiceId: String(invoice.Id), docNumber: invoice.DocNumber ?? null });
      }

      // Write back to the batch: mark exported, capture the QBO doc number when we had none.
      const firstDoc = created[0]?.docNumber;
      await storage.updateInvoiceBatch(batchId, {
        exportedToQBO: true,
        exportedAt: new Date(),
        ...(batch.glInvoiceNumber || !firstDoc ? {} : { glInvoiceNumber: firstDoc }),
      } as any);
      await storage.updateQuickbooksSyncStatus(tenantId, "success", null);

      res.json({ success: true, invoices: created });
    } catch (error: any) {
      console.error("[QBO] Invoice push failed:", error);
      await storage.createQuickbooksSyncLog({
        tenantId,
        action: "invoice_pushed",
        localObjectType: "invoice_batch",
        localObjectId: batchId,
        status: "error",
        errorMessage: error.message,
      });
      await storage.updateQuickbooksSyncStatus(tenantId, "error", error.message);
      res.status(502).json({ message: error.message });
    }
  });

  // Cancel & Reissue: void the QBO invoice(s) for a batch and release the
  // export lock so the batch can be unfinalized, corrected, and re-pushed.
  app.post("/api/invoice-batches/:batchId/qbo-cancel", deps.requireAuth, deps.requireRole(["admin", "billing-admin"]), async (req: Request, res: Response) => {
    const tenantId = await requireEnabled(req, res);
    if (!tenantId) return;
    const { batchId } = req.params;

    try {
      const batch = await storage.getInvoiceBatchByBatchId(batchId);
      if (!batch) return res.status(404).json({ message: "Invoice batch not found" });
      if (batch.tenantId && batch.tenantId !== tenantId) return res.status(403).json({ message: "Access denied" });
      if (!batch.exportedToQBO) return res.status(400).json({ message: "This batch has not been pushed to QuickBooks" });

      // Collect all invoice mappings for this batch (single- or multi-client).
      const all = await storage.getQuickbooksMappings(tenantId, "invoice_batch");
      const mappings = all.filter((m) =>
        m.qboObjectType === "Invoice" &&
        m.status === "active" &&
        (m.localObjectId === batchId || m.localObjectId.startsWith(`${batchId}::`)),
      );

      // If nothing was pushed through the API (e.g. the batch was marked
      // exported via the CSV flow, or its mapping was already voided), do NOT
      // silently clear the export lock — an invoice may still exist in QBO.
      // Resolve those directly in QuickBooks.
      if (mappings.length === 0) {
        return res.status(400).json({
          message: "No QuickBooks invoice is tracked for this batch (it may have been exported via CSV or already cancelled). Resolve it directly in QuickBooks; Cancel & Reissue only voids invoices pushed through the API.",
        });
      }

      const voided: string[] = [];
      for (const mapping of mappings) {
        // Re-read for a fresh SyncToken (QBO rejects stale tokens on void).
        const current = await getQboInvoice(tenantId, mapping.qboObjectId);
        const syncToken = String(current?.SyncToken ?? mapping.qboSyncToken ?? "0");
        await voidQboInvoice(tenantId, mapping.qboObjectId, syncToken);
        await storage.updateQuickbooksMapping(mapping.id, { status: "voided" });
        await storage.createQuickbooksSyncLog({
          tenantId,
          action: "invoice_voided",
          localObjectType: "invoice_batch",
          localObjectId: mapping.localObjectId,
          qboObjectType: "Invoice",
          qboObjectId: mapping.qboObjectId,
          status: "success",
        });
        voided.push(mapping.qboObjectId);
      }

      // Release the export lock so the batch can be unfinalized and reissued.
      await storage.updateInvoiceBatch(batchId, { exportedToQBO: false, exportedAt: null } as any);
      await storage.updateQuickbooksSyncStatus(tenantId, "success", null);

      res.json({ success: true, voided, message: "QuickBooks invoice voided. You can now unfinalize, correct, and reissue this batch." });
    } catch (error: any) {
      console.error("[QBO] Invoice cancel failed:", error);
      await storage.createQuickbooksSyncLog({
        tenantId,
        action: "invoice_voided",
        localObjectType: "invoice_batch",
        localObjectId: batchId,
        status: "error",
        errorMessage: error.message,
      });
      res.status(502).json({ message: error.message });
    }
  });

  // ==========================================================================
  // Payment-status pull-back (A/R)
  // ==========================================================================

  // The sync logic lives in services/quickbooks-payment-sync.ts so the manual
  // routes below and the background scheduler share one code path.

  app.post("/api/invoice-batches/:batchId/qbo-payment-sync", deps.requireAuth, deps.requireRole(["admin", "billing-admin"]), async (req: Request, res: Response) => {
    const tenantId = await requireEnabled(req, res);
    if (!tenantId) return;
    const { batchId } = req.params;
    const userId = (req as any).user?.id;

    try {
      const batch = await storage.getInvoiceBatchByBatchId(batchId);
      if (!batch) return res.status(404).json({ message: "Invoice batch not found" });
      if (batch.tenantId && batch.tenantId !== tenantId) return res.status(403).json({ message: "Access denied" });

      const result = await syncBatchPaymentStatus(tenantId, batchId, userId);
      if (!result) return res.status(400).json({ message: "This batch has not been pushed to QuickBooks" });

      await storage.updateQuickbooksSyncStatus(tenantId, "success", null);
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("[QBO] Payment sync failed:", error);
      await storage.createQuickbooksSyncLog({
        tenantId,
        action: "payment_synced",
        localObjectType: "invoice_batch",
        localObjectId: batchId,
        status: "error",
        errorMessage: error.message,
      });
      await storage.updateQuickbooksSyncStatus(tenantId, "error", error.message);
      res.status(502).json({ message: error.message });
    }
  });

  // Tenant-wide payment-status refresh across every batch with an active QBO
  // invoice mapping. (A scheduled job can call this same path later.)
  app.post("/api/accounting/quickbooks/sync/payments", deps.requireAuth, deps.requireRole(["admin", "billing-admin"]), async (req: Request, res: Response) => {
    const tenantId = await requireEnabled(req, res);
    if (!tenantId) return;
    const userId = (req as any).user?.id;

    try {
      const result = await syncTenantPayments(tenantId, userId);
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("[QBO] Bulk payment sync failed:", error);
      res.status(502).json({ message: error.message });
    }
  });

  // ==========================================================================
  // Vendor invoice push (A/P)  +  Cancel
  // ==========================================================================

  // Resolve a QBO Vendor id for a Constellation vendor user, creating + mapping
  // on demand.
  async function resolveVendorId(tenantId: string, userId: string, displayName: string): Promise<string> {
    const existing = await storage.getQuickbooksMappingByLocal(tenantId, "vendor_user", userId);
    if (existing?.qboObjectId) return existing.qboObjectId;

    let vendor = await findQboVendorByName(tenantId, displayName);
    if (!vendor) vendor = await createQboVendor(tenantId, { DisplayName: displayName });

    await storage.upsertQuickbooksMapping({
      tenantId,
      localObjectType: "vendor_user",
      localObjectId: userId,
      qboObjectType: "Vendor",
      qboObjectId: String(vendor.Id),
      status: "active",
      metadata: { displayName: vendor.DisplayName ?? displayName },
    });
    return String(vendor.Id);
  }

  app.post("/api/vendor-invoices/:id/push-qbo", deps.requireAuth, deps.requireRole(["admin", "billing-admin"]), async (req: Request, res: Response) => {
    const tenantId = await requireEnabled(req, res);
    if (!tenantId) return;
    const { id } = req.params;

    try {
      const invoice = await storage.getVendorInvoice(id, tenantId);
      if (!invoice || !invoice.id) return res.status(404).json({ message: "Vendor invoice not found" });
      if (!["approved", "posted"].includes(invoice.status)) {
        return res.status(400).json({ message: "Only approved or posted vendor invoices can be pushed to QuickBooks" });
      }
      if (invoice.exportedToQBO) {
        return res.status(409).json({ message: "This vendor invoice is already in QuickBooks. Cancel it there first to re-push." });
      }
      // Idempotency: if a prior push created the Bill but failed before the
      // local export fields were written, a retry would create a duplicate.
      // Detect the existing active Bill mapping and reconcile the local state
      // instead of pushing again.
      const existingBillMapping = await storage.getQuickbooksMappingByLocal(tenantId, "vendor_invoice", id);
      if (existingBillMapping && existingBillMapping.status === "active") {
        await storage.updateVendorInvoice(id, {
          glBillNumber: existingBillMapping.qboObjectId,
          exportedToQBO: true,
          exportedAt: new Date(),
        } as any);
        return res.status(409).json({
          message: "This vendor invoice already has a QuickBooks bill (the previous push completed in QuickBooks). The local status has been reconciled — cancel it to re-push.",
          billId: existingBillMapping.qboObjectId,
        });
      }
      if (!invoice.vendorUserId) {
        return res.status(400).json({ message: "This invoice has no resolved vendor. Assign a contractor before pushing." });
      }

      const connection = await storage.getQuickbooksConnection(tenantId);
      const settings = (connection?.settings || {}) as Record<string, any>;
      if (!settings.defaultExpenseAccountId) {
        return res.status(400).json({ message: "No default QuickBooks expense Account is configured. Set one in Organization Settings → QuickBooks before pushing bills." });
      }

      const vendorUser = await storage.getUser(invoice.vendorUserId);
      const displayName = (vendorUser as any)?.contractorBusinessName || (vendorUser as any)?.name || "Vendor";
      const vendorId = await resolveVendorId(tenantId, invoice.vendorUserId, displayName);

      const lines: any[] = invoice.lines || [];
      const nonTaxLines = lines.filter((l) => l.kind !== "tax" && Number(l.lineAmount ?? 0) !== 0);
      const billLines: QboBillLine[] = nonTaxLines.map((l) => ({
        description: l.description || l.expenseCategory || "Subcontractor charge",
        amount: Number(l.lineAmount ?? 0),
        accountRef: String(settings.defaultExpenseAccountId),
      }));

      // Collapse tax (explicit tax lines or header taxAmount) into one line so
      // the Bill total matches the vendor invoice total.
      const taxFromLines = lines.filter((l) => l.kind === "tax").reduce((s, l) => s + Number(l.lineAmount ?? 0), 0);
      const taxAmount = taxFromLines || Number(invoice.taxAmount ?? 0);
      if (taxAmount > 0) {
        billLines.push({ description: "Tax", amount: taxAmount, accountRef: String(settings.defaultExpenseAccountId) });
      }

      if (billLines.length === 0) {
        return res.status(400).json({ message: "Vendor invoice has no billable lines to push" });
      }

      const bill = await createQboBill(tenantId, {
        vendorId,
        docNumber: invoice.vendorInvoiceNumber || undefined,
        txnDate: invoice.invoiceDate || undefined,
        dueDate: invoice.dueDate || undefined,
        currencyCode: invoice.currency || undefined,
        privateNote: invoice.description || undefined,
        lines: billLines,
      });

      await storage.upsertQuickbooksMapping({
        tenantId,
        localObjectType: "vendor_invoice",
        localObjectId: id,
        qboObjectType: "Bill",
        qboObjectId: String(bill.Id),
        qboSyncToken: String(bill.SyncToken ?? "0"),
        status: "active",
        metadata: { docNumber: bill.DocNumber ?? null, total: bill.TotalAmt ?? null, vendorId },
      });

      await storage.updateVendorInvoice(id, {
        glBillNumber: String(bill.Id),
        exportedToQBO: true,
        exportedAt: new Date(),
      } as any);

      await storage.createQuickbooksSyncLog({
        tenantId,
        action: "bill_pushed",
        localObjectType: "vendor_invoice",
        localObjectId: id,
        qboObjectType: "Bill",
        qboObjectId: String(bill.Id),
        status: "success",
      });
      await storage.updateQuickbooksSyncStatus(tenantId, "success", null);

      res.json({ success: true, billId: String(bill.Id), docNumber: bill.DocNumber ?? null });
    } catch (error: any) {
      console.error("[QBO] Vendor bill push failed:", error);
      await storage.createQuickbooksSyncLog({
        tenantId,
        action: "bill_pushed",
        localObjectType: "vendor_invoice",
        localObjectId: id,
        status: "error",
        errorMessage: error.message,
      });
      await storage.updateQuickbooksSyncStatus(tenantId, "error", error.message);
      res.status(502).json({ message: error.message });
    }
  });

  // Cancel: delete the QBO Bill and release the export lock so the vendor
  // invoice can be corrected and re-pushed.
  app.post("/api/vendor-invoices/:id/qbo-cancel", deps.requireAuth, deps.requireRole(["admin", "billing-admin"]), async (req: Request, res: Response) => {
    const tenantId = await requireEnabled(req, res);
    if (!tenantId) return;
    const { id } = req.params;

    try {
      const invoice = await storage.getVendorInvoice(id, tenantId);
      if (!invoice) return res.status(404).json({ message: "Vendor invoice not found" });
      if (!invoice.exportedToQBO) return res.status(400).json({ message: "This vendor invoice has not been pushed to QuickBooks" });

      const mapping = await storage.getQuickbooksMappingByLocal(tenantId, "vendor_invoice", id);
      if (mapping && mapping.status === "active") {
        const current = await getQboBill(tenantId, mapping.qboObjectId);
        const syncToken = String(current?.SyncToken ?? mapping.qboSyncToken ?? "0");
        await deleteQboBill(tenantId, mapping.qboObjectId, syncToken);
        await storage.updateQuickbooksMapping(mapping.id, { status: "voided" });
        await storage.createQuickbooksSyncLog({
          tenantId,
          action: "bill_voided",
          localObjectType: "vendor_invoice",
          localObjectId: id,
          qboObjectType: "Bill",
          qboObjectId: mapping.qboObjectId,
          status: "success",
        });
      }

      await storage.updateVendorInvoice(id, { exportedToQBO: false, exportedAt: null } as any);
      await storage.updateQuickbooksSyncStatus(tenantId, "success", null);

      res.json({ success: true, message: "QuickBooks bill removed. You can correct and re-push this vendor invoice." });
    } catch (error: any) {
      console.error("[QBO] Vendor bill cancel failed:", error);
      res.status(502).json({ message: error.message });
    }
  });

  // ==========================================================================
  // Payroll GL push (finalized run → QBO Journal Entry)  +  Cancel
  // ==========================================================================
  //
  // Reuses the existing payroll GL builder (payrollStorage.buildGlExport), which
  // already produces balanced debit/credit lines keyed by the tenant's payroll
  // GL account numbers. Constellation owns payroll computation; QBO receives
  // only the accounting impact as a JournalEntry. The payroll GL account
  // numbers must match the QBO chart-of-accounts numbers (AcctNum).

  app.post("/api/payroll/runs/:id/push-qbo", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "executive"]), async (req: Request, res: Response) => {
    const tenantId = await requireEnabled(req, res);
    if (!tenantId) return;
    const { id } = req.params;

    try {
      const run = await payrollStorage.getRun(tenantId, id);
      if (!run) return res.status(404).json({ message: "Payroll run not found" });
      if (run.status !== "finalized") {
        return res.status(400).json({ message: "Only finalized payroll runs can be pushed to QuickBooks" });
      }

      // Idempotency: reuse the existing journal entry if one is already mapped.
      const existing = await storage.getQuickbooksMappingByLocal(tenantId, "payroll_run", id);
      if (existing && existing.status === "active") {
        return res.status(409).json({
          message: "This payroll run already has a QuickBooks journal entry. Cancel it first to re-push.",
          journalEntryId: existing.qboObjectId,
        });
      }

      const glRows = await payrollStorage.buildGlExport(tenantId, id);
      if (glRows.length === 0) {
        return res.status(400).json({ message: "No payroll GL lines to post. Configure payroll GL accounts and category mappings first." });
      }

      // Resolve each GL account number to a QBO account id.
      const qboAccountByNumber = await getQboAccountIdsByNumber(tenantId);
      const missing = Array.from(new Set(
        glRows.filter((r) => !qboAccountByNumber.has(String(r.accountNumber))).map((r) => r.accountNumber),
      ));
      if (missing.length > 0) {
        return res.status(400).json({
          message: `These payroll GL account numbers have no matching active QuickBooks account (by number): ${missing.join(", ")}. Align the account numbers in QuickBooks, then retry.`,
        });
      }

      const lines: QboJournalLine[] = glRows.map((r) => ({
        debit: r.debitCents / 100,
        credit: r.creditCents / 100,
        accountRef: qboAccountByNumber.get(String(r.accountNumber))!,
        description: r.memo,
      }));

      const journal = await createQboJournalEntry(tenantId, {
        docNumber: `PR-${String(id).slice(0, 8)}`,
        txnDate: run.payDate,
        privateNote: `Payroll run ${id} — pay date ${run.payDate}`,
        lines,
      });

      await storage.upsertQuickbooksMapping({
        tenantId,
        localObjectType: "payroll_run",
        localObjectId: id,
        qboObjectType: "JournalEntry",
        qboObjectId: String(journal.Id),
        qboSyncToken: String(journal.SyncToken ?? "0"),
        status: "active",
        metadata: { payDate: run.payDate, lineCount: lines.length },
      });
      await storage.createQuickbooksSyncLog({
        tenantId,
        action: "journal_pushed",
        localObjectType: "payroll_run",
        localObjectId: id,
        qboObjectType: "JournalEntry",
        qboObjectId: String(journal.Id),
        status: "success",
      });
      await storage.updateQuickbooksSyncStatus(tenantId, "success", null);

      res.json({ success: true, journalEntryId: String(journal.Id), lines: lines.length });
    } catch (error: any) {
      console.error("[QBO] Payroll journal push failed:", error);
      await storage.createQuickbooksSyncLog({
        tenantId,
        action: "journal_pushed",
        localObjectType: "payroll_run",
        localObjectId: id,
        status: "error",
        errorMessage: error.message,
      });
      await storage.updateQuickbooksSyncStatus(tenantId, "error", error.message);
      res.status(502).json({ message: error.message });
    }
  });

  // Cancel: delete the QBO journal entry and release the mapping so the run
  // can be re-pushed (e.g. after a GL mapping correction).
  app.post("/api/payroll/runs/:id/qbo-cancel", deps.requireAuth, deps.requireRole(["admin", "billing-admin", "executive"]), async (req: Request, res: Response) => {
    const tenantId = await requireEnabled(req, res);
    if (!tenantId) return;
    const { id } = req.params;

    try {
      const mapping = await storage.getQuickbooksMappingByLocal(tenantId, "payroll_run", id);
      if (!mapping || mapping.status !== "active") {
        return res.status(400).json({ message: "This payroll run has no active QuickBooks journal entry" });
      }

      const current = await getQboJournalEntry(tenantId, mapping.qboObjectId);
      const syncToken = String(current?.SyncToken ?? mapping.qboSyncToken ?? "0");
      await deleteQboJournalEntry(tenantId, mapping.qboObjectId, syncToken);
      await storage.updateQuickbooksMapping(mapping.id, { status: "voided" });
      await storage.createQuickbooksSyncLog({
        tenantId,
        action: "journal_voided",
        localObjectType: "payroll_run",
        localObjectId: id,
        qboObjectType: "JournalEntry",
        qboObjectId: mapping.qboObjectId,
        status: "success",
      });
      await storage.updateQuickbooksSyncStatus(tenantId, "success", null);

      res.json({ success: true, message: "QuickBooks journal entry removed. You can re-push this payroll run." });
    } catch (error: any) {
      console.error("[QBO] Payroll journal cancel failed:", error);
      res.status(502).json({ message: error.message });
    }
  });
}
