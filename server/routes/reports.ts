import * as fsNode from "fs";
import * as pathNode from "path";
import * as osNode from "os";
import type { Express } from "express";
import { z } from "zod";
import { storage, db } from "../storage";
import { projects, clients, users, timeEntries, expenses, projectMilestones, invoiceBatches, invoiceLines, projectAllocations, projectWorkstreams, projectEpics, projectStages, roles, estimates, tenants, statusReports } from "@shared/schema";
import { AI_FEATURES } from "@shared/schema";
import { eq, sql, inArray, and, gte, lte, desc } from "drizzle-orm";
import { aiService } from "../services/ai-service.js";
import { SharePointFileStorage } from "../services/sharepoint-file-storage.js";

interface ReportsRouteDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
  sharePointFileStorage: InstanceType<typeof SharePointFileStorage>;
}

export function registerReportsRoutes(app: Express, deps: ReportsRouteDeps) {
  const { requireAuth, requireRole, sharePointFileStorage } = deps;

  app.get("/api/reports/portfolio", requireAuth, async (req, res) => {
    try {
      if (!["admin", "billing-admin", "pm", "executive"].includes(req.user!.role)) {
        return res.status(403).json({ message: "Insufficient permissions to view portfolio reports" });
      }

      const filters = {
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        clientId: req.query.clientId as string | undefined,
        status: req.query.status as string | undefined,
        tenantId: req.user?.tenantId
      };

      const metrics = await storage.getPortfolioMetrics(filters);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching portfolio metrics:", error);
      res.status(500).json({ message: "Failed to fetch portfolio metrics" });
    }
  });

  app.get("/api/reports/estimate-accuracy", requireAuth, async (req, res) => {
    try {
      if (!["admin", "billing-admin", "pm", "executive"].includes(req.user!.role)) {
        return res.status(403).json({ message: "Insufficient permissions to view estimate accuracy reports" });
      }

      const filters = {
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        clientId: req.query.clientId as string | undefined,
        tenantId: req.user?.tenantId
      };

      const accuracy = await storage.getEstimateAccuracy(filters);
      res.json(accuracy);
    } catch (error) {
      console.error("Error fetching estimate accuracy:", error);
      res.status(500).json({ message: "Failed to fetch estimate accuracy" });
    }
  });

  app.get("/api/reports/revenue", requireAuth, async (req, res) => {
    try {
      if (!["admin", "billing-admin", "executive"].includes(req.user!.role)) {
        return res.status(403).json({ message: "Insufficient permissions to view revenue reports" });
      }

      const filters = {
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        clientId: req.query.clientId as string | undefined,
        tenantId: req.user?.tenantId
      };

      const revenue = await storage.getRevenueMetrics(filters);
      res.json(revenue);
    } catch (error) {
      console.error("Error fetching revenue metrics:", error);
      res.status(500).json({ message: "Failed to fetch revenue metrics" });
    }
  });

  app.get("/api/reports/utilization", requireAuth, async (req, res) => {
    try {
      if (!["admin", "billing-admin", "pm", "executive"].includes(req.user!.role)) {
        return res.status(403).json({ message: "Insufficient permissions to view utilization reports" });
      }

      const filters = {
        startDate: req.query.startDate as string | undefined,
        endDate: req.query.endDate as string | undefined,
        roleId: req.query.roleId as string | undefined,
        tenantId: req.user?.tenantId
      };

      const utilization = await storage.getResourceUtilization(filters);
      res.json(utilization);
    } catch (error) {
      console.error("Error fetching utilization metrics:", error);
      res.status(500).json({ message: "Failed to fetch utilization metrics" });
    }
  });

  app.get("/api/reports/financial-comparison", requireAuth, async (req, res) => {
    try {
      if (!["admin", "billing-admin", "executive", "pm"].includes(req.user!.role)) {
        return res.status(403).json({ message: "Insufficient permissions to view financial reports" });
      }

      const { startDate, endDate, clientIds, status, pmId, quickFilter } = req.query;
      const tenantId = req.user?.tenantId;
      
      const clientIdList = clientIds ? (clientIds as string).split(',') : [];
      
      const projectConditions: any[] = [];
      if (tenantId) {
        projectConditions.push(eq(projects.tenantId, tenantId));
      }
      
      const allProjects = await db.select({
        id: projects.id,
        name: projects.name,
        status: projects.status,
        clientId: projects.clientId,
        clientName: clients.name,
        clientShortName: clients.shortName,
        pm: projects.pm,
        pmName: users.name,
        budget: projects.budget,
        createdAt: projects.createdAt,
        startDate: projects.startDate,
        endDate: projects.endDate,
        estimateId: projects.estimateId
      })
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .leftJoin(users, eq(projects.pm, users.id))
      .where(projectConditions.length > 0 ? and(...projectConditions) : undefined);
      
      let filteredProjects = allProjects;
      
      if (clientIdList.length > 0) {
        filteredProjects = filteredProjects.filter(p => clientIdList.includes(p.clientId || ''));
      }
      
      if (status && status !== 'all') {
        filteredProjects = filteredProjects.filter(p => p.status === status);
      }
      
      if (pmId && pmId !== 'all') {
        filteredProjects = filteredProjects.filter(p => p.pm === pmId);
      }
      
      const batchConditions: any[] = [eq(invoiceBatches.status, 'finalized')];
      if (tenantId) {
        batchConditions.push(eq(invoiceBatches.tenantId, tenantId));
      }
      const finalizedBatches = await db.select({
        batchId: invoiceBatches.batchId,
        totalAmount: invoiceBatches.totalAmount,
        aggregateAdjustmentTotal: invoiceBatches.aggregateAdjustmentTotal,
        discountAmount: invoiceBatches.discountAmount
      })
      .from(invoiceBatches)
      .where(and(...batchConditions));
      
      const batchProjectLines = await db.select({
        batchId: invoiceLines.batchId,
        projectId: invoiceLines.projectId,
        lineTotal: sql<string>`SUM(COALESCE(${invoiceLines.amount}, 0))`.as('line_total')
      })
      .from(invoiceLines)
      .groupBy(invoiceLines.batchId, invoiceLines.projectId);
      
      const projectRevenueMap = new Map<string, number>();
      
      for (const batch of finalizedBatches) {
        const baseTotal = Number(batch.totalAmount || 0);
        const adjustments = Number(batch.aggregateAdjustmentTotal || 0);
        const discounts = Number(batch.discountAmount || 0);
        const batchTotal = baseTotal + adjustments - discounts;
        
        if (batchTotal === 0) continue;
        
        const batchLines = batchProjectLines.filter(l => l.batchId === batch.batchId);
        const batchLineSum = batchLines.reduce((sum, l) => sum + Number(l.lineTotal || 0), 0);
        
        if (batchLineSum === 0) continue;
        
        for (const line of batchLines) {
          const projectShare = Number(line.lineTotal || 0) / batchLineSum;
          const projectRevenue = batchTotal * projectShare;
          const existing = projectRevenueMap.get(line.projectId) || 0;
          projectRevenueMap.set(line.projectId, existing + projectRevenue);
        }
      }
      
      const timeConditions: any[] = [];
      if (tenantId) {
        timeConditions.push(eq(timeEntries.tenantId, tenantId));
      }
      const timeData = await db.select({
        projectId: timeEntries.projectId,
        personId: timeEntries.personId,
        hours: timeEntries.hours,
        date: timeEntries.date,
        personName: users.name,
        roleName: roles.name,
        entryCostRate: timeEntries.costRate,
        userCostRate: users.defaultCostRate,
        isSalaried: users.isSalaried,
        roleIsAlwaysSalaried: roles.isAlwaysSalaried
      })
      .from(timeEntries)
      .leftJoin(users, eq(timeEntries.personId, users.id))
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(timeConditions.length > 0 ? and(...timeConditions) : undefined);
      
      const expenseConditions: any[] = [];
      if (tenantId) {
        expenseConditions.push(eq(expenses.tenantId, tenantId));
      }
      const expenseData = await db.select({
        projectId: expenses.projectId,
        amount: expenses.amount,
        approvalStatus: expenses.approvalStatus,
        date: expenses.date
      })
      .from(expenses)
      .where(expenseConditions.length > 0 ? and(...expenseConditions) : undefined);
      
      const estimateConditions: any[] = [];
      if (tenantId) {
        estimateConditions.push(eq(estimates.tenantId, tenantId));
      }
      const estimateData = await db.select({
        id: estimates.id,
        totalFees: estimates.totalFees,
        totalCost: estimates.totalCost,
        totalMargin: estimates.totalMargin
      })
      .from(estimates)
      .where(estimateConditions.length > 0 ? and(...estimateConditions) : undefined);
      
      const milestoneData = await db.select({
        projectId: projectMilestones.projectId,
        status: projectMilestones.status
      })
      .from(projectMilestones);
      
      const projectFinancials = filteredProjects.map(project => {
        const billedAmount = projectRevenueMap.get(project.id) || 0;
        
        const projectTimeEntries = timeData.filter(t => t.projectId === project.id);
        let laborCost = 0;
        projectTimeEntries.forEach(entry => {
          const isSalaried = entry.isSalaried === true || entry.roleIsAlwaysSalaried === true;
          if (isSalaried) return;
          
          const hours = Number(entry.hours || 0);
          const costRate = Number(entry.entryCostRate || entry.userCostRate || 75);
          laborCost += hours * costRate;
        });
        
        const projectExpenses = expenseData.filter(e => 
          e.projectId === project.id && 
          e.approvalStatus === 'approved'
        );
        const expenseCost = projectExpenses.reduce((sum, exp) => 
          sum + Number(exp.amount || 0), 0
        );
        
        const actualCost = laborCost + expenseCost;
        
        const estimate = estimateData.find(e => e.id === project.estimateId);
        const originalEstimate = estimate ? Number(estimate.totalFees || 0) : 0;
        const estimatedCost = estimate ? Number(estimate.totalCost || 0) : 0;
        
        const sowAmount = Number(project.budget || 0);
        
        const currentEstimate = sowAmount > 0 ? sowAmount : originalEstimate;
        
        const profit = billedAmount - actualCost;
        const profitMargin = billedAmount > 0 ? (profit / billedAmount) * 100 : 0;
        
        const budgetUtilization = currentEstimate > 0 ? (actualCost / currentEstimate) * 100 : 0;
        
        const unbilledAmount = Math.max(0, currentEstimate - billedAmount);
        
        const variance = currentEstimate - billedAmount;
        
        const projectMilestonesData = milestoneData.filter(m => m.projectId === project.id);
        const totalMilestones = projectMilestonesData.length;
        const completedMilestones = projectMilestonesData.filter(m => 
          m.status === 'completed' || m.status === 'invoiced'
        ).length;
        const completionPercentage = totalMilestones > 0 
          ? Math.round((completedMilestones / totalMilestones) * 100) 
          : 0;
        
        let healthScore: 'green' | 'yellow' | 'red' = 'green';
        if (budgetUtilization > 100 || profitMargin < 0) {
          healthScore = 'red';
        } else if (budgetUtilization > 80 || profitMargin < 15) {
          healthScore = 'yellow';
        }
        
        const trend: 'up' | 'down' | 'stable' = 'stable';
        
        const teamMap = new Map<string, { personId: string; personName: string; hours: number; cost: number; billed: number }>();
        projectTimeEntries.forEach(entry => {
          const personId = entry.personId || 'unknown';
          const existing = teamMap.get(personId) || { 
            personId, 
            personName: entry.personName || 'Unknown', 
            hours: 0, 
            cost: 0, 
            billed: 0 
          };
          const hours = Number(entry.hours || 0);
          const costRate = Number(entry.entryCostRate || entry.userCostRate || 75);
          existing.hours += hours;
          existing.cost += hours * costRate;
          teamMap.set(personId, existing);
        });
        
        return {
          projectId: project.id,
          projectName: project.name,
          clientName: project.clientName || 'Unknown Client',
          status: project.status || 'active',
          pmName: project.pmName || 'Unassigned',
          originalEstimate,
          currentEstimate,
          sowAmount,
          actualCost,
          billedAmount,
          unbilledAmount,
          variance,
          profitMargin: Math.round(profitMargin * 10) / 10,
          budgetUtilization: Math.round(budgetUtilization * 10) / 10,
          completionPercentage,
          timeEntries: projectTimeEntries.length,
          expenses: projectExpenses.length,
          adjustments: 0,
          lastActivity: project.createdAt ? new Date(project.createdAt).toISOString() : new Date().toISOString(),
          healthScore,
          trend,
          milestones: {
            total: totalMilestones,
            completed: completedMilestones
          },
          teamBreakdown: Array.from(teamMap.values()),
          monthlyData: []
        };
      });
      
      let finalProjects = projectFinancials;
      if (quickFilter === 'at-risk') {
        finalProjects = projectFinancials.filter(p => p.healthScore === 'red');
      } else if (quickFilter === 'on-track') {
        finalProjects = projectFinancials.filter(p => p.healthScore === 'green');
      } else if (quickFilter === 'unbilled') {
        finalProjects = projectFinancials.filter(p => p.unbilledAmount > 0);
      }
      
      const summary = {
        totalEstimated: finalProjects.reduce((sum, p) => sum + p.currentEstimate, 0),
        totalContracted: finalProjects.reduce((sum, p) => sum + p.sowAmount, 0),
        totalActualCost: finalProjects.reduce((sum, p) => sum + p.actualCost, 0),
        totalBilled: finalProjects.reduce((sum, p) => sum + p.billedAmount, 0),
        totalProfit: finalProjects.reduce((sum, p) => sum + (p.billedAmount - p.actualCost), 0),
        averageMargin: finalProjects.length > 0 
          ? finalProjects.reduce((sum, p) => sum + p.profitMargin, 0) / finalProjects.length 
          : 0,
        projectsAtRisk: finalProjects.filter(p => p.healthScore === 'red').length,
        projectsOnTrack: finalProjects.filter(p => p.healthScore === 'green').length,
        unbilledAmount: finalProjects.reduce((sum, p) => sum + p.unbilledAmount, 0),
        overdueAmount: 0
      };
      
      res.json({
        summary,
        projects: finalProjects
      });
    } catch (error) {
      console.error("Error fetching financial comparison data:", error);
      res.status(500).json({ message: "Failed to fetch financial comparison data" });
    }
  });

  app.get("/api/reports/invoices", requireAuth, async (req, res) => {
    try {
      if (!["admin", "billing-admin", "executive", "pm"].includes(req.user!.role)) {
        return res.status(403).json({ message: "Insufficient permissions to view invoice reports" });
      }

      const tenantId = req.user?.tenantId;
      const { startDate, endDate, batchTypeFilter = 'services' } = req.query;

      let tenantTimezone = 'America/New_York';
      if (tenantId) {
        const tenantSettings = await db.select({ defaultTimezone: tenants.defaultTimezone })
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        if (tenantSettings.length > 0 && tenantSettings[0].defaultTimezone) {
          tenantTimezone = tenantSettings[0].defaultTimezone;
        }
      }

      const currentYear = new Date().getFullYear();
      const filterStartDate = (startDate as string) || `${currentYear}-01-01`;
      const filterEndDate = (endDate as string) || new Date().toISOString().split('T')[0];

      const effectiveDateExpr = sql`COALESCE(${invoiceBatches.asOfDate}, (${invoiceBatches.finalizedAt} AT TIME ZONE ${tenantTimezone})::date, (${invoiceBatches.createdAt} AT TIME ZONE ${tenantTimezone})::date)`;

      const conditions: any[] = [
        eq(invoiceBatches.status, 'finalized'),
        sql`${effectiveDateExpr} >= ${filterStartDate}::date`,
        sql`${effectiveDateExpr} <= ${filterEndDate}::date`,
      ];

      if (tenantId) {
        conditions.push(eq(invoiceBatches.tenantId, tenantId));
      }

      if (batchTypeFilter === 'services') {
        conditions.push(inArray(invoiceBatches.batchType, ['services', 'mixed']));
      } else if (batchTypeFilter === 'expenses') {
        conditions.push(eq(invoiceBatches.batchType, 'expenses'));
      }

      const rows = await db.select({
        batchId: invoiceBatches.batchId,
        startDate: invoiceBatches.startDate,
        endDate: invoiceBatches.endDate,
        finalizedAt: invoiceBatches.finalizedAt,
        asOfDate: invoiceBatches.asOfDate,
        effectiveDate: sql<string>`${effectiveDateExpr}::text`.as('effective_date'),
        totalAmount: invoiceBatches.totalAmount,
        aggregateAdjustmentTotal: invoiceBatches.aggregateAdjustmentTotal,
        discountAmount: invoiceBatches.discountAmount,
        taxAmount: invoiceBatches.taxAmount,
        taxAmountOverride: invoiceBatches.taxAmountOverride,
        taxRate: invoiceBatches.taxRate,
        batchType: invoiceBatches.batchType,
        glInvoiceNumber: invoiceBatches.glInvoiceNumber,
        paymentStatus: invoiceBatches.paymentStatus,
        paymentDate: invoiceBatches.paymentDate,
        paymentAmount: invoiceBatches.paymentAmount,
        notes: invoiceBatches.notes,
      })
      .from(invoiceBatches)
      .where(and(...conditions))
      .orderBy(sql`${effectiveDateExpr} ASC`);

      const batchIds = rows.map(r => r.batchId);

      let clientMap: Record<string, string> = {};
      if (batchIds.length > 0) {
        const lineClients = await db.selectDistinct({
          batchId: invoiceLines.batchId,
          clientId: invoiceLines.clientId,
          clientName: clients.name,
        })
        .from(invoiceLines)
        .innerJoin(clients, eq(invoiceLines.clientId, clients.id))
        .where(inArray(invoiceLines.batchId, batchIds));

        const batchClientNames: Record<string, Set<string>> = {};
        for (const lc of lineClients) {
          if (!batchClientNames[lc.batchId]) batchClientNames[lc.batchId] = new Set();
          batchClientNames[lc.batchId].add(lc.clientName);
        }
        for (const [bid, names] of Object.entries(batchClientNames)) {
          clientMap[bid] = Array.from(names).join(', ');
        }
      }

      const invoices = rows.map(row => {
        const base = Number(row.totalAmount || 0);
        const discount = Number(row.discountAmount || 0);
        const taxRate = Number(row.taxRate || 0);
        const invoiceAmount = base - discount;
        const calculatedTax = taxRate > 0 ? Math.round(invoiceAmount * taxRate) / 100 : 0;
        const storedTax = row.taxAmountOverride ?? row.taxAmount;
        const tax = storedTax != null ? Number(storedTax) : calculatedTax;
        const invoiceTotal = invoiceAmount + tax;
        const paid = row.paymentStatus === 'paid' ? invoiceTotal : Number(row.paymentAmount || 0);
        const outstanding = row.paymentStatus === 'paid' ? 0 : invoiceTotal - paid;

        return {
          batchId: row.batchId,
          invoiceDate: row.effectiveDate || row.startDate,
          periodStart: row.startDate,
          periodEnd: row.endDate,
          clientName: clientMap[row.batchId] || 'Unknown',
          batchType: row.batchType,
          glInvoiceNumber: row.glInvoiceNumber,
          invoiceAmount: Math.round(invoiceAmount * 100) / 100,
          taxAmount: Math.round(tax * 100) / 100,
          invoiceTotal: Math.round(invoiceTotal * 100) / 100,
          paymentStatus: row.paymentStatus,
          paymentDate: row.paymentDate,
          amountPaid: Math.round(paid * 100) / 100,
          outstanding: Math.round(outstanding * 100) / 100,
        };
      });

      const totals = {
        invoiceAmount: invoices.reduce((s, i) => s + i.invoiceAmount, 0),
        taxAmount: invoices.reduce((s, i) => s + i.taxAmount, 0),
        invoiceTotal: invoices.reduce((s, i) => s + i.invoiceTotal, 0),
        amountPaid: invoices.reduce((s, i) => s + i.amountPaid, 0),
        outstanding: invoices.reduce((s, i) => s + i.outstanding, 0),
        count: invoices.length,
      };

      res.json({ invoices, totals, filters: { startDate: filterStartDate, endDate: filterEndDate, batchTypeFilter } });
    } catch (error) {
      console.error("Error fetching invoice report:", error);
      res.status(500).json({ message: "Failed to fetch invoice report" });
    }
  });

  app.get("/api/reports/client-revenue", requireAuth, async (req, res) => {
    try {
      if (!["admin", "billing-admin", "executive"].includes(req.user!.role)) {
        return res.status(403).json({ message: "Insufficient permissions to view client revenue reports" });
      }

      const tenantId = req.user?.tenantId;
      const { startDate, endDate, batchTypeFilter = 'services', groupBy = 'client' } = req.query;

      let tenantTimezone = 'America/New_York';
      if (tenantId) {
        const tenantSettings = await db.select({ defaultTimezone: tenants.defaultTimezone })
          .from(tenants)
          .where(eq(tenants.id, tenantId))
          .limit(1);
        if (tenantSettings.length > 0 && tenantSettings[0].defaultTimezone) {
          tenantTimezone = tenantSettings[0].defaultTimezone;
        }
      }

      const currentYear = new Date().getFullYear();
      const filterStartDate = (startDate as string) || `${currentYear}-01-01`;
      const filterEndDate = (endDate as string) || new Date().toISOString().split('T')[0];

      const effectiveDateExpr = sql`COALESCE(${invoiceBatches.asOfDate}, (${invoiceBatches.finalizedAt} AT TIME ZONE ${tenantTimezone})::date, (${invoiceBatches.createdAt} AT TIME ZONE ${tenantTimezone})::date)`;

      const conditions: any[] = [
        eq(invoiceBatches.status, 'finalized'),
        sql`${effectiveDateExpr} >= ${filterStartDate}::date`,
        sql`${effectiveDateExpr} <= ${filterEndDate}::date`,
      ];

      if (tenantId) {
        conditions.push(eq(invoiceBatches.tenantId, tenantId));
      }

      if (batchTypeFilter === 'services') {
        conditions.push(inArray(invoiceBatches.batchType, ['services', 'mixed']));
      } else if (batchTypeFilter === 'expenses') {
        conditions.push(eq(invoiceBatches.batchType, 'expenses'));
      }

      const rows = await db.select({
        batchId: invoiceBatches.batchId,
        startDate: invoiceBatches.startDate,
        endDate: invoiceBatches.endDate,
        effectiveDate: sql<string>`${effectiveDateExpr}::text`.as('effective_date'),
        totalAmount: invoiceBatches.totalAmount,
        discountAmount: invoiceBatches.discountAmount,
        taxAmount: invoiceBatches.taxAmount,
        taxAmountOverride: invoiceBatches.taxAmountOverride,
        taxRate: invoiceBatches.taxRate,
        batchType: invoiceBatches.batchType,
        paymentStatus: invoiceBatches.paymentStatus,
        paymentAmount: invoiceBatches.paymentAmount,
      })
      .from(invoiceBatches)
      .where(and(...conditions))
      .orderBy(sql`${effectiveDateExpr} ASC`);

      const batchIds = rows.map(r => r.batchId);

      if (batchIds.length === 0) {
        return res.json({
          rows: [],
          totals: { invoiceAmount: 0, taxAmount: 0, invoiceTotal: 0, amountPaid: 0, outstanding: 0, invoiceCount: 0 },
          filters: { startDate: filterStartDate, endDate: filterEndDate, batchTypeFilter, groupBy },
        });
      }

      const lineDetailsRaw = await db.execute(sql`
        SELECT 
          il.batch_id as "batchId",
          il.client_id as "clientId", 
          c.name as "clientName",
          il.project_id as "projectId",
          p.name as "projectName",
          il.amount as "lineTotal"
        FROM invoice_lines il
        INNER JOIN clients c ON il.client_id = c.id
        LEFT JOIN projects p ON il.project_id = p.id
        WHERE il.batch_id = ANY(${sql.raw(`ARRAY[${batchIds.map(id => `'${id}'`).join(',')}]`)})
      `);
      const lineDetails = (lineDetailsRaw as any).rows || lineDetailsRaw;

      const batchTotals: Record<string, { invoiceAmount: number; taxAmount: number; invoiceTotal: number; amountPaid: number; outstanding: number }> = {};
      for (const row of rows) {
        const base = Number(row.totalAmount || 0);
        const discount = Number(row.discountAmount || 0);
        const invoiceAmount = base - discount;
        const taxRate = Number(row.taxRate || 0);
        const calculatedTax = taxRate > 0 ? Math.round(invoiceAmount * taxRate) / 100 : 0;
        const storedTax = row.taxAmountOverride ?? row.taxAmount;
        const tax = storedTax != null ? Number(storedTax) : calculatedTax;
        const invoiceTotal = invoiceAmount + tax;
        const paid = row.paymentStatus === 'paid' ? invoiceTotal : Number(row.paymentAmount || 0);
        const outstanding = row.paymentStatus === 'paid' ? 0 : invoiceTotal - paid;

        batchTotals[row.batchId] = {
          invoiceAmount: Math.round(invoiceAmount * 100) / 100,
          taxAmount: Math.round(tax * 100) / 100,
          invoiceTotal: Math.round(invoiceTotal * 100) / 100,
          amountPaid: Math.round(paid * 100) / 100,
          outstanding: Math.round(outstanding * 100) / 100,
        };
      }

      const batchLineTotals: Record<string, number> = {};
      for (const line of lineDetails) {
        const key = line.batchId;
        batchLineTotals[key] = (batchLineTotals[key] || 0) + Number(line.lineTotal || 0);
      }

      type GroupKey = string;
      const groupedData: Record<GroupKey, {
        clientId: string;
        clientName: string;
        projectId: string | null;
        projectName: string | null;
        invoiceAmount: number;
        taxAmount: number;
        invoiceTotal: number;
        amountPaid: number;
        outstanding: number;
        invoiceCount: number;
        batchIds: Set<string>;
      }> = {};

      for (const line of lineDetails) {
        const batch = batchTotals[line.batchId];
        if (!batch) continue;

        const batchTotal = batchLineTotals[line.batchId] || 1;
        const lineAmount = Number(line.lineTotal || 0);
        const proportion = batchTotal > 0 ? lineAmount / batchTotal : 0;

        const key = groupBy === 'client-project'
          ? `${line.clientId}::${line.projectId || 'no-project'}`
          : line.clientId;

        if (!groupedData[key]) {
          groupedData[key] = {
            clientId: line.clientId,
            clientName: line.clientName,
            projectId: groupBy === 'client-project' ? line.projectId : null,
            projectName: groupBy === 'client-project' ? line.projectName : null,
            invoiceAmount: 0,
            taxAmount: 0,
            invoiceTotal: 0,
            amountPaid: 0,
            outstanding: 0,
            invoiceCount: 0,
            batchIds: new Set(),
          };
        }

        const g = groupedData[key];
        g.invoiceAmount += batch.invoiceAmount * proportion;
        g.taxAmount += batch.taxAmount * proportion;
        g.invoiceTotal += batch.invoiceTotal * proportion;
        g.amountPaid += batch.amountPaid * proportion;
        g.outstanding += batch.outstanding * proportion;
        if (!g.batchIds.has(line.batchId)) {
          g.batchIds.add(line.batchId);
          g.invoiceCount += 1;
        }
      }

      const resultRows = Object.values(groupedData).map(g => ({
        clientId: g.clientId,
        clientName: g.clientName,
        projectId: g.projectId,
        projectName: g.projectName,
        invoiceAmount: Math.round(g.invoiceAmount * 100) / 100,
        taxAmount: Math.round(g.taxAmount * 100) / 100,
        invoiceTotal: Math.round(g.invoiceTotal * 100) / 100,
        amountPaid: Math.round(g.amountPaid * 100) / 100,
        outstanding: Math.round(g.outstanding * 100) / 100,
        invoiceCount: g.invoiceCount,
      })).sort((a, b) => b.invoiceTotal - a.invoiceTotal);

      const totals = {
        invoiceAmount: resultRows.reduce((s, r) => s + r.invoiceAmount, 0),
        taxAmount: resultRows.reduce((s, r) => s + r.taxAmount, 0),
        invoiceTotal: resultRows.reduce((s, r) => s + r.invoiceTotal, 0),
        amountPaid: resultRows.reduce((s, r) => s + r.amountPaid, 0),
        outstanding: resultRows.reduce((s, r) => s + r.outstanding, 0),
        invoiceCount: rows.length,
      };

      res.json({
        rows: resultRows,
        totals,
        filters: { startDate: filterStartDate, endDate: filterEndDate, batchTypeFilter, groupBy },
      });
    } catch (error) {
      console.error("Error fetching client revenue report:", error);
      res.status(500).json({ message: "Failed to fetch client revenue report" });
    }
  });

  app.get("/api/reports/resource-utilization", requireAuth, async (req, res) => {
    try {
      const { 
        personId, 
        startDate, 
        endDate, 
        clientId, 
        projectId, 
        status,
        sortBy = 'startDate',
        sortOrder = 'asc',
        groupBy
      } = req.query;
      const tenantId = req.user?.tenantId;

      const userId = req.user!.id;
      const userRole = req.user!.role;
      const targetPersonId = personId as string || userId;

      if (userRole === 'employee' && targetPersonId !== userId) {
        return res.status(403).json({ message: "Employees can only view their own resource utilization" });
      }

      let allocationsQuery = db
        .select({
          id: projectAllocations.id,
          projectId: projectAllocations.projectId,
          projectName: projects.name,
          projectCode: projects.code,
          projectStatus: projects.status,
          clientId: clients.id,
          clientName: clients.name,
          personId: projectAllocations.personId,
          personName: users.name,
          personEmail: users.email,
          roleId: projectAllocations.roleId,
          roleName: roles.name,
          workstreamId: projectAllocations.projectWorkstreamId,
          workstreamName: projectWorkstreams.name,
          epicId: projectAllocations.projectEpicId,
          epicName: projectEpics.name,
          stageId: projectAllocations.projectStageId,
          stageName: projectStages.name,
          hours: projectAllocations.hours,
          plannedStartDate: projectAllocations.plannedStartDate,
          plannedEndDate: projectAllocations.plannedEndDate,
          status: projectAllocations.status,
          startedDate: projectAllocations.startedDate,
          completedDate: projectAllocations.completedDate,
          weekNumber: projectAllocations.weekNumber,
          taskDescription: projectAllocations.taskDescription,
          notes: projectAllocations.notes,
          pricingMode: projectAllocations.pricingMode,
          billingRate: projectAllocations.billingRate,
          projectVocabulary: projects.vocabularyOverrides,
          clientVocabulary: clients.vocabularyOverrides
        })
        .from(projectAllocations)
        .innerJoin(projects, eq(projectAllocations.projectId, projects.id))
        .innerJoin(clients, eq(projects.clientId, clients.id))
        .leftJoin(users, eq(projectAllocations.personId, users.id))
        .leftJoin(roles, eq(projectAllocations.roleId, roles.id))
        .leftJoin(projectWorkstreams, eq(projectAllocations.projectWorkstreamId, projectWorkstreams.id))
        .leftJoin(projectEpics, eq(projectAllocations.projectEpicId, projectEpics.id))
        .leftJoin(projectStages, eq(projectAllocations.projectStageId, projectStages.id));

      const conditions: any[] = [eq(projectAllocations.isBaseline, false)];

      if (tenantId) {
        conditions.push(eq(projects.tenantId, tenantId));
      }

      if (targetPersonId) {
        conditions.push(eq(projectAllocations.personId, targetPersonId));
      }

      if (startDate && endDate) {
        conditions.push(
          and(
            sql`${projectAllocations.plannedEndDate} >= ${startDate}`,
            sql`${projectAllocations.plannedStartDate} <= ${endDate}`
          )
        );
      }

      if (clientId) {
        conditions.push(eq(clients.id, clientId as string));
      }

      if (projectId) {
        conditions.push(eq(projects.id, projectId as string));
      }

      if (status) {
        conditions.push(eq(projectAllocations.status, status as string));
      }

      const allocations = conditions.length > 0
        ? await allocationsQuery.where(and(...conditions))
        : await allocationsQuery;

      const orgVocab = await storage.getOrganizationVocabulary();

      const processedAllocations = allocations.map(allocation => {
        let projectVocab: any = {};
        let clientVocab: any = {};
        
        try {
          if (allocation.projectVocabulary) {
            projectVocab = JSON.parse(allocation.projectVocabulary);
          }
        } catch {}
        
        try {
          if (allocation.clientVocabulary) {
            clientVocab = JSON.parse(allocation.clientVocabulary);
          }
        } catch {}

        const vocabularyContext = {
          epic: projectVocab.epic || clientVocab.epic || orgVocab.epic || 'Epic',
          stage: projectVocab.stage || clientVocab.stage || orgVocab.stage || 'Stage',
          activity: projectVocab.activity || clientVocab.activity || orgVocab.activity || 'Activity',
          workstream: projectVocab.workstream || clientVocab.workstream || orgVocab.workstream || 'Workstream'
        };

        return {
          id: allocation.id,
          project: {
            id: allocation.projectId,
            name: allocation.projectName,
            code: allocation.projectCode,
            status: allocation.projectStatus,
            client: {
              id: allocation.clientId,
              name: allocation.clientName
            }
          },
          person: {
            id: allocation.personId,
            name: allocation.personName,
            email: allocation.personEmail
          },
          role: allocation.roleId ? {
            id: allocation.roleId,
            name: allocation.roleName
          } : null,
          workstream: allocation.workstreamName,
          epicId: allocation.epicId,
          epicName: allocation.epicName,
          stageId: allocation.stageId,
          stageName: allocation.stageName,
          hours: allocation.hours,
          plannedStartDate: allocation.plannedStartDate,
          plannedEndDate: allocation.plannedEndDate,
          status: allocation.status,
          startedDate: allocation.startedDate,
          completedDate: allocation.completedDate,
          weekNumber: allocation.weekNumber,
          taskDescription: allocation.taskDescription,
          notes: allocation.notes,
          pricingMode: allocation.pricingMode,
          billingRate: allocation.billingRate,
          vocabularyContext
        };
      });

      const sortedAllocations = [...processedAllocations].sort((a, b) => {
        let comparison = 0;
        
        switch (sortBy) {
          case 'startDate':
            comparison = (a.plannedStartDate || '').localeCompare(b.plannedStartDate || '');
            break;
          case 'endDate':
            comparison = (a.plannedEndDate || '').localeCompare(b.plannedEndDate || '');
            break;
          case 'project':
            comparison = a.project.name.localeCompare(b.project.name);
            break;
          case 'client':
            comparison = a.project.client.name.localeCompare(b.project.client.name);
            break;
          case 'status':
            comparison = a.status.localeCompare(b.status);
            break;
          case 'hours':
            comparison = parseFloat(String(a.hours || 0)) - parseFloat(String(b.hours || 0));
            break;
          default:
            comparison = (a.plannedStartDate || '').localeCompare(b.plannedStartDate || '');
        }

        return sortOrder === 'desc' ? -comparison : comparison;
      });

      let groupedAllocations: any = null;
      if (groupBy) {
        groupedAllocations = sortedAllocations.reduce((groups: any, allocation) => {
          let key: string;
          
          switch (groupBy) {
            case 'project':
              key = allocation.project.id;
              if (!groups[key]) {
                groups[key] = {
                  groupKey: key,
                  groupName: allocation.project.name,
                  groupType: 'project',
                  allocations: []
                };
              }
              break;
            case 'client':
              key = allocation.project.client.id;
              if (!groups[key]) {
                groups[key] = {
                  groupKey: key,
                  groupName: allocation.project.client.name,
                  groupType: 'client',
                  allocations: []
                };
              }
              break;
            case 'status':
              key = allocation.status;
              if (!groups[key]) {
                groups[key] = {
                  groupKey: key,
                  groupName: allocation.status,
                  groupType: 'status',
                  allocations: []
                };
              }
              break;
            case 'timeframe':
              const date = new Date(allocation.plannedStartDate || '');
              key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
              if (!groups[key]) {
                groups[key] = {
                  groupKey: key,
                  groupName: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
                  groupType: 'timeframe',
                  allocations: []
                };
              }
              break;
            default:
              key = 'all';
              if (!groups[key]) {
                groups[key] = {
                  groupKey: key,
                  groupName: 'All Assignments',
                  groupType: 'all',
                  allocations: []
                };
              }
          }
          
          groups[key].allocations.push(allocation);
          return groups;
        }, {});
      }

      const totalHours = processedAllocations.reduce((sum, a) => sum + parseFloat(String(a.hours || 0)), 0);
      const activeAllocations = processedAllocations.filter(a => a.status === 'in_progress' || a.status === 'open');
      const completedAllocations = processedAllocations.filter(a => a.status === 'completed');
      
      const weeklyCapacity = 40;
      const utilizationRate = weeklyCapacity > 0 ? (totalHours / weeklyCapacity) * 100 : 0;
      
      let utilizationStatus: 'under' | 'optimal' | 'over' = 'optimal';
      if (utilizationRate < 70) utilizationStatus = 'under';
      else if (utilizationRate > 100) utilizationStatus = 'over';

      const response: any = {
        summary: {
          totalAllocations: processedAllocations.length,
          activeAllocations: activeAllocations.length,
          completedAllocations: completedAllocations.length,
          totalHours,
          weeklyCapacity,
          utilizationRate: Math.round(utilizationRate),
          utilizationStatus,
          projectCount: new Set(processedAllocations.map(a => a.project.id)).size,
          clientCount: new Set(processedAllocations.map(a => a.project.client.id)).size
        },
        allocations: groupedAllocations ? Object.values(groupedAllocations) : sortedAllocations,
        filters: {
          personId: targetPersonId,
          startDate,
          endDate,
          clientId,
          projectId,
          status,
          sortBy,
          sortOrder,
          groupBy
        }
      };

      if (targetPersonId && processedAllocations.length > 0) {
        response.person = processedAllocations[0].person;
      }

      res.json(response);
    } catch (error: any) {
      console.error("[ERROR] Failed to fetch resource utilization:", error);
      res.status(500).json({ message: "Failed to fetch resource utilization" });
    }
  });

  app.post("/api/reports/executive-narrative", requireAuth, requireRole(["admin", "pm", "portfolio-manager", "executive"]), async (req, res) => {
    req.setTimeout(180000);
    res.setTimeout(180000);
    try {
      const schema = z.object({
        startDate: z.string().min(1),
        endDate: z.string().min(1),
      });
      let validated;
      try { validated = schema.parse(req.body); }
      catch (e: any) { return res.status(400).json({ message: e.message || "Invalid request body" }); }
      const { startDate, endDate } = validated;
      const user = req.user as any;
      const tenantId = user?.activeTenantId || user?.primaryTenantId || user?.tenantId;
      if (!tenantId) return res.status(403).json({ message: "No tenant context available" });

      const { validateDateRange, aggregateActivityData } = await import('../services/activity-aggregation.js');
      const dateCheck = validateDateRange(startDate, endDate);
      if (!dateCheck.valid) {
        return res.status(400).json({ message: dateCheck.error });
      }

      const [
        activity,
        allProjects,
        allClients,
        allTimeEntries,
        allExpenses,
        allMilestones,
        allUsers,
        periodInvoiceBatches,
        periodInvoiceLines,
      ] = await Promise.all([
        aggregateActivityData(tenantId, startDate, endDate),
        db.select().from(projects).where(eq(projects.tenantId, tenantId)),
        db.select().from(clients).where(eq(clients.tenantId, tenantId)),
        db.select().from(timeEntries).where(
          and(eq(timeEntries.tenantId, tenantId), gte(timeEntries.date, startDate), lte(timeEntries.date, endDate))
        ),
        db.select().from(expenses).where(
          and(eq(expenses.tenantId, tenantId), gte(expenses.date, startDate), lte(expenses.date, endDate))
        ),
        db.select().from(projectMilestones).where(
          inArray(projectMilestones.projectId,
            db.select({ id: projects.id }).from(projects).where(eq(projects.tenantId, tenantId))
          )
        ),
        db.select().from(users).where(eq(users.primaryTenantId, tenantId)),
        db.select().from(invoiceBatches).where(
          and(
            eq(invoiceBatches.tenantId, tenantId),
            eq(invoiceBatches.status, "finalized"),
            lte(invoiceBatches.startDate, endDate),
            gte(invoiceBatches.endDate, startDate),
          )
        ),
        db.select().from(invoiceLines).where(
          inArray(invoiceLines.batchId,
            db.select({ batchId: invoiceBatches.batchId }).from(invoiceBatches).where(
              and(
                eq(invoiceBatches.tenantId, tenantId),
                eq(invoiceBatches.status, "finalized"),
                lte(invoiceBatches.startDate, endDate),
                gte(invoiceBatches.endDate, startDate),
              )
            )
          )
        ),
      ]);

      const clientMap = new Map(allClients.map(c => [c.id, c.name]));
      const projectMap = new Map(allProjects.map(p => [p.id, p]));
      const userMap = new Map(allUsers.map(u => [u.id, u.name]));

      const activeProjects = allProjects.filter(p => p.status === "active" || p.status === "in_progress");

      const totalHours = allTimeEntries.reduce((s, t) => s + Number(t.hours || 0), 0);
      const billableHours = allTimeEntries.filter(t => t.billable).reduce((s, t) => s + Number(t.hours || 0), 0);
      const totalCost = allTimeEntries.reduce((s, t) => s + Number(t.hours || 0) * Number(t.costRate || 0), 0);

      const SERVICE_LINE_TYPES = new Set(["time", "milestone"]);
      const serviceLines = periodInvoiceLines.filter(l => SERVICE_LINE_TYPES.has(l.type));
      const totalRevenue = serviceLines.reduce((s, l) => s + Number(l.amount || 0), 0);

      const revenueByProject = new Map<string, number>();
      for (const line of serviceLines) {
        revenueByProject.set(line.projectId, (revenueByProject.get(line.projectId) || 0) + Number(line.amount || 0));
      }

      const hoursByProject = new Map<string, { name: string; client: string; hours: number; billable: number; invoicedRevenue: number }>();
      for (const te of allTimeEntries) {
        const proj = projectMap.get(te.projectId);
        const key = te.projectId;
        const existing = hoursByProject.get(key) || {
          name: proj?.name || "Unknown",
          client: clientMap.get(proj?.clientId || "") || "Unknown",
          hours: 0, billable: 0, invoicedRevenue: 0
        };
        existing.hours += Number(te.hours || 0);
        if (te.billable) {
          existing.billable += Number(te.hours || 0);
        }
        hoursByProject.set(key, existing);
      }
      for (const [projId, rev] of revenueByProject) {
        const proj = projectMap.get(projId);
        const existing = hoursByProject.get(projId) || {
          name: proj?.name || "Unknown",
          client: clientMap.get(proj?.clientId || "") || "Unknown",
          hours: 0, billable: 0, invoicedRevenue: 0
        };
        existing.invoicedRevenue += rev;
        hoursByProject.set(projId, existing);
      }
      const projectHoursSummary = Array.from(hoursByProject.values())
        .sort((a, b) => b.invoicedRevenue - a.invoicedRevenue || b.hours - a.hours)
        .map(p => `- ${p.client} / ${p.name}: ${p.hours.toFixed(1)} total hrs (${p.billable.toFixed(1)} billable)${p.invoicedRevenue > 0 ? `, $${p.invoicedRevenue.toFixed(0)} invoiced` : ''}`)
        .join("\n") || "No time entries recorded.";

      const hoursByPerson = new Map<string, { name: string; hours: number }>();
      for (const te of allTimeEntries) {
        const key = te.personId;
        const existing = hoursByPerson.get(key) || { name: userMap.get(te.personId) || "Unknown", hours: 0 };
        existing.hours += Number(te.hours || 0);
        hoursByPerson.set(key, existing);
      }
      const personSummary = Array.from(hoursByPerson.values())
        .sort((a, b) => b.hours - a.hours)
        .map(p => `- ${p.name}: ${p.hours.toFixed(1)} hours`)
        .join("\n") || "No resource data.";

      const totalExpenseAmount = allExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
      const expenseByCategory = new Map<string, number>();
      for (const e of allExpenses) {
        const cat = e.category || "Other";
        expenseByCategory.set(cat, (expenseByCategory.get(cat) || 0) + Number(e.amount || 0));
      }
      const expenseSummary = Array.from(expenseByCategory.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([cat, amt]) => `- ${cat}: $${amt.toFixed(0)}`)
        .join("\n") || "No expenses.";

      const estimateSummary = activity.estimates.length > 0
        ? activity.estimates
            .sort((a, b) => (b.totalFees || 0) - (a.totalFees || 0))
            .map(e => `- ${e.name} (${e.clientName || "Internal"}): $${(e.totalFees || 0).toLocaleString()} — Status: ${e.status}`)
            .join("\n")
        : "No new estimates created.";

      const completedMilestones = allMilestones.filter(m => {
        if (m.status !== "completed" || !m.completedDate) return false;
        return m.completedDate >= startDate && m.completedDate <= endDate;
      });
      const upcomingMilestones = allMilestones.filter(m => {
        if (m.status === "completed" || m.status === "cancelled") return false;
        return m.targetDate && m.targetDate > endDate;
      }).slice(0, 10);

      const completedMilestoneSummary = completedMilestones.length > 0
        ? completedMilestones.map(m => {
            const proj = projectMap.get(m.projectId || "");
            return `- ${proj?.name || "?"}: ${m.name}${m.isPaymentMilestone ? ` (Payment: $${Number(m.amount || 0).toLocaleString()})` : ""}`;
          }).join("\n")
        : "None completed in this period.";

      const upcomingMilestoneSummary = upcomingMilestones.length > 0
        ? upcomingMilestones.map(m => {
            const proj = projectMap.get(m.projectId || "");
            return `- ${proj?.name || "?"}: ${m.name} — Due: ${m.targetDate}`;
          }).join("\n")
        : "None upcoming.";

      const openStatuses = ["open", "in_progress"];
      const highPriorityRaidd = activity.raidd.filter(r =>
        openStatuses.includes(r.status) && (r.priority === "high" || r.priority === "critical")
      );
      const raiddSummary = highPriorityRaidd.length > 0
        ? highPriorityRaidd.map(r =>
            `- [${r.type?.toUpperCase()}] ${r.refNumber || ""} ${r.title} (${r.priority}) — ${r.projectName || "?"}: ${r.impact || r.description || ""}`
          ).join("\n")
        : "No high-priority risks or issues.";

      const raiddCounts = {
        openRisks: activity.raidd.filter(r => r.type === "risk" && openStatuses.includes(r.status)).length,
        openIssues: activity.raidd.filter(r => r.type === "issue" && openStatuses.includes(r.status)).length,
        openActions: activity.raidd.filter(r => r.type === "action_item" && openStatuses.includes(r.status)).length,
      };

      const statusReportsSummary = activity.statusReports.length > 0
        ? activity.statusReports
            .map(r => `- ${r.projectName || "?"} (${r.clientName || "?"}): "${r.title}" — Health: ${r.overallHealth || "N/A"}`)
            .join("\n")
        : "No status reports published in this period.";

      const uniqueAssignedPeople = new Set(activity.assignments.map(a => a.personName).filter(Boolean));
      const assignmentsSummary = activity.assignments.length > 0
        ? `${activity.assignments.length} active assignments across ${uniqueAssignedPeople.size} team members`
        : "No active assignments in this period.";

      const dataPayload = `Generate an executive narrative summary for the period ${startDate} to ${endDate}.

PRACTICE OVERVIEW
=================
Active Projects: ${activeProjects.length}
Total Projects: ${allProjects.length}
Active Clients: ${new Set(activeProjects.map(p => p.clientId).filter(Boolean)).size}
Active Assignments: ${assignmentsSummary}

FINANCIAL PERFORMANCE (${startDate} to ${endDate})
===================================================
Total Hours Logged: ${totalHours.toFixed(1)}
Billable Hours: ${billableHours.toFixed(1)} (${totalHours > 0 ? ((billableHours / totalHours) * 100).toFixed(0) : 0}% utilization)
Services Revenue (time + milestone lines on finalized invoices; excludes expense reimbursements and tax): $${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
Finalized Invoices: ${periodInvoiceBatches.length}
Internal Cost: $${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
Gross Margin: ${totalRevenue > 0 ? (((totalRevenue - totalCost) / totalRevenue) * 100).toFixed(1) : 0}%
Total Expenses: $${totalExpenseAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}

HOURS & INVOICED REVENUE BY PROJECT
====================================
${projectHoursSummary}

RESOURCE LOADING
================
${personSummary}

EXPENSES BY CATEGORY
====================
${expenseSummary}

ESTIMATES CREATED
=================
${estimateSummary}

STATUS REPORTS PUBLISHED
========================
${statusReportsSummary}

MILESTONES COMPLETED
====================
${completedMilestoneSummary}

UPCOMING MILESTONES
===================
${upcomingMilestoneSummary}

RAIDD — HIGH PRIORITY ITEMS
============================
Open Risks: ${raiddCounts.openRisks} | Open Issues: ${raiddCounts.openIssues} | Open Actions: ${raiddCounts.openActions}
${raiddSummary}`;

      const { buildGroundingContext } = await import('../services/ai-service.js');
      const groundingDocs = tenantId
        ? await storage.getActiveGroundingDocumentsForTenant(tenantId)
        : await storage.getActiveGroundingDocuments();
      const groundingCtx = buildGroundingContext(groundingDocs, 'executive_narrative');

      const stats = {
        totalHours: Math.round(totalHours * 10) / 10,
        billableHours: Math.round(billableHours * 10) / 10,
        totalRevenue: Math.round(totalRevenue),
        totalExpenses: Math.round(totalExpenseAmount),
        activeProjects: activeProjects.length,
        estimatesCreated: activity.estimates.length,
        milestonesCompleted: completedMilestones.length,
        openRisks: raiddCounts.openRisks,
        openIssues: raiddCounts.openIssues,
        openActions: raiddCounts.openActions,
        statusReportsPublished: activity.statusReports.length,
        activeAssignments: activity.assignments.length,
        raiddHighPriority: highPriorityRaidd.map((r: any) => ({
          type: r.type,
          refNumber: r.refNumber,
          title: r.title,
          priority: r.priority,
          impact: r.impact || r.description || '',
          projectName: r.projectName || '',
        })),
      };

      // Async job mode: submit job and return immediately (default behavior)
      // Pass ?wait=true for synchronous mode (backwards compatibility)
      const useAsync = req.query.wait !== 'true';
      if (useAsync) {
        const { jobQueueService } = await import('../services/job-queue-service.js');
        const job = await jobQueueService.submit('ai.executiveNarrative.generate', {
          tenantId,
          userId: user?.id,
          startDate,
          endDate,
          dataPayload,
          groundingCtx,
        }, {
          tenantId,
          createdBy: user?.id,
          maxAttempts: 2,
        });
        return res.status(202).json({
          jobId: job.id,
          message: 'Executive narrative generation queued',
          period: { startDate, endDate },
          stats,
        });
      }

      const narrative = await aiService.generateExecutiveNarrative(
        dataPayload,
        groundingCtx,
        { tenantId, userId: user?.id, feature: AI_FEATURES.EXECUTIVE_NARRATIVE }
      );

      console.log(`[AI] Executive narrative generated for ${startDate}–${endDate} by user ${user?.id}`);
      res.json({
        narrative,
        period: { startDate, endDate },
        stats,
      });
    } catch (error: any) {
      console.error("[AI] Executive narrative generation failed:", error);
      res.status(500).json({ message: error.message || "Failed to generate executive narrative" });
    }
  });

  app.get("/api/reports/executive-narratives", requireAuth, requireRole(["admin", "pm", "portfolio-manager", "executive"]), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.activeTenantId || user?.primaryTenantId || user?.tenantId;
      if (!tenantId) return res.status(403).json({ message: "No tenant context available" });

      const rows = await db
        .select()
        .from(statusReports)
        .where(and(eq(statusReports.tenantId, tenantId), eq(statusReports.reportType, "executive_narrative")))
        .orderBy(desc(statusReports.createdAt));

      res.json(rows);
    } catch (error: any) {
      console.error("[AI] Executive narratives list failed:", error);
      res.status(500).json({ message: error.message || "Failed to list executive narratives" });
    }
  });

  app.post("/api/reports/executive-narrative/save", requireAuth, requireRole(["admin", "pm", "portfolio-manager", "executive"]), async (req, res) => {
    try {
      const schema = z.object({
        narrative: z.string().min(1),
        startDate: z.string().min(1),
        endDate: z.string().min(1),
        stats: z.record(z.any()).optional(),
      });
      let validated;
      try { validated = schema.parse(req.body); }
      catch (e: any) { return res.status(400).json({ message: e.message || "Invalid request body" }); }

      const user = req.user as any;
      const tenantId = user?.activeTenantId || user?.primaryTenantId || user?.tenantId;
      if (!tenantId) return res.status(403).json({ message: "No tenant context available" });

      const report = await storage.createStatusReport({
        projectId: null,
        tenantId,
        title: `Executive Narrative — ${validated.startDate} to ${validated.endDate}`,
        reportType: "executive_narrative",
        reportStyle: "executive_brief",
        periodStart: validated.startDate,
        periodEnd: validated.endDate,
        reportContent: validated.narrative,
        status: "final",
        metadata: {
          ...validated.stats,
          generatedAt: new Date().toISOString(),
          generatedBy: user.name || user.email,
        },
        generatedBy: user.id,
      });

      console.log(`[AI] Executive narrative saved for ${validated.startDate}–${validated.endDate} by user ${user.id}`);
      res.json({ id: report.id, message: "Executive narrative saved successfully" });
    } catch (error: any) {
      console.error("[AI] Executive narrative save failed:", error);
      res.status(500).json({ message: error.message || "Failed to save executive narrative" });
    }
  });

  app.post("/api/reports/executive-narrative/export-pptx", requireAuth, requireRole(["admin", "pm", "portfolio-manager", "executive"]), async (req, res) => {
    req.setTimeout(180000);
    res.setTimeout(180000);
    try {
      const schema = z.object({
        narrative: z.string().min(1),
        startDate: z.string().min(1),
        endDate: z.string().min(1),
        stats: z.record(z.any()).optional(),
        templateSlots: z.object({
          title: z.boolean().optional(),
          section: z.boolean().optional(),
          closing: z.boolean().optional(),
        }).optional(),
      });
      let validated;
      try { validated = schema.parse(req.body); }
      catch (e: any) { return res.status(400).json({ message: e.message || "Invalid request body" }); }

      const user = req.user as any;
      const tenantId = user?.activeTenantId || user?.primaryTenantId || user?.tenantId;
      if (!tenantId) return res.status(403).json({ message: "No tenant context available" });

      const tenant = await storage.getTenant(tenantId);
      const branding = (tenant as any)?.branding || {};
      const primaryColor = branding.primaryColor || '#810FFB';
      const secondaryColor = branding.secondaryColor || '#E60CB3';
      const resolvedSlots = validated.templateSlots || { title: true, section: true, closing: true };

      const now = new Date();
      const reportDate = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      let logoPath: string | null = null;
      const logoUrl = (tenant as any)?.logoUrl;
      if (logoUrl) {
        const possiblePaths = [
          pathNode.join(process.cwd(), 'client', 'public', logoUrl.replace(/^\//, '')),
          pathNode.join(process.cwd(), logoUrl.replace(/^\//, '')),
          pathNode.join(process.cwd(), 'client', 'src', 'assets', logoUrl.replace(/^.*\/assets\//, '')),
        ];
        for (const p of possiblePaths) {
          if (fsNode.existsSync(p)) { logoPath = p; break; }
        }
      }

      const stats = validated.stats || {};
      const raiddHighPriority = (stats as any).raiddHighPriority || [];

      const pptxData: any = {
        tenantName: (tenant as any)?.name || '',
        reportDate,
        periodStart: validated.startDate,
        periodEnd: validated.endDate,
        primaryColor,
        secondaryColor,
        logoPath,
        narrative: validated.narrative,
        stats: {
          totalHours: stats.totalHours || 0,
          billableHours: stats.billableHours || 0,
          totalRevenue: stats.totalRevenue || 0,
          totalExpenses: stats.totalExpenses || 0,
          activeProjects: stats.activeProjects || 0,
          estimatesCreated: stats.estimatesCreated || 0,
          milestonesCompleted: stats.milestonesCompleted || 0,
          openRisks: stats.openRisks || 0,
          openIssues: stats.openIssues || 0,
          openActions: stats.openActions || 0,
          statusReportsPublished: stats.statusReportsPublished || 0,
          activeAssignments: stats.activeAssignments || 0,
        },
        raiddHighPriority,
      };

      const templateTempFiles: string[] = [];
      if (tenant) {
        const t = tenant as any;
        const templateSlotDefs: Array<{ fileId: string | null; key: string; slotName: keyof typeof resolvedSlots }> = [
          { fileId: t.pptxTitleTemplateFileId, key: 'titleTemplatePath', slotName: 'title' },
          { fileId: t.pptxSectionTemplateFileId, key: 'sectionTemplatePath', slotName: 'section' },
          { fileId: t.pptxClosingTemplateFileId, key: 'closingTemplatePath', slotName: 'closing' },
        ];
        for (const slot of templateSlotDefs) {
          if (slot.fileId && resolvedSlots[slot.slotName] !== false) {
            try {
              const fileContent = await sharePointFileStorage.getFileContent(slot.fileId, tenantId);
              if (fileContent?.buffer) {
                const tmpTemplatePath = pathNode.join(osNode.tmpdir(), `pptx-exec-template-${slot.key}-${Date.now()}.pptx`);
                fsNode.writeFileSync(tmpTemplatePath, fileContent.buffer);
                pptxData[slot.key] = tmpTemplatePath;
                templateTempFiles.push(tmpTemplatePath);
              }
            } catch (tmplErr: any) {
              console.warn(`[EXEC-PPTX] Could not download template for ${slot.key}:`, tmplErr.message);
            }
          }
        }
      }

      const tmpFile = pathNode.join(osNode.tmpdir(), `exec-narrative-${Date.now()}.pptx`);
      const scriptPath = pathNode.join(process.cwd(), 'server', 'scripts', 'generate_status_report_pptx.py');

      const cleanupTemplateFiles = () => {
        for (const f of templateTempFiles) {
          try { fsNode.unlinkSync(f); } catch {}
        }
      };

      try {
        const { spawnSync } = await import('child_process');
        const pyResult = spawnSync('python3', [scriptPath, tmpFile, '--executive-narrative'], {
          input: JSON.stringify(pptxData),
          timeout: 30000,
          maxBuffer: 10 * 1024 * 1024,
        });
        if (pyResult.stderr && pyResult.stderr.length > 0) {
          console.log(`[EXEC-PPTX] Python stderr:\n${pyResult.stderr.toString().substring(0, 2000)}`);
        }
        if (pyResult.status !== 0) {
          throw new Error(`Python script exited with code ${pyResult.status}: ${pyResult.stderr?.toString().substring(0, 500)}`);
        }
        if (!fsNode.existsSync(tmpFile)) {
          throw new Error('PPTX file was not generated');
        }

        const filename = `Executive_Narrative-${validated.startDate}_to_${validated.endDate}.pptx`;
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.presentationml.presentation");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

        try {
          await storage.createStatusReport({
            projectId: null,
            tenantId,
            title: `Executive Narrative PPTX — ${validated.startDate} to ${validated.endDate}`,
            reportType: "executive_narrative",
            reportStyle: "executive_brief",
            periodStart: validated.startDate,
            periodEnd: validated.endDate,
            reportContent: validated.narrative,
            status: "final",
            metadata: {
              ...validated.stats,
              format: 'pptx',
              generatedAt: new Date().toISOString(),
              generatedBy: user.name || user.email,
            },
            generatedBy: user.id,
          });
        } catch (saveErr: any) {
          console.error("[EXEC-PPTX] Failed to save report record:", saveErr.message);
        }

        const fileStream = fsNode.createReadStream(tmpFile);
        fileStream.pipe(res);
        fileStream.on('end', () => {
          fsNode.unlink(tmpFile, () => {});
          cleanupTemplateFiles();
        });
        fileStream.on('error', () => {
          fsNode.unlink(tmpFile, () => {});
          cleanupTemplateFiles();
          if (!res.headersSent) {
            res.status(500).json({ message: "Failed to stream PPTX" });
          }
        });
      } catch (scriptError: any) {
        console.error("[EXEC-PPTX] Generation script error:", scriptError.message);
        if (fsNode.existsSync(tmpFile)) fsNode.unlinkSync(tmpFile);
        cleanupTemplateFiles();
        res.status(500).json({ message: "Failed to generate PowerPoint report" });
      }
    } catch (error: any) {
      console.error("[EXEC-PPTX] Export error:", error);
      res.status(500).json({ message: "Failed to export executive narrative PowerPoint" });
    }
  });

  app.get("/api/reports/raidd", requireAuth, requireRole(["admin", "pm", "executive"]), async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.primaryTenantId || req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ message: "Tenant context required" });
      }

      const { raiddFiltersSchema } = await import("@shared/pagination");
      const parsed = raiddFiltersSchema.parse(req.query);

      const filters: { type?: string; status?: string; priority?: string; projectId?: string; activeProjectsOnly?: boolean; limit: number; offset: number } = {
        limit: parsed.limit,
        offset: parsed.offset,
      };
      if (parsed.type) filters.type = parsed.type;
      if (parsed.status) filters.status = parsed.status;
      if (parsed.priority) filters.priority = parsed.priority;
      if (parsed.projectId) filters.projectId = parsed.projectId;
      filters.activeProjectsOnly = parsed.activeProjectsOnly !== false;

      const result = await storage.getPortfolioRaiddEntriesPaginated(tenantId, filters);
      res.json({ items: result.items, summary: result.summary, projectList: result.projectList, total: result.total, hasMore: result.hasMore, limit: result.limit, offset: result.offset });
    } catch (error: any) {
      console.error("Error fetching portfolio RAIDD data:", error);
      res.status(500).json({ message: error.message || "Failed to fetch portfolio RAIDD data" });
    }
  });

  app.get("/api/my/raidd", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user?.primaryTenantId || req.user?.tenantId;
      if (!tenantId) {
        return res.status(400).json({ message: "Tenant context required" });
      }
      const userId = req.user!.id;

      const { type, status, priority, projectId } = req.query;
      const filters: { type?: string; status?: string; priority?: string; projectId?: string } = {};
      if (type && typeof type === 'string') filters.type = type;
      if (status && typeof status === 'string') filters.status = status;
      if (priority && typeof priority === 'string') filters.priority = priority;
      if (projectId && typeof projectId === 'string') filters.projectId = projectId;

      const entries = await storage.getMyRaiddEntries(userId, tenantId, filters);

      const openStatuses = ["open", "in_progress"];
      const openEntries = entries.filter(e => openStatuses.includes(e.status));
      const summary = {
        totalEntries: entries.length,
        ownedByMe: entries.filter(e => e.ownerId === userId).length,
        assignedToMe: entries.filter(e => e.assigneeId === userId).length,
        openRisks: openEntries.filter(e => e.type === "risk").length,
        openIssues: openEntries.filter(e => e.type === "issue").length,
        openActionItems: openEntries.filter(e => e.type === "action_item").length,
        overdueItems: openEntries.filter(e => e.dueDate && new Date(e.dueDate) < new Date()).length,
        criticalItems: openEntries.filter(e => e.priority === "critical").length,
        highPriorityItems: openEntries.filter(e => e.priority === "high").length,
      };

      const projectList = Array.from(
        new Set(entries.map(e => JSON.stringify({ id: e.projectId, name: e.projectName })))
      ).map(s => JSON.parse(s));

      res.json({ entries, summary, projectList });
    } catch (error: any) {
      console.error("Error fetching my RAIDD entries:", error);
      res.status(500).json({ message: error.message || "Failed to fetch my RAIDD entries" });
    }
  });

  // Calendar suggestion adoption analytics
  // GET /api/reports/calendar-suggestion-adoption?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&scope=me|tenant
  // - scope=me (default): returns the caller's own breakdown
  // - scope=tenant: admin-only; returns tenant-wide totals plus a per-user breakdown.
  //   Fails closed (400) when active tenant context is missing.
  app.get("/api/reports/calendar-suggestion-adoption", requireAuth, async (req, res) => {
    try {
      const userId: string = req.user!.id;
      const tenantId: string | null = req.user?.tenantId ?? null;
      const role: string = req.user!.role;
      const scope = req.query.scope === "tenant" ? "tenant" : "me";

      if (scope === "tenant" && role !== "admin") {
        return res.status(403).json({ message: "Insufficient permissions to view tenant-wide adoption" });
      }
      if (scope === "tenant" && !tenantId) {
        return res.status(400).json({ message: "Active tenant context is required for tenant-wide adoption" });
      }

      // Default to current ISO week (Mon..Sun)
      const today = new Date();
      const day = today.getDay(); // 0=Sun
      const diffToMon = (day === 0 ? -6 : 1 - day);
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() + diffToMon);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const fmt = (d: Date) => d.toISOString().split("T")[0];

      const startDate = typeof req.query.startDate === "string" ? req.query.startDate : fmt(weekStart);
      const endDate = typeof req.query.endDate === "string" ? req.query.endDate : fmt(weekEnd);

      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD." });
      }

      const filters: { startDate: string; endDate: string; tenantId?: string; personId?: string } = { startDate, endDate };
      if (tenantId) filters.tenantId = tenantId;
      if (scope === "me") filters.personId = userId;

      const entries = await storage.getTimeEntries(filters);

      let suggestionHours = 0;
      let manualHours = 0;
      let suggestionCount = 0;
      let manualCount = 0;
      const byUser = new Map<string, { personId: string; personName: string; suggestionHours: number; manualHours: number; suggestionCount: number; manualCount: number }>();

      for (const e of entries) {
        const hoursRaw = e.hours == null ? 0 : Number(e.hours);
        const hours = Number.isFinite(hoursRaw) ? hoursRaw : 0;
        const isSuggested = !!e.fromCalendarSuggestion;
        if (isSuggested) {
          suggestionHours += hours;
          suggestionCount += 1;
        } else {
          manualHours += hours;
          manualCount += 1;
        }

        if (scope === "tenant") {
          const key = e.personId;
          const existing = byUser.get(key) ?? {
            personId: key,
            personName: e.person?.name || e.person?.email || "Unknown",
            suggestionHours: 0,
            manualHours: 0,
            suggestionCount: 0,
            manualCount: 0,
          };
          if (isSuggested) {
            existing.suggestionHours += hours;
            existing.suggestionCount += 1;
          } else {
            existing.manualHours += hours;
            existing.manualCount += 1;
          }
          byUser.set(key, existing);
        }
      }

      const totalHours = suggestionHours + manualHours;
      const suggestionPercentage = totalHours > 0 ? (suggestionHours / totalHours) * 100 : 0;

      const round2 = (n: number) => Math.round(n * 100) / 100;
      const round1 = (n: number) => Math.round(n * 10) / 10;

      const perUser = scope === "tenant"
        ? Array.from(byUser.values())
            .map(u => {
              const total = u.suggestionHours + u.manualHours;
              return {
                personId: u.personId,
                personName: u.personName,
                suggestionHours: round2(u.suggestionHours),
                manualHours: round2(u.manualHours),
                totalHours: round2(total),
                suggestionCount: u.suggestionCount,
                manualCount: u.manualCount,
                suggestionPercentage: round1(total > 0 ? (u.suggestionHours / total) * 100 : 0),
              };
            })
            .sort((a, b) => b.suggestionHours - a.suggestionHours)
        : undefined;

      res.json({
        scope,
        startDate,
        endDate,
        summary: {
          suggestionHours: round2(suggestionHours),
          manualHours: round2(manualHours),
          totalHours: round2(totalHours),
          suggestionCount,
          manualCount,
          totalEntries: suggestionCount + manualCount,
          suggestionPercentage: round1(suggestionPercentage),
        },
        perUser,
      });
    } catch (error: any) {
      console.error("Error fetching calendar suggestion adoption:", error);
      res.status(500).json({ message: error.message || "Failed to fetch calendar suggestion adoption" });
    }
  });
}
