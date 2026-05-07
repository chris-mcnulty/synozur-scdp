/**
 * Galaxy enqueue per-client fan-out tests.
 *
 * Covers the `enqueueGalaxyEvent({ clientId })` filter that ships with the
 * v2.5 outbound webhook wiring (estimate.sent, status_report.published,
 * milestone.completed, invoice.issued):
 *
 *   - Only apps that hold an active grant for the supplied clientId receive
 *     a delivery row. A tenant-mate app with no matching grant is skipped.
 *   - Disabled apps and apps without a webhookUrl are skipped even when
 *     they have a matching grant.
 *   - When `clientId` is omitted, the legacy fan-out (all tenant apps)
 *     applies — no per-client filter is enforced.
 *   - When the supplied `clientId` matches no grants, no delivery rows are
 *     created.
 *   - The created delivery row carries the documented payload envelope:
 *     id, event, tenantId, appId, createdAt, data.
 *
 * The DB layer is stubbed via monkey-patching the storage singleton so the
 * test never touches Postgres; the grant lookup that the enqueue path runs
 * against `db.select(...).from(galaxyAppGrants)` is intercepted at the
 * Drizzle `select()` boundary so we don't need a live connection.
 */
import { describe, it, expect } from "./_harness.js";
import { storage } from "../server/storage";
import { enqueueGalaxyEvent } from "../server/services/galaxy-webhook-delivery.js";
import * as dbModule from "../server/db";

function fakeApp(over: Partial<any> = {}): any {
  return {
    id: "app_enq_1",
    tenantId: "tenant_a",
    name: "Enq App",
    description: null,
    clientSecretHash: "x",
    redirectUris: [],
    webhookUrl: "https://example.com/hook",
    webhookSecret: "whk_secret_test",
    allowedScopes: [],
    originAllowList: [],
    rateLimitPerMin: 1000,
    tokenRateLimitPerMin: 100,
    jwtSigningKey: "irrelevant",
    createdBy: null,
    createdAt: new Date(),
    disabledAt: null,
    rotatedAt: null,
    ...over,
  };
}

interface EnqHarness {
  created: any[];
  restore: () => void;
}

/**
 * Stub the storage and DB lookups that `enqueueGalaxyEvent` relies on.
 *
 * `tenantApps`     — what `storage.getGalaxyAppsForTenant` returns.
 * `grants`         — { appId, clientId } rows that pretend to be the
 *                    active galaxy_app_grants for this tenant.
 *
 * The enqueue path calls `db.select(...).from(galaxyAppGrants).where(...)`
 * to pull active grants. We intercept that chain by patching `db.select`
 * to return a thenable whose where() resolves to the grants subset matching
 * the requested clientId.
 */
function installEnqueueHarness(opts: {
  tenantApps: any[];
  grants: Array<{ appId: string; clientId: string | null }>;
}): EnqHarness {
  const origGetForTenant = (storage as any).getGalaxyAppsForTenant;
  const origGetApp = (storage as any).getGalaxyApp;
  const origCreate = (storage as any).createGalaxyWebhookDelivery;
  const origSelect = (dbModule.db as any).select;

  const harness: EnqHarness = {
    created: [],
    restore: () => {
      (storage as any).getGalaxyAppsForTenant = origGetForTenant;
      (storage as any).getGalaxyApp = origGetApp;
      (storage as any).createGalaxyWebhookDelivery = origCreate;
      (dbModule.db as any).select = origSelect;
    },
  };

  (storage as any).getGalaxyAppsForTenant = async (_tenantId: string) => opts.tenantApps;
  (storage as any).getGalaxyApp = async (id: string) => opts.tenantApps.find((a) => a.id === id);
  (storage as any).createGalaxyWebhookDelivery = async (data: any) => {
    harness.created.push(data);
    return { id: `del_${harness.created.length}`, ...data };
  };

  // Intercept db.select for the grant lookup. The enqueue caller does
  // `.select({ appId }).from(...).where(and(eq(tenantId,...), eq(clientId,...), isNull(revokedAt)))`.
  // We don't try to interpret the where() — we just return the grants
  // configured for this harness (which the caller then maps to appIds).
  // Other db.select calls in this process aren't exercised by the spec.
  (dbModule.db as any).select = (_cols?: any) => {
    return {
      from: (_table: any) => ({
        where: (_cond: any) =>
          Promise.resolve(opts.grants.map((g) => ({ appId: g.appId }))),
      }),
    };
  };

  return harness;
}

describe("galaxy enqueue: per-client fan-out filter", () => {
  it("delivers only to apps with an active grant for the target clientId", async () => {
    const apps = [
      fakeApp({ id: "app_a" }),
      fakeApp({ id: "app_b" }),
    ];
    const h = installEnqueueHarness({
      tenantApps: apps,
      // Only app_a has consented for tenant_a / client_X
      grants: [{ appId: "app_a", clientId: "client_X" }],
    });
    try {
      await enqueueGalaxyEvent({
        tenantId: "tenant_a",
        event: "estimate.sent",
        clientId: "client_X",
        data: { estimateId: "est_1" },
      });
      expect(h.created.length).toBe(1);
      expect(h.created[0].appId).toBe("app_a");
      expect(h.created[0].event).toBe("estimate.sent");
      expect(h.created[0].tenantId).toBe("tenant_a");
    } finally {
      h.restore();
    }
  });

  it("skips disabled apps even if they have a grant", async () => {
    const apps = [
      fakeApp({ id: "app_a", disabledAt: new Date() }),
      fakeApp({ id: "app_b" }),
    ];
    const h = installEnqueueHarness({
      tenantApps: apps,
      grants: [
        { appId: "app_a", clientId: "client_X" },
        { appId: "app_b", clientId: "client_X" },
      ],
    });
    try {
      await enqueueGalaxyEvent({
        tenantId: "tenant_a",
        event: "estimate.sent",
        clientId: "client_X",
        data: {},
      });
      expect(h.created.length).toBe(1);
      expect(h.created[0].appId).toBe("app_b");
    } finally {
      h.restore();
    }
  });

  it("skips apps without a webhookUrl", async () => {
    const apps = [
      fakeApp({ id: "app_a", webhookUrl: null }),
      fakeApp({ id: "app_b" }),
    ];
    const h = installEnqueueHarness({
      tenantApps: apps,
      grants: [
        { appId: "app_a", clientId: "client_X" },
        { appId: "app_b", clientId: "client_X" },
      ],
    });
    try {
      await enqueueGalaxyEvent({
        tenantId: "tenant_a",
        event: "estimate.sent",
        clientId: "client_X",
        data: {},
      });
      expect(h.created.length).toBe(1);
      expect(h.created[0].appId).toBe("app_b");
    } finally {
      h.restore();
    }
  });

  it("creates no deliveries when no app has a matching grant", async () => {
    const apps = [fakeApp({ id: "app_a" }), fakeApp({ id: "app_b" })];
    const h = installEnqueueHarness({ tenantApps: apps, grants: [] });
    try {
      await enqueueGalaxyEvent({
        tenantId: "tenant_a",
        event: "milestone.completed",
        clientId: "client_X",
        data: {},
      });
      expect(h.created.length).toBe(0);
    } finally {
      h.restore();
    }
  });

  it("falls back to all tenant apps when clientId is omitted", async () => {
    const apps = [fakeApp({ id: "app_a" }), fakeApp({ id: "app_b" })];
    const h = installEnqueueHarness({ tenantApps: apps, grants: [] });
    try {
      await enqueueGalaxyEvent({
        tenantId: "tenant_a",
        event: "invoice.issued",
        data: {},
      });
      expect(h.created.length).toBe(2);
    } finally {
      h.restore();
    }
  });

  it("envelope contains id, event, tenantId, appId, createdAt, data", async () => {
    const apps = [fakeApp({ id: "app_a" })];
    const h = installEnqueueHarness({
      tenantApps: apps,
      grants: [{ appId: "app_a", clientId: "client_X" }],
    });
    try {
      await enqueueGalaxyEvent({
        tenantId: "tenant_a",
        event: "status_report.published",
        clientId: "client_X",
        data: { statusReportId: "sr_1", projectId: "p_1" },
      });
      expect(h.created.length).toBe(1);
      const env = h.created[0].payload;
      expect(typeof env.id).toBe("string");
      expect(env.event).toBe("status_report.published");
      expect(env.tenantId).toBe("tenant_a");
      expect(env.appId).toBe("app_a");
      expect(typeof env.createdAt).toBe("string");
      expect(env.data.statusReportId).toBe("sr_1");
      expect(env.data.projectId).toBe("p_1");
    } finally {
      h.restore();
    }
  });
});
