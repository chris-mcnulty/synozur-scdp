/**
 * Task #142 — Galaxy auth unit tests.
 *
 * Covers:
 *   - hashSecret / timingSafeEqualHex
 *   - generateSecret / generateAuthCode shape + entropy
 *   - parseScopeString / intersectScopes
 *   - mintAccessToken + verifyAccessToken happy/sad paths
 *   - Token rejection when the app has been disabled
 *   - Token rejection on tampered signature
 */
import jwt from "jsonwebtoken";
import { describe, it, expect } from "./_harness.js";
import {
  hashSecret,
  timingSafeEqualHex,
  generateSecret,
  generateAuthCode,
  parseScopeString,
  intersectScopes,
  mintAccessToken,
  verifyAccessToken,
  ACCESS_TTL_SECONDS,
} from "../server/services/galaxy-auth.js";
import { storage } from "../server/storage";

function fakeApp(over: Partial<any> = {}): any {
  return {
    id: "app_test_1",
    tenantId: "tenant_a",
    name: "Test",
    description: null,
    clientSecretHash: hashSecret("secret"),
    redirectUris: ["https://example.com/cb"],
    webhookUrl: null,
    webhookSecret: null,
    allowedScopes: ["projects:read", "estimates:read", "estimates:approve"],
    originAllowList: [],
    rateLimitPerMin: 1000,
    tokenRateLimitPerMin: 100,
    jwtSigningKey: "test-signing-key-do-not-use-in-prod",
    createdBy: null,
    createdAt: new Date(),
    disabledAt: null,
    rotatedAt: null,
    ...over,
  };
}

/** Replace storage.getGalaxyApp with a deterministic stub for the duration of fn. */
async function withStubApp(app: any | null, fn: () => Promise<void>): Promise<void> {
  const orig = (storage as any).getGalaxyApp;
  (storage as any).getGalaxyApp = async (id: string) => {
    if (app && app.id === id) return app;
    return undefined;
  };
  try {
    await fn();
  } finally {
    (storage as any).getGalaxyApp = orig;
  }
}

describe("galaxy-auth: hashing + timing-safe comparison", () => {
  it("hashSecret produces 64-char hex (sha256)", () => {
    const h = hashSecret("hello");
    expect(h.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(h)).toBe(true);
  });
  it("hashSecret is deterministic for the same input", () => {
    expect(hashSecret("abc")).toBe(hashSecret("abc"));
  });
  it("hashSecret diverges for different inputs", () => {
    expect(hashSecret("abc") === hashSecret("abd")).toBe(false);
  });
  it("timingSafeEqualHex returns true for matching hex", () => {
    expect(timingSafeEqualHex(hashSecret("a"), hashSecret("a"))).toBe(true);
  });
  it("timingSafeEqualHex returns false for differing hex", () => {
    expect(timingSafeEqualHex(hashSecret("a"), hashSecret("b"))).toBe(false);
  });
  it("timingSafeEqualHex returns false for length mismatch (no throw)", () => {
    expect(timingSafeEqualHex("aa", "aabb")).toBe(false);
  });
});

describe("galaxy-auth: secret + auth code generation", () => {
  it("generateSecret has the expected prefix", () => {
    expect(generateSecret("gxs", 8).startsWith("gxs_")).toBe(true);
  });
  it("generateSecret is unique across calls", () => {
    expect(generateSecret("gxs", 16) === generateSecret("gxs", 16)).toBe(false);
  });
  it("generateAuthCode is base64url and >= 32 bytes", () => {
    const c = generateAuthCode();
    expect(/^[A-Za-z0-9_\-]+$/.test(c)).toBe(true);
    expect(c.length).toBeGreaterThanOrEqual(40);
  });
});

describe("galaxy-auth: scope parsing + intersection", () => {
  it("parseScopeString handles undefined", () => {
    expect(parseScopeString(undefined)).toEqual([]);
  });
  it("parseScopeString splits on whitespace and commas", () => {
    expect(parseScopeString("projects:read estimates:read,milestones:read"))
      .toEqual(["projects:read", "estimates:read", "milestones:read"]);
  });
  it("intersectScopes drops scopes not allowed by the app", () => {
    expect(intersectScopes(
      ["projects:read", "estimates:approve", "secret:admin"],
      ["projects:read", "estimates:approve"],
    )).toEqual(["projects:read", "estimates:approve"]);
  });
  it("intersectScopes drops scopes not in the global GALAXY_SCOPES set", () => {
    // "fake:scope" is not in GALAXY_SCOPES even if the app claims to allow it
    expect(intersectScopes(
      ["projects:read", "fake:scope"],
      ["projects:read", "fake:scope"],
    )).toEqual(["projects:read"]);
  });
  it("intersectScopes returns [] when nothing overlaps", () => {
    expect(intersectScopes(["raidd:read"], ["projects:read"])).toEqual([]);
  });
});

describe("galaxy-auth: mint + verify access token", () => {
  it("mintAccessToken returns a JWT with expected claims", () => {
    const app = fakeApp();
    const { token, jti, expiresAt } = mintAccessToken(app, {
      clientUserId: "user_1",
      clientId: "client_1",
      scopes: ["projects:read"],
      grant: "authorization_code",
    });
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3);
    expect(jti.length).toBeGreaterThanOrEqual(8);
    const skew = Math.abs(expiresAt.getTime() - (Date.now() + ACCESS_TTL_SECONDS * 1000));
    expect(skew).toBeLessThanOrEqual(2_000);

    const decoded = jwt.decode(token) as any;
    expect(decoded.iss).toBe("galaxy");
    expect(decoded.aud).toBe(app.id);
    expect(decoded.tid).toBe(app.tenantId);
    expect(decoded.cid).toBe("client_1");
    expect(decoded.scp).toBe("projects:read");
    expect(decoded.gnt).toBe("authorization_code");
  });

  it("verifyAccessToken returns claims for a freshly minted token", async () => {
    const app = fakeApp();
    await withStubApp(app, async () => {
      const { token } = mintAccessToken(app, {
        clientUserId: "user_1",
        clientId: "client_1",
        scopes: ["projects:read", "estimates:read"],
        grant: "authorization_code",
      });
      const v = await verifyAccessToken(token);
      expect(v).toBeTruthy();
      expect(v!.app.id).toBe(app.id);
      expect(v!.scopes).toEqual(["projects:read", "estimates:read"]);
      expect(v!.claims.tid).toBe(app.tenantId);
    });
  });

  it("verifyAccessToken rejects garbage input", async () => {
    await withStubApp(null, async () => {
      expect(await verifyAccessToken("not.a.jwt")).toBeNull();
      expect(await verifyAccessToken("")).toBeNull();
    });
  });

  it("verifyAccessToken rejects tokens whose app cannot be loaded", async () => {
    const app = fakeApp();
    const { token } = mintAccessToken(app, {
      clientUserId: "u",
      clientId: "c",
      scopes: ["projects:read"],
      grant: "authorization_code",
    });
    await withStubApp(null, async () => {
      expect(await verifyAccessToken(token)).toBeNull();
    });
  });

  it("verifyAccessToken rejects tokens for disabled apps", async () => {
    const app = fakeApp();
    const { token } = mintAccessToken(app, {
      clientUserId: "u",
      clientId: "c",
      scopes: ["projects:read"],
      grant: "authorization_code",
    });
    const disabled = { ...app, disabledAt: new Date() };
    await withStubApp(disabled, async () => {
      expect(await verifyAccessToken(token)).toBeNull();
    });
  });

  it("verifyAccessToken rejects a token signed with the wrong key", async () => {
    const app = fakeApp();
    // Mint with a *different* key, then point the stub at the original app
    const evilApp = { ...app, jwtSigningKey: "evil-key" };
    const { token } = mintAccessToken(evilApp, {
      clientUserId: "u",
      clientId: "c",
      scopes: ["projects:read"],
      grant: "authorization_code",
    });
    await withStubApp(app, async () => {
      expect(await verifyAccessToken(token)).toBeNull();
    });
  });

  it("verifyAccessToken rejects expired tokens", async () => {
    const app = fakeApp();
    const now = Math.floor(Date.now() / 1000);
    const expired = jwt.sign({
      iss: "galaxy", aud: app.id, sub: "u", tid: app.tenantId, cid: "c",
      scp: "projects:read", gnt: "authorization_code", jti: "x",
      iat: now - 7200, exp: now - 3600,
    }, app.jwtSigningKey, { algorithm: "HS256" });
    await withStubApp(app, async () => {
      expect(await verifyAccessToken(expired)).toBeNull();
    });
  });

  it("verifyAccessToken rejects tokens with iss != 'galaxy'", async () => {
    const app = fakeApp();
    const now = Math.floor(Date.now() / 1000);
    const wrong = jwt.sign({
      iss: "other", aud: app.id, sub: "u", tid: app.tenantId, cid: "c",
      scp: "projects:read", gnt: "authorization_code", jti: "x",
      iat: now, exp: now + 60,
    }, app.jwtSigningKey, { algorithm: "HS256" });
    await withStubApp(app, async () => {
      expect(await verifyAccessToken(wrong)).toBeNull();
    });
  });
});
