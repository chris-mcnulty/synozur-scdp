import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import puppeteer, { type HTTPRequest, type Page } from "puppeteer";

const port = 5199;
const origin = `http://127.0.0.1:${port}`;
const projectId = "browser-project";
let server: ChildProcess | undefined;

function chromiumExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const store = "/nix/store";
  const chromiumPackage = readdirSync(store)
    .filter((entry) => /^.{32}-chromium-\d/.test(entry) && existsSync(`${store}/${entry}/bin/chromium`))
    .sort((a, b) => {
      const aVersion = Number(a.match(/-chromium-(\d+)/)?.[1] || 0);
      const bVersion = Number(b.match(/-chromium-(\d+)/)?.[1] || 0);
      return bVersion - aVersion;
    })[0];
  const executable = chromiumPackage ? `${store}/${chromiumPackage}/bin/chromium` : "";
  if (!executable || !existsSync(executable)) {
    throw new Error("Chromium is required for the project browser validation");
  }
  return executable;
}

const people = [
  { id: "person-1", name: "Ada Lovelace" },
  { id: "person-2", name: "Grace Hopper" },
];
const assignments = [
  { id: "assignment-1", personId: "person-2", taskDescription: "Browser assignment", projectStageId: "stage-2", projectWorkstreamId: "workstream-2" },
];
const stages = [{ id: "stage-1", name: "Discover" }, { id: "stage-2", name: "Build" }];
const workstreams = [{ id: "workstream-1", name: "Advisory" }, { id: "workstream-2", name: "Engineering" }];

let entries: any[] = [
  editable("editable-1", "person-1", "2026-08-03", 2, "Baseline row", { commercialEligibilityOutcome: "not_eligible", commercialTreatmentState: "baseline_terms", commercialTreatmentLabel: "Baseline terms" }),
  editable("editable-2", "person-2", "2026-09-04", 3, "No value row", { commercialTreatmentState: "no_value", commercialTreatmentLabel: "No commercial value" }),
  immutable("locked-1", "Locked in an invoice batch", { locked: true }),
  immutable("billed-1", "Marked as billed", { billedFlag: true }),
  immutable("invoice-1", "Included in an invoice batch", { invoiceBatchId: "invoice-batch-1" }),
  immutable("vendor-1", "Matched to a vendor invoice line", { vendorInvoiceLineId: "vendor-line-1" }),
];

function editable(id: string, personId: string, date: string, hours: number, description: string, extra: any = {}) {
  return { id, projectId, personId, personName: people.find((p) => p.id === personId)?.name, date, hours: String(hours), description, billable: true, submissionStatus: "draft", ...extra };
}

function immutable(id: string, readOnlyReason: string, extra: any) {
  return { ...editable(id, "person-1", "2026-09-01", 1, `${id} row`), readOnlyReason, immutable: true, ...extra };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(`${origin}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Browser-test server did not become ready");
}

async function select(page: Page, testId: string, option: string) {
  await page.click(`[data-testid="${testId}"]`);
  await page.waitForSelector('[role="option"]');
  const clicked = await page.evaluate((label) => {
    const item = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((node) => node.textContent?.trim() === label);
    item?.click();
    return !!item;
  }, option);
  assert.equal(clicked, true, `option ${option} should be available`);
}

async function replace(page: Page, selector: string, value: string) {
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type(selector, value);
}

async function respond(request: HTTPRequest) {
  const url = new URL(request.url());
  if (url.origin !== origin || !url.pathname.startsWith("/api/")) return request.continue();
  const method = request.method();
  const json = (body: unknown, status = 200) => request.respond({ status, contentType: "application/json", body: JSON.stringify(body) });

  if (url.pathname === "/api/auth/user") return json({ id: "admin-1", name: "Browser Admin", email: "browser@example.test", role: "admin", tenantId: "tenant-1" });
  if (url.pathname === "/api/auth/tenants") return json({ activeTenantId: "tenant-1", tenants: [{ id: "tenant-1", name: "Browser Tenant", slug: "browser", role: "admin", isActive: true }] });
  if (url.pathname === `/api/projects/${projectId}/analytics`) return json({
    project: { id: projectId, name: "Browser Fixture Project", code: "BROWSER", clientId: "client-1", pm: "admin-1", status: "active" },
    monthlyMetrics: [],
    burnRate: { totalBudget: 0, consumedBudget: 0, burnRatePercentage: 0, estimatedHours: 0, actualHours: 0, hoursVariance: 0, projectedCompletion: null },
    teamHours: [],
  });
  if (url.pathname === `/api/time-entries` && url.searchParams.get("projectId") === projectId) return json(entries);
  if (url.pathname === `/api/projects/${projectId}/allocations`) return json(assignments);
  if (url.pathname === `/api/projects/${projectId}/stages`) return json(stages);
  if (url.pathname === `/api/projects/${projectId}/workstreams`) return json(workstreams);
  if (url.pathname === `/api/projects/${projectId}/epics`) return json([]);
  if (url.pathname === `/api/projects/${projectId}/milestones`) return json([]);
  if (url.pathname === `/api/projects/${projectId}/commercial-buckets`) return json({ required: false, buckets: [] });
  if (url.pathname === "/api/users") return json(people);

  if (method === "PATCH" && url.pathname.startsWith("/api/time-entries/")) {
    const id = url.pathname.split("/").at(-1)!;
    const patch = JSON.parse(request.postData() || "{}");
    entries = entries.map((entry) => entry.id === id ? {
      ...entry, ...patch, hours: String(patch.hours ?? entry.hours),
      commercialTreatmentState: patch.baselineSow ? "baseline_terms" : "no_value",
      commercialTreatmentLabel: patch.baselineSow ? "Baseline terms" : "No commercial value",
    } : entry);
    return json(entries.find((entry) => entry.id === id));
  }
  if (method === "POST" && url.pathname === "/api/time-entries/batch-create") {
    const body = JSON.parse(request.postData() || "{}");
    const created = body.entries.map((entry: any, index: number) => editable(`created-${index + 1}`, entry.personId, entry.date, Number(entry.hours), entry.description, {
      ...entry,
      personName: people.find((p) => p.id === entry.personId)?.name,
      commercialTreatmentState: entry.baselineSow ? "baseline_terms" : "no_value",
      commercialTreatmentLabel: entry.baselineSow ? "Baseline terms" : "No commercial value",
    }));
    entries = [...entries, ...created];
    return json(created, 201);
  }
  if (method === "POST" && url.pathname === "/api/time-entries/bulk-update") {
    const body = JSON.parse(request.postData() || "{}");
    entries = entries.map((entry) => body.ids.includes(entry.id) ? { ...entry, ...body.updates } : entry);
    return json({ updated: body.ids.length, errors: [] });
  }
  return json(url.pathname.includes("hours-summary") ? { budgetedHours: 0, actualHours: 0, remainingHours: 0, hoursVariance: 0, hoursConsumedPct: 0 } : []);
}

async function main() {
  server = spawn("npm", ["run", "dev"], { env: { ...process.env, PORT: String(port), NODE_ENV: "development" }, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let serverLog = "";
  server.stdout?.on("data", (chunk) => { serverLog += chunk; });
  server.stderr?.on("data", (chunk) => { serverLog += chunk; });
  await waitForServer();

  const browser = await puppeteer.launch({ executablePath: chromiumExecutable(), headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    const page = await browser.newPage();
    const browserErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.setRequestInterception(true);
    page.on("request", (request) => void respond(request).catch((error) => request.abort().catch(() => {}).finally(() => { throw error; })));
    await page.evaluateOnNewDocument(() => localStorage.setItem("sessionId", "browser-session"));
    await page.goto(`${origin}/projects/${projectId}?tab=time`, { waitUntil: "networkidle0", timeout: 30_000 });
    try {
      await page.waitForSelector('[data-testid="project-time-workbench"]');
    } catch (error) {
      const body = await page.$eval("body", (node) => node.innerText).catch(() => "");
      throw new Error(`Time workbench did not render at ${page.url()}\nBrowser errors: ${browserErrors.join("\n")}\nBody: ${body.slice(0, 2000)}\n${error}`);
    }
    assert.equal(await page.$eval('[data-testid="tab-time"]', (node) => node.getAttribute("data-state")), "active");

    await select(page, "time-filter-person", "Grace Hopper");
    assert.equal(await page.$$eval('[data-testid^="time-entry-"]', (nodes) => nodes.length), 1);
    await page.click("button", { offset: { x: 2, y: 2 } }).catch(() => {});
    await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Clear all filters"))?.click());
    await select(page, "time-group-by", "Month");
    assert.match(await page.$eval('[data-testid="project-time-workbench"]', (node) => node.textContent || ""), /August 2026/);

    await page.click('[aria-label="Expand time entry"]');
    await replace(page, '[data-testid="inline-editor-hours"]', "0");
    assert.equal(await page.$eval('button[type="submit"]', (button: any) => button.disabled), true);
    await replace(page, '[data-testid="inline-editor-hours"]', "4.5");
    await replace(page, '[data-testid="inline-editor-description"]', "unsaved edit");
    await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Cancel")?.click());
    assert.doesNotMatch(await page.$eval('[data-testid="project-time-workbench"]', (node) => node.textContent || ""), /unsaved edit/);

    await page.click('[aria-label="Expand time entry"]');
    await replace(page, '[data-testid="inline-editor-hours"]', "4.5");
    await replace(page, '[data-testid="inline-editor-description"]', "saved inline edit");
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => document.body.textContent?.includes("saved inline edit"));

    await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Add rows"))?.click());
    await select(page, "composer-row-1-assignment", "Browser assignment");
    assert.equal(await page.$eval('[data-testid="composer-row-1-person"]', (node) => node.textContent?.trim()), "Grace Hopper");
    assert.equal(await page.$eval('[data-testid="composer-row-1-stage"]', (node) => node.textContent?.trim()), "Build");
    assert.equal(await page.$eval('[data-testid="composer-row-1-workstream"]', (node) => node.textContent?.trim()), "Engineering");
    await replace(page, '[data-testid="composer-row-1-hours"]', "2");
    await replace(page, '[data-testid="composer-row-1-description"]', "composed row");
    await page.click('[aria-label="Duplicate row 1"]');
    assert.equal(await page.$$eval('[aria-label^="Duplicate row"]', (nodes) => nodes.length), 2);
    await page.click('[aria-label="Remove row 2"]');
    await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Add another row"))?.click());
    await replace(page, '[data-testid="composer-row-2-hours"]', "1");
    await replace(page, '[data-testid="composer-row-2-description"]', "second composed row");
    await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Save all 2 rows"))?.click());
    await page.waitForFunction(() => document.body.textContent?.includes("second composed row"));

    await select(page, "time-filter-person", "Grace Hopper");
    await page.click('[aria-label="Select all visible entries"]');
    const selected = await page.$eval('[role="toolbar"][aria-label="Selected time entry actions"] strong', (node) => node.textContent);
    assert.match(selected || "", /selected/);
    await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Mark non-billable")?.click());
    await page.waitForFunction(() => !document.querySelector('[role="toolbar"][aria-label="Selected time entry actions"]'));
    assert.equal(entries.filter((entry) => entry.personId === "person-2" && !entry.immutable).every((entry) => entry.billable === false), true);

    await page.evaluate(() => [...document.querySelectorAll("button")].find((button) => button.textContent?.includes("Clear all filters"))?.click());
    for (const [id, reason] of [["locked-1", "Locked in an invoice batch"], ["billed-1", "Marked as billed"], ["invoice-1", "Included in an invoice batch"], ["vendor-1", "Matched to a vendor invoice line"]]) {
      const row = `[data-testid="time-entry-${id}"]`;
      assert.match(await page.$eval(row, (node) => node.textContent || ""), new RegExp(reason));
      assert.equal(await page.$eval(`${row} button[role="checkbox"]`, (node) => node.getAttribute("data-disabled") !== null), true);
    }

    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector('[data-testid="project-time-workbench"]');
    const text = await page.$eval('[data-testid="project-time-workbench"]', (node) => node.textContent || "");
    assert.match(text, /Baseline terms/);
    assert.match(text, /No commercial value/);
    console.log("project Time browser regression suite passed");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  if (server?.pid) {
    try { process.kill(-server.pid, "SIGTERM"); } catch {}
  }
});