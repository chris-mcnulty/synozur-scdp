import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import puppeteer, { type HTTPRequest, type Page } from "puppeteer";

// Serve the real App/Router/recovery hook without starting workers or touching a DB.
const port = 5202;
const origin = `http://127.0.0.1:${port}`;
const session = "background-jobs-test-session";
const admin = { id: "admin-test", name: "Job Tester", email: "jobs@example.test",
  role: "admin", platformRole: "global_admin", tenantId: "tenant-test" };
const rows = [
  { id: "job-failed", type: "pdf.invoice.generate", status: "failed", attempts: 2, maxAttempts: 3,
    createdAt: "2026-10-01T12:00:00Z", startedAt: "2026-10-01T12:01:00Z",
    finishedAt: "2026-10-01T12:01:03Z", payload: { invoiceId: "invoice-test", systemPrompt: "private prompt" },
    result: { diagnostic: "Test result" }, lastError: "PDF generation failed" },
  { id: "job-queued", type: "planner.task.pull", status: "queued", attempts: 0, maxAttempts: 3,
    createdAt: "invalid-date", payload: null, runAfter: "bad-date" },
  null,
  { id: "job-malformed", type: {}, status: [], attempts: "bad", maxAttempts: null,
    payload: "not-an-object", lastError: { reason: "Malformed detail" }, result: ["diagnostic"] },
];

function chromiumExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const store = "/nix/store";
  const found = readdirSync(store).filter((name) =>
    /^.{32}-chromium-\d/.test(name) && existsSync(`${store}/${name}/bin/chromium`))
    .sort((a, b) => Number(b.match(/-chromium-(\d+)/)?.[1]) - Number(a.match(/-chromium-(\d+)/)?.[1]))[0];
  if (!found) throw new Error("Set PUPPETEER_EXECUTABLE_PATH to an installed Chromium");
  return `${store}/${found}/bin/chromium`;
}

const server = spawn("node_modules/.bin/vite", ["--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  env: { ...process.env, NODE_ENV: "test" }, detached: true, stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk; });
server.stderr.on("data", (chunk) => { serverLog += chunk; });
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;

async function waitText(page: Page, text: string) {
  await page.waitForFunction((value) => document.body.textContent?.includes(value), {}, text);
}
async function clickText(page: Page, text: string, selector = "button") {
  await page.waitForFunction((value, elements) =>
    [...document.querySelectorAll<HTMLElement>(elements)].some((item) =>
      item.textContent?.trim() === value && !(item instanceof HTMLButtonElement && item.disabled)),
  {}, text, selector);
  assert.equal(await page.evaluate((value, elements) => {
    const node = [...document.querySelectorAll<HTMLElement>(elements)]
      .find((item) => item.textContent?.trim() === value);
    node?.click();
    return !!node;
  }, text, selector), true, `Control not found: ${text}`);
}

try {
  for (let i = 0; i < 240; i++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (i === 239) throw new Error(`Vite did not start:\n${serverLog.slice(-2000)}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await puppeteer.launch({ executablePath: chromiumExecutable(), headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  const errors: string[] = [];
  const requests: { path: string; search: string; header?: string; method: string }[] = [];
  let listMode: "ok" | "503" | "network" | "401" | "401-once" | "invalid" = "ok";
  let authMode: "ok" | "503" | "network" | "401" = "ok";
  let navigations = 0;
  let authChecks = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations++; });
  await page.evaluateOnNewDocument((id) => {
    // Only seed once, so a real removal or reload cannot be hidden by the test.
    if (!sessionStorage.getItem("testInitialized")) {
      localStorage.setItem("sessionId", id);
      sessionStorage.setItem("testInitialized", "yes");
    }
    (window as any).unauthorizedEvents = 0;
    window.addEventListener("unauthorized", () => { (window as any).unauthorizedEvents++; });
  }, session);
  await page.setRequestInterception(true);
  const respond = async (request: HTTPRequest) => {
    const url = new URL(request.url());
    if (url.origin !== origin || !url.pathname.startsWith("/api/")) return request.continue();
    const path = url.pathname;
    const header = request.headers()["x-session-id"];
    requests.push({ path, search: url.search, header, method: request.method() });
    const json = (body: unknown, status = 200) =>
      request.respond({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/auth/user") {
      authChecks++;
      if (authMode === "network") return request.abort("failed");
      if (authMode !== "ok") return json({ message: "Auth validation unavailable" }, Number(authMode));
      return header === session ? json(admin) : json({ message: "Not authenticated" }, 401);
    }
    if (path === "/api/admin/background-jobs") {
      if (header !== session) return json({ message: "Not authenticated: missing session header" }, 401);
      if (listMode === "401-once") {
        listMode = "ok";
        return json({ message: "One-time unauthorized response" }, 401);
      }
      if (listMode === "network") return request.abort("failed");
      if (listMode === "503" || listMode === "401") return json({ message: "Queue temporarily unavailable" }, Number(listMode));
      return json(listMode === "invalid" ? { jobs: rows } : rows);
    }
    if (path.startsWith("/api/admin/background-jobs/")) {
      assert.equal(header, session, `${path} must authenticate`);
      if (path.endsWith("/prune-config")) return json({ succeededRetentionDays: 30, failedRetentionDays: 60 });
      return json({ totalDeleted: 0, succeededDeleted: 0, failedDeleted: 0 });
    }
    if (path === "/api/auth/tenants") return json({ activeTenantId: "tenant-test",
      tenants: [{ id: "tenant-test", name: "Test Tenant", slug: "test", role: "admin", isActive: true }] });
    if (path === "/api/tenant/plan-status") return json({ status: "active", planType: "paid", planName: "Team", isGracePeriod: false });
    if (path === "/api/tenant/settings") return json({});
    if (path === "/api/notifications") return json({ notifications: [], unreadCount: 0 });
    if (path === "/api/changelog/whats-new") return json({ showModal: false });
    if (path === "/api/ai/status") return json({ enabled: false });
    if (path === "/api/auth/sso/status") return json({ enabled: false });
    if (path === "/api/analytics/pageview") return json({ ok: true });
    errors.push(`Unhandled API: ${request.method()} ${path}`);
    return json({ message: "Unhandled test request" }, 500);
  };
  page.on("request", (request) => void respond(request).catch((error) => {
    errors.push(String(error)); void request.abort().catch(() => {});
  }));
  await page.goto(`${origin}/admin/background-jobs`, {
    waitUntil: process.argv.includes("--reproduce") ? "domcontentloaded" : "networkidle0",
  });

  if (process.argv.includes("--reproduce")) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const list = requests.filter((request) => request.path === "/api/admin/background-jobs");
    assert.ok(list.some((request) => !request.header), "Old build sends a list request without authentication");
    assert.ok(navigations > 1, "Valid auth recovery reloads the old build");
    console.log(JSON.stringify({ reproduction: "missing header → list 401 → validation succeeds → page reload",
      listRequests: list.length, missingHeaders: list.filter((request) => !request.header).length,
      authChecks, navigations }));
  } else {
    await waitText(page, "PDF generation failed");
    const stableNavigationCount = navigations;
    const assertStable = async () => {
      assert.equal(new URL(page.url()).pathname, "/admin/background-jobs");
      assert.equal(navigations, stableNavigationCount, "No full-page reload or redirect");
      assert.equal(await page.evaluate(() => localStorage.getItem("sessionId")), session);
      assert.deepEqual(errors, [], errors.join("\n"));
      for (const request of requests.filter((item) => item.path.startsWith("/api/admin/background-jobs"))) {
        assert.equal(request.header, session, "Every monitor request uses the current session");
      }
    };
    await page.click("tbody tr");
    await waitText(page, "invoice-test");
    await waitText(page, "Test result");
    assert.equal(await page.evaluate(() => document.body.textContent?.includes("private prompt")), false);
    await clickText(page, "unknown", "tbody tr span"); // malformed row expands safely
    await waitText(page, "Diagnostic information");
    await page.click("tbody tr:last-child");
    await waitText(page, "Persisted payload was not an object");
    mkdirSync("generated-artifacts", { recursive: true });
    await page.screenshot({ path: "generated-artifacts/background-jobs-expanded.png", fullPage: true });
    const initialLists = requests.filter((item) => item.path === "/api/admin/background-jobs").length;
    await new Promise((resolve) => setTimeout(resolve, 10_500));
    assert.ok(requests.filter((item) => item.path === "/api/admin/background-jobs").length >= initialLists + 2,
      "Repeated polling runs");
    await assertStable();
    await clickText(page, "Refresh");
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((node) => node.textContent?.trim() === "Refresh" && !node.disabled));
    await clickText(page, "All types");
    await clickText(page, "Invoice PDF", '[role="option"]');
    await clickText(page, "All statuses");
    await clickText(page, "Failed", '[role="option"]');
    await waitText(page, "PDF generation failed");
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.ok(requests.some((item) => item.search.includes("type=pdf.invoice.generate") &&
      item.search.includes("status=failed") && item.search.includes("limit=200")));
    await assertStable();
    // Mutating controls are intercepted: no job records are changed.
    await page.click('button[title="Retry"]');
    await page.click('button[title="Cancel"]');
    await page.click('[data-testid="button-purge-old-jobs"]');
    await page.click('[data-testid="button-confirm-purge"]');
    await waitText(page, "Old jobs purged");
    for (const suffix of ["/job-failed/retry", "/job-queued/cancel", "/prune"]) {
      assert.ok(requests.some((item) => item.path.endsWith(suffix) && item.method === "POST"));
    }
    for (const mode of ["503", "network", "invalid"] as const) {
      listMode = mode;
      await clickText(page, "Refresh");
      await waitText(page, "Queue refresh failed");
      await waitText(page, mode === "503" ? "Queue temporarily unavailable" :
        mode === "invalid" ? "Background-jobs API returned an invalid queue" : "Failed to fetch");
      await waitText(page, "PDF generation failed");
      const pausedCount = requests.filter((item) => item.path === "/api/admin/background-jobs").length;
      await new Promise((resolve) => setTimeout(resolve, 5500));
      assert.equal(requests.filter((item) => item.path === "/api/admin/background-jobs").length, pausedCount,
        "Errors pause polling");
      await assertStable();
      listMode = "ok";
      await clickText(page, "Retry");
      await page.waitForFunction(() => !document.body.textContent?.includes("Queue refresh failed"));
      await assertStable();
    }
    // One rejected refresh with a valid session retries in place, preserving
    // local filters and expanded rows rather than unmounting the page.
    const beforeRecovery = requests.filter((item) => item.path === "/api/admin/background-jobs").length;
    listMode = "401-once";
    const recoveredResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/admin/background-jobs" && response.status() === 200);
    void recoveredResponse.catch(() => {});
    await clickText(page, "Refresh");
    await recoveredResponse;
    await page.waitForFunction(() => !document.body.textContent?.includes("Queue refresh failed"));
    assert.equal(requests.filter((item) => item.path === "/api/admin/background-jobs").length, beforeRecovery + 2);
    await page.click("tbody tr");
    await waitText(page, "invoice-test");
    // Trigger recovery again with a row already open.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("unauthorized")));
    await new Promise((resolve) => setTimeout(resolve, 300));
    await waitText(page, "invoice-test");
    await assertStable();
    // Exercise the actual global recovery hook, not a stub, including transient validation.
    for (const mode of ["503", "network"] as const) {
      authMode = mode;
      listMode = "401";
      await clickText(page, "Refresh");
      await waitText(page, "Unable to verify session");
      await assertStable();
      authMode = "ok";
      listMode = "ok";
      await clickText(page, "Retry");
      await page.waitForFunction(() => !document.body.textContent?.includes("Queue refresh failed"));
    }
    // A persistently unauthorized list gets at most one controlled recovery retry, never a loop.
    // Use a fresh query key so this assertion is not satisfied by the earlier cooldown.
    await clickText(page, "Failed");
    await clickText(page, "Running", '[role="option"]');
    await waitText(page, "PDF generation failed");
    await new Promise((resolve) => setTimeout(resolve, 300));
    const beforePersistent = requests.filter((item) => item.path === "/api/admin/background-jobs").length;
    listMode = "401";
    await clickText(page, "Refresh");
    await waitText(page, "Queue refresh failed");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const boundedCount = requests.filter((item) => item.path === "/api/admin/background-jobs").length;
    assert.equal(boundedCount, beforePersistent + 2, "Exactly one automatic retry after validation");
    await new Promise((resolve) => setTimeout(resolve, 6000));
    assert.equal(requests.filter((item) => item.path === "/api/admin/background-jobs").length, boundedCount);
    await assertStable();
    assert.ok(await page.evaluate(() => (window as any).unauthorizedEvents > 0));
    listMode = "ok";
    await clickText(page, "Retry");
    await page.waitForFunction(() => !document.body.textContent?.includes("Queue refresh failed"));
    // Successful validation with a now-successful list recovers without losing filters/details.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("unauthorized")));
    await new Promise((resolve) => setTimeout(resolve, 300));
    await assertStable();
    assert.equal(await page.evaluate(() => document.body.textContent?.includes("Invoice PDF")), true);
    // Genuine expiration must revoke cached access and route to login.
    authMode = "401";
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("unauthorized")));
    await page.waitForFunction(() => window.location.pathname === "/login");
    assert.equal(await page.evaluate(() => localStorage.getItem("sessionId")), null);
    assert.equal(await page.evaluate(() => sessionStorage.getItem("redirectAfterLogin")), "/admin/background-jobs");
    assert.equal(await page.evaluate(() => document.body.textContent?.includes("Monitor PDF generation")), false);
    assert.deepEqual(errors, []);
    // Fresh startup: a service error must not grant protected access or discard the saved session.
    authMode = "503";
    await page.goto(`${origin}/admin/background-jobs`, { waitUntil: "networkidle0" });
    await page.evaluate((id) => localStorage.setItem("sessionId", id), session);
    await page.reload({ waitUntil: "networkidle0" });
    await waitText(page, "Unable to verify session");
    assert.equal(new URL(page.url()).pathname, "/admin/background-jobs");
    assert.equal(await page.evaluate(() => localStorage.getItem("sessionId")), session);
    assert.equal(await page.evaluate(() => document.body.textContent?.includes("Monitor PDF generation")), false);
    authMode = "ok";
    await clickText(page, "Retry");
    await waitText(page, "PDF generation failed");
    assert.deepEqual(errors, []);
    await page.reload({ waitUntil: "networkidle0" });
    await waitText(page, "PDF generation failed");
    assert.equal(new URL(page.url()).pathname, "/admin/background-jobs");
    assert.equal(await page.evaluate(() => localStorage.getItem("sessionId")), session);
    // Auth-query rejection on startup also clears the session and denies access.
    authMode = "401";
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForFunction(() => window.location.pathname === "/login");
    assert.equal(await page.evaluate(() => localStorage.getItem("sessionId")), null);
    assert.equal(await page.evaluate(() => document.body.textContent?.includes("Monitor PDF generation")), false);
    console.log("PASS Background Jobs browser: authenticated lists/filters/polling/actions, safe details, retained errors/retry, bounded recovery, transient validation, expiration and startup access guard");
  }
} finally {
  await browser?.close();
  if (server.pid) {
    try { process.kill(-server.pid, "SIGTERM"); } catch {}
  }
}
