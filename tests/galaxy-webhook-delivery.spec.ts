/**
 * Task #142 — Galaxy webhook delivery tests.
 *
 * Covers:
 *   - HMAC signature format + verifiability
 *   - Outbound POST contains canonical headers + body matching the signature
 *   - Exponential backoff progression (30s, 2m, 10m, 1h, 6h, 24h)
 *   - Final attempt marks delivery as failed
 *   - Successful 2xx response marks delivery as succeeded
 *   - Disabled apps are skipped without retry
 */
import crypto from "crypto";
import { describe, it, expect } from "./_harness.js";
import {
  signWebhookPayload,
  processGalaxyWebhookQueue,
} from "../server/services/galaxy-webhook-delivery.js";
import { storage } from "../server/storage";

function fakeApp(over: Partial<any> = {}): any {
  return {
    id: "app_wh_1",
    tenantId: "tenant_a",
    name: "Webhook App",
    description: null,
    clientSecretHash: "deadbeef",
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

function fakeDelivery(over: Partial<any> = {}): any {
  return {
    id: "del_1",
    tenantId: "tenant_a",
    appId: "app_wh_1",
    event: "estimate.approved",
    payload: { id: "evt_1", event: "estimate.approved", data: {} },
    status: "pending",
    attempts: 0,
    maxAttempts: 6,
    lastStatusCode: null,
    lastError: null,
    nextAttemptAt: new Date(),
    deliveredAt: null,
    createdAt: new Date(),
    ...over,
  };
}

interface Harness {
  patches: Array<Partial<any>>;
  fetchCalls: Array<{ url: string; init: any }>;
  recentForAlert: any[];
  restore: () => void;
}

function installHarness(opts: {
  delivery: any;
  app: any | null;
  fetchImpl: (url: string, init: any) => Promise<Response>;
  recent?: any[];
}): Harness {
  const origGetApp = (storage as any).getGalaxyApp;
  const origGetPending = (storage as any).getPendingGalaxyWebhookDeliveries;
  const origUpdate = (storage as any).updateGalaxyWebhookDelivery;
  const origRecent = (storage as any).getGalaxyWebhookDeliveries;
  const origFetch = global.fetch;

  const harness: Harness = {
    patches: [],
    fetchCalls: [],
    recentForAlert: opts.recent ?? [],
    restore: () => {
      (storage as any).getGalaxyApp = origGetApp;
      (storage as any).getPendingGalaxyWebhookDeliveries = origGetPending;
      (storage as any).updateGalaxyWebhookDelivery = origUpdate;
      (storage as any).getGalaxyWebhookDeliveries = origRecent;
      global.fetch = origFetch;
    },
  };

  let dispensed = false;
  (storage as any).getPendingGalaxyWebhookDeliveries = async () => {
    if (dispensed) return [];
    dispensed = true;
    return [opts.delivery];
  };
  (storage as any).getGalaxyApp = async (id: string) =>
    opts.app && id === opts.app.id ? opts.app : undefined;
  (storage as any).updateGalaxyWebhookDelivery = async (_id: string, patch: any) => {
    harness.patches.push(patch);
  };
  (storage as any).getGalaxyWebhookDeliveries = async () => harness.recentForAlert;

  global.fetch = (async (url: any, init: any) => {
    harness.fetchCalls.push({ url: String(url), init });
    return opts.fetchImpl(String(url), init);
  }) as typeof fetch;

  return harness;
}

describe("galaxy webhook: HMAC signature", () => {
  it("signWebhookPayload returns the documented t=,v1=hex format", () => {
    const sig = signWebhookPayload("secret", "{\"a\":1}", 1700000000);
    expect(sig.startsWith("t=1700000000,v1=")).toBe(true);
    expect(/^t=\d+,v1=[0-9a-f]{64}$/.test(sig)).toBe(true);
  });

  it("signature is verifiable by recomputing HMAC-SHA256(secret, t.body)", () => {
    const ts = 1700000123;
    const body = JSON.stringify({ event: "estimate.approved", x: 42 });
    const sig = signWebhookPayload("hunter2", body, ts);
    const m = /^t=(\d+),v1=([0-9a-f]+)$/.exec(sig)!;
    expect(m).toBeTruthy();
    const expected = crypto
      .createHmac("sha256", "hunter2")
      .update(`${m[1]}.${body}`, "utf8")
      .digest("hex");
    expect(m[2]).toBe(expected);
  });

  it("different secrets produce different signatures for the same body", () => {
    const a = signWebhookPayload("s1", "x", 1);
    const b = signWebhookPayload("s2", "x", 1);
    expect(a === b).toBe(false);
  });

  it("any change to the body invalidates the signature", () => {
    const ts = 1700000999;
    const sig1 = signWebhookPayload("k", "{\"a\":1}", ts);
    const sig2 = signWebhookPayload("k", "{\"a\":2}", ts);
    expect(sig1 === sig2).toBe(false);
  });
});

describe("galaxy webhook: outbound request shape", () => {
  it("POSTs JSON to webhookUrl with X-Galaxy-* headers and signed body", async () => {
    const app = fakeApp();
    const d = fakeDelivery();
    const h = installHarness({
      delivery: d,
      app,
      fetchImpl: async () => new Response("ok", { status: 200 }),
    });
    try {
      await processGalaxyWebhookQueue();
      expect(h.fetchCalls.length).toBe(1);
      const call = h.fetchCalls[0];
      expect(call.url).toBe(app.webhookUrl);
      expect(call.init.method).toBe("POST");
      expect(call.init.headers["Content-Type"]).toBe("application/json");
      expect(call.init.headers["X-Galaxy-Event"]).toBe(d.event);
      expect(call.init.headers["X-Galaxy-Delivery"]).toBe(d.id);
      const sig = call.init.headers["X-Galaxy-Signature"] as string;
      const m = /^t=(\d+),v1=([0-9a-f]+)$/.exec(sig)!;
      expect(m).toBeTruthy();
      // Recompute and compare
      const expected = crypto
        .createHmac("sha256", app.webhookSecret)
        .update(`${m[1]}.${call.init.body}`, "utf8")
        .digest("hex");
      expect(m[2]).toBe(expected);
    } finally {
      h.restore();
    }
  });
});

describe("galaxy webhook: backoff progression", () => {
  // Documented schedule: 30s, 2m, 10m, 1h, 6h, 24h.
  const SCHEDULE = [30, 120, 600, 3600, 21600, 86400];
  // 1 initial attempt + 6 retries = 7 total attempts, so every slot in the
  // documented SCHEDULE — including the final 24h backoff — is reachable.
  const MAX_ATTEMPTS = SCHEDULE.length + 1;

  // After the Nth attempt (1-indexed) fails, the documented schedule says
  // wait SCHEDULE[N-1]: i.e. first retry = 30s, second = 2m, … sixth = 24h.
  for (let attempts = 0; attempts < SCHEDULE.length; attempts++) {
    const expectedDelay = SCHEDULE[attempts];
    it(`attempt ${attempts + 1} → re-queues with ~${expectedDelay}s backoff`, async () => {
      const app = fakeApp();
      const d = fakeDelivery({ attempts, maxAttempts: MAX_ATTEMPTS });
      const h = installHarness({
        delivery: d,
        app,
        fetchImpl: async () => new Response("nope", { status: 500 }),
      });
      try {
        const before = Date.now();
        await processGalaxyWebhookQueue();
        const after = Date.now();
        expect(h.patches.length).toBe(1);
        const patch = h.patches[0];
        expect(patch.status).toBe("pending");
        expect(patch.attempts).toBe(attempts + 1);
        expect(patch.lastStatusCode).toBe(500);
        expect(typeof patch.lastError).toBe("string");
        const next = (patch.nextAttemptAt as Date).getTime();
        // Allow a generous skew window (±2s plus the wall-clock between
        // before/after) but assert we land in the expected bucket.
        const lower = before + expectedDelay * 1000 - 2_000;
        const upper = after + expectedDelay * 1000 + 2_000;
        expect(next >= lower).toBe(true);
        expect(next <= upper).toBe(true);
      } finally {
        h.restore();
      }
    });
  }

  it("final attempt marks the delivery as failed and stops retrying", async () => {
    const app = fakeApp();
    // attempts === maxAttempts - 1 so the next attempt is the last one.
    // With the documented schedule + initial attempt that's the 7th try.
    const d = fakeDelivery({ attempts: MAX_ATTEMPTS - 1, maxAttempts: MAX_ATTEMPTS });
    const h = installHarness({
      delivery: d,
      app,
      fetchImpl: async () => new Response("still nope", { status: 500 }),
      recent: [], // not 10 in a row, so no alert path
    });
    try {
      await processGalaxyWebhookQueue();
      expect(h.patches.length).toBe(1);
      const patch = h.patches[0];
      expect(patch.status).toBe("failed");
      expect(patch.attempts).toBe(MAX_ATTEMPTS);
      expect(patch.deliveredAt instanceof Date).toBe(true);
      expect(patch.nextAttemptAt).toBe(undefined);
    } finally {
      h.restore();
    }
  });

  it("2xx response marks the delivery as succeeded with no further retries", async () => {
    const app = fakeApp();
    const d = fakeDelivery({ attempts: 0 });
    const h = installHarness({
      delivery: d,
      app,
      fetchImpl: async () => new Response("ok", { status: 200 }),
    });
    try {
      await processGalaxyWebhookQueue();
      expect(h.patches.length).toBe(1);
      const patch = h.patches[0];
      expect(patch.status).toBe("succeeded");
      expect(patch.attempts).toBe(1);
      expect(patch.lastStatusCode).toBe(200);
      expect(patch.lastError).toBe(null);
      expect(patch.deliveredAt instanceof Date).toBe(true);
    } finally {
      h.restore();
    }
  });

  it("disabled apps short-circuit to failed without dispatch", async () => {
    const app = fakeApp({ disabledAt: new Date() });
    const d = fakeDelivery();
    const h = installHarness({
      delivery: d,
      app,
      fetchImpl: async () => {
        throw new Error("must not fetch when app is disabled");
      },
    });
    try {
      await processGalaxyWebhookQueue();
      expect(h.fetchCalls.length).toBe(0);
      expect(h.patches.length).toBe(1);
      expect(h.patches[0].status).toBe("failed");
    } finally {
      h.restore();
    }
  });
});
