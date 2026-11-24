import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { PRODUCT_RELEASE } from "../shared/release";

// Explicit allowlist: never copy private operator inputs or all of docs/.
const mirrors: Record<string, string[]> = {
  "docs/USER_GUIDE.md": ["client/public/USER_GUIDE.md", "client/public/docs/USER_GUIDE.md"],
  "docs/CHANGELOG.md": ["client/public/docs/CHANGELOG.md"],
};
const write = process.argv.includes("--write");
for (const [source, targets] of Object.entries(mirrors)) {
  const content = readFileSync(source, "utf8");
  for (const target of targets) {
    if (write) writeFileSync(target, content);
    else assert.equal(readFileSync(target, "utf8"), content, `Stale public mirror: ${target}`);
  }
}
const changelog = readFileSync("docs/CHANGELOG.md", "utf8");
assert.equal(changelog.match(/### Version ([\d.]+)/)?.[1], PRODUCT_RELEASE.version);
assert.ok(changelog.includes(`**Release Date:** ${PRODUCT_RELEASE.date}`));
for (const file of ["docs/USER_GUIDE.md", "docs/user-guide/SCDP-User-Guide.md", "docs/user-guide/SCDP-Administrator-Guide.md"]) {
  const content = readFileSync(file, "utf8");
  assert.ok(content.includes(PRODUCT_RELEASE.version), `Missing release identity: ${file}`);
  for (const match of content.matchAll(/(?:\*Version:\s*|\*\*Version:\*\*\s*)([\d.]+)/g)) {
    assert.equal(match[1], PRODUCT_RELEASE.version, `Stale version footer: ${file}`);
  }
  for (const term of ["Revenue Forecast", "Historical estimate intelligence", "Scheduled status reports"]) {
    assert.ok(content.includes(term), `${file} is missing ${term}`);
  }
}
console.log(`Release ${PRODUCT_RELEASE.version}: canonical docs, public mirrors and guide coverage passed.`);
