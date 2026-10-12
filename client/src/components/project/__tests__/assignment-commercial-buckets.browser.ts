// Run against an already-running app:
// npx tsx client/src/components/project/__tests__/assignment-commercial-buckets.browser.ts
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import puppeteer, { type HTTPRequest, type Page } from "puppeteer";

const origin = process.env.BROWSER_TEST_ORIGIN || "http://127.0.0.1:5000";
const projectId = "assignment-bucket-browser-project";
const noBucket = "No bucket (baseline / not assigned)";
const person = { id: "operator", name: "Morgan Reed" };
const buckets = [
  { id: "advisory", label: "Execution advisory", isActive: true, effectiveStartDate: "2026-08-18", effectiveEndDate: "2026-10-23" },
  { id: "recovery", label: "Recovery", isActive: false },
];
let configured = false;
let role = "admin";
let failBulk = false;
let allocations = [
  { id: "assignment-1", personId: person.id, person, pricingMode: "role", hours: "7.5", status: "open", taskDescription: "Review execution plan", plannedStartDate: "2026-08-17", plannedEndDate: "2026-08-21", commercialBucketId: "recovery" as string | null },
  { id: "assignment-2", personId: person.id, person, pricingMode: "person", hours: "3.5", status: "completed", taskDescription: "Document recovery", plannedStartDate: "2026-06-03", plannedEndDate: "2026-06-05", commercialBucketId: null as string | null },
];
const writes: { path: string; method: string; body: Record<string, any> }[] = [];

function chromiumExecutable() {
  const explicit = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  const store = "/nix/store";
  const found = readdirSync(store).filter(name => /^.{32}-chromium-\d/.test(name) && existsSync(`${store}/${name}/bin/chromium`))
    .sort((a, b) => Number(b.match(/-chromium-(\d+)/)?.[1] || 0) - Number(a.match(/-chromium-(\d+)/)?.[1] || 0))[0];
  if (!found) throw new Error("Set PUPPETEER_EXECUTABLE_PATH to run this regression.");
  return `${store}/${found}/bin/chromium`;
}

async function respond(request: HTTPRequest) {
  const url = new URL(request.url());
  if (url.origin !== origin || !url.pathname.startsWith("/api/")) return request.continue();
  const path = url.pathname;
  const json = (body: unknown, status = 200) => request.respond({ status, contentType: "application/json", body: JSON.stringify(body) });
  if (path === "/api/auth/user") return json({ ...person, email: "operator@example.test", role, tenantId: "tenant-1" });
  if (path === "/api/auth/tenants") return json({ activeTenantId: "tenant-1", tenants: [{ id: "tenant-1", name: "Assignment fixture", slug: "assignment-fixture", role, isActive: true }] });
  if (path === `/api/projects/${projectId}/analytics`) return json({
    project: { id: projectId, name: "Commercial assignment fixture", code: "ASSIGNMENT", clientId: "client-1", pm: "different-pm", status: "active" },
    monthlyMetrics: [], teamHours: [],
    burnRate: { totalBudget: 0, consumedBudget: 0, burnRatePercentage: 0, estimatedHours: 0, actualHours: 0, hoursVariance: 0, projectedCompletion: null },
  });
  if (path === `/api/projects/${projectId}/commercial-buckets`) return json({ required: true, buckets: configured ? buckets : [] });
  if (path === "/api/users") return json([person]);
  if (path.includes("/allocations") && request.method() !== "GET") {
    const body = JSON.parse(request.postData() || "{}");
    writes.push({ path, method: request.method(), body });
    if (path.endsWith("/commercial-bucket")) {
      if (failBulk) return json({ message: "A selected assignment changed. No mappings were saved." }, 409);
      assert.deepEqual(Object.keys(body).sort(), ["commercialBucketId", "ids"]);
      allocations = allocations.map(assignment => body.ids.includes(assignment.id) ? { ...assignment, commercialBucketId: body.commercialBucketId } : assignment);
      return json({ updated: body.ids.length });
    }
    if (request.method() === "POST") return json({ ...body, id: "created" }, 201);
    allocations = allocations.map(assignment => path.endsWith(`/${assignment.id}`) ? { ...assignment, ...body } : assignment);
    return json(allocations.find(assignment => path.endsWith(`/${assignment.id}`)));
  }
  if (path === `/api/projects/${projectId}/allocations`) return json(allocations);
  return json(path.includes("hours-summary") ? { budgetedHours: 0, actualHours: 0, remainingHours: 0, hoursVariance: 0, hoursConsumedPct: 0 } : []);
}

async function choose(page: Page, testId: string, text: string) {
  await page.waitForSelector(`[data-testid="${testId}"]`, { visible: true });
  await page.click(`[data-testid="${testId}"]`);
  await page.waitForSelector('[role="option"]');
  assert.equal(await page.evaluate(label => {
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(node => node.textContent?.trim() === label);
    if (!option || option.getAttribute("aria-disabled") === "true") return false;
    option.click(); return true;
  }, text), true, `selectable option: ${text}`);
}

async function openProject(page: Page) {
  await page.goto(`${origin}/projects/${projectId}?tab=delivery`, { waitUntil: "domcontentloaded", timeout: 90000 });
  // This suite checks data workflows, not animation. Radix exit overlays can
  // otherwise intercept the very next checkbox click after a dialog closes.
  await page.addStyleTag({ content: "*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }" });
  await page.waitForSelector('[data-testid="allocation-row-assignment-1"]', { timeout: 90000 });
}

async function saveForm(page: Page) {
  await page.click('form[name="project-team-assignment-form"] button[type="submit"]');
  try {
    await page.waitForFunction(() => !document.querySelector('form[name="project-team-assignment-form"]'));
  } catch (error) {
    console.error("Assignment submit diagnostic", writes, await page.evaluate(() => ({
      invalid: [...document.querySelectorAll<HTMLInputElement>('form[name="project-team-assignment-form"] :invalid')].map(input => ({ name: input.name, value: input.value, message: input.validationMessage })),
      alerts: [...document.querySelectorAll('[role="alert"]')].map(node => node.textContent),
    })));
    throw error;
  }
}

async function selectAssignments(page: Page) {
  await page.waitForFunction(() => !document.querySelector('.fixed.inset-0[data-state="closed"]'));
  // Editing may have scrolled the wide assignment table to its action column.
  // Return to the selection column and wait for each controlled checkbox before
  // clicking the next one, rather than racing its React update.
  await page.$eval('[data-testid="checkbox-allocation-assignment-1"]', node => {
    const viewport = node.closest("table")?.parentElement;
    if (viewport) viewport.scrollLeft = 0;
  });
  for (const id of ["assignment-1", "assignment-2"]) {
    const selector = `[data-testid="checkbox-allocation-${id}"]`;
    await page.waitForSelector(selector, { visible: true });
    if (await page.$eval(selector, node => node.getAttribute("data-state")) !== "checked") {
      await page.click(selector);
    }
    await page.waitForFunction(selected => document.querySelector(selected)?.getAttribute("data-state") === "checked", {}, selector);
  }
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: chromiumExecutable(), headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.setRequestInterception(true);
    page.on("request", request => void respond(request).catch(error => { errors.push(String(error)); void request.abort(); }));

    // Required TIME classification never creates assignment controls or a requirement.
    await openProject(page);
    assert.equal(await page.$('[data-testid="filter-allocation-commercial-bucket"]'), null);
    assert.equal(await page.$('[data-testid="allocation-commercial-bucket-assignment-1"]'), null);
    await page.click('[data-testid="button-add-assignment"]');
    assert.equal(await page.$('[data-testid="select-assignment-commercial-bucket"]'), null);
    await choose(page, "select-person", person.name);
    await page.type('[data-testid="input-hours"]', "4.5");
    await saveForm(page);
    assert.equal("commercialBucketId" in writes.at(-1)!.body, false);

    configured = true;
    await openProject(page);
    assert.match(await page.$eval('[data-testid="allocation-commercial-bucket-assignment-1"]', node => node.textContent || ""), /Recovery \(archived\)/);
    await choose(page, "filter-allocation-commercial-bucket", noBucket);
    assert.equal(await page.$('[data-testid="allocation-row-assignment-1"]'), null);
    assert.ok(await page.$('[data-testid="allocation-row-assignment-2"]'));
    await choose(page, "filter-allocation-commercial-bucket", "All commercial buckets");

    // No automatic bucket; explicit null is accepted despite required=true.
    await page.click('[data-testid="button-add-assignment"]');
    assert.equal(await page.$eval('[data-testid="select-assignment-commercial-bucket"]', node => node.textContent), noBucket);
    await choose(page, "select-person", person.name);
    await page.type('[data-testid="input-hours"]', "4.5");
    await saveForm(page);
    assert.equal(writes.at(-1)!.body.commercialBucketId, null);

    // Ordinary edits preserve the imported archived mapping through omission.
    await page.$eval('[data-testid="button-edit-allocation-assignment-1"]', node => (node as HTMLButtonElement).click());
    await page.waitForSelector('[data-testid="select-assignment-commercial-bucket"]', { visible: true });
    await page.click('[data-testid="select-assignment-commercial-bucket"]');
    await page.waitForSelector('[role="option"][data-disabled]');
    assert.equal(await page.$eval('[role="option"][data-disabled]', node => node.textContent), "Recovery (archived)");
    await page.keyboard.press("Escape");
    await saveForm(page);
    assert.equal("commercialBucketId" in writes.at(-1)!.body, false);
    assert.equal(allocations[0].commercialBucketId, "recovery");
    await page.$eval('[data-testid="button-edit-allocation-assignment-1"]', node => (node as HTMLButtonElement).click());
    await choose(page, "select-assignment-commercial-bucket", "Execution advisory");
    assert.match(await page.$eval('[role="dialog"]', node => node.textContent || ""), /You can still save/);
    await choose(page, "select-assignment-commercial-bucket", noBucket);
    await saveForm(page);
    assert.equal(writes.at(-1)!.body.commercialBucketId, null);
    assert.equal(allocations[0].plannedStartDate, "2026-08-17");
    assert.deepEqual(writes.at(-1)!.body, { commercialBucketId: null }, "bucket-only dialog edit must not send stale Planner task fields");

    // Bulk changes require explicit selection and a before/after confirmation.
    const preserved = allocations.map(({ plannedStartDate, plannedEndDate, status }) => ({ plannedStartDate, plannedEndDate, status }));
    await selectAssignments(page);
    await page.click('[data-testid="button-bulk-assignment-bucket"]');
    assert.equal(await page.$eval('[data-testid="button-review-assignment-bucket"]', node => (node as HTMLButtonElement).disabled), true);
    await choose(page, "select-bulk-assignment-commercial-bucket", "Execution advisory");
    await page.click('[data-testid="button-review-assignment-bucket"]');
    assert.match(await page.$eval('[role="dialog"]', node => node.textContent || ""), /Before.*After/s);
    failBulk = true;
    await page.click('[data-testid="button-confirm-assignment-bucket"]');
    await page.waitForFunction(() => document.querySelector('[role="dialog"] [role="alert"]')?.textContent?.includes("No mappings were saved"));
    assert.deepEqual(writes.at(-1)!.body.ids.sort(), ["assignment-1", "assignment-2"]);
    assert.equal(writes.at(-1)!.body.commercialBucketId, "advisory");
    assert.ok(allocations.every(assignment => assignment.commercialBucketId === null));
    failBulk = false;
    const retrySaved = page.waitForResponse(response =>
      response.url().endsWith(`/api/projects/${projectId}/allocations/commercial-bucket`) &&
      response.request().method() === "PUT" && response.status() === 200);
    await page.click('[data-testid="button-confirm-assignment-bucket"]');
    await retrySaved;
    await page.waitForFunction(() => !document.querySelector('[data-testid="button-confirm-assignment-bucket"]'));
    assert.ok(allocations.every(assignment => assignment.commercialBucketId === "advisory"));
    assert.deepEqual(allocations.map(({ plannedStartDate, plannedEndDate, status }) => ({ plannedStartDate, plannedEndDate, status })), preserved);

    await selectAssignments(page);
    await page.click('[data-testid="button-bulk-assignment-bucket"]');
    await choose(page, "select-bulk-assignment-commercial-bucket", noBucket);
    await page.click('[data-testid="button-review-assignment-bucket"]');
    await page.click('[data-testid="button-confirm-assignment-bucket"]');
    await page.waitForFunction(() => !document.querySelector('[data-testid="button-confirm-assignment-bucket"]'));
    assert.ok(allocations.every(assignment => assignment.commercialBucketId === null));
    assert.deepEqual(allocations.map(({ plannedStartDate, plannedEndDate, status }) => ({ plannedStartDate, plannedEndDate, status })), preserved);

    role = "pm"; // Not this project's PM.
    await openProject(page);
    await page.click('[data-testid="checkbox-allocation-assignment-1"]');
    assert.equal(await page.$('[data-testid="button-bulk-assignment-bucket"]'), null);
    role = "portfolio-manager";
    await openProject(page);
    await page.click('[data-testid="checkbox-allocation-assignment-1"]');
    assert.ok(await page.$('[data-testid="button-bulk-assignment-bucket"]'));
    assert.deepEqual(errors, []);
    console.log("assignment commercial bucket browser regression passed");
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
