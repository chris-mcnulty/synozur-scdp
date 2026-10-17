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
import {PlannerWebhookRetry} from "/src/components/planner/PlannerWebhookRetry.tsx";
import {PlannerWebhookHealth} from "/src/components/planner/PlannerWebhookHealth.tsx";
import {Toaster} from "/src/components/ui/toaster.tsx";
function Test(){
 const {data:health}=useQuery({queryKey:["/api/projects","test-project","planner-sync-health"]});
 return React.createElement("main",{style:{padding:24,maxWidth:480}},
  React.createElement("h1",{style:{fontSize:22,marginBottom:16}},"Planner webhook"),
  health&&React.createElement(PlannerWebhookHealth,{subscription:health.subscriptions[0],
   enabled:health.connection.syncEnabled,suspended:health.connection.syncSuspended}),
  React.createElement("div",{style:{marginTop:16}},
   React.createElement(PlannerWebhookRetry,{projectId:"test-project",
    enabled:health?.connection.syncEnabled||false,suspended:health?.connection.syncSuspended??true})),
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
  connected: true, connection: { syncEnabled: true, syncSuspended: false },
  subscriptions: [{
    status: "error", lastRenewedAt: null as string | null,
    expirationDateTime: null as string | null, lastRenewalError: "Subscription needs recovery",
  }],
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
      if (url.pathname === "/api/projects/test-project/planner-webhook/retry" && request.method() === "POST") {
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
  const selector = '[data-testid="button-retry-planner-webhook"]';
  await page.goto(`${origin}/__planner-webhook-retry-test`, { waitUntil: "networkidle0" });
  await page.waitForSelector(selector);
  await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('[data-testid="button-retry-planner-webhook"]')?.disabled === false);
  await page.tap(selector);
  await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('[data-testid="button-retry-planner-webhook"]')?.disabled);
  assert.match(await page.$eval(selector, (el) => el.textContent || ""), /Retrying/);
  // A second activation while pending must not start another request.
  await page.$eval(selector, (el) => (el as HTMLButtonElement).click());
  assert.equal(writes.length, 1);
  assert.ok(pending, "Retry request was sent");
  const failed = pending;
  pending = undefined;
  health.subscriptions[0].lastRenewalError = "Graph temporarily unavailable";
  await failed.respond({ status: 502, contentType: "application/json", body: JSON.stringify({ message: "Graph temporarily unavailable" }) });
  await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent?.includes("Graph temporarily unavailable"));
  await page.waitForFunction(() => document.querySelector('[data-testid="planner-webhook-health"]')?.textContent?.includes("Graph temporarily unavailable"));

  await page.tap(selector);
  await page.waitForFunction(() => document.querySelector<HTMLButtonElement>('[data-testid="button-retry-planner-webhook"]')?.disabled);
  assert.ok(pending);
  const accepted = pending;
  pending = undefined;
  health.subscriptions[0] = {
    status: "active", lastRenewedAt: new Date().toISOString(),
    expirationDateTime: new Date(Date.now() + 60 * 60_000).toISOString(), lastRenewalError: "",
  };
  await accepted.respond({ status: 200, contentType: "application/json", body: JSON.stringify({
    status: "active", expirationDateTime: health.subscriptions[0].expirationDateTime,
  }) });
  await page.waitForFunction(() => document.querySelector('[data-testid="planner-webhook-health"]')?.textContent?.includes("Webhook: active"));
  await page.waitForFunction(() => document.body.innerText.includes("Webhook subscription is active"));
  assert.equal(await page.$('[role="alert"]'), null);
  await page.screenshot({ path: "/tmp/planner-webhook-retry-mobile.png" });

  health.connection.syncEnabled = false;
  await page.reload({ waitUntil: "networkidle0" });
  assert.equal(await page.$eval(selector, (el) => (el as HTMLButtonElement).disabled), true);
  assert.ok(await page.evaluate(() => document.body.innerText.includes("Enable sync first")));
  health.connection.syncEnabled = true;
  health.connection.syncSuspended = true;
  await page.reload({ waitUntil: "networkidle0" });
  assert.equal(await page.$eval(selector, (el) => (el as HTMLButtonElement).disabled), true);
  health.connection.syncSuspended = false;
  user = { role: "pm", platformRole: "user" };
  await page.reload({ waitUntil: "networkidle0" });
  assert.equal(await page.$(selector), null);
  user = { role: "employee", platformRole: "constellation_admin" };
  await page.setViewport({ width: 1280, height: 900, hasTouch: false, isMobile: false });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(selector);
  assert.equal(await page.$eval(selector, (el) => (el as HTMLButtonElement).disabled), false);
  assert.deepEqual(writes, [
    "POST /api/projects/test-project/planner-webhook/retry",
    "POST /api/projects/test-project/planner-webhook/retry",
  ]);
  assert.deepEqual(failures, []);
  console.log("Webhook retry browser regression passed: mobile pending/error/retry/success, health refresh, disabled/suspended state, admin visibility and no task-sync writes.");
} catch (error) {
  console.error("Webhook retry browser failure:", error, "Browser errors:", failures);
  throw error;
} finally {
  await browser.close();
}
