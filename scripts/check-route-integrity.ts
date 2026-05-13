/**
 * check-route-integrity.ts
 *
 * Runs as part of post-merge.sh after every merge (including external PRs).
 * Detects:
 *   1. Same-method duplicate routes within any single route file.
 *   2. Cross-file same-method conflicts between routes/projects.ts and routes.ts
 *      (projects.ts wins by registration order, but duplicates in routes.ts are
 *      dead code that should be cleaned up).
 *
 * Exit 0 = clean.  Exit 1 = violations found (blocks post-merge).
 *
 * Add new files to ROUTE_FILES as more modules are extracted from routes.ts.
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");

const ROUTE_FILES = [
  "server/routes/projects.ts",
  "server/routes/platform.ts",
  "server/routes/planner.ts",
  "server/routes/raidd.ts",
  "server/routes/galaxy/v1/index.ts",
];

const MAIN_ROUTES_FILE = "server/routes.ts";

// Matches: app.get("/path", ...) or app.post(`/path`, ...)
const ROUTE_RE = /app\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g;

type RouteEntry = { method: string; path: string; file: string; line: number };

function extractRoutes(filePath: string): RouteEntry[] {
  const abs = path.join(ROOT, filePath);
  if (!fs.existsSync(abs)) return [];
  const src = fs.readFileSync(abs, "utf8");
  const lines = src.split("\n");
  const entries: RouteEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    let m: RegExpExecArray | null;
    const re = new RegExp(ROUTE_RE.source, "g");
    while ((m = re.exec(lines[i])) !== null) {
      entries.push({ method: m[1].toUpperCase(), path: m[2], file: filePath, line: i + 1 });
    }
  }
  return entries;
}

function key(r: RouteEntry) { return `${r.method} ${r.path}`; }

let violations = 0;

// 1. Intra-file duplicates
for (const file of [...ROUTE_FILES, MAIN_ROUTES_FILE]) {
  const routes = extractRoutes(file);
  const seen = new Map<string, RouteEntry>();
  for (const r of routes) {
    const k = key(r);
    if (seen.has(k)) {
      const first = seen.get(k)!;
      console.error(`[route-integrity] DUPLICATE in ${file}:`);
      console.error(`  ${k}  — first at line ${first.line}, again at line ${r.line}`);
      violations++;
    } else {
      seen.set(k, r);
    }
  }
}

// 2. Cross-file: routes registered in both projects.ts AND routes.ts
//    (projects.ts wins due to registration order, but the routes.ts copy is dead code)
const projectRoutes = extractRoutes("server/routes/projects.ts");
const mainRoutes = extractRoutes(MAIN_ROUTES_FILE);

const projectKeys = new Set(projectRoutes.map(key));
const mainKeys = new Map<string, RouteEntry>();
for (const r of mainRoutes) mainKeys.set(key(r), r);

const crossConflicts: Array<{ k: string; mainLine: number }> = [];
for (const k of projectKeys) {
  if (mainKeys.has(k)) {
    crossConflicts.push({ k, mainLine: mainKeys.get(k)!.line });
  }
}

if (crossConflicts.length > 0) {
  console.warn(`\n[route-integrity] WARNING — ${crossConflicts.length} route(s) registered in BOTH`);
  console.warn(`  server/routes/projects.ts (wins) AND server/routes.ts (dead duplicate):`);
  for (const { k, mainLine } of crossConflicts.slice(0, 20)) {
    console.warn(`  ${k}  — routes.ts line ${mainLine}`);
  }
  if (crossConflicts.length > 20) {
    console.warn(`  ... and ${crossConflicts.length - 20} more.`);
  }
  console.warn(`  These are dead code in routes.ts and should be removed in a follow-up cleanup.\n`);
  // Cross-file duplicates are warnings only (known pending cleanup), not hard failures.
}

if (violations > 0) {
  console.error(`\n[route-integrity] FAILED: ${violations} intra-file duplicate route(s) found.`);
  process.exit(1);
} else {
  console.log(`[route-integrity] PASSED: no intra-file duplicate routes.`);
  if (crossConflicts.length === 0) {
    console.log(`[route-integrity] PASSED: no cross-file route conflicts.`);
  }
}
