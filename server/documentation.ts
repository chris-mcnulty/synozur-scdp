import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** Explicit public allowlist only. Prefer canonical source, then built assets. */
export function readPublicDocumentation(name: "USER_GUIDE.md" | "CHANGELOG.md"): string {
  const candidates = [
    path.join(process.cwd(), "docs", name),
    path.join(process.cwd(), "dist", "public", "docs", name),
    path.join(process.cwd(), "client", "public", "docs", name),
  ];
  const file = candidates.find(candidate => existsSync(candidate));
  if (!file) throw new Error(`Public documentation is unavailable: ${name}`);
  return readFileSync(file, "utf8");
}
