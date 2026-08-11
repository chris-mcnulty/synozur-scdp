/**
 * Seed script: import 2026 contractor cost invoices and payments from the
 * 2026 Account Reconciliation Ledger workbook.
 *
 * Usage:
 *   npx tsx scripts/seed-contractor-invoices-2026.ts \
 *     --tenantId <uuid> \
 *     [--file path/to/workbook.xlsx] \
 *     [--dryRun]
 *
 * The script is fully idempotent — safe to re-run. Duplicate invoices are
 * detected by (tenantId, contractorUserId, invoiceNumber) and skipped.
 */

import * as path from "path";
import * as fs from "fs";
import { parseArgs } from "util";

// ─── CLI args ─────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    file: { type: "string" },
    tenantId: { type: "string" },
    dryRun: { type: "boolean", default: false },
  },
});

if (!args.tenantId) {
  console.error(
    "Usage: npx tsx scripts/seed-contractor-invoices-2026.ts --tenantId <id> [--file <path>] [--dryRun]",
  );
  process.exit(1);
}

const DEFAULT_FILE = path.resolve(
  "attached_assets/0_Master_2026_Account_Reconciliation_Ledger_with_Project_Prof_1786477799463.xlsx",
);
const filePath = args.file ? path.resolve(args.file as string) : DEFAULT_FILE;

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const TENANT_ID = args.tenantId as string;
const DRY_RUN = args.dryRun === true;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a date value that may be a MM/DD/YYYY string, YYYY-MM-DD string,
 * or an Excel serial number. Returns ISO date string (YYYY-MM-DD).
 */
function parseDate(raw: string | number | undefined): string {
  if (raw == null || raw === "") return new Date().toISOString().slice(0, 10);
  const s = String(raw).trim();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // MM/DD/YYYY or M/D/YYYY
  const mdyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, mm, dd, yyyy] = mdyMatch;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  // Excel serial number (numeric)
  const n = parseFloat(s);
  if (!isNaN(n) && n > 1000) {
    // Excel epoch: Jan 0 1900 = 0; offset 1 = Jan 1 1900
    // Subtract 2: one for 0-based start, one for Excel's fake Feb 29 1900 leap-year bug
    const ms = Date.UTC(1900, 0, 1) + (n - 2) * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }

  // Fallback — let JS parse it
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  console.warn(`  ⚠ Could not parse date "${raw}", using today`);
  return new Date().toISOString().slice(0, 10);
}

/** Normalise a status string to one of the valid enum values. */
function normaliseStatus(raw: string): string {
  const lower = (raw || "").toLowerCase();
  if (lower.includes("paid")) return "paid";
  if (lower === "approved") return "approved";
  if (lower === "submitted") return "submitted";
  if (lower === "draft") return "draft";
  return "approved"; // all rows come from a reconciled ledger
}

/**
 * Normalise a payment method string to a short token.
 * The DB stores free-text but we canonicalise common values for readability.
 */
function normaliseMethod(raw: string): string {
  const lower = (raw || "").toLowerCase().trim();
  if (!lower || lower === "not specified in screenshot" || lower === "not specified") return "other";
  if (lower.includes("zelle")) return "zelle";
  if (lower.includes("ach")) return "ach";
  if (lower.includes("check") || lower.includes("chk")) return "check";
  if (lower.includes("bill pay")) return "check";
  if (lower.includes("wire")) return "wire";
  return lower.slice(0, 50);
}

/**
 * Given the "Applied To / Allocation" text from the Payments sheet, return an
 * array of candidate invoice number tokens that should be looked up.
 *
 * Handles patterns like:
 *   "Invoice 1001"
 *   "Invoice 1020 (Helux)"
 *   "Invoices 1021, 1024, 1027"
 *   "Invoices 1028 & 1029"
 *   "SA-16 fees (Platinum Equity)"     ← suffix match against invoice numbers
 *   "SA-04 (Narrative Kick-off)"
 *   "SA-05 (Narrative portion)"
 *   "SA-06 + SA-07 ..."
 *   "Matched to invoices 1005 and 1007"
 *   "Matched to invoice 1019 and partial 1020"
 *   "WHPHSYN2026-001"
 *   "SOW-CA-SMT"                       ← no match expected
 */
function parseAppliedTo(raw: string): string[] {
  if (!raw || raw.trim() === "") return [];

  const tokens: string[] = [];

  // Pattern 1: "Invoice[s]? NUMBER1[, NUMBER2[, &/and NUMBER3]]"
  // NUMBER can be alphanumeric with dashes/underscores
  const invoiceWordRe =
    /\binvoices?\s+([\w\-]+(?:\s*[,&+]\s*[\w\-]+)*(?:\s+and\s+[\w\-]+)?(?:\s+(?:and\s+)?partial\s+[\w\-]+)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = invoiceWordRe.exec(raw)) !== null) {
    // Split on commas, &, +, "and"
    const parts = m[1].split(/[\s,&+]+|(?:\s+and\s+)|\bpartial\b/i);
    for (const p of parts) {
      const t = p.trim().replace(/[()]/g, "");
      if (t && /^[\w\-]+$/.test(t)) tokens.push(t);
    }
  }

  if (tokens.length > 0) return tokens;

  // Pattern 2: The whole string is an invoice number (e.g. "WHPHSYN2026-001")
  const trimmed = raw.trim();
  if (/^[\w\-]+$/.test(trimmed)) {
    tokens.push(trimmed);
    return tokens;
  }

  // Pattern 3: Extract SA-XX, SY-XX style tokens from free text
  const suffixRe = /\b((?:SA|SY|SY)-\d+)\b/gi;
  while ((m = suffixRe.exec(raw)) !== null) {
    tokens.push(m[1]);
  }

  // Pattern 4: Bare numbers in the string
  if (tokens.length === 0) {
    const numRe = /\b(\d{4,})\b/g;
    while ((m = numRe.exec(raw)) !== null) {
      tokens.push(m[1]);
    }
  }

  return [...new Set(tokens)];
}

/**
 * Given a set of token candidates and the map of (invoiceNumber → id) for
 * the current contractor, return matching invoice IDs.
 *
 * Falls back to suffix matching when an exact token does not match:
 *   "SA-16" matches invoice number "260201_SA-16"
 *   "SY-03" matches "260321-SY-03"
 */
function resolveInvoiceIds(
  tokens: string[],
  contractorInvoiceMap: Map<string, string>,
): string[] {
  const found: string[] = [];
  for (const token of tokens) {
    // Exact match
    const direct = contractorInvoiceMap.get(token.toUpperCase());
    if (direct) {
      found.push(direct);
      continue;
    }
    // Case-insensitive exact
    for (const [invNum, invId] of contractorInvoiceMap) {
      if (invNum.toUpperCase() === token.toUpperCase()) {
        found.push(invId);
        break;
      }
    }
    if (found[found.length - 1]) continue; // already found above

    // Suffix match: token "SA-16" matches "260201_SA-16"
    const tokenUpper = token.toUpperCase();
    for (const [invNum, invId] of contractorInvoiceMap) {
      if (
        invNum.toUpperCase().endsWith(`-${tokenUpper}`) ||
        invNum.toUpperCase().endsWith(`_${tokenUpper}`)
      ) {
        found.push(invId);
        break;
      }
    }
  }
  return [...new Set(found)];
}

/**
 * Fuzzy project resolver: extracts the leading client-name portion from an
 * engagement string and finds the best partial match in the project name map.
 *
 * Examples:
 *   "Narrative Strategies - Phase 0"  → "Narrative Strategies"
 *   "Helux - retainer"                → "Helux"
 *   "PE / PEA travel"                 → looks for "Platinum Equity" / "PEA"
 *   "CA AI Fluency Days"              → looks for "Curriculum Associates" / "CA"
 *   "SAPA / CISPA - program support"  → looks for "SAPA" or "CISPA"
 */
function makeProjectResolver(projectByName: Map<string, string>) {
  return function resolveProject(engagement: string): string | null {
    if (!engagement || engagement.toLowerCase() === "none") return null;

    // Split on " - " and take the first token as the client name
    const clientToken = engagement.split(/\s+-\s+/)[0].trim().toLowerCase();

    // Exact match on full engagement or first token
    for (const [pName, pId] of projectByName) {
      if (pName === clientToken) return pId;
    }

    // Partial containment: project name contains the client token
    for (const [pName, pId] of projectByName) {
      if (pName.includes(clientToken) || clientToken.includes(pName)) return pId;
    }

    // Handle known abbreviations / aliases
    const aliases: Record<string, string[]> = {
      "pe": ["platinum equity"],
      "pea": ["platinum equity"],
      "pe / pea": ["platinum equity"],
      "ca": ["curriculum associates"],
      "sapa": ["microsoft sapa", "sapa", "cispa"],
      "cispa": ["microsoft sapa", "sapa", "cispa"],
      "sapa / cispa": ["microsoft sapa", "sapa", "cispa"],
      "synozur": ["synozur"],
    };

    const alias = aliases[clientToken];
    if (alias) {
      for (const term of alias) {
        for (const [pName, pId] of projectByName) {
          if (pName.includes(term)) return pId;
        }
      }
    }

    // Word-level fallback: any word in clientToken ≥4 chars that matches a project name
    const words = clientToken.split(/\s+/).filter((w) => w.length >= 4);
    for (const word of words) {
      for (const [pName, pId] of projectByName) {
        if (pName.includes(word)) return pId;
      }
    }

    return null;
  };
}

// ─── Predicate: is this row a real invoice record? ───────────────────────────

function isValidInvoiceRow(row: Record<string, any>): boolean {
  const invNum = String(row["Invoice #"] ?? "").trim();
  if (!invNum) return false;
  // Skip rows where the invoice # is clearly a note/status sentence
  if (invNum.length > 30) return false;
  if (invNum.toUpperCase().startsWith("STATUS:")) return false;
  if (invNum.toUpperCase().startsWith("NOTE:")) return false;
  // Skip rows with zero amount across all columns
  const amount = parseFloat(String(row["Amount ($)"] ?? 0));
  const fees = parseFloat(String(row["Fees ($)"] ?? 0));
  const expenses = parseFloat(String(row["Expenses ($)"] ?? 0));
  if (amount === 0 && fees === 0 && expenses === 0) return false;
  return true;
}

function isValidPaymentRow(row: Record<string, any>): boolean {
  const contractor = String(row["Contractor"] ?? "").trim();
  if (!contractor) return false;
  const dateRaw = row["Payment Date"];
  const dateStr = String(dateRaw ?? "").trim();
  // Skip rows where the date is a note sentence (long string)
  if (dateStr.length > 20) return false;
  const amount = parseFloat(String(row["Amount ($)"] ?? 0));
  if (!amount || amount === 0) return false;
  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Lazy-import xlsx (handles both ESM default-wrap and CJS direct exports)
  let xlsx: typeof import("xlsx");
  try {
    const raw = await import("xlsx");
    xlsx = (raw as any).default ?? raw;
  } catch {
    console.error("xlsx package not found. Run: npm install xlsx");
    process.exit(1);
  }

  // DB imports
  const { db } = await import("../server/db.js");
  const {
    users,
    projects,
    contractorCostInvoices,
    contractorCostInvoiceLines,
    contractorPayments,
    contractorPaymentAllocations,
  } = await import("../shared/schema.js");
  const { eq, and } = await import("drizzle-orm");

  console.log(`📂 Reading workbook: ${filePath}`);
  if (DRY_RUN) console.log("🔍 DRY RUN — no database writes will occur.\n");

  const workbook = xlsx.readFile(filePath);

  // ── Read Invoice Ledger sheet ─────────────────────────────────────────────
  if (!workbook.SheetNames.includes("Invoice Ledger")) {
    console.error('Sheet "Invoice Ledger" not found in workbook.');
    process.exit(1);
  }
  const invoiceSheet = workbook.Sheets["Invoice Ledger"];
  // Rows 0–2 are title/description; row 3 is the real header
  const invoiceRows = xlsx.utils.sheet_to_json(invoiceSheet, { range: 3, defval: "" }) as Record<string, any>[];
  console.log(`📊 Found ${invoiceRows.length} rows in "Invoice Ledger" sheet`);

  // ── Read Payments & Advances sheet ───────────────────────────────────────
  if (!workbook.SheetNames.includes("Payments & Advances")) {
    console.error('Sheet "Payments & Advances" not found in workbook.');
    process.exit(1);
  }
  const paymentSheet = workbook.Sheets["Payments & Advances"];
  const paymentRows = xlsx.utils.sheet_to_json(paymentSheet, { range: 3, defval: "" }) as Record<string, any>[];
  console.log(`📊 Found ${paymentRows.length} rows in "Payments & Advances" sheet\n`);

  // ── Load tenant lookup maps ───────────────────────────────────────────────
  const { tenantUsers: tenantUsersTable } = await import("../shared/schema.js");

  // Users are linked to tenants via the tenant_users join table
  const tenantUserRows = await db
    .select({
      id: users.id,
      name: users.name,
      businessName: users.contractorBusinessName,
    })
    .from(users)
    .innerJoin(tenantUsersTable, and(
      eq(tenantUsersTable.userId, users.id),
      eq(tenantUsersTable.tenantId, TENANT_ID),
    ));

  const tenantProjects = await db
    .select({ id: projects.id, name: projects.name, code: projects.code })
    .from(projects)
    .where(eq(projects.tenantId, TENANT_ID));

  const userByName = new Map<string, string>(
    tenantUserRows.map((u) => [u.name?.toLowerCase() ?? "", u.id]),
  );
  const userByBusiness = new Map<string, string>(
    tenantUserRows
      .filter((u) => u.businessName)
      .map((u) => [u.businessName!.toLowerCase(), u.id]),
  );
  const projectByName = new Map<string, string>(
    tenantProjects.map((p) => [p.name?.toLowerCase() ?? "", p.id]),
  );

  console.log(
    `  Loaded ${tenantUserRows.length} users, ${tenantProjects.length} projects for tenant ${TENANT_ID}`,
  );

  function resolveUser(rawName: string): string | null {
    if (!rawName) return null;
    const n = rawName.toLowerCase().trim();
    return userByName.get(n) ?? userByBusiness.get(n) ?? null;
  }

  const resolveProject = makeProjectResolver(projectByName);

  // ── Check for existing invoices (idempotency) ─────────────────────────────
  const existingInvoices = await db
    .select({
      id: contractorCostInvoices.id,
      contractorUserId: contractorCostInvoices.contractorUserId,
      invoiceNumber: contractorCostInvoices.invoiceNumber,
    })
    .from(contractorCostInvoices)
    .where(eq(contractorCostInvoices.tenantId, TENANT_ID));

  const existingInvoiceKeys = new Set(
    existingInvoices.map((i) => `${i.contractorUserId}::${i.invoiceNumber}`),
  );

  // ── Warnings tracking ────────────────────────────────────────────────────
  const warnings: string[] = [];

  // ── PHASE 1: Insert Invoices ──────────────────────────────────────────────
  console.log("\n─── Phase 1: Invoices ───────────────────────────────────────");

  let invoicesCreated = 0;
  let invoicesSkipped = 0;
  let invoicesInvalid = 0;

  // Map: (contractorUserId → invoiceNumber → invoiceId) for allocation lookup later
  const invoiceIdMap = new Map<string, Map<string, string>>();

  // Seed the map with already-existing invoices so allocations can reference them
  for (const inv of existingInvoices) {
    if (!invoiceIdMap.has(inv.contractorUserId)) {
      invoiceIdMap.set(inv.contractorUserId, new Map());
    }
    invoiceIdMap.get(inv.contractorUserId)!.set(inv.invoiceNumber.toUpperCase(), inv.id);
  }

  for (const row of invoiceRows) {
    if (!isValidInvoiceRow(row)) {
      invoicesInvalid++;
      continue;
    }

    const contractorRaw = String(row["Contractor"] ?? "").trim();
    const invoiceNumberRaw = String(row["Invoice #"] ?? "").trim();
    const invoiceDateRaw = row["Invoice Date"];
    const engagementRaw = String(row["Engagement"] ?? "").trim();
    const hoursRaw = row["Hours / Qty"];
    const rateRaw = row["Rate ($)"];
    const feesRaw = row["Fees ($)"];
    const expensesRaw = row["Expenses ($)"];
    const amountRaw = row["Amount ($)"];
    const statusRaw = String(row["Status"] ?? "").trim();
    const notesRaw = String(row["Notes"] ?? "").trim();
    const billingEntityRaw = String(row["Billing Entity"] ?? "").trim();

    const contractorUserId = resolveUser(contractorRaw);
    if (!contractorUserId) {
      const warn = `  ⚠ Unresolved contractor "${contractorRaw}" — skipping invoice ${invoiceNumberRaw}`;
      console.warn(warn);
      warnings.push(warn);
      invoicesInvalid++;
      continue;
    }

    // Check idempotency
    const dedupeKey = `${contractorUserId}::${invoiceNumberRaw}`;
    if (existingInvoiceKeys.has(dedupeKey)) {
      console.log(`  ⟳ SKIP  ${invoiceNumberRaw} | ${contractorRaw} (already exists)`);
      // Ensure it's in the map for allocation phase
      const existing = existingInvoices.find(
        (i) => i.contractorUserId === contractorUserId && i.invoiceNumber === invoiceNumberRaw,
      );
      if (existing) {
        if (!invoiceIdMap.has(contractorUserId)) invoiceIdMap.set(contractorUserId, new Map());
        invoiceIdMap.get(contractorUserId)!.set(invoiceNumberRaw.toUpperCase(), existing.id);
      }
      invoicesSkipped++;
      continue;
    }

    const projectId = resolveProject(engagementRaw);
    if (!projectId && engagementRaw && engagementRaw.toLowerCase() !== "none") {
      const warn = `  ⚠ No project match for engagement "${engagementRaw}" — invoice ${invoiceNumberRaw} will have no project`;
      console.warn(warn);
      warnings.push(warn);
    }

    const fees = parseFloat(String(feesRaw)) || 0;
    const expenses = parseFloat(String(expensesRaw)) || 0;
    const amount = parseFloat(String(amountRaw)) || 0;
    const total = fees + expenses || amount;
    const hours = hoursRaw ? parseFloat(String(hoursRaw)) || null : null;
    const rate = rateRaw ? parseFloat(String(rateRaw)) || null : null;
    const invoiceDate = parseDate(invoiceDateRaw);
    const status = normaliseStatus(statusRaw);

    console.log(
      `  ✓ ${invoiceNumberRaw.padEnd(24)} | ${contractorRaw.padEnd(22)} | ${invoiceDate} | $${total.toFixed(2).padStart(9)} | ${status}${projectId ? "" : " [no project]"}`,
    );

    if (!DRY_RUN) {
      const [invoice] = await db
        .insert(contractorCostInvoices)
        .values({
          tenantId: TENANT_ID,
          contractorUserId,
          projectId: projectId ?? null,
          invoiceNumber: invoiceNumberRaw,
          engagementLabel: engagementRaw || null,
          invoiceDate,
          total: total.toFixed(2),
          status,
          notes: [notesRaw, billingEntityRaw ? `Billing entity: ${billingEntityRaw}` : ""]
            .filter(Boolean)
            .join(" | ") || null,
          createdBy: null,
        })
        .returning();

      // Record in the map for allocation lookups
      if (!invoiceIdMap.has(contractorUserId)) {
        invoiceIdMap.set(contractorUserId, new Map());
      }
      invoiceIdMap.get(contractorUserId)!.set(invoiceNumberRaw.toUpperCase(), invoice.id);

      // Build invoice lines
      const lineInserts: any[] = [];
      if (fees > 0) {
        lineInserts.push({
          invoiceId: invoice.id,
          lineNumber: 1,
          kind: "service",
          description: engagementRaw ? `Services — ${engagementRaw}` : "Professional services",
          hours: hours != null ? String(hours) : null,
          rate: rate != null ? String(rate) : null,
          amount: fees.toFixed(2),
          reconcileStatus: "unreconciled",
        });
      }
      if (expenses > 0) {
        lineInserts.push({
          invoiceId: invoice.id,
          lineNumber: lineInserts.length + 1,
          kind: "expense",
          description: "Reimbursable expenses",
          hours: null,
          rate: null,
          amount: expenses.toFixed(2),
          reconcileStatus: "unreconciled",
        });
      }
      // Fallback: single line when neither fees nor expenses are split out
      if (lineInserts.length === 0 && total > 0) {
        lineInserts.push({
          invoiceId: invoice.id,
          lineNumber: 1,
          kind: "service",
          description: engagementRaw ? `Services — ${engagementRaw}` : "Services",
          hours: hours != null ? String(hours) : null,
          rate: rate != null ? String(rate) : null,
          amount: total.toFixed(2),
          reconcileStatus: "unreconciled",
        });
      }
      if (lineInserts.length > 0) {
        await db.insert(contractorCostInvoiceLines).values(lineInserts);
      }
    } else {
      // Dry-run: still populate the map with a placeholder so payment resolution works
      if (!invoiceIdMap.has(contractorUserId)) invoiceIdMap.set(contractorUserId, new Map());
      invoiceIdMap.get(contractorUserId)!.set(invoiceNumberRaw.toUpperCase(), `[dry-run-${invoiceNumberRaw}]`);
    }

    existingInvoiceKeys.add(dedupeKey);
    invoicesCreated++;
  }

  console.log(
    `\n  Invoices: ${invoicesCreated} created, ${invoicesSkipped} skipped (already existed), ${invoicesInvalid} invalid/filtered`,
  );

  // ── PHASE 2: Insert Payments & Allocations ────────────────────────────────
  console.log("\n─── Phase 2: Payments & Allocations ────────────────────────");

  // Check existing payments for idempotency
  // Key: contractorUserId + paymentDate + amount (sufficient for our dataset)
  const existingPayments = await db
    .select({
      id: contractorPayments.id,
      contractorUserId: contractorPayments.contractorUserId,
      paymentDate: contractorPayments.paymentDate,
      amount: contractorPayments.amount,
    })
    .from(contractorPayments)
    .where(eq(contractorPayments.tenantId, TENANT_ID));

  const existingPaymentKeys = new Set(
    existingPayments.map((p) => `${p.contractorUserId}::${p.paymentDate}::${p.amount}`),
  );

  let paymentsCreated = 0;
  let paymentsSkipped = 0;
  let paymentsInvalid = 0;
  let allocationsCreated = 0;

  for (const row of paymentRows) {
    if (!isValidPaymentRow(row)) {
      paymentsInvalid++;
      continue;
    }

    const contractorRaw = String(row["Contractor"] ?? "").trim();
    const dateRaw = row["Payment Date"];
    const methodRaw = String(row["Method"] ?? "").trim();
    const amountRaw = row["Amount ($)"];
    const appliedToRaw = String(row["Applied To / Allocation"] ?? "").trim();
    const billingEntityRaw = String(row["Billing Entity"] ?? "").trim();
    const notesRaw = String(row["Notes"] ?? "").trim();

    const contractorUserId = resolveUser(contractorRaw);
    if (!contractorUserId) {
      const warn = `  ⚠ Unresolved contractor "${contractorRaw}" — skipping payment`;
      console.warn(warn);
      warnings.push(warn);
      paymentsInvalid++;
      continue;
    }

    const amount = parseFloat(String(amountRaw));
    if (!amount || amount <= 0) {
      paymentsInvalid++;
      continue;
    }

    const paymentDate = parseDate(dateRaw);
    const method = normaliseMethod(methodRaw);

    // Idempotency check
    const dedupKey = `${contractorUserId}::${paymentDate}::${amount.toFixed(2)}`;
    if (existingPaymentKeys.has(dedupKey)) {
      console.log(`  ⟳ SKIP  ${paymentDate} | ${contractorRaw.padEnd(22)} | $${amount.toFixed(2)} (already exists)`);
      paymentsSkipped++;
      continue;
    }

    // Resolve invoice allocations
    const tokens = parseAppliedTo(appliedToRaw);
    const contractorInvMap = invoiceIdMap.get(contractorUserId) ?? new Map<string, string>();
    const matchedInvoiceIds = resolveInvoiceIds(tokens, contractorInvMap);

    if (tokens.length > 0 && matchedInvoiceIds.length === 0) {
      const warn = `  ⚠ Could not match allocation "${appliedToRaw}" to any invoice for ${contractorRaw}`;
      console.warn(warn);
      warnings.push(warn);
    }

    const allocationLabel = matchedInvoiceIds.length > 0
      ? `→ ${matchedInvoiceIds.length} invoice(s)`
      : "(no allocation)";

    console.log(
      `  ✓ ${paymentDate} | ${contractorRaw.padEnd(22)} | $${amount.toFixed(2).padStart(9)} | ${method.padEnd(10)} | ${allocationLabel}`,
    );

    if (!DRY_RUN) {
      const [payment] = await db
        .insert(contractorPayments)
        .values({
          tenantId: TENANT_ID,
          contractorUserId,
          payeeEntityName: billingEntityRaw || null,
          paymentDate,
          paymentMethod: method,
          amount: amount.toFixed(2),
          reference: appliedToRaw || null,
          notes: notesRaw || null,
          unmatchedAmount: matchedInvoiceIds.length > 0 ? "0.00" : amount.toFixed(2),
          status: matchedInvoiceIds.length > 0 ? "matched" : "unmatched",
          createdBy: null,
        })
        .returning();

      if (matchedInvoiceIds.length > 0) {
        const perInvoice = (amount / matchedInvoiceIds.length).toFixed(2);
        const allocValues = matchedInvoiceIds.map((invoiceId) => ({
          paymentId: payment.id,
          invoiceId,
          allocatedAmount: perInvoice,
        }));
        await db.insert(contractorPaymentAllocations).values(allocValues);
        allocationsCreated += allocValues.length;
      }
    }

    existingPaymentKeys.add(dedupKey);
    paymentsCreated++;
  }

  console.log(
    `\n  Payments: ${paymentsCreated} created, ${paymentsSkipped} skipped (already existed), ${paymentsInvalid} invalid/filtered`,
  );
  console.log(`  Allocations: ${allocationsCreated} created`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`✅ Seed ${DRY_RUN ? "(DRY RUN)" : "complete"}`);
  console.log(`   Invoices : ${invoicesCreated} created  ${invoicesSkipped} skipped`);
  console.log(`   Payments : ${paymentsCreated} created  ${paymentsSkipped} skipped`);
  console.log(`   Allocations: ${allocationsCreated}`);

  if (warnings.length > 0) {
    console.log(`\n⚠  ${warnings.length} warning(s) — manual follow-up may be needed:`);
    for (const w of warnings) console.log(w);
  } else {
    console.log("\n✓ No warnings.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
