import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import puppeteer, { type Page } from "puppeteer";

// A frontend-only server and intercepted API: no worker, credentials, AI or email.
const externalOrigin = process.argv[2];
const origin = externalOrigin || "http://127.0.0.1:5204";
const server = externalOrigin ? null : spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5204"], { detached: true, stdio: "ignore" });
function chromiumExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const store = "/nix/store";
  const found = readdirSync(store).filter(name => /^.{32}-chromium-\d/.test(name) && existsSync(`${store}/${name}/bin/chromium`))
    .sort((a, b) => Number(b.match(/-chromium-(\d+)/)?.[1]) - Number(a.match(/-chromium-(\d+)/)?.[1]))[0];
  if (!found) throw new Error("No environment Chromium installed");
  return `${store}/${found}/bin/chromium`;
}
async function text(page: Page, value: string) {
  await page.waitForFunction(value => document.body.textContent?.includes(value), {}, value);
}
async function click(page: Page, value: string) {
  await page.waitForFunction(value => [...document.querySelectorAll("button")].some(b => b.textContent?.trim() === value && !b.disabled), {}, value);
  await page.evaluate(value => ([...document.querySelectorAll("button")].find(b => b.textContent?.trim() === value))?.click(), value);
  await page.waitForNetworkIdle({ idleTime: 100 });
}
async function setLabeled(page: Page, label: string, value: string) {
  await page.evaluate((label, value) => {
    const field = [...document.querySelectorAll("label")].find(l => l.textContent?.trim() === label)?.parentElement?.querySelector("input,select,textarea") as HTMLInputElement;
    if (!field) throw new Error(`Field not found: ${label}`);
    const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event(field instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  }, label, value);
}
const config = { cadence: "weekly", day: 1, time: "08:00", timezone: "America/New_York", period: "previous_week",
  style: "executive_brief", recipientIds: ["pm"], reviewerId: "pm", autoSend: false, pmContext: "" };
let schedules: any[] = [];
let runs: any[] = [];
const recipients = [{ id: "pm", name: "Synthetic PM", email: "pm@example.test", role: "pm" }];
const mutations: { method: string; pathname: string; body: any }[] = [];
const errors: string[] = [];
const delayedDetails = new Map<string, { ready: () => void; gate: Promise<void>; failed: boolean }>();
function delayDetail(id: string, failed = false) {
  let ready!: () => void, release!: () => void;
  const received = new Promise<void>(resolve => { ready = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  delayedDetails.set(id, { ready, gate, failed });
  return { received, release };
}
async function openReviewIndex(page: Page, index: number) {
  await page.evaluate(index => {
    const button = [...document.querySelectorAll("button")].filter(b => b.textContent?.trim() === "Review report")[index];
    if (!button) throw new Error("Review button not found");
    button.click();
  }, index);
}
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
try {
  for (let attempt = 0; attempt < 240; attempt++) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (attempt === 239) throw new Error("Frontend test server did not start");
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  browser = await puppeteer.launch({ executablePath: chromiumExecutable(), headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 900 });
  // Deliberately model a transport that ignores cancellation. Identity guards,
  // not just browser AbortController behavior, must protect report approval.
  await page.evaluateOnNewDocument(() => {
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = (input, init) => String(input).includes("/runs/race-")
      ? fetchOriginal(input, { ...init, signal: undefined }) : fetchOriginal(input, init);
  });
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") console.error(message.text()); });
  await page.setRequestInterception(true);
  page.on("request", request => {
    void (async () => {
      const url = new URL(request.url());
      if (url.pathname === "/favicon.ico") return request.respond({ status: 204 });
      if (url.pathname === "/__report-schedules-component-test") {
        return request.respond({ contentType: "text/html", body: `<!doctype html><html><head>
          <script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;</script>
          </head><body><div id="root"></div><script type="module" src="/@fs/${path.resolve("tests/report-schedules.harness.tsx")}"></script></body></html>` });
      }
      if (!url.pathname.startsWith("/api/")) return request.continue();
      const json = (body: unknown, status = 200) => request.respond({ status, contentType: "application/json", body: JSON.stringify(body) });
      const method = request.method(), pathname = url.pathname;
      const base = "/api/projects/synthetic-project/report-schedules";
      if (method !== "GET") {
        const body = request.postData() ? JSON.parse(request.postData()!) : {};
        mutations.push({ method, pathname, body });
        if (pathname === base && method === "POST") schedules.push({ id: "schedule-1", projectId: "synthetic-project", config: body, paused: false,
          nextRunAt: "2026-11-30T13:00:00Z", lastResult: null, deletedAt: null });
        else if (method === "PATCH") {
          if (typeof body.paused === "boolean") schedules[0].paused = body.paused; else schedules[0].config = body;
        } else if (method === "DELETE") schedules = [];
        else if (pathname.endsWith("/approve")) {
          const run = runs.find(r => pathname.includes(r.id)); run.status = "approved";
        } else if (pathname.endsWith("/retry")) {
          const run = runs.find(r => pathname.includes(r.id)); run.status = "queued";
        }
        return json({ success: true });
      }
      if (pathname === base) return json({ schedules, runs, recipients });
      if (pathname === "/api/projects/another-project/report-schedules") return json({ schedules: [], runs: [], recipients });
      if (pathname === "/api/admin/report-schedules") return json({ schedules, runs });
      if (pathname.startsWith(`${base}/runs/`)) {
        const run = runs.find(r => pathname.endsWith(r.id));
        const delay = delayedDetails.get(run.id);
        if (delay) {
          delay.ready(); await delay.gate; delayedDetails.delete(run.id);
          if (delay.failed) return json({ message: "Stale internal review request failed" }, 503);
        }
        const internal = run.id === "race-internal";
        const clientFacing = run.id === "race-client";
        return json({ run, report: { reportContent: internal ? "INTERNAL CONFIDENTIAL CONTENT" : clientFacing ? "CLIENT APPROVED AUDIENCE CONTENT" : "Synthetic generated draft", title: "Synthetic report" },
          deliveries: [{ id: "delivery", recipientId: internal ? "internal" : clientFacing ? "client" : "pm",
            email: internal ? "private@example.test" : clientFacing ? "client@example.test" : "pm@example.test",
            status: "pending", lastError: null, providerMessageId: null, sentAt: null }] });
      }
      errors.push(`Unexpected API ${pathname}`); return json({ message: "Unhandled test request" }, 500);
    })().catch(error => { errors.push(String(error)); if (!request.isInterceptResolutionHandled()) void request.abort(); });
  });
  await page.goto(`${origin}/__report-schedules-component-test`, { waitUntil: "networkidle0" });
  await text(page, "Scheduled delivery");
  await click(page, "New schedule");
  await text(page, "Schedule a status report");
  assert.equal(await page.$eval('[role="dialog"] button:last-child', b => (b as HTMLButtonElement).disabled), true);
  await page.evaluate(() => (document.querySelector('[role="dialog"] [role="checkbox"]') as HTMLElement)?.click());
  await setLabeled(page, "Reviewer", "pm");
  await click(page, "Create schedule");
  await text(page, "Review required");
  assert.equal(mutations[0].body.autoSend, false);
  await click(page, "Pause"); await text(page, "Paused"); await click(page, "Resume");
  await click(page, "Edit");
  await setLabeled(page, "Cadence", "monthly");
  await setLabeled(page, "Day of month (1–31)", "31");
  await setLabeled(page, "Report style", "client_facing");
  await click(page, "Save schedule");
  assert.ok(mutations.some(m => m.method === "PATCH" && m.body.cadence === "monthly" && m.body.day === 31));
  const baseRun = { scheduleId: "schedule-1", projectId: "synthetic-project", scheduledFor: "2026-11-23T13:00:00Z",
    periodStart: "2026-11-16", periodEnd: "2026-11-22", reportId: "report", createdAt: "2026-11-23T13:01:00Z", config };
  runs = [
    { ...baseRun, id: "review-run", status: "pending_review", lastError: null },
    { ...baseRun, id: "failed-run", status: "failed", lastError: "Provider rejected request; fix and retry" },
    { ...baseRun, id: "unknown-run", status: "ambiguous", lastError: "Email outcome unknown; provider investigation required" },
  ];
  await page.reload({ waitUntil: "networkidle0" });
  await text(page, "awaiting review");
  await click(page, "Review report");
  await text(page, "Synthetic generated draft");
  await page.$eval("#scheduled-report-content", el => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, "Reviewed synthetic content");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click(page, "Approve for delivery");
  assert.equal(mutations.filter(m => m.pathname.endsWith("/approve")).length, 0);
  await text(page, "Confirm report delivery"); await click(page, "Confirm approval");
  await text(page, "Report approved for delivery");
  assert.equal(mutations.find(m => m.pathname.endsWith("/approve"))?.body.reportContent, "Reviewed synthetic content");
  const retryButtons = await page.$$eval("button", bs => bs.filter(b => b.textContent?.includes("Safe retry")).length);
  // Only failed rows get retry; ambiguous rows never do.
  assert.equal(retryButtons, 1);
  await click(page, "Safe retry");
  assert.ok(mutations.some(m => m.pathname.endsWith("failed-run/retry")));
  assert.ok(!mutations.some(m => m.pathname.endsWith("unknown-run/retry")));
  await page.setViewport({ width: 402, height: 874 });
  mkdirSync("generated-artifacts", { recursive: true });
  await page.screenshot({ path: "generated-artifacts/report-schedules-mobile.png", fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, "No horizontal mobile overflow");
  await page.setViewport({ width: 1280, height: 900 });
  await page.screenshot({ path: "generated-artifacts/report-schedules-desktop.png", fullPage: true });
  await page.click('button[aria-label="Delete schedule"]'); await text(page, "Delete this schedule?");
  assert.equal(mutations.filter(m => m.method === "DELETE").length, 0);
  await click(page, "Delete schedule");
  assert.equal(mutations.filter(m => m.method === "DELETE").length, 1);

  // Security regression: late internal response must never replace selected
  // client-facing content/recipients or be posted to the client's approval URL.
  runs = [
    { ...baseRun, id: "race-internal", status: "pending_review", config: { ...config, style: "detailed_update", recipientIds: ["internal"] } },
    { ...baseRun, id: "race-client", status: "pending_review", config: { ...config, style: "client_facing", recipientIds: ["client"] } },
  ];
  await page.reload({ waitUntil: "networkidle0" });
  let delayed = delayDetail("race-internal");
  await openReviewIndex(page, 0); await delayed.received;
  assert.equal(await page.$eval('[role="dialog"] button:last-child', b => (b as HTMLButtonElement).disabled), true);
  await page.evaluate(() => ([...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent?.trim() === "Close") as HTMLButtonElement)?.click());
  await openReviewIndex(page, 1);
  await page.waitForFunction(() => (document.querySelector("#scheduled-report-content") as HTMLTextAreaElement)?.value === "CLIENT APPROVED AUDIENCE CONTENT");
  delayed.release(); await page.waitForNetworkIdle({ idleTime: 100 });
  assert.equal(await page.$eval("#scheduled-report-content", el => (el as HTMLTextAreaElement).value), "CLIENT APPROVED AUDIENCE CONTENT");
  const clientDialog = await page.$eval('[role="dialog"]', el => el.textContent);
  assert.ok(clientDialog?.includes("client@example.test")); assert.ok(!clientDialog?.includes("private@example.test"));
  await click(page, "Approve for delivery"); await click(page, "Confirm approval");
  const raceApproval = mutations.find(m => m.pathname.endsWith("/race-client/approve"));
  assert.equal(raceApproval?.body.reportContent, "CLIENT APPROVED AUDIENCE CONTENT");
  assert.ok(!mutations.some(m => m.pathname.endsWith("/race-internal/approve")));

  // A late failure/finally handler must not close B or clear its loading guard.
  runs[1].status = "pending_review"; await page.reload({ waitUntil: "networkidle0" });
  delayed = delayDetail("race-internal", true);
  await openReviewIndex(page, 0); await delayed.received;
  await page.evaluate(() => ([...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent?.trim() === "Close") as HTMLButtonElement)?.click());
  await openReviewIndex(page, 1);
  await page.waitForFunction(() => (document.querySelector("#scheduled-report-content") as HTMLTextAreaElement)?.value === "CLIENT APPROVED AUDIENCE CONTENT");
  delayed.release(); await page.waitForNetworkIdle({ idleTime: 100 });
  assert.equal(await page.$eval("#scheduled-report-content", el => (el as HTMLTextAreaElement).value), "CLIENT APPROVED AUDIENCE CONTENT");
  await click(page, "Close");

  // Project changes invalidate an old response even when the component is reused.
  delayed = delayDetail("race-internal");
  await openReviewIndex(page, 0); await delayed.received;
  const projectChanged = page.waitForResponse(r => r.url().includes("/projects/another-project/report-schedules"));
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("report-test-project", { detail: "another-project" })));
  await projectChanged;
  delayed.release(); await page.waitForNetworkIdle({ idleTime: 100 });
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  assert.equal(await page.$('[role="dialog"]'), null);
  assert.equal(await page.$("#scheduled-report-content"), null);
  assert.deepEqual(errors, []);
  console.log("Scheduled-report browser checks passed: CRUD, review confirmation, safe retry, admin/mobile layout, out-of-order internal/client review responses, stale failures and project changes. All API calls mocked.");
} catch (error) {
  console.error("Browser errors:", errors);
  const pages = await browser?.pages();
  const page = pages?.at(-1);
  if (page) console.error("Page content:", (await page.evaluate(() => document.body.innerText)).slice(0, 4000));
  throw error;
} finally {
  await browser?.close();
  if (server?.pid) {
    try { process.kill(-server.pid, "SIGTERM"); } catch {}
    await new Promise<void>(resolve => { if (server.exitCode !== null) resolve(); else server.once("exit", () => resolve()); });
  }
}
