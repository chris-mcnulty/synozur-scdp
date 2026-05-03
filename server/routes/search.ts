import type { Express } from "express";
import { storage } from "../storage";

interface SearchRouteDeps {
  requireAuth: any;
}

export function registerSearchRoutes(app: Express, deps: SearchRouteDeps) {
  const { requireAuth } = deps;

  app.get("/api/search", requireAuth, async (req, res) => {
    try {
      const q = (req.query.q as string | undefined)?.trim() || "";
      const rawLimit = parseInt((req.query.limit as string) || "5", 10);
      const limit = Math.min(Math.max(isNaN(rawLimit) ? 5 : rawLimit, 1), 20);

      if (!q || q.length < 2) {
        return res.json({
          query: q,
          projects: [],
          users: [],
          timeEntries: [],
          totals: { projects: 0, users: 0, timeEntries: 0 },
        });
      }

      const user = (req as any).user;
      const tenantId = user?.tenantId || undefined;
      const role = user?.role;
      const allowUsers = ["admin", "pm", "portfolio-manager", "billing-admin", "executive"].includes(role);

      // Time entries are scoped to the caller for non-privileged roles, just like
      // /api/time-entries. Privileged roles see all entries in the tenant.
      const teFilters: any = {
        tenantId,
        limit,
        offset: 0,
        search: q,
      };
      const privilegedForTime = ["admin", "billing-admin", "pm", "executive", "portfolio-manager"].includes(role);
      if (!privilegedForTime && user?.id) {
        teFilters.personId = user.id;
      }

      const [projectsResult, usersResult, timeEntriesResult] = await Promise.all([
        storage.getProjectsPaginated({
          tenantId,
          limit,
          offset: 0,
          search: q,
          sortBy: "name",
          sortDir: "asc",
        }),
        allowUsers
          ? storage.getUsersPaginated(tenantId, {
              includeInactive: false,
              includeStakeholders: false,
              search: q,
              limit,
              offset: 0,
            })
          : Promise.resolve({ items: [], total: 0, hasMore: false }),
        storage.getTimeEntriesPaginated(teFilters),
      ]);

      const projects = (projectsResult.items || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        status: p.status,
        clientName: p.client?.name || null,
      }));

      const usersList = (usersResult.items || []).map((u: any) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
      }));

      const timeEntriesList = (timeEntriesResult.items || []).map((t: any) => ({
        id: t.id,
        date: t.date,
        hours: t.hours,
        description: t.description,
        projectId: t.project?.id || t.projectId,
        projectName: t.project?.name || null,
        personName: t.person?.name || null,
      }));

      return res.json({
        query: q,
        projects,
        users: usersList,
        timeEntries: timeEntriesList,
        totals: {
          projects: projectsResult.total ?? projects.length,
          users: usersResult.total ?? usersList.length,
          timeEntries: timeEntriesResult.total ?? timeEntriesList.length,
        },
      });
    } catch (error) {
      console.error("[SEARCH] Error performing global search:", error);
      res.status(500).json({ message: "Failed to perform search" });
    }
  });
}
