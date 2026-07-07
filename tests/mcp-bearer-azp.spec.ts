/**
 * Regression suite pinning the Copilot client allow-list (azp) contract for
 * MCP bearer auth.
 *
 * Layered enforcement rules that must never silently change:
 *   1. Tenant override present  -> always enforced, even when the override is
 *      an empty list (explicit "deny everyone" lockdown for that tenant).
 *   2. No override, global list non-empty -> enforced against the global list.
 *   3. No override, empty global list -> open access (any validly-signed token).
 *
 * getEffectiveKnownClientIds resolves the effective list + source from
 * storage; evaluateAzpEnforcement is the pure decision the middleware applies.
 * Storage lookups are stubbed so no database is required.
 */
import { describe, it, expect } from "./_harness.js";
import {
  getEffectiveKnownClientIds,
  evaluateAzpEnforcement,
} from "../server/auth/mcp-bearer-auth.js";
import { storage } from "../server/storage.js";

const TENANT_ID = "11111111-2222-3333-4444-555555555555";
const KEY = "COPILOT_KNOWN_CLIENT_IDS";

const originalGetSystem = storage.getSystemSettingValue.bind(storage);
const originalGetTenant = storage.getTenantSettingValue.bind(storage);

/**
 * Stub the two storage lookups the resolver uses.
 * globalRaw: raw string stored in system_settings (the resolver passes a
 *            default of "[]", mirrored here when the setting is absent).
 * tenantRaw: raw string stored in tenant_settings, or undefined when the
 *            tenant has no override row.
 */
function stubSettings(globalRaw: string | undefined, tenantRaw: string | undefined) {
  (storage as any).getSystemSettingValue = async (key: string, defaultValue?: string) => {
    if (key !== KEY) return originalGetSystem(key, defaultValue);
    return globalRaw !== undefined ? globalRaw : (defaultValue ?? "");
  };
  (storage as any).getTenantSettingValue = async (
    tenantId: string,
    key: string,
    defaultValue?: string
  ) => {
    if (key !== KEY) return originalGetTenant(tenantId, key, defaultValue);
    return tenantRaw;
  };
}

function restoreSettings() {
  (storage as any).getSystemSettingValue = originalGetSystem;
  (storage as any).getTenantSettingValue = originalGetTenant;
}

async function resolve(globalRaw: string | undefined, tenantRaw: string | undefined, tenantId: string | null = TENANT_ID) {
  stubSettings(globalRaw, tenantRaw);
  try {
    return await getEffectiveKnownClientIds(tenantId);
  } finally {
    restoreSettings();
  }
}

describe("MCP azp allow-list — effective list resolution", () => {
  it("tenant override wins over the global list", async () => {
    const r = await resolve('["global-app"]', '["tenant-app"]');
    expect(r.source).toBe("tenant");
    expect(r.effective).toEqual(["tenant-app"]);
    expect(r.globalIds).toEqual(["global-app"]);
  });

  it("empty tenant override still counts as a tenant override (lockdown)", async () => {
    const r = await resolve('["global-app"]', "[]");
    expect(r.source).toBe("tenant");
    expect(r.effective).toEqual([]);
  });

  it("falls back to the global list when the tenant has no override", async () => {
    const r = await resolve('["global-app"]', undefined);
    expect(r.source).toBe("global");
    expect(r.effective).toEqual(["global-app"]);
    expect(r.tenantIds).toBeNull();
  });

  it("reports source none when neither list is configured", async () => {
    const r = await resolve(undefined, undefined);
    expect(r.source).toBe("none");
    expect(r.effective).toEqual([]);
  });

  it("empty global list with no override means source none", async () => {
    const r = await resolve("[]", undefined);
    expect(r.source).toBe("none");
    expect(r.effective).toEqual([]);
  });

  it("without a tenant id the tenant override is never consulted", async () => {
    // tenantRaw would enforce lockdown if consulted; a null tenant must skip it.
    const r = await resolve('["global-app"]', "[]", null);
    expect(r.source).toBe("global");
    expect(r.effective).toEqual(["global-app"]);
  });

  it("malformed stored JSON degrades to an empty list, not a crash", async () => {
    const r = await resolve("not-json", undefined);
    expect(r.source).toBe("none");
    expect(r.effective).toEqual([]);
  });

  it("non-array stored JSON degrades to an empty list", async () => {
    const r = await resolve('{"app":"x"}', undefined);
    expect(r.source).toBe("none");
    expect(r.effective).toEqual([]);
  });
});

describe("MCP azp allow-list — enforcement decision", () => {
  it("tenant source with a listed azp is allowed", () => {
    const d = evaluateAzpEnforcement("tenant-app", ["tenant-app"], "tenant");
    expect(d.enforced).toBe(true);
    expect(d.allowed).toBe(true);
  });

  it("tenant source rejects an azp not in the override list", () => {
    const d = evaluateAzpEnforcement("rogue-app", ["tenant-app"], "tenant");
    expect(d.enforced).toBe(true);
    expect(d.allowed).toBe(false);
  });

  it("empty tenant override rejects every azp (lockdown)", () => {
    const d = evaluateAzpEnforcement("any-app", [], "tenant");
    expect(d.enforced).toBe(true);
    expect(d.allowed).toBe(false);
  });

  it("empty tenant override rejects tokens with no azp claim", () => {
    const d = evaluateAzpEnforcement(undefined, [], "tenant");
    expect(d.enforced).toBe(true);
    expect(d.allowed).toBe(false);
  });

  it("global source with a listed azp is allowed", () => {
    const d = evaluateAzpEnforcement("global-app", ["global-app"], "global");
    expect(d.enforced).toBe(true);
    expect(d.allowed).toBe(true);
  });

  it("global source rejects an unlisted azp", () => {
    const d = evaluateAzpEnforcement("rogue-app", ["global-app"], "global");
    expect(d.enforced).toBe(true);
    expect(d.allowed).toBe(false);
  });

  it("enforced sources reject tokens missing the azp claim", () => {
    const d = evaluateAzpEnforcement(undefined, ["global-app"], "global");
    expect(d.enforced).toBe(true);
    expect(d.allowed).toBe(false);
  });

  it("no lists configured means open access", () => {
    const d = evaluateAzpEnforcement("any-app", [], "none");
    expect(d.enforced).toBe(false);
    expect(d.allowed).toBe(true);
  });

  it("no lists configured allows tokens without an azp claim", () => {
    const d = evaluateAzpEnforcement(undefined, [], "none");
    expect(d.enforced).toBe(false);
    expect(d.allowed).toBe(true);
  });
});

describe("MCP azp allow-list — resolution + enforcement end to end", () => {
  it("unlisted app is rejected under a tenant override", async () => {
    const r = await resolve('["global-app"]', '["tenant-app"]');
    const d = evaluateAzpEnforcement("global-app", r.effective, r.source);
    // global-app is on the global list, but the tenant override supersedes it.
    expect(d.allowed).toBe(false);
  });

  it("listed app is accepted under the global list", async () => {
    const r = await resolve('["good-app"]', undefined);
    expect(evaluateAzpEnforcement("good-app", r.effective, r.source).allowed).toBe(true);
    expect(evaluateAzpEnforcement("bad-app", r.effective, r.source).allowed).toBe(false);
  });

  it("open access when nothing is configured anywhere", async () => {
    const r = await resolve(undefined, undefined);
    expect(evaluateAzpEnforcement("anything", r.effective, r.source).allowed).toBe(true);
  });
});
