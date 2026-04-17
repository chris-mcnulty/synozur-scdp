/**
 * Regenerates client/public/.well-known/agent.json from the canonical
 * shared source in server/a2a/agent-card-data.ts.
 *
 * Usage:
 *   npx tsx scripts/gen-agent-card.ts [--base-url https://your-domain.com]
 *
 * Run this script whenever skills or static metadata in agent-card-data.ts
 * change so the static file stays in sync with the Express endpoint.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { buildAgentCard } from "../server/a2a/agent-card-data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const baseUrlArg = (() => {
  const idx = process.argv.indexOf("--base-url");
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

const baseUrl = baseUrlArg || "https://constellation.synozur.com";
const card = buildAgentCard(baseUrl);

const outDir = path.join(__dirname, "..", "client", "public", ".well-known");
const outFile = path.join(outDir, "agent.json");

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(card, null, 2) + "\n", "utf-8");

console.log(`[gen-agent-card] Written to ${outFile}`);
console.log(`[gen-agent-card] base url: ${baseUrl}`);
console.log(`[gen-agent-card] skills: ${card.skills.map((s) => s.id).join(", ")}`);
