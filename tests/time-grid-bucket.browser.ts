import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import puppeteer, { type HTTPRequest } from "puppeteer";

const port = 5201;
const origin = `http://127.0.0.1:${port}`;
const projectId = "grid-project";
const bucketId = "change-order";
const label = "Change Order M2 — Extended delivery";
const cell = '[data-testid="grid-cell-commercialBucketId-0"]';
let server: ChildProcess | undefined;
let entry = {
  id: "entry-1", projectId, personId: "user-1", date: "2026-09-28",
  hours: "2", billable: true, description: "Delivery work", submissionStatus: "draft",
  commercialBucketId: null as string | null, commercialEligibilityOutcome: null as string | null,
};
const patches: Record<string, unknown>[] = [];
let releaseFirst: () => void = () => {};
let firstHeld: Promise<void>;
let firstStarted: () => void;
let firstReceived: Promise<void>;
let failFirst = false;
let refetches = 0;

function holdFirstPatch(reject = false) {
  failFirst = reject;
  firstHeld = new Promise<void>((resolve) => { releaseFirst = resolve; });
  firstReceived = new Promise<void>((resolve) => { firstStarted = resolve; });
}

function chromiumExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const store = "/nix/store";
  const found = readdirSync(store)
    .filter((name) => /^.{32}-chromium-\d/.test(name) && existsSync(`${store}/${name}/bin/chromium`))
    .sort((a, b) => Number(b.match(/-chromium-(\d+)/)?.[1] || 0) - Number(a.match(/-chromium-(\d+)/)?.[1] || 0))[0];
  if (!found) throw new Error("Chromium is required for the grid browser regression");
  return `${store}/${found}/bin/chromium`;
}

async function withTimeout<T>(promise: Promise<T>, name: string, ms = 15_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out waiting for ${name}`)), ms);
    })]);
  } finally {
    clearTimeout(timer!);
  }
}

async function respond(request: HTTPRequest, failures: string[]) {
  const url = new URL(request.url());
  if (url.origin !== origin || !url.pathname.startsWith("/api/")) return request.continue();
  const path = url.pathname;
  const json = (body: unknown, status = 200) =>
    request.respond({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (path === "/api/auth/user") return json({ id: "user-1", name: "Grid Tester", email: "grid@example.test", role: "admin", tenantId: "tenant-1" });
  if (path === "/api/auth/tenants") return json({ activeTenantId: "tenant-1", tenants: [{ id: "tenant-1", name: "Tenant", slug: "tenant", role: "admin", isActive: true }] });
  if (path === "/api/projects") return json([{ id: projectId, name: "Grid Project", code: "GRID", status: "active", clientId: "client-1", client: { id: "client-1", name: "Client", shortName: "CLI" } }]);
  if (path === "/api/clients") return json([{ id: "client-1", name: "Client", shortName: "CLI" }]);
  if (path === "/api/users") return json([{ id: "user-1", name: "Grid Tester", isActive: true }]);
  if (path === "/api/tenant/settings") return json({ requireTimeApproval: false });
  if (path === "/api/tenant/plan-status") return json({
    status: "active", planType: "paid", planName: "Team", daysRemaining: null,
    isGracePeriod: false, expiresAt: null,
  });
  if (path === "/api/notifications") return json({ notifications: [], unreadCount: 0 });
  if (path === "/api/changelog/whats-new") return json({ showModal: false });
  if (path === "/api/ai/status") return json({ enabled: false });
  if (path === `/api/projects/${projectId}/commercial-buckets`) return json({
    required: false, buckets: [{ id: bucketId, label: "Extended delivery", basis: "time_and_materials",
      contractReference: "CO M2", isActive: true, approvalRequired: false, defaultEligibilityOutcome: "eligible" }],
  });
  if (path === `/api/projects/${projectId}/allocations` || path === `/api/projects/${projectId}/milestones`) return json([]);
  if (path === "/api/time-entries" && request.method() === "GET") {
    if (url.searchParams.has("personId")) {
      refetches++;
      return json([{ ...entry }]);
    }
    return json({ items: [{ ...entry }], total: 1, hasMore: false });
  }
  if (path === "/api/time-entries/entry-1" && request.method() === "PATCH") {
    const patch = JSON.parse(request.postData() || "{}");
    patches.push(patch);
    if (patches.length === 1) {
      firstStarted();
      await withTimeout(firstHeld, "release of the first PATCH");
      if (failFirst) return json({ error: "Simulated save failure" }, 503);
    }
    entry = { ...entry, ...patch, hours: String(patch.hours ?? entry.hours) };
    return json({ ...entry });
  }
  // These widgets remain mounted even when the grid view is selected.
  if (path === "/api/me/calendar-suggestions") return json({ disabled: true, outlookNotConnected: true, suggestions: [] });
  if (/^\/api\/users\/[^/]+\/reminder-settings$/.test(path)) return json({ calendarSuggestionsDaysBack: 0 });
  if (path === "/api/reports/calendar-suggestion-adoption") return json({
    scope: "me", startDate: "2026-09-01", endDate: "2026-09-30",
    summary: { suggestionHours: 0, manualHours: 0, totalHours: 0, suggestionCount: 0,
      manualCount: 0, totalEntries: 0, suggestionPercentage: 0 },
  });
  if (path === "/api/analytics/pageview" && request.method() === "POST") return json({ ok: true });
  failures.push(`Unhandled API request: ${request.method()} ${path}`);
  return json({ error: "Unhandled test request" }, 500);
}

async function main() {
  holdFirstPatch();
  server = spawn("npm", ["run", "dev"], {
    env: { ...process.env, PORT: String(port), NODE_ENV: "development" },
    stdio: ["ignore", "pipe", "pipe"], detached: true,
  });
  let serverLog = "";
  server.stdout?.on("data", (chunk) => { serverLog += chunk; });
  server.stderr?.on("data", (chunk) => { serverLog += chunk; });
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(`${origin}/health`)).ok) break; } catch {}
    if (attempt === 79) throw new Error(`Grid test server did not start:\n${serverLog.slice(-2000)}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const browser = await puppeteer.launch({ executablePath: chromiumExecutable(), headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const failures: string[] = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => failures.push(`Page error: ${error.message}`));
    page.on("console", (message) => {
      // Vite's Replit metadata transform adds a prop to an existing Fragment in GridTable.
      // It is a development-only React warning, not an error from the interaction under test.
      if (message.type() === "error" &&
          !message.text().includes("Invalid prop `%s` supplied to `React.Fragment`") &&
          !(failFirst && message.text().includes("the server responded with a status of 503"))) {
        failures.push(`Console error: ${message.text()}`);
      }
    });
    await page.setRequestInterception(true);
    page.on("request", (request) => void respond(request, failures).catch((error) => {
      failures.push(`Request interception: ${error}`);
      void request.abort().catch(() => {});
    }));
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem("sessionId", "browser-session");
      localStorage.setItem("timeTrackingView", "grid");
    });
    await page.goto(`${origin}/time`, { waitUntil: "networkidle0", timeout: 30_000 });
    await page.waitForSelector(cell);
    assert.equal(failures.length, 0, failures.join("\n"));

    // Start an unrelated autosave and leave its response in flight.
    await page.click('[data-testid="grid-cell-billable-0"]');
    await withTimeout(firstReceived, "first autosave");
    assert.equal(patches[0].commercialBucketId, null);
    await page.click(cell, { clickCount: 2 });
    await page.waitForSelector('[data-testid="select-grid-commercial-bucket"]');
    await page.waitForSelector('[role="option"]');
    const selected = await page.evaluate((text) => {
      const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((node) => node.textContent?.trim() === text);
      option?.click();
      return !!option;
    }, label);
    assert.equal(selected, true, "change-order bucket is offered");
    await page.waitForFunction((selector, text) => document.querySelector(selector)?.textContent?.includes(text), {}, cell, label);
    assert.equal(patches.length, 1, "selection is visible before the earlier save responds");

    const staleRefetch = page.waitForResponse((response) =>
      response.url().includes("/api/time-entries?personId=user-1") && response.request().method() === "GET",
      { timeout: 15_000 });
    releaseFirst();
    await staleRefetch;
    assert.equal(await page.$eval(cell, (node) => node.textContent?.trim()), label,
      "earlier save and its stale refetch cannot replace the selection");
    assert.equal(patches.length, 1, "newer save has not yet responded");
    await page.waitForFunction(() => document.querySelector('[data-testid="button-grid-save-all"]')?.textContent?.trim() === "Save all", { timeout: 15_000 });
    assert.equal(patches.length, 2, "newer selection is sent by a second autosave");
    assert.equal(patches[1].commercialBucketId, bucketId);
    assert.equal(patches[1].commercialEligibilityOutcome, "eligible");
    await page.waitForFunction((selector, text) => document.querySelector(selector)?.textContent?.includes(text), {}, cell, label);
    assert.ok(refetches >= 2, "autosave triggered a server refetch");
    assert.equal(entry.commercialBucketId, bucketId);

    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForFunction((selector, text) => document.querySelector(selector)?.textContent?.includes(text), {}, cell, label);
    assert.equal(failures.length, 0, failures.join("\n"));

    // Repeat with a rejected older PATCH. The server still has the old value
    // when the failure arrives, so the newer selection must remain dirty and retry.
    entry = { ...entry, commercialBucketId: null, commercialEligibilityOutcome: null, billable: true };
    patches.length = 0;
    holdFirstPatch(true);
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector(cell);
    await page.click('[data-testid="grid-cell-billable-0"]');
    await withTimeout(firstReceived, "first autosave in failure scenario");
    assert.equal(patches[0].commercialBucketId, null);
    await page.click(cell, { clickCount: 2 });
    await page.waitForSelector('[data-testid="select-grid-commercial-bucket"]');
    await page.waitForSelector('[role="option"]');
    const selectedAfterFailure = await page.evaluate((text) => {
      const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((node) => node.textContent?.trim() === text);
      option?.click();
      return !!option;
    }, label);
    assert.equal(selectedAfterFailure, true, "change-order bucket is offered after reload");
    await page.waitForFunction((selector, text) => document.querySelector(selector)?.textContent?.includes(text), {}, cell, label);
    assert.equal(patches.length, 1, "newer classification is selected while older save is in flight");

    const rejectedSave = page.waitForResponse((response) =>
      response.url().endsWith("/api/time-entries/entry-1") && response.request().method() === "PATCH" && response.status() === 503,
      { timeout: 15_000 });
    releaseFirst();
    await rejectedSave;
    assert.equal(entry.commercialBucketId, null, "rejected PATCH does not change the stored entry");
    assert.equal(await page.$eval(cell, (node) => node.textContent?.trim()), label,
      "failed older save cannot erase the newer classification");
    await page.waitForFunction(() => document.querySelector('[data-testid="button-grid-save-all"]')?.textContent?.trim() === "Save all", { timeout: 15_000 });
    assert.equal(patches.length, 2, "newer classification is retried after the failed save");
    assert.equal(patches[1].commercialBucketId, bucketId);
    assert.equal(patches[1].commercialEligibilityOutcome, "eligible");
    assert.equal(entry.commercialBucketId, bucketId, "retry persists the classification");
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForFunction((selector, text) => document.querySelector(selector)?.textContent?.includes(text), {}, cell, label);
    assert.equal(failures.length, 0, failures.join("\n"));
    console.log("time grid bucket browser regression passed");
  } finally {
    releaseFirst();
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  if (server?.pid) { try { process.kill(-server.pid, "SIGTERM"); } catch {} }
});