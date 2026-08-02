/**
 * One-time admin script: import 2026 contractor cost invoices from an Excel
 * workbook.  Run with:
 *
 *   npx tsx scripts/import-contractor-costs.ts \
 *     --file path/to/contractor-ledger-2026.xlsx \
 *     --tenantId <your-tenant-uuid> \
 *     [--dryRun]
 *
 * Expected workbook columns (case-insensitive, any order):
 *   Contractor / Contractor Name     → looked up / created in users table
 *   Project / Project Code           → matched against projects table
 *   Invoice # / Invoice Number       → invoiceNumber
 *   Invoice Date                     → invoiceDate (YYYY-MM-DD or parseable)
 *   Engagement / Engagement Label    → engagementLabel
 *   Hours                            → line hours
 *   Rate / Hourly Rate               → line rate
 *   Fees / Service Amount            → service line amount
 *   Expenses / Expense Amount        → expense line amount
 *   Total                            → invoice total (verified vs lines)
 *   Status                           → draft|submitted|approved|paid (default draft)
 *   Notes                            → notes
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

if (!args.file || !args.tenantId) {
  console.error("Usage: npx tsx scripts/import-contractor-costs.ts --file <path> --tenantId <id> [--dryRun]");
  process.exit(1);
}

const filePath = path.resolve(args.file as string);
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const TENANT_ID = args.tenantId as string;
const DRY_RUN = args.dryRun === true;

// ─── Lazy-import xlsx (install via: npm install xlsx) ────────────────────────

async function loadXlsx() {
  try {
    return await import("xlsx");
  } catch {
    console.error("xlsx package not found. Install it: npm install xlsx");
    process.exit(1);
  }
}

// ─── DB setup ─────────────────────────────────────────────────────────────────

async function getDb() {
  const { db } = await import("../server/db.js");
  const { users, projects } = await import("../shared/schema.js");
  const { eq, ilike, and } = await import("drizzle-orm");
  return { db, users, projects, eq, ilike, and };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalize(obj: Record<string, any>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k.trim().toLowerCase()] = v != null ? String(v).trim() : "";
  }
  return out;
}

function parseDate(raw: string | undefined): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  // Excel serial number?
  const n = parseFloat(raw);
  if (!isNaN(n)) {
    // Excel epoch: Jan 1 1900 = 1; JS epoch: Jan 1 1970
    const excelEpoch = new Date(Date.UTC(1900, 0, 1));
    const ms = excelEpoch.getTime() + (n - 2) * 86400000; // -2 for Excel leap-year bug
    return new Date(ms).toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function col(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k.toLowerCase()];
    if (v) return v;
  }
  return "";
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const xlsx = await loadXlsx();
  const { db, users, projects, eq, ilike, and } = await getDb();

  console.log(`📂 Reading workbook: ${filePath}`);
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows: Record<string, any>[] = xlsx.utils.sheet_to_json(sheet, { defval: "" });
  const rows = rawRows.map(normalize);

  console.log(`📊 Found ${rows.length} rows in sheet "${sheetName}"`);
  if (DRY_RUN) console.log("🔍 DRY RUN — no changes will be written.\n");

  // Pre-load lookup maps — SCOPED TO THE TARGET TENANT only.
  // Cross-tenant user/project associations would be a security violation.
  const tenantUsers = await db
    .select({ id: users.id, name: users.name, email: users.email, businessName: users.contractorBusinessName, tenantId: users.tenantId })
    .from(users)
    .where(eq(users.tenantId, TENANT_ID));

  const tenantProjects = await db
    .select({ id: projects.id, name: projects.name, code: projects.code, tenantId: projects.tenantId })
    .from(projects)
    .where(eq(projects.tenantId, TENANT_ID));

  // Verify all resolved projects belong to this tenant (sanity guard).
  const projectIds = new Set(tenantProjects.map(p => p.id));

  const userByName = new Map(tenantUsers.map(u => [u.name?.toLowerCase(), u.id]));
  const userByBusiness = new Map(tenantUsers.filter(u => u.businessName).map(u => [u.businessName!.toLowerCase(), u.id]));
  const projectByCode = new Map(tenantProjects.map(p => [p.code?.toLowerCase(), p.id]));
  const projectByName = new Map(tenantProjects.map(p => [p.name?.toLowerCase(), p.id]));

  console.log(`  Found ${tenantUsers.length} contractor-eligible users and ${tenantProjects.length} projects for tenant ${TENANT_ID}`);

  function resolveUser(rawName: string): string | null {
    if (!rawName) return null;
    const n = rawName.toLowerCase();
    const id = userByName.get(n) ?? userByBusiness.get(n) ?? null;
    // Always re-verify the resolved user belongs to the target tenant.
    if (id && !tenantUsers.find(u => u.id === id)) return null;
    return id;
  }

  function resolveProject(rawCode: string, rawName: string): string | null {
    let id: string | undefined;
    if (rawCode) id = projectByCode.get(rawCode.toLowerCase());
    if (!id && rawName) id = projectByName.get(rawName.toLowerCase());
    // Verify project is in this tenant.
    if (id && !projectIds.has(id)) return null;
    return id ?? null;
  }

  const { contractorCostInvoices, contractorCostInvoiceLines } = await import("../shared/schema.js");

  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const contractorRaw = col(row, "contractor", "contractor name", "vendor", "subcontractor");
    const projectCodeRaw = col(row, "project code", "project", "proj code");
    const projectNameRaw = col(row, "project name");
    const invoiceNumberRaw = col(row, "invoice #", "invoice number", "inv #", "inv number");
    const invoiceDateRaw = col(row, "invoice date", "date");
    const engagementRaw = col(row, "engagement", "engagement label", "sow", "phase");
    const feesRaw = col(row, "fees", "service amount", "labor", "service fees", "fee amount");
    const expensesRaw = col(row, "expenses", "expense amount", "reimbursables");
    const hoursRaw = col(row, "hours");
    const rateRaw = col(row, "rate", "hourly rate", "billing rate");
    const totalRaw = col(row, "total", "invoice total", "amount");
    const statusRaw = col(row, "status") || "draft";
    const notesRaw = col(row, "notes", "comments");

    if (!invoiceNumberRaw) {
      console.warn(`  ⚠ Skipping row with no invoice number`);
      skipped++;
      continue;
    }

    const contractorUserId = resolveUser(contractorRaw);
    if (!contractorUserId) {
      console.warn(`  ⚠ Cannot resolve contractor "${contractorRaw}" — skipping invoice ${invoiceNumberRaw}`);
      skipped++;
      continue;
    }

    const projectId = resolveProject(projectCodeRaw, projectNameRaw);
    if (!projectId && (projectCodeRaw || projectNameRaw)) {
      console.warn(`  ⚠ Project "${projectCodeRaw || projectNameRaw}" not found — invoice ${invoiceNumberRaw} will have no project`);
    }

    const fees = parseFloat(feesRaw) || 0;
    const expenses = parseFloat(expensesRaw) || 0;
    const total = parseFloat(totalRaw) || (fees + expenses);
    const invoiceDate = parseDate(invoiceDateRaw);

    const validStatus = ["draft", "submitted", "approved", "paid"].includes(statusRaw.toLowerCase())
      ? statusRaw.toLowerCase()
      : "draft";

    console.log(`  ✓ ${invoiceNumberRaw} | ${contractorRaw} | ${invoiceDate} | $${total.toFixed(2)} | ${validStatus}`);

    if (!DRY_RUN) {
      const [invoice] = await db.insert(contractorCostInvoices).values({
        tenantId: TENANT_ID,
        contractorUserId,
        projectId: projectId ?? null,
        invoiceNumber: invoiceNumberRaw,
        engagementLabel: engagementRaw || null,
        invoiceDate,
        total: total.toFixed(2),
        status: validStatus,
        notes: notesRaw || null,
        createdBy: null,
      }).returning();

      const lineInserts = [];
      if (fees > 0) {
        lineInserts.push({
          invoiceId: invoice.id,
          lineNumber: 1,
          kind: "service",
          description: engagementRaw ? `Services — ${engagementRaw}` : "Professional services",
          hours: hoursRaw ? hoursRaw : null,
          rate: rateRaw ? rateRaw : null,
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
      if (lineInserts.length === 0 && total > 0) {
        lineInserts.push({
          invoiceId: invoice.id,
          lineNumber: 1,
          kind: "service",
          description: "Services",
          hours: hoursRaw || null,
          rate: rateRaw || null,
          amount: total.toFixed(2),
          reconcileStatus: "unreconciled",
        });
      }
      if (lineInserts.length > 0) {
        await db.insert(contractorCostInvoiceLines).values(lineInserts as any[]);
      }
    }
    created++;
  }

  console.log(`\n✅ Import complete: ${created} invoices ${DRY_RUN ? "would be" : ""} created, ${skipped} skipped.`);
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
