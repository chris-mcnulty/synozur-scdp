import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import puppeteer, { type HTTPRequest } from "puppeteer";

// Intercept a test-only document and all API calls in the browser. The actual
// production components are imported from Vite; no auth bypass is added to the app.
const origin = process.env.TEST_APP_ORIGIN || "http://127.0.0.1:5000";
const source = async (path: string) => {
  const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(15_000) });
  assert.equal(response.status, 200);
  return response.text();
};
const [buttonSource, querySource, mainSource] = await Promise.all([
  source("/src/components/ui/button.tsx"), source("/src/lib/queryClient.ts"), source("/src/main.tsx"),
]);
const reactUrl = buttonSource.match(/from\s*["']([^"']*\/react\.js[^"']*)["']/)?.[1];
const queryUrl = querySource.match(/from\s*["']([^"']*\/@tanstack_react-query\.js[^"']*)["']/)?.[1];
const domUrl = mainSource.match(/from\s*["']([^"']*\/react-dom_client\.js[^"']*)["']/)?.[1];
assert.ok(reactUrl && queryUrl && domUrl, "Use the same optimized modules as the running app");
const document = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/src/index.css"></head><body><div id="root"></div>
<script type="module">
import RefreshRuntime from "/@react-refresh";
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$=()=>{};
window.$RefreshSig$=()=>type=>type;
window.__vite_plugin_react_preamble_installed__=true;
</script><script type="module">
import React from ${JSON.stringify(reactUrl)};
import ReactDOM from ${JSON.stringify(domUrl)};
import {QueryClientProvider,useQuery} from ${JSON.stringify(queryUrl)};
import {queryClient} from "/src/lib/queryClient.ts";
import {PlannerInboundCheck} from "/src/components/planner/PlannerWebhookRetry.tsx";
import {PlannerInboundHealth} from "/src/components/planner/PlannerInboundHealth.tsx";
import {Toaster} from "/src/components/ui/toaster.tsx";
function Test(){
 const {data:health}=useQuery({queryKey:["/api/projects","test-project","planner-sync-health"]});
 return React.createElement("main",{style:{padding:24,maxWidth:480}},
  React.createElement("h1",{style:{fontSize:22,marginBottom:16}},"Planner inbound updates"),
  health&&React.createElement(PlannerInboundHealth,{health:health.inbound,direction:health.connection.syncDirection,
   enabled:health.connection.syncEnabled,suspended:health.connection.syncSuspended}),
  React.createElement("div",{style:{marginTop:16}},
   React.createElement(PlannerInboundCheck,{projectId:"test-project",
    enabled:health?.connection.syncEnabled&&health?.connection.syncDirection!=="outbound_only",suspended:health?.connection.syncSuspended??true})),
  React.createElement(Toaster));
}
ReactDOM.createRoot(window.document.getElementById("root")).render(
 React.createElement(QueryClientProvider,{client:queryClient},React.createElement(Test)));
</script></body></html>`;

const candidates = readdirSync("/nix/store")
  .filter((name) => /^.{32}-chromium-\d/.test(name))
  .sort((a, b) => Number(b.includes("-chromium-131.")) - Number(a.includes("-chromium-131.")))
  .map((name) => `/nix/store/${name}/bin/chromium`);
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || candidates.find(existsSync);
assert.ok(executablePath, "Environment Chromium is required");
const browser = await puppeteer.launch({
  executablePath, headless: true, timeout: 20_000,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
const failures: string[] = [];
const writes: string[] = [];
let pending: HTTPRequest | undefined;
let user = { role: "admin", platformRole: "user" };
let health = {
  connected: true, connection: { syncEnabled: true, syncSuspended: false, syncDirection: "bidirectional" },
  inbound: { mode: "polling", intervalMinutes: 5, lastCheck: null as null | {
    status: string; checkedAt: string; error: string | null; counts: { checked: number; failed: number; skipped: number };
  } },
};
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => failures.push(String(error)));
  await page.setViewport({ width: 402, height: 874, isMobile: true, hasTouch: true });
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const handle = async () => {
      const url = new URL(request.url());
      if (url.origin !== origin) return request.continue();
      if (url.pathname === "/__planner-webhook-retry-test") {
        return request.respond({ status: 200, contentType: "text/html", body: document });
      }
      if (!url.pathname.startsWith("/api/")) return request.continue();
      if (request.method() !== "GET") writes.push(`${request.method()} ${url.pathname}`);
      if (url.pathname === "/api/projects/test-project/planner-inbound/check" && request.method() === "POST") {
        pending = request;
        return;
      }
      const body = url.pathname === "/api/auth/user" ? { id: "test-user", ...user }
        : url.pathname === "/api/projects/test-project/planner-sync-health" ? health : undefined;
      if (!body) failures.push(`Unhandled API: ${request.method()} ${url.pathname}`);
      return request.respond({ status: body ? 200 : 404, contentType: "application/json", body: JSON.stringify(body || {}) });
    };
    void handle().catch((error) => failures.push(String(error)));
  });
  const selector = '[data-testid="button-check-planner-inbound"]';
  await page.goto(`${origin}/__planner-webhook-retry-test`, { waitUntil: "networkidle0" });
  await page.waitForSelector(selector);
  await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('[data-testid="button-check-planner-inbound"]')?.disabled === false);
  assert.ok(await page.evaluate(() => document.body.innerText.includes("No inbound check completed yet")));
  await page.screenshot({ path: "/tmp/planner-inbound-mobile.png" });
  await page.tap(selector);
  await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('[data-testid="button-check-planner-inbound"]')?.disabled);
  assert.match(await page.$eval(selector, (el) => el.textContent || ""), /Checking Planner/);
  // A second activation while pending must not start another request.
  await page.$eval(selector, (el) => (el as HTMLButtonElement).click());
  assert.equal(writes.length, 1);
  assert.ok(pending, "Retry request was sent");
  const failed = pending;
  pending = undefined;
  health.inbound.lastCheck = { status: "error", checkedAt: new Date().toISOString(),
    error: "Graph temporarily unavailable", counts: { checked: 0, failed: 1, skipped: 0 } };
  await failed.respond({ status: 502, contentType: "application/json", body: JSON.stringify({ message: "Graph temporarily unavailable" }) });
  await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent?.includes("Graph temporarily unavailable"));
  await page.waitForFunction(() => document.querySelector('[data-testid="planner-inbound-health"]')?.textContent?.includes("Graph temporarily unavailable"));

  await page.tap(selector);
  await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('[data-testid="button-check-planner-inbound"]')?.disabled);
  assert.ok(pending);
  const accepted = pending;
  pending = undefined;
  health.inbound.lastCheck = { status: "success", checkedAt: new Date().toISOString(),
    error: null, counts: { checked: 2, failed: 0, skipped: 0 } };
  await accepted.respond({ status: 200, contentType: "application/json", body: JSON.stringify({
    status: "success", checked: 2, failed: 0, skipped: 0,
  }) });
  await page.waitForFunction(() => document.querySelector('[data-testid="planner-inbound-health"]')?.textContent?.includes("Completed"));
  await page.waitForFunction(() => document.body.innerText.includes("Planner check completed"));
  assert.equal(await page.$('[role="alert"]'), null);

  health.connection.syncEnabled = false;
  await page.reload({ waitUntil: "networkidle0" });
  assert.equal(await page.$eval(selector, (el) => (el as HTMLButtonElement).disabled), true);
  assert.ok(await page.evaluate(() => document.body.innerText.includes("Enable inbound or bidirectional sync first")));
  health.connection.syncEnabled = true;
  health.connection.syncSuspended = true;
  await page.reload({ waitUntil: "networkidle0" });
  assert.equal(await page.$eval(selector, (el) => (el as HTMLButtonElement).disabled), true);
  health.connection.syncSuspended = false;
  health.connection.syncDirection = "outbound_only";
  await page.reload({ waitUntil: "networkidle0" });
  assert.equal(await page.$eval(selector, (el) => (el as HTMLButtonElement).disabled), true);
  health.connection.syncDirection = "bidirectional";
  user = { role: "pm", platformRole: "user" };
  await page.reload({ waitUntil: "networkidle0" });
  assert.equal(await page.$(selector), null);
  user = { role: "employee", platformRole: "constellation_admin" };
  await page.setViewport({ width: 1280, height: 900, hasTouch: false, isMobile: false });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(selector);
  assert.equal(await page.$eval(selector, (el) => (el as HTMLButtonElement).disabled), false);
  assert.deepEqual(writes, [
    "POST /api/projects/test-project/planner-inbound/check",
    "POST /api/projects/test-project/planner-inbound/check",
  ]);
  assert.deepEqual(failures, []);
  console.log("Inbound polling browser regression passed: mobile pending/error/retry/success, health refresh, disabled/suspended/outbound-only state, admin visibility and only two mocked inbound-check POSTs.");
} catch (error) {
  console.error("Webhook retry browser failure:", error, "Browser errors:", failures);
  throw error;
} finally {
  await browser.close();
}
