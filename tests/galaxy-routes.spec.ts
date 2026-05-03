/**
 * Task #142 — Galaxy v1 route middleware tests.
 *
 * Spins up an in-process Express app with the Galaxy v1 routes mounted and
 * exercises the auth/scope/rate-limit/cross-tenant guarantees end-to-end via
 * loopback HTTP. All persistence is stubbed by monkey-patching the storage
 * singleton — these tests intentionally do NOT touch the database.
 *
 * Covers:
 *   - 401 on missing / malformed / invalid bearer
 *   - 401 on token signed for an unknown app
 *   - 403 (client_user_unbound) when claims.cid is null
 *   - 403 (missing_scope) when token lacks the required scope
 *   - 429 once rate-limit thresholds are exceeded, with Retry-After
 *   - 200 on a valid token; cross-client list filtering
 *   - 404 cross-tenant: estimate from another tenant is invisible
 *   - 404 cross-client: estimate from another client (same tenant) is invisible
 */
import http from "node:http";
import express from "express";
import { describe, it, expect } from "./_harness.js";
import { storage } from "../server/storage";
import { mintAccessToken } from "../server/services/galaxy-auth.js";
import { registerGalaxyV1Routes } from "../server/routes/galaxy/v1/index.js";

function fakeApp(over: Partial<any> = {}): any {
  return {
    id: "app_routes_1",
    tenantId: "tenant_a",
    name: "Routes App",
    description: null,
    clientSecretHash: "x",
    redirectUris: ["https://example.com/cb"],
    webhookUrl: null,
    webhookSecret: null,
    allowedScopes: [
      "projects:read",
      "estimates:read",
      "estimates:approve",
      "invoices:read",
    ],
    originAllowList: [],
    rateLimitPerMin: 5000,
    tokenRateLimitPerMin: 600,
    jwtSigningKey: "routes-test-signing-key",
    createdBy: null,
    createdAt: new Date(),
    disabledAt: null,
    rotatedAt: null,
    ...over,
  };
}

interface ServerHarness {
  origin: string;
  close: () => Promise<void>;
  rateBuckets: Map<string, number>;
  audits: any[];
  setEstimate: (e: any | null) => void;
  setProjects: (rows: any[]) => void;
  restore: () => void;
}

async function startApp(opts: { app: any }): Promise<ServerHarness> {
  const origGetApp = (storage as any).getGalaxyApp;
  const origIncr = (storage as any).incrementGalaxyRateBucket;
  const origAudit = (storage as any).writeGalaxyAudit;
  const origGetEstimate = (storage as any).getEstimate;
  const origGetProjects = (storage as any).getProjects;

  const buckets = new Map<string, number>();
  const audits: any[] = [];
  let estimate: any | null = null;
  let projectRows: any[] = [];

  (storage as any).getGalaxyApp = async (id: string) =>
    id === opts.app.id ? opts.app : undefined;
  (storage as any).incrementGalaxyRateBucket = async (key: string) => {
    const next = (buckets.get(key) ?? 0) + 1;
    buckets.set(key, next);
    return next;
  };
  (storage as any).writeGalaxyAudit = async (a: any) => {
    audits.push(a);
  };
  (storage as any).getEstimate = async (_id: string) => estimate ?? undefined;
  (storage as any).getProjects = async (_tenantId: string) => projectRows;

  const exp = express();
  exp.use(express.json());
  // Minimal stubs for the auth deps used only by admin endpoints we don't hit
  registerGalaxyV1Routes(exp, {
    requireAuth: (_req: any, _res: any, next: any) => next(),
    requireRole: () => (_req: any, _res: any, next: any) => next(),
  });

  const server = http.createServer(exp);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as any;
  const origin = `http://127.0.0.1:${addr.port}`;

  return {
    origin,
    rateBuckets: buckets,
    audits,
    setEstimate: (e) => { estimate = e; },
    setProjects: (rows) => { projectRows = rows; },
    close: async () => {
      await new Promise<void>((r) => server.close(() => r()));
    },
    restore: () => {
      (storage as any).getGalaxyApp = origGetApp;
      (storage as any).incrementGalaxyRateBucket = origIncr;
      (storage as any).writeGalaxyAudit = origAudit;
      (storage as any).getEstimate = origGetEstimate;
      (storage as any).getProjects = origGetProjects;
    },
  };
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

describe("galaxy routes: auth middleware (401/403)", () => {
  it("returns 401 missing_token when no Authorization header is set", async () => {
    const app = fakeApp();
    const h = await startApp({ app });
    try {
      const res = await fetch(`${h.origin}/api/galaxy/v1/projects`);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe("missing_token");
      expect(res.headers.get("WWW-Authenticate")?.includes("Bearer")).toBe(true);
    } finally {
      h.restore();
      await h.close();
    }
  });

  it("returns 401 invalid_token for a malformed JWT", async () => {
    const app = fakeApp();
    const h = await startApp({ app });
    try {
      const res = await fetch(`${h.origin}/api/galaxy/v1/projects`, {
        headers: bearer("not-a-real-jwt"),
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe("invalid_token");
    } finally {
      h.restore();
      await h.close();
    }
  });

  it("returns 401 invalid_token when the token's app cannot be resolved", async () => {
    const app = fakeApp();
    const h = await startApp({ app });
    try {
      const ghost = fakeApp({ id: "app_unknown", jwtSigningKey: "ghost-key" });
      const { token } = mintAccessToken(ghost, {
        clientUserId: "u",
        clientId: "c",
        scopes: ["projects:read"],
        grant: "authorization_code",
      });
      const res = await fetch(`${h.origin}/api/galaxy/v1/projects`, {
        headers: bearer(token),
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe("invalid_token");
    } finally {
      h.restore();
      await h.close();
    }
  });

  it("returns 403 client_user_unbound when token has no cid", async () => {
    const app = fakeApp();
    const h = await startApp({ app });
    try {
      const { token } = mintAccessToken(app, {
        clientUserId: "u",
        clientId: null,
        scopes: ["projects:read"],
        grant: "client_credentials",
      });
      const res = await fetch(`${h.origin}/api/galaxy/v1/projects`, {
        headers: bearer(token),
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe("client_user_unbound");
    } finally {
      h.restore();
      await h.close();
    }
  });

  it("returns 403 missing_scope when the required scope is absent", async () => {
    const app = fakeApp();
    const h = await startApp({ app });
    try {
      // Token has invoices:read only — but /projects requires projects:read
      const { token } = mintAccessToken(app, {
        clientUserId: "u",
        clientId: "client_a",
        scopes: ["invoices:read"],
        grant: "authorization_code",
      });
      const res = await fetch(`${h.origin}/api/galaxy/v1/projects`, {
        headers: bearer(token),
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.code).toBe("missing_scope");
      expect(body.missing_scope).toBe("projects:read");
    } finally {
      h.restore();
      await h.close();
    }
  });
});

describe("galaxy routes: rate limiting (429)", () => {
  it("returns 429 with Retry-After once the per-app limit is exceeded", async () => {
    const app = fakeApp({ rateLimitPerMin: 2, tokenRateLimitPerMin: 100 });
    const h = await startApp({ app });
    try {
      h.setProjects([]);
      const { token } = mintAccessToken(app, {
        clientUserId: "u",
        clientId: "client_a",
        scopes: ["projects:read"],
        grant: "authorization_code",
      });
      // Two requests within the limit
      for (let i = 0; i < 2; i++) {
        const ok = await fetch(`${h.origin}/api/galaxy/v1/projects`, { headers: bearer(token) });
        expect(ok.status).toBe(200);
      }
      // Third request — over the per-app limit
      const res = await fetch(`${h.origin}/api/galaxy/v1/projects`, { headers: bearer(token) });
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.code).toBe("rate_limited");
      const retry = res.headers.get("Retry-After");
      expect(retry !== null).toBe(true);
      expect(parseInt(retry!, 10) >= 0).toBe(true);
      expect(parseInt(retry!, 10) <= 60).toBe(true);
    } finally {
      h.restore();
      await h.close();
    }
  });

  it("returns 429 once the per-token limit is exceeded", async () => {
    const app = fakeApp({ rateLimitPerMin: 5000, tokenRateLimitPerMin: 1 });
    const h = await startApp({ app });
    try {
      h.setProjects([]);
      const { token } = mintAccessToken(app, {
        clientUserId: "u",
        clientId: "client_a",
        scopes: ["projects:read"],
        grant: "authorization_code",
      });
      const ok = await fetch(`${h.origin}/api/galaxy/v1/projects`, { headers: bearer(token) });
      expect(ok.status).toBe(200);
      const limited = await fetch(`${h.origin}/api/galaxy/v1/projects`, { headers: bearer(token) });
      expect(limited.status).toBe(429);
    } finally {
      h.restore();
      await h.close();
    }
  });
});

describe("galaxy routes: cross-tenant + cross-client isolation (404)", () => {
  it("filters /projects list to entries with matching clientId only", async () => {
    const app = fakeApp();
    const h = await startApp({ app });
    try {
      h.setProjects([
        { id: "p1", code: "C1", name: "Mine", clientId: "client_a", status: "active" },
        { id: "p2", code: "C2", name: "Theirs", clientId: "client_b", status: "active" },
      ]);
      const { token } = mintAccessToken(app, {
        clientUserId: "u",
        clientId: "client_a",
        scopes: ["projects:read"],
        grant: "authorization_code",
      });
      const res = await fetch(`${h.origin}/api/galaxy/v1/projects`, { headers: bearer(token) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.items.length).toBe(1);
      expect(body.items[0].id).toBe("p1");
    } finally {
      h.restore();
      await h.close();
    }
  });

  it("returns 404 for an estimate belonging to a different tenant", async () => {
    const app = fakeApp();
    const h = await startApp({ app });
    try {
      h.setEstimate({
        id: "est_x", tenantId: "tenant_b", clientId: "client_a", status: "sent",
        name: "X", estimateType: "fixed",
      });
      const { token } = mintAccessToken(app, {
        clientUserId: "u",
        clientId: "client_a",
        scopes: ["estimates:read"],
        grant: "authorization_code",
      });
      const res = await fetch(`${h.origin}/api/galaxy/v1/estimates/est_x`, { headers: bearer(token) });
      expect(res.status).toBe(404);
    } finally {
      h.restore();
      await h.close();
    }
  });

  it("returns 404 for an estimate belonging to a different client (same tenant)", async () => {
    const app = fakeApp();
    const h = await startApp({ app });
    try {
      h.setEstimate({
        id: "est_y", tenantId: "tenant_a", clientId: "client_b", status: "sent",
        name: "Y", estimateType: "fixed",
      });
      const { token } = mintAccessToken(app, {
        clientUserId: "u",
        clientId: "client_a",
        scopes: ["estimates:read"],
        grant: "authorization_code",
      });
      const res = await fetch(`${h.origin}/api/galaxy/v1/estimates/est_y`, { headers: bearer(token) });
      expect(res.status).toBe(404);
    } finally {
      h.restore();
      await h.close();
    }
  });

  it("returns 200 for an estimate matching tenant + client + status", async () => {
    const app = fakeApp();
    const h = await startApp({ app });
    try {
      h.setEstimate({
        id: "est_ok", tenantId: "tenant_a", clientId: "client_a", status: "sent",
        name: "OK", estimateType: "fixed",
      });
      const { token } = mintAccessToken(app, {
        clientUserId: "u",
        clientId: "client_a",
        scopes: ["estimates:read"],
        grant: "authorization_code",
      });
      const res = await fetch(`${h.origin}/api/galaxy/v1/estimates/est_ok`, { headers: bearer(token) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe("est_ok");
    } finally {
      h.restore();
      await h.close();
    }
  });
});
