/**
 * Validates the Constellation A2A Agent Card against A2A 1.0 requirements.
 *
 * Reads client/public/.well-known/agent.json and runs the shared
 * validateAgentCard() checks from server/a2a/validate-agent-card.ts.
 *
 * Usage:
 *   npx tsx scripts/validate-agent-card.ts [--file <path>]
 *
 * Exit codes:
 *   0  All checks passed
 *   1  One or more validation errors found (or file unreadable / not valid JSON)
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { validateAgentCard } from "../server/a2a/validate-agent-card.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fileArg = (() => {
  const idx = process.argv.indexOf("--file");
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

const cardPath =
  fileArg ||
  path.join(__dirname, "..", "client", "public", ".well-known", "agent.json");

// ── 1. File exists and is readable ───────────────────────────────────────────

let raw: string;
try {
  raw = fs.readFileSync(cardPath, "utf-8");
} catch {
  console.error(`[validate-agent-card] FAILED: cannot read ${cardPath}`);
  process.exit(1);
}

// ── 2. Valid JSON ─────────────────────────────────────────────────────────────

let card: unknown;
try {
  card = JSON.parse(raw);
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[validate-agent-card] FAILED: agent.json is not valid JSON — ${msg}`);
  process.exit(1);
}

// ── 3. Structural validation ──────────────────────────────────────────────────

const errors = validateAgentCard(card as Record<string, unknown>);

if (errors.length === 0) {
  const skillCount = Array.isArray((card as Record<string, unknown>).skills)
    ? ((card as Record<string, unknown>).skills as unknown[]).length
    : 0;
  console.log(
    `[validate-agent-card] PASSED: agent.json is valid (${skillCount} skill(s) checked)`
  );
  process.exit(0);
} else {
  console.error(
    `[validate-agent-card] FAILED: ${errors.length} error(s) found in ${cardPath}`
  );
  for (const err of errors) {
    console.error(`  \u2717 ${err}`);
  }
  process.exit(1);
}
