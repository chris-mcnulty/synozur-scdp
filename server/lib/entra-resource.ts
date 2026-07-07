/**
 * Single source of truth for the Constellation Azure app registration's
 * OAuth resource identifiers.
 *
 * The Azure app's Application ID URI is the DOMAIN-BASED form
 * `api://constellation.synozur.com/<client-id>` — this form is required for
 * Teams tab SSO. All MCP / Copilot / A2A surfaces must advertise and accept
 * this form. The legacy short form `api://<client-id>` is kept only for
 * backward compatibility with tokens issued to existing connections.
 *
 * If the app's domain ever changes, update APP_ID_URI_DOMAIN (or set the
 * APP_ID_URI_DOMAIN env var) — nothing else should hard-code the domain.
 */

export const CONSTELLATION_CLIENT_ID =
  process.env.AZURE_CLIENT_ID || "198aa0a6-d2ed-4f35-b41b-b6f6778a30d6";

export const APP_ID_URI_DOMAIN =
  process.env.APP_ID_URI_DOMAIN || "constellation.synozur.com";

/** Domain-based Application ID URI — the authoritative audience. */
export const DOMAIN_APP_ID_URI = `api://${APP_ID_URI_DOMAIN}/${CONSTELLATION_CLIENT_ID}`;

/** Legacy short-form URI — accepted for backward compatibility only. */
export const LEGACY_APP_ID_URI = `api://${CONSTELLATION_CLIENT_ID}`;

/** The delegated scope exposed by the Constellation app. */
export const MCP_ACCESS_SCOPE = `${DOMAIN_APP_ID_URI}/access_as_user`;

/** All audiences the bearer-auth middleware should accept. */
export const VALID_TOKEN_AUDIENCES: [string, ...string[]] = [
  DOMAIN_APP_ID_URI,
  LEGACY_APP_ID_URI,
  CONSTELLATION_CLIENT_ID,
];
