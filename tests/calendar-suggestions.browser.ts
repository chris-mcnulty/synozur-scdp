import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import puppeteer from "puppeteer";

const port = 5198;
const origin = `http://127.0.0.1:${port}`;
let server: ChildProcess | undefined;
const posted: any[] = [];

function chromiumExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const packageName = readdirSync("/nix/store")
    .filter((entry) => /^.{32}-chromium-\d/.test(entry) && existsSync(`/nix/store/${entry}/bin/chromium`))
    .sort((a, b) => Number(b.match(/-chromium-(\d+)/)?.[1]) - Number(a.match(/-chromium-(\d+)/)?.[1]))[0];
  assert.ok(packageName, "Chromium is required for the calendar browser regression");
  return `/nix/store/${packageName}/bin/chromium`;
}

async function main() {
  server = spawn("npm", ["run", "dev"], {
    env: { ...process.env, PORT: String(port), NODE_ENV: "development" },
    stdio: "ignore", detached: true,
  });
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(`${origin}/health`)).ok) { ready = true; break; } } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, "Browser-test server did not become ready");
  console.log("calendar browser server ready");

  const browser = await puppeteer.launch({
    executablePath: chromiumExecutable(), headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"], timeout: 15_000,
  });
  try {
    console.log("calendar browser launched");
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on("request", request => {
      void (async () => {
        const url = new URL(request.url());
        if (url.origin !== origin || !url.pathname.startsWith("/api/")) return request.continue();
        const json = (body: unknown) => request.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
        if (url.pathname === "/api/auth/user") return json({ id: "admin-1", name: "Browser Admin", role: "admin", tenantId: "tenant-1" });
        if (url.pathname === "/api/auth/tenants") return json({ activeTenantId: "tenant-1", tenants: [{ id: "tenant-1", name: "Test Tenant", role: "admin", isActive: true }] });
        if (url.pathname === "/api/projects") return json([{ id: "project-1", name: "Platinum", code: "IA-1434", status: "active", client: { name: "Platinum" } }]);
        if (url.pathname === "/api/users/admin-1/reminder-settings") return json({ calendarSuggestionsDaysBack: 7 });
        if (url.pathname === "/api/projects/project-1/commercial-buckets") return json({
          required: true, buckets: [{ id: "bucket-1", label: "Fixed-price work", isActive: true }],
        });
        if (url.pathname === "/api/me/calendar-suggestions") return json({
          disabled: false, suggestions: [{
            eventId: "event-1", eventKey: "event-key", subject: "Pilot review",
            startIso: "2026-09-28T10:00:00Z", endIso: "2026-09-28T11:00:00Z",
            hours: 1, date: "2026-09-28", organizer: null, attendees: [],
            attendeeCount: 0, bodyPreview: "", seriesMasterId: null,
            projectId: "project-1", confidence: "high", mappingReason: "Saved mapping",
            alreadyAccepted: false,
          }],
        });
        if (url.pathname === "/api/me/calendar-suggestions/accept" && request.method() === "POST") {
          posted.push(JSON.parse(request.postData() || "{}"));
          return json({ created: 1, entries: [{ calendarEventId: "event-1" }] });
        }
        if (url.pathname === "/api/time-entries") return json([]);
        return json([]);
      })().catch(() => void request.abort());
    });
    await page.evaluateOnNewDocument(() => localStorage.setItem("sessionId", "browser-session"));
    await page.goto(`${origin}/time`, { waitUntil: "domcontentloaded" });
    console.log("calendar page loaded");
    await page.waitForSelector('[data-testid="select-calendar-bucket-project-1"]', { timeout: 20_000 }).catch(async () => {
      throw new Error(`Calendar picker did not render: ${(await page.$eval("body", node => node.innerText)).slice(0, 700)}; ${errors.join(" | ")}`);
    });
    assert.equal(await page.$eval('[data-testid="button-calendar-accept-event-1"]', node => (node as HTMLButtonElement).disabled), true);
    console.log("calendar picker ready");
    await page.click('[data-testid="select-calendar-bucket-project-1"]');
    await page.waitForSelector('[role="option"]');
    await page.click('[role="option"]');
    await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('[data-testid="button-calendar-accept-event-1"]')?.disabled);
    await page.click('[data-testid="button-calendar-accept-event-1"]');
    console.log("calendar accept clicked");
    await page.waitForFunction(() => document.body.textContent?.includes("Time entry created"), { timeout: 10_000 });
    assert.equal(posted.length, 1);
    assert.equal(posted[0].items[0].projectId, "project-1");
    assert.equal(posted[0].items[0].commercialBucketId, "bucket-1");
    assert.deepEqual(errors, []);
    console.log("calendar work classification browser regression passed");
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  if (server?.pid) {
    try { process.kill(-server.pid, "SIGTERM"); } catch {}
  }
});