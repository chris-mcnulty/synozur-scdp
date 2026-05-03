import type { Express, Request, Response } from 'express';
import { jobQueueService } from '../services/job-queue-service';
import { runJobPrune, getPruneRetention, getCurrentIntervalHours } from '../services/job-prune-scheduler';

interface JobRouteDeps {
  requireAuth: any;
  requireRole: (roles: string[]) => any;
}

export function registerJobRoutes(app: Express, deps: JobRouteDeps) {
  const { requireAuth, requireRole } = deps;

  // Get a single job's status.
  // Authorization: the user must be the job creator, share the same tenant, or be a platform admin.
  app.get('/api/jobs/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const job = await jobQueueService.getStatus(req.params.id);
      if (!job) return res.status(404).json({ message: 'Job not found' });

      const isPlatformAdmin = user?.platformRole === 'global_admin' || user?.platformRole === 'constellation_admin';
      const isAdmin = user?.role === 'admin' || isPlatformAdmin;
      const isCreator = job.createdBy && job.createdBy === user?.id;
      const userTenantId = user?.activeTenantId || user?.primaryTenantId || user?.tenantId;
      const isSameTenant = job.tenantId && userTenantId && job.tenantId === userTenantId;

      if (!isPlatformAdmin && !isAdmin && !isCreator && !isSameTenant) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Strip sensitive payload from non-admin responses
      if (!isAdmin) {
        const { payload: _payload, ...safeJob } = job;
        return res.json(safeJob);
      }

      res.json(job);
    } catch (err: any) {
      res.status(500).json({ message: err.message || 'Failed to get job status' });
    }
  });

  // List recent background jobs (admin only)
  app.get('/api/admin/background-jobs', requireAuth, requireRole(['admin', 'billing-admin']), async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const tenantId = user?.activeTenantId || user?.primaryTenantId || user?.tenantId;
      const { type, status, limit, offset, since } = req.query;

      const isPlatformAdmin = user?.platformRole === 'global_admin' || user?.platformRole === 'constellation_admin';

      const jobs = await jobQueueService.listRecent({
        tenantId: isPlatformAdmin ? undefined : tenantId,
        type: type as string | undefined,
        status: status as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : 100,
        offset: offset ? parseInt(offset as string, 10) : 0,
        since: since ? new Date(since as string) : undefined,
      });

      res.json(jobs);
    } catch (err: any) {
      res.status(500).json({ message: err.message || 'Failed to list background jobs' });
    }
  });

  // Retry a failed job (admin only — verifies tenant ownership)
  app.post('/api/admin/background-jobs/:id/retry', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const isPlatformAdmin = user?.platformRole === 'global_admin' || user?.platformRole === 'constellation_admin';
      const existing = await jobQueueService.getStatus(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Job not found or not in a failed state' });

      if (!isPlatformAdmin) {
        const userTenantId = user?.activeTenantId || user?.primaryTenantId || user?.tenantId;
        if (existing.tenantId && existing.tenantId !== userTenantId) {
          return res.status(403).json({ message: 'Access denied' });
        }
      }

      const job = await jobQueueService.retry(req.params.id);
      if (!job) return res.status(404).json({ message: 'Job not found or not in a failed state' });
      res.json(job);
    } catch (err: any) {
      res.status(500).json({ message: err.message || 'Failed to retry job' });
    }
  });

  // Cancel a queued/running job (admin only — verifies tenant ownership)
  app.post('/api/admin/background-jobs/:id/cancel', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const isPlatformAdmin = user?.platformRole === 'global_admin' || user?.platformRole === 'constellation_admin';
      const existing = await jobQueueService.getStatus(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Job not found' });

      if (!isPlatformAdmin) {
        const userTenantId = user?.activeTenantId || user?.primaryTenantId || user?.tenantId;
        if (existing.tenantId && existing.tenantId !== userTenantId) {
          return res.status(403).json({ message: 'Access denied' });
        }
      }

      await jobQueueService.cancel(req.params.id);
      res.json({ message: 'Job cancelled' });
    } catch (err: any) {
      res.status(500).json({ message: err.message || 'Failed to cancel job' });
    }
  });

  // Authorize platform admins (global_admin / constellation_admin) regardless of
  // their tenant role — purge is a cross-tenant maintenance action.
  const requirePlatformAdmin = (req: Request, res: Response, next: any) => {
    const user = req.user as any;
    if (!user) return res.status(401).json({ message: 'Authentication required' });
    const role = user?.platformRole;
    if (role !== 'global_admin' && role !== 'constellation_admin') {
      return res.status(403).json({ message: 'Platform admin required' });
    }
    next();
  };

  // Get current prune retention configuration (platform admin only)
  app.get('/api/admin/background-jobs/prune-config', requireAuth, requirePlatformAdmin, async (_req: Request, res: Response) => {
    try {
      const retention = await getPruneRetention();
      res.json({ ...retention, intervalHours: getCurrentIntervalHours() });
    } catch (err: any) {
      res.status(500).json({ message: err.message || 'Failed to load prune config' });
    }
  });

  // Manually trigger a prune of old succeeded/failed jobs (platform admin only)
  app.post('/api/admin/background-jobs/prune', requireAuth, requirePlatformAdmin, async (req: Request, res: Response) => {
    try {

      const body = req.body || {};
      const succeededOverride = body.succeededRetentionDays != null ? Number(body.succeededRetentionDays) : undefined;
      const failedOverride = body.failedRetentionDays != null ? Number(body.failedRetentionDays) : undefined;

      let result;
      if (succeededOverride != null || failedOverride != null) {
        const retention = await getPruneRetention();
        result = await jobQueueService.pruneOldJobs({
          succeededRetentionDays: Number.isFinite(succeededOverride) && (succeededOverride as number) > 0
            ? succeededOverride
            : retention.succeededRetentionDays,
          failedRetentionDays: Number.isFinite(failedOverride) && (failedOverride as number) > 0
            ? failedOverride
            : retention.failedRetentionDays,
        });
      } else {
        const r = await runJobPrune('manual');
        result = { succeededDeleted: r.succeededDeleted, failedDeleted: r.failedDeleted };
      }

      res.json({ ...result, totalDeleted: result.succeededDeleted + result.failedDeleted });
    } catch (err: any) {
      res.status(500).json({ message: err.message || 'Failed to prune background jobs' });
    }
  });
}
