/**
 * Regression suite pinning the MCP bearer-auth audience contract.
 *
 * After the switch to the domain-based Application ID URI, the middleware
 * must keep accepting all three audiences so Power Platform / Copilot Studio
 * connections created before the switch don't break:
 *   1. DOMAIN_APP_ID_URI  — api://constellation.synozur.com/<client-id>
 *   2. LEGACY_APP_ID_URI  — api://<client-id>
 *   3. CONSTELLATION_CLIENT_ID — bare client ID
 *
 * Also pins that the A2A agent card advertises the same audience/scope the
 * middleware accepts, so the card and middleware cannot drift apart.
 */
import { generateKeyPairSync } from "node:crypto";
import jwt from "jsonwebtoken";
import { describe, it, expect } from "./_harness.js";
import { verifyToken } from "../server/auth/mcp-bearer-auth.js";
import {
  DOMAIN_APP_ID_URI,
  LEGACY_APP_ID_URI,
  CONSTELLATION_CLIENT_ID,
  MCP_ACCESS_SCOPE,
  VALID_TOKEN_AUDIENCES,
} from "../server/lib/entra-resource.js";
import { AGENT_CARD_STATIC } from "../server/a2a/agent-card-data.js";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
const privatePem = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();

const resolveTestKey = async () => publicPem;

const V2_ISSUER =
  "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0";
const V1_ISSUER = "https://sts.windows.net/9188040d-6c67-4c5b-b112-36a304b66dad/";

function signToken(claims: Record<string, unknown>): string {
  return jwt.sign(
    {
      iss: V2_ISSUER,
      preferred_username: "test@synozur.com",
      ...claims,
    },
    privatePem,
    { algorithm: "RS256", expiresIn: "5m", keyid: "test-key" }
  );
}

async function verifyOutcome(
  token: string
): Promise<{ ok: boolean; payload?: jwt.JwtPayload; error?: string }> {
  try {
    const payload = await verifyToken(token, resolveTestKey);
    return { ok: true, payload };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

describe("MCP bearer auth — accepted token audiences", () => {
  it("accepts the domain-based Application ID URI audience", async () => {
    const res = await verifyOutcome(signToken({ aud: DOMAIN_APP_ID_URI }));
    expect(res.ok).toBe(true);
    expect(res.payload?.aud).toBe(DOMAIN_APP_ID_URI);
  });

  it("accepts the legacy short-form URI audience (pre-switch connections)", async () => {
    const res = await verifyOutcome(signToken({ aud: LEGACY_APP_ID_URI }));
    expect(res.ok).toBe(true);
    expect(res.payload?.aud).toBe(LEGACY_APP_ID_URI);
  });

  it("accepts the bare client ID audience", async () => {
    const res = await verifyOutcome(signToken({ aud: CONSTELLATION_CLIENT_ID }));
    expect(res.ok).toBe(true);
    expect(res.payload?.aud).toBe(CONSTELLATION_CLIENT_ID);
  });

  it("rejects a token with an unknown audience", async () => {
    const res = await verifyOutcome(signToken({ aud: "api://some-other-app" }));
    expect(res.ok).toBe(false);
    expect(res.error || "").toMatch(/audience/i);
  });

  it("rejects a token with no audience claim", async () => {
    const res = await verifyOutcome(signToken({}));
    expect(res.ok).toBe(false);
  });

  it("accepts a v1 (sts.windows.net) issuer with a valid audience", async () => {
    const res = await verifyOutcome(
      signToken({ aud: LEGACY_APP_ID_URI, iss: V1_ISSUER })
    );
    expect(res.ok).toBe(true);
  });

  it("rejects a token from an unknown issuer even with a valid audience", async () => {
    const res = await verifyOutcome(
      signToken({ aud: DOMAIN_APP_ID_URI, iss: "https://evil.example.com/v2.0" })
    );
    expect(res.ok).toBe(false);
    expect(res.error || "").toMatch(/issuer/i);
  });
});

describe("MCP bearer auth — audience list contract", () => {
  it("VALID_TOKEN_AUDIENCES contains exactly the three supported audiences", () => {
    expect([...VALID_TOKEN_AUDIENCES].sort()).toEqual(
      [DOMAIN_APP_ID_URI, LEGACY_APP_ID_URI, CONSTELLATION_CLIENT_ID].sort()
    );
  });

  it("legacy short-form URI derives from the client ID", () => {
    expect(LEGACY_APP_ID_URI).toBe(`api://${CONSTELLATION_CLIENT_ID}`);
  });

  it("domain-based URI embeds the client ID", () => {
    expect(DOMAIN_APP_ID_URI.endsWith(`/${CONSTELLATION_CLIENT_ID}`)).toBe(true);
    expect(DOMAIN_APP_ID_URI.startsWith("api://")).toBe(true);
  });
});

describe("A2A agent card — audience/scope match the middleware", () => {
  const oauth2 = (AGENT_CARD_STATIC as any).authentication?.oauth2;

  it("advertised audience is the domain-based App ID URI", () => {
    expect(oauth2?.audience).toBe(DOMAIN_APP_ID_URI);
  });

  it("advertised audience is accepted by the bearer middleware", () => {
    expect(VALID_TOKEN_AUDIENCES).toContain(oauth2?.audience);
  });

  it("advertised scope is MCP_ACCESS_SCOPE", () => {
    const scopes = Object.keys(oauth2?.scopes ?? {});
    expect(scopes).toContain(MCP_ACCESS_SCOPE);
    expect(scopes.length).toBe(1);
  });

  it("scope is rooted at the advertised audience", () => {
    expect(MCP_ACCESS_SCOPE).toBe(`${DOMAIN_APP_ID_URI}/access_as_user`);
  });
});
