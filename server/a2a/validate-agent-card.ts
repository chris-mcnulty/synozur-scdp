/**
 * Shared A2A agent card validator.
 *
 * Used by:
 *   1. scripts/validate-agent-card.ts — CI/build-time check
 *   2. server/routes/mcp.ts — GET /mcp/agent-card-health runtime endpoint
 *
 * Validates a card object against A2A 1.0 requirements and the
 * Constellation-specific audience/scope constraints.
 */

export const EXPECTED_APP_ID = "198aa0a6-d2ed-4f35-b41b-b6f6778a30d6";
export const EXPECTED_SCOPE = `api://${EXPECTED_APP_ID}/access_as_user`;
export const EXPECTED_AUDIENCE = `api://${EXPECTED_APP_ID}`;

export interface AgentCardSkill {
  id: string;
  name: string;
  description: string;
  examples: readonly string[];
  tags?: readonly string[];
}

export interface AgentCardOauth2 {
  authorizationUrl: string;
  tokenUrl: string;
  scopes: Record<string, string>;
  audience: string;
  issuerPattern?: string;
}

export interface AgentCardAuthentication {
  schemes: readonly string[];
  oauth2: AgentCardOauth2;
  credentials: null | unknown;
}

export interface AgentCard {
  protocolVersion: string;
  name: string;
  url: string;
  description?: string;
  version?: string;
  skills: readonly AgentCardSkill[];
  authentication: AgentCardAuthentication;
  [key: string]: unknown;
}

/**
 * Validates a parsed agent card object and returns a list of error strings.
 * An empty array means the card is valid.
 */
export function validateAgentCard(card: Partial<AgentCard>): string[] {
  const errors: string[] = [];

  const REQUIRED_TOP_LEVEL: Array<keyof AgentCard> = [
    "protocolVersion",
    "name",
    "url",
    "skills",
    "authentication",
  ];

  for (const field of REQUIRED_TOP_LEVEL) {
    if (card[field] === undefined || card[field] === null) {
      errors.push(`Missing required field: "${field}"`);
    }
  }

  const auth = card.authentication;
  if (!auth || typeof auth !== "object") {
    errors.push('"authentication" must be a non-null object');
  } else {
    if (!auth.oauth2 || typeof auth.oauth2 !== "object") {
      errors.push('Missing required field: "authentication.oauth2"');
    } else {
      const oauth2 = auth.oauth2;

      if (oauth2.audience !== EXPECTED_AUDIENCE) {
        errors.push(
          `authentication.oauth2.audience is "${oauth2.audience}" but expected "${EXPECTED_AUDIENCE}"`
        );
      }

      const scopes: Record<string, string> = oauth2.scopes ?? {};
      if (!Object.prototype.hasOwnProperty.call(scopes, EXPECTED_SCOPE)) {
        errors.push(
          `authentication.oauth2.scopes is missing required scope "${EXPECTED_SCOPE}"`
        );
      }
    }
  }

  const skills = card.skills;
  if (!Array.isArray(skills)) {
    errors.push('"skills" must be an array');
  } else if (skills.length === 0) {
    errors.push('"skills" array must not be empty');
  } else {
    for (let i = 0; i < skills.length; i++) {
      const skill = skills[i];
      const label = skill?.id ? `skills[${i}] ("${skill.id}")` : `skills[${i}]`;

      if (!skill.id || typeof skill.id !== "string") {
        errors.push(`${label}: missing or invalid "id"`);
      }
      if (!skill.name || typeof skill.name !== "string") {
        errors.push(`${label}: missing or invalid "name"`);
      }
      if (!skill.description || typeof skill.description !== "string") {
        errors.push(`${label}: missing or invalid "description"`);
      }
      if (!Array.isArray(skill.examples) || skill.examples.length === 0) {
        errors.push(`${label}: must have at least one entry in "examples"`);
      }
    }
  }

  return errors;
}
