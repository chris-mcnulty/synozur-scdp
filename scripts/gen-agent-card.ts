/**
 * Regenerates client/public/.well-known/agent.json from the canonical
 * shared source in server/a2a/agent-card-data.ts.
 *
 * Usage:
 *   npx tsx scripts/gen-agent-card.ts [--base-url https://your-domain.com]
 *   npx tsx scripts/gen-agent-card.ts --check [--base-url https://your-domain.com]
 *
 * Run this script whenever skills or static metadata in agent-card-data.ts
 * change so the static file stays in sync with the Express endpoint.
 *
 * --check   Dry-run mode: exits non-zero if the on-disk file differs from the
 *           generated output. Useful in CI to catch drift without writing files.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { buildAgentCard } from "../server/a2a/agent-card-data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const checkMode = process.argv.includes("--check");

const baseUrlArg = (() => {
  const idx = process.argv.indexOf("--base-url");
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

const baseUrl = baseUrlArg || "https://constellation.synozur.com";
const card = buildAgentCard(baseUrl);
const generated = JSON.stringify(card, null, 2) + "\n";

const outDir = path.join(__dirname, "..", "client", "public", ".well-known");
const outFile = path.join(outDir, "agent.json");

if (checkMode) {
  let current: string;
  try {
    current = fs.readFileSync(outFile, "utf-8");
  } catch {
    console.error(
      `[gen-agent-card] --check FAILED: ${outFile} does not exist. Run the script without --check to generate it.`
    );
    process.exit(1);
  }

  if (current === generated) {
    console.log("[gen-agent-card] --check PASSED: agent.json is up to date.");
    process.exit(0);
  } else {
    console.error(
      "[gen-agent-card] --check FAILED: agent.json is out of sync with agent-card-data.ts."
    );
    console.error(
      "Run `npx tsx scripts/gen-agent-card.ts` to regenerate the file."
    );
    process.exit(1);
  }
} else {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, generated, "utf-8");

  console.log(`[gen-agent-card] Written to ${outFile}`);
  console.log(`[gen-agent-card] base url: ${baseUrl}`);
  console.log(`[gen-agent-card] skills: ${card.skills.map((s) => s.id).join(", ")}`);
}
