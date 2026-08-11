/**
 * Paystub PDF renderer.
 * Accepts run + run-item + reimbursements + YTD totals and produces a clean,
 * formatted HTML string (Letter-sized) that is then converted to PDF by the
 * shared htmlToPdf() helper.
 */

import { htmlToPdf } from "./html-to-pdf";

const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "—";
  // Dates come through as ISO date strings (YYYY-MM-DD or full ISO)
  const s = String(d).slice(0, 10);
  const [y, m, day] = s.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[parseInt(m, 10) - 1]} ${parseInt(day, 10)}, ${y}`;
};

function row(label: string, amount: number, bold = false): string {
  const style = bold ? "font-weight:700;border-top:1px solid #e2e8f0;padding-top:6px;" : "";
  return `
    <tr>
      <td style="padding:4px 0;${style}">${label}</td>
      <td style="padding:4px 0;text-align:right;${style}">${usd(amount)}</td>
    </tr>`;
}

function section(title: string, rows: string, note?: string): string {
  return `
    <div style="margin-bottom:18px;">
      <div style="font-size:13px;font-weight:700;color:#1e293b;border-bottom:2px solid #3b82f6;padding-bottom:4px;margin-bottom:8px;">${title}</div>
      ${note ? `<p style="font-size:11px;color:#64748b;margin:0 0 6px 0;">${note}</p>` : ""}
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

export interface PaystubPdfInput {
  companyName?: string;
  employeeName?: string;
  run: {
    payDate: string;
    periodStart: string;
    periodEnd: string;
    status?: string;
  };
  item: {
    grossCents: number;
    netPayCents: number;
    employeeTaxCents?: number;
    preTaxDeductionCents?: number;
    postTaxDeductionCents?: number;
    breakdown?: { lines?: Array<{ category: string; label: string; amountCents: number }> };
  };
  reimbursements?: Array<{
    id: string;
    amountCents: number;
    category: string;
    description?: string | null;
  }>;
  ytd?: {
    grossCents: number;
    employeeTaxCents: number;
    preTaxDeductionCents: number;
    postTaxDeductionCents: number;
    netPayCents: number;
  };
}

function renderHtml(input: PaystubPdfInput): string {
  const { companyName, employeeName, run, item, reimbursements = [], ytd } = input;
  const lines = (item.breakdown?.lines ?? []) as Array<{ category: string; label: string; amountCents: number }>;
  const wage = lines.filter(l => l.category === "wages");
  const preTax = lines.filter(l => l.category === "pre_tax_deduction");
  const eeTax = lines.filter(l => l.category === "employee_tax");
  const postTax = lines.filter(
    l => l.category === "post_tax" || l.category === "garnishment",
  );
  const reimbursementTotal = reimbursements.reduce((s, r) => s + r.amountCents, 0);
  const wagesNet = item.netPayCents - reimbursementTotal;

  // Earnings section
  const earningsRows =
    wage.map(l => row(l.label, l.amountCents)).join("") +
    row("Gross pay", item.grossCents, true);

  // Pre-tax deductions
  const preTaxSection =
    preTax.length > 0
      ? section("Pre-tax deductions", preTax.map(l => row(l.label, l.amountCents)).join(""))
      : "";

  // Taxes
  const taxRows = eeTax.map(l => row(l.label, l.amountCents)).join("");
  const taxSection = section("Taxes withheld", taxRows || row("No taxes withheld", 0));

  // Post-tax
  const postTaxSection =
    postTax.length > 0
      ? section("Other deductions", postTax.map(l => row(l.label, l.amountCents)).join(""))
      : "";

  // Reimbursements
  const reimbSection =
    reimbursements.length > 0
      ? section(
          "Reimbursements (not taxable)",
          reimbursements
            .map(r => row(r.description ?? r.category, r.amountCents))
            .join("") + row("Total reimbursements", reimbursementTotal, true),
          "Expense reimbursements paid alongside paycheck — not included in W-2 Box 1 wages.",
        )
      : "";

  // Total deposited
  const depositSection = `
    <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin-bottom:18px;">
      <div style="font-size:13px;font-weight:700;color:#0369a1;margin-bottom:6px;">Total deposited</div>
      <div style="font-size:26px;font-weight:700;color:#0f172a;">${usd(item.netPayCents)}</div>
      ${
        reimbursementTotal > 0
          ? `<div style="font-size:11px;color:#64748b;margin-top:4px;">= ${usd(wagesNet)} wages (after tax) + ${usd(reimbursementTotal)} reimbursements</div>`
          : ""
      }
      <div style="font-size:10px;color:#94a3b8;margin-top:8px;">Tax tables are simplified (2024 brackets, estimated). Year-end W-2 / 1099 is the source of truth.</div>
    </div>`;

  // YTD
  const ytdSection = ytd
    ? section(
        `Year to date (through ${fmtDate(run.payDate)})`,
        row("YTD gross", ytd.grossCents) +
          (ytd.preTaxDeductionCents > 0 ? row("YTD pre-tax deductions", ytd.preTaxDeductionCents) : "") +
          row("YTD taxes withheld", ytd.employeeTaxCents) +
          (ytd.postTaxDeductionCents > 0 ? row("YTD other deductions", ytd.postTaxDeductionCents) : "") +
          row("YTD net pay", ytd.netPayCents, true),
        `Totals across all finalized paychecks in ${String(run.payDate).slice(0, 4)}, through this pay date.`,
      )
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Paystub – ${fmtDate(run.payDate)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #0f172a; font-size: 13px; }
</style>
</head>
<body style="padding:0;margin:0;">
  <div style="max-width:680px;margin:0 auto;padding:32px 40px;">

    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #0f172a;">
      <div>
        <div style="font-size:22px;font-weight:700;color:#0f172a;">${companyName ? escapeHtml(companyName) : "Pay Statement"}</div>
        ${employeeName ? `<div style="font-size:14px;color:#475569;margin-top:2px;">${escapeHtml(employeeName)}</div>` : ""}
      </div>
      <div style="text-align:right;">
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;">Pay Statement</div>
        <div style="font-size:13px;font-weight:600;color:#0f172a;margin-top:2px;">${fmtDate(run.payDate)}</div>
      </div>
    </div>

    <!-- Pay period banner -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;margin-bottom:20px;display:flex;gap:32px;">
      <div>
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Pay period</div>
        <div style="font-size:13px;font-weight:600;">${fmtDate(run.periodStart)} – ${fmtDate(run.periodEnd)}</div>
      </div>
      <div>
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">Pay date</div>
        <div style="font-size:13px;font-weight:600;">${fmtDate(run.payDate)}</div>
      </div>
    </div>

    <!-- Earnings -->
    ${section("Earnings", earningsRows)}

    <!-- Pre-tax deductions -->
    ${preTaxSection}

    <!-- Taxes withheld -->
    ${taxSection}

    <!-- Post-tax deductions -->
    ${postTaxSection}

    <!-- Reimbursements -->
    ${reimbSection}

    <!-- Total deposited -->
    ${depositSection}

    <!-- Year to date -->
    ${ytdSection}

    <!-- Footer -->
    <div style="margin-top:32px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center;">
      Generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
      · This document is for informational purposes only
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build a PDF buffer for a single paystub.
 */
export async function renderPaystubPdf(input: PaystubPdfInput): Promise<Buffer> {
  const html = renderHtml(input);
  return htmlToPdf(html, {
    format: "Letter",
    margin: { top: "0.4in", right: "0.4in", bottom: "0.4in", left: "0.4in" },
  });
}
