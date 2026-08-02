import type { Express, Request } from "express";
import { db } from "../db.js";
import { storage } from "../storage/index.js";
import {
  projects,
  clients,
  users,
  sows,
  projectRevenueEntries,
  contractorCostInvoices,
  contractorCostInvoiceLines,
} from "@shared/schema";
import { eq, sql, inArray, and } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

interface AnalyticsRouteDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
}

const FINANCE_ROLES = ["admin", "billing-admin", "executive", "pm", "portfolio-manager"];
const ADMIN_ROLES = ["admin", "billing-admin", "executive"];

function getTenantId(req: Request): string | undefined {
  return (req as any).user?.tenantId;
}

export function registerAnalyticsRoutes(app: Express, deps: AnalyticsRouteDeps) {
  const { requireAuth, requireRole } = deps;

  // ── GET /api/analytics/profitability ────────────────────────────────────────
  // Returns per-project profitability records.
  // Query params: clientId, pmId, dateFrom, dateTo, groupBy=account, format=csv
  app.get(
    "/api/analytics/profitability",
    requireAuth,
    requireRole(FINANCE_ROLES),
    async (req, res) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ message: "Tenant context required" });

        const { clientId, pmId, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
        const format = req.query.format as string | undefined;
        const groupBy = req.query.groupBy as string | undefined;

        const rows = await getProjectProfitabilityRows(tenantId, { clientId, pmId, dateFrom, dateTo });

        if (groupBy === "account") {
          const rollup = buildAccountRollup(rows);
          if (format === "csv") return sendCsv(res, flattenAccountRollup(rollup), "profitability_by_account");
          return res.json(rollup);
        }

        if (format === "csv") return sendCsv(res, rows, "profitability");
        res.json(rows);
      } catch (err) {
        console.error("[analytics/profitability]", err);
        res.status(500).json({ message: "Failed to fetch profitability data" });
      }
    }
  );

  // ── GET /api/analytics/profitability/:projectId ──────────────────────────────
  // Returns detailed profitability breakdown for a single project.
  app.get(
    "/api/analytics/profitability/:projectId",
    requireAuth,
    requireRole(FINANCE_ROLES),
    async (req, res) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ message: "Tenant context required" });

        const { projectId } = req.params;
        const detail = await getProjectProfitabilityDetail(tenantId, projectId);
        if (!detail) return res.status(404).json({ message: "Project not found" });
        res.json(detail);
      } catch (err) {
        console.error("[analytics/profitability/:projectId]", err);
        res.status(500).json({ message: "Failed to fetch project profitability detail" });
      }
    }
  );

  // ── GET /api/analytics/profitability-trend ───────────────────────────────────
  // Returns monthly estimated vs actual margin trend.
  app.get(
    "/api/analytics/profitability-trend",
    requireAuth,
    requireRole(ADMIN_ROLES),
    async (req, res) => {
      try {
        const tenantId = getTenantId(req);
        if (!tenantId) return res.status(400).json({ message: "Tenant context required" });

        const trend = await getMarginAccuracyTrend(tenantId);
        res.json(trend);
      } catch (err) {
        console.error("[analytics/profitability-trend]", err);
        res.status(500).json({ message: "Failed to fetch margin trend" });
      }
    }
  );
}

// ─── Core query helpers ───────────────────────────────────────────────────────

export interface ProjectProfitabilityRow {
  projectId: string;
  projectName: string;
  projectCode: string | null;
  clientId: string | null;
  clientName: string;
  pmId: string | null;
  pmName: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  // Revenue
  recognizedRevenue: number;
  pendingRevenue: number;
  totalRevenue: number;
  // Costs (contractor cost invoices: approved + paid)
  feesCost: number;
  expensesCost: number;
  totalCost: number;
  // Profitability
  grossProfit: number;
  grossMarginPct: number;
  // Estimate
  sowValue: number;
  estimatedMarginPct: number;
  marginVariancePct: number;
}

async function getProjectProfitabilityRows(
  tenantId: string,
  filters: { clientId?: string; pmId?: string; dateFrom?: string; dateTo?: string }
): Promise<ProjectProfitabilityRow[]> {
  const pmAlias = alias(users, "pm_user");

  // 1. Fetch all projects for this tenant (with client + PM)
  const projectRows = await db
    .select({
      project: projects,
      client: clients,
      pmFirst: pmAlias.firstName,
      pmLast: pmAlias.lastName,
      pmEmail: pmAlias.email,
    })
    .from(projects)
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(pmAlias, eq(projects.pm, pmAlias.id))
    .where(
      and(
        eq(projects.tenantId, tenantId),
        filters.clientId ? eq(projects.clientId, filters.clientId) : undefined,
        filters.pmId ? eq(projects.pm, filters.pmId) : undefined,
      )
    );

  if (projectRows.length === 0) return [];

  const projectIds = projectRows.map(r => r.project.id);
  const idList = sql.join(projectIds.map(id => sql`${id}::text`), sql`,`);

  // 2. Recognized revenue per project
  const revenueRows = await db
    .select({
      projectId: projectRevenueEntries.projectId,
      recognized: projectRevenueEntries.recognized,
      amount: projectRevenueEntries.amount,
    })
    .from(projectRevenueEntries)
    .where(inArray(projectRevenueEntries.projectId, projectIds));

  const recognizedRevMap = new Map<string, number>();
  const pendingRevMap = new Map<string, number>();
  for (const r of revenueRows) {
    const amt = Number(r.amount) || 0;
    if (r.recognized) {
      recognizedRevMap.set(r.projectId, (recognizedRevMap.get(r.projectId) || 0) + amt);
    } else {
      pendingRevMap.set(r.projectId, (pendingRevMap.get(r.projectId) || 0) + amt);
    }
  }

  // 3. Contractor cost totals per project (approved + paid only)
  type CostRow = { project_id: string; fees_cost: string; expenses_cost: string };
  const costAgg = await db.execute<CostRow>(sql`
    SELECT
      cci.project_id,
      COALESCE(SUM(CASE WHEN ccil.kind = 'service' THEN CAST(ccil.amount AS NUMERIC) ELSE 0 END), 0) AS fees_cost,
      COALESCE(SUM(CASE WHEN ccil.kind = 'expense' THEN CAST(ccil.amount AS NUMERIC) ELSE 0 END), 0) AS expenses_cost
    FROM contractor_cost_invoices cci
    JOIN contractor_cost_invoice_lines ccil ON ccil.invoice_id = cci.id
    WHERE cci.tenant_id = ${tenantId}
      AND cci.status IN ('approved', 'paid')
      AND cci.project_id IN (${idList})
      ${filters.dateFrom ? sql`AND cci.invoice_date >= ${filters.dateFrom}` : sql``}
      ${filters.dateTo ? sql`AND cci.invoice_date <= ${filters.dateTo}` : sql``}
    GROUP BY cci.project_id
  `);
  const feesCostMap = new Map<string, number>();
  const expCostMap = new Map<string, number>();
  for (const r of costAgg.rows) {
    feesCostMap.set(r.project_id, Number(r.fees_cost) || 0);
    expCostMap.set(r.project_id, Number(r.expenses_cost) || 0);
  }

  // 4. Approved SOW values per project (estimate)
  const sowRows = await db
    .select({
      projectId: sows.projectId,
      total: sql<number>`COALESCE(SUM(CAST(${sows.value} AS NUMERIC)), 0)`,
    })
    .from(sows)
    .where(and(inArray(sows.projectId, projectIds), eq(sows.status, "approved")))
    .groupBy(sows.projectId);
  const sowMap = new Map<string, number>();
  for (const r of sowRows) sowMap.set(r.projectId, Number(r.total) || 0);

  // 5. Assemble results
  return projectRows.map(r => {
    const p = r.project;
    const pmFullName = `${r.pmFirst || ""} ${r.pmLast || ""}`.trim();
    const pmName = pmFullName || r.pmEmail || null;

    const recognizedRevenue = recognizedRevMap.get(p.id) || 0;
    const pendingRevenue = pendingRevMap.get(p.id) || 0;
    const totalRevenue = recognizedRevenue + pendingRevenue;

    const feesCost = feesCostMap.get(p.id) || 0;
    const expensesCost = expCostMap.get(p.id) || 0;
    const totalCost = feesCost + expensesCost;

    const grossProfit = totalRevenue - totalCost;
    const grossMarginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    const sowValue = sowMap.get(p.id) || 0;
    // Estimated margin: assume 100% of SOW is revenue, no way to estimate cost without budget
    // Use SOW ceiling as the "plan" — we show estimated margin only when we have SOW data
    const estimatedMarginPct = 0; // filled by detail query when available
    const marginVariancePct = grossMarginPct - estimatedMarginPct;

    return {
      projectId: p.id,
      projectName: p.name,
      projectCode: p.code || null,
      clientId: p.clientId || null,
      clientName: r.client?.name || "No Client",
      pmId: p.pm || null,
      pmName,
      status: p.status || "active",
      startDate: p.startDate ? String(p.startDate) : null,
      endDate: p.endDate ? String(p.endDate) : null,
      recognizedRevenue,
      pendingRevenue,
      totalRevenue,
      feesCost,
      expensesCost,
      totalCost,
      grossProfit,
      grossMarginPct: Math.round(grossMarginPct * 10) / 10,
      sowValue,
      estimatedMarginPct,
      marginVariancePct: Math.round(marginVariancePct * 10) / 10,
    };
  });
}

// ─── Account rollup ───────────────────────────────────────────────────────────

export interface AccountRollupRow {
  clientId: string | null;
  clientName: string;
  projectCount: number;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  grossMarginPct: number;
  projects: ProjectProfitabilityRow[];
}

function buildAccountRollup(rows: ProjectProfitabilityRow[]): AccountRollupRow[] {
  const map = new Map<string, AccountRollupRow>();
  for (const r of rows) {
    const key = r.clientId || "__no_client__";
    if (!map.has(key)) {
      map.set(key, {
        clientId: r.clientId,
        clientName: r.clientName,
        projectCount: 0,
        totalRevenue: 0,
        totalCost: 0,
        grossProfit: 0,
        grossMarginPct: 0,
        projects: [],
      });
    }
    const acc = map.get(key)!;
    acc.projectCount++;
    acc.totalRevenue += r.totalRevenue;
    acc.totalCost += r.totalCost;
    acc.grossProfit += r.grossProfit;
    acc.projects.push(r);
  }
  for (const acc of map.values()) {
    acc.grossMarginPct = acc.totalRevenue > 0
      ? Math.round((acc.grossProfit / acc.totalRevenue) * 1000) / 10
      : 0;
  }
  return [...map.values()].sort((a, b) => b.totalRevenue - a.totalRevenue);
}

function flattenAccountRollup(rollup: AccountRollupRow[]) {
  return rollup.flatMap(a =>
    a.projects.map(p => ({ account: a.clientName, ...p }))
  );
}

// ─── Project detail ───────────────────────────────────────────────────────────

export interface ProjectProfitabilityDetail {
  project: {
    id: string;
    name: string;
    code: string | null;
    status: string;
    clientName: string;
    pmName: string | null;
    startDate: string | null;
    endDate: string | null;
  };
  revenueSummary: {
    recognizedRevenue: number;
    pendingRevenue: number;
    totalRevenue: number;
    entries: {
      id: string;
      description: string | null;
      amount: number;
      recognized: boolean;
      sourceType: string;
      entryDate: string | null;
    }[];
  };
  costSummary: {
    feesCost: number;
    expensesCost: number;
    totalCost: number;
    byContractor: {
      contractorId: string;
      contractorName: string;
      feesCost: number;
      expensesCost: number;
      totalCost: number;
      invoiceCount: number;
    }[];
  };
  profitability: {
    grossProfit: number;
    grossMarginPct: number;
    sowValue: number;
    estimatedMarginPct: number;
    marginVariancePct: number;
    marginVarianceDollars: number;
  };
}

async function getProjectProfitabilityDetail(
  tenantId: string,
  projectId: string
): Promise<ProjectProfitabilityDetail | null> {
  const pmAlias = alias(users, "pm_user");

  // Fetch project
  const [projectRow] = await db
    .select({
      project: projects,
      client: clients,
      pmFirst: pmAlias.firstName,
      pmLast: pmAlias.lastName,
      pmEmail: pmAlias.email,
    })
    .from(projects)
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(pmAlias, eq(projects.pm, pmAlias.id))
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1);

  if (!projectRow) return null;

  const p = projectRow.project;

  // Revenue entries
  const revenueEntries = await db
    .select()
    .from(projectRevenueEntries)
    .where(eq(projectRevenueEntries.projectId, projectId));

  const recognizedRevenue = revenueEntries
    .filter(e => e.recognized)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const pendingRevenue = revenueEntries
    .filter(e => !e.recognized)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalRevenue = recognizedRevenue + pendingRevenue;

  // Contractor cost invoices with contractor breakdown
  type InvRow = {
    contractor_id: string;
    contractor_name: string;
    fees_cost: string;
    expenses_cost: string;
    invoice_count: string;
  };
  const invAgg = await db.execute<InvRow>(sql`
    SELECT
      cci.contractor_user_id AS contractor_id,
      COALESCE(u.name, u.email, 'Unknown') AS contractor_name,
      COALESCE(SUM(CASE WHEN ccil.kind = 'service' THEN CAST(ccil.amount AS NUMERIC) ELSE 0 END), 0) AS fees_cost,
      COALESCE(SUM(CASE WHEN ccil.kind = 'expense' THEN CAST(ccil.amount AS NUMERIC) ELSE 0 END), 0) AS expenses_cost,
      COUNT(DISTINCT cci.id) AS invoice_count
    FROM contractor_cost_invoices cci
    JOIN contractor_cost_invoice_lines ccil ON ccil.invoice_id = cci.id
    LEFT JOIN users u ON u.id = cci.contractor_user_id
    WHERE cci.project_id = ${projectId}
      AND cci.tenant_id = ${tenantId}
      AND cci.status IN ('approved', 'paid')
    GROUP BY cci.contractor_user_id, u.name, u.email
  `);

  const byContractor = invAgg.rows.map(r => ({
    contractorId: r.contractor_id,
    contractorName: r.contractor_name,
    feesCost: Number(r.fees_cost) || 0,
    expensesCost: Number(r.expenses_cost) || 0,
    totalCost: (Number(r.fees_cost) || 0) + (Number(r.expenses_cost) || 0),
    invoiceCount: Number(r.invoice_count) || 0,
  }));

  const feesCost = byContractor.reduce((s, c) => s + c.feesCost, 0);
  const expensesCost = byContractor.reduce((s, c) => s + c.expensesCost, 0);
  const totalCost = feesCost + expensesCost;

  // SOW value
  const [sowAgg] = await db
    .select({ total: sql<number>`COALESCE(SUM(CAST(${sows.value} AS NUMERIC)), 0)` })
    .from(sows)
    .where(and(eq(sows.projectId, projectId), eq(sows.status, "approved")));
  const sowValue = Number(sowAgg?.total) || 0;

  const grossProfit = totalRevenue - totalCost;
  const grossMarginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  // Estimated margin: if no cost data, we can't estimate — show 0
  const estimatedMarginPct = 0;
  const marginVariancePct = grossMarginPct - estimatedMarginPct;
  const marginVarianceDollars = sowValue > 0 ? (marginVariancePct / 100) * sowValue : grossProfit;

  const pmFullName = `${projectRow.pmFirst || ""} ${projectRow.pmLast || ""}`.trim();
  const pmName = pmFullName || projectRow.pmEmail || null;

  return {
    project: {
      id: p.id,
      name: p.name,
      code: p.code || null,
      status: p.status || "active",
      clientName: projectRow.client?.name || "No Client",
      pmName,
      startDate: p.startDate ? String(p.startDate) : null,
      endDate: p.endDate ? String(p.endDate) : null,
    },
    revenueSummary: {
      recognizedRevenue,
      pendingRevenue,
      totalRevenue,
      entries: revenueEntries.map(e => ({
        id: e.id,
        description: e.notes || null,
        amount: Number(e.amount) || 0,
        recognized: !!e.recognized,
        sourceType: e.sourceType || "manual",
        entryDate: e.recognizedAt ? String(e.recognizedAt) : null,
      })),
    },
    costSummary: {
      feesCost,
      expensesCost,
      totalCost,
      byContractor,
    },
    profitability: {
      grossProfit,
      grossMarginPct: Math.round(grossMarginPct * 10) / 10,
      sowValue,
      estimatedMarginPct,
      marginVariancePct: Math.round(marginVariancePct * 10) / 10,
      marginVarianceDollars: Math.round(marginVarianceDollars),
    },
  };
}

// ─── Margin accuracy trend ────────────────────────────────────────────────────

interface TrendPoint {
  period: string;        // e.g. "2025-01"
  recognizedRevenue: number;
  totalCost: number;
  grossProfit: number;
  grossMarginPct: number;
}

async function getMarginAccuracyTrend(tenantId: string): Promise<TrendPoint[]> {
  type TrendRow = { period: string; recognized_revenue: string; total_cost: string };
  const result = await db.execute<TrendRow>(sql`
    SELECT
      TO_CHAR(DATE_TRUNC('month', period_date), 'YYYY-MM') AS period,
      COALESCE(SUM(recognized_revenue), 0) AS recognized_revenue,
      COALESCE(SUM(total_cost), 0) AS total_cost
    FROM (
      -- Revenue recognized entries
      SELECT
        COALESCE(pre.entry_date, pre.created_at)::date AS period_date,
        CAST(pre.amount AS NUMERIC) AS recognized_revenue,
        0 AS total_cost
      FROM project_revenue_entries pre
      JOIN projects p ON p.id = pre.project_id
      WHERE p.tenant_id = ${tenantId}
        AND pre.recognized = true

      UNION ALL

      -- Contractor cost invoice lines
      SELECT
        cci.invoice_date::date AS period_date,
        0 AS recognized_revenue,
        CAST(ccil.amount AS NUMERIC) AS total_cost
      FROM contractor_cost_invoices cci
      JOIN contractor_cost_invoice_lines ccil ON ccil.invoice_id = cci.id
      WHERE cci.tenant_id = ${tenantId}
        AND cci.status IN ('approved', 'paid')
    ) combined
    WHERE period_date IS NOT NULL
    GROUP BY DATE_TRUNC('month', period_date)
    ORDER BY DATE_TRUNC('month', period_date)
  `);

  return result.rows.map(r => {
    const rev = Number(r.recognized_revenue) || 0;
    const cost = Number(r.total_cost) || 0;
    const profit = rev - cost;
    const margin = rev > 0 ? (profit / rev) * 100 : 0;
    return {
      period: r.period,
      recognizedRevenue: rev,
      totalCost: cost,
      grossProfit: profit,
      grossMarginPct: Math.round(margin * 10) / 10,
    };
  });
}

// ─── CSV helper ───────────────────────────────────────────────────────────────

function sendCsv(res: any, data: any[], filename: string) {
  if (!data.length) {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
    return res.send("");
  }
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(","),
    ...data.map(row =>
      headers.map(h => {
        const v = row[h];
        if (v === null || v === undefined) return "";
        const s = String(v);
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      }).join(",")
    ),
  ].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
  res.send(csv);
}
