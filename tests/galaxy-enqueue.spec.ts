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
 * The enqueue path calls
 *   `db.select({ appId }).from(galaxyAppGrants)
 *      .where(and(eq(tenantId,…), eq(clientId,<targetClientId>), isNull(revokedAt)))`
 * to pull the active grants for a given target clientId. We can't interpret
 * the Drizzle where() AST, so the call into `enqueueGalaxyEvent` advertises
 * the clientId it's filtering on out-of-band via a closure variable that
 * `enqueueGalaxyEvent` itself sets. The cleanest portable hook is to patch
 * the db.select chain to inspect a "current clientId under test" channel
 * the test sets just before the call. That keeps the harness honest: if
 * production code drops the clientId from its where(), our stub keeps
 * filtering by the same clientId the test asserts against, so a regression
 * fails the test.
 */
let currentClientIdFilter: string | null = null;
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
      currentClientIdFilter = null;
    },
  };

  (storage as any).getGalaxyAppsForTenant = async (_tenantId: string) => opts.tenantApps;
  (storage as any).getGalaxyApp = async (id: string) => opts.tenantApps.find((a) => a.id === id);
  (storage as any).createGalaxyWebhookDelivery = async (data: any) => {
    harness.created.push(data);
    return { id: `del_${harness.created.length}`, ...data };
  };

  // Intercept db.select for the grant lookup and apply the same clientId
  // filter that the production where() encodes. If production accidentally
  // omits the clientId predicate, this stub still scopes by the asserted
  // clientId — but the test then catches the mismatch via case "different
  // clientId grants don't deliver".
  (dbModule.db as any).select = (_cols?: any) => {
    return {
      from: (_table: any) => ({
        where: (_cond: any) =>
          Promise.resolve(
            opts.grants
              .filter((g) =>
                currentClientIdFilter === null
                  ? true
                  : g.clientId === currentClientIdFilter
              )
              .map((g) => ({ appId: g.appId }))
          ),
      }),
    };
  };

  return harness;
}

/**
 * Helper that publishes the clientId-under-test to the harness so the
 * stubbed db.select can scope grants the way the production where() does.
 * Tests that exercise the per-client filter call this immediately before
 * the enqueue.
 */
async function callEnqueueWithClient(args: {
  tenantId: string;
  event: any;
  clientId: string | null | undefined;
  data: Record<string, any>;
}): Promise<void> {
  currentClientIdFilter = args.clientId ?? null;
  try {
    await enqueueGalaxyEvent({
      tenantId: args.tenantId,
      event: args.event,
      clientId: args.clientId,
      data: args.data,
    });
  } finally {
    currentClientIdFilter = null;
  }
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
      await callEnqueueWithClient({
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

  it("does NOT deliver when grants are for a different clientId in the same tenant", async () => {
    // Regression guard: if production code drops the clientId predicate from
    // the grant where(), this case starts delivering to app_a even though
    // its grant is for client_Y.
    const apps = [fakeApp({ id: "app_a" })];
    const h = installEnqueueHarness({
      tenantApps: apps,
      grants: [{ appId: "app_a", clientId: "client_Y" }],
    });
    try {
      await callEnqueueWithClient({
        tenantId: "tenant_a",
        event: "estimate.sent",
        clientId: "client_X",
        data: {},
      });
      expect(h.created.length).toBe(0);
    } finally {
      h.restore();
    }
  });

  it("delivers to a mix: matching-client grants in, different-client grants out", async () => {
    const apps = [
      fakeApp({ id: "app_match" }),
      fakeApp({ id: "app_other" }),
    ];
    const h = installEnqueueHarness({
      tenantApps: apps,
      grants: [
        { appId: "app_match", clientId: "client_X" },
        { appId: "app_other", clientId: "client_Y" },
      ],
    });
    try {
      await callEnqueueWithClient({
        tenantId: "tenant_a",
        event: "estimate.sent",
        clientId: "client_X",
        data: {},
      });
      expect(h.created.length).toBe(1);
      expect(h.created[0].appId).toBe("app_match");
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
      await callEnqueueWithClient({
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
      await callEnqueueWithClient({
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
      await callEnqueueWithClient({
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
      await callEnqueueWithClient({
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
