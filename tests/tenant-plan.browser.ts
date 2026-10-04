import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import puppeteer from "puppeteer";

// Run against a running dev server. Every API call is intercepted: no writes
// reach the real database, and authentication remains unchanged in the app.
const origin = process.env.TEST_APP_ORIGIN || "http://127.0.0.1:5000";
const browserPaths = readdirSync("/nix/store")
  .filter((name) => /^.{32}-chromium-\d/.test(name) && existsSync(`/nix/store/${name}/bin/chromium`))
  .sort((a, b) => Number(b.match(/-chromium-(\d+)/)?.[1]) - Number(a.match(/-chromium-(\d+)/)?.[1]))
  .map((name) => `/nix/store/${name}/bin/chromium`)[0];
const chromium = process.env.PUPPETEER_EXECUTABLE_PATH
  || readdirSync("/nix/store").filter((name) => /^.{32}-chromium-131\./.test(name))
    .map((name) => `/nix/store/${name}/bin/chromium`).find((path) => existsSync(path))
  || browserPaths;
assert.ok(chromium, "Environment Chromium is required");

let tenant = {
  id: "plan-tenant", name: "Plan Test Organization", slug: "plan-test",
  allowedDomains: [], servicePlanId: "enterprise", planStatus: "expired",
  planExpiresAt: "2026-04-16T17:24:13.589Z", defaultTimezone: "America/Chicago",
  enforceSso: false, allowLocalAuth: true, createdAt: "2026-02-15T00:00:00.000Z",
};
const patches: Record<string, unknown>[] = [];
let rejectSave = false;
let platformAdmin = true;
const failures: string[] = [];
const browser = await puppeteer.launch({
  executablePath: chromium, headless: true, timeout: 20_000,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 402, height: 874 });
  page.on("pageerror", (error) => failures.push(String(error)));
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const handle = async () => {
      const url = new URL(request.url());
      if (url.origin !== origin || !url.pathname.startsWith("/api/")) return request.continue();
      const path = url.pathname;
      const json = (body: unknown, status = 200) => request.respond({
        status, contentType: "application/json", body: JSON.stringify(body),
      });
      if (path === "/api/auth/user") return json({
        id: "admin-1", name: "Plan Admin", email: "admin@example.test", role: "admin",
        platformRole: platformAdmin ? "global_admin" : "user", tenantId: tenant.id,
      });
      if (path === "/api/auth/tenants") return json({
        activeTenantId: tenant.id, tenants: [{ ...tenant, role: "admin", isActive: true }],
      });
      if (path === "/api/platform/tenants") return json([tenant]);
      if (path === `/api/platform/tenants/${tenant.id}` && request.method() === "PATCH") {
        const payload = JSON.parse(request.postData() || "{}");
        patches.push(payload);
        if (rejectSave) return json({ error: "Simulated update failure" }, 503);
        tenant = { ...tenant, ...payload };
        return json(tenant);
      }
      if (path === "/api/platform/service-plans") return json([
        { id: "enterprise", internalName: "enterprise", displayName: "Enterprise", planType: "enterprise" },
      ]);
      if (path === "/api/tenant/plan-status") return json({
        status: tenant.planStatus, planType: "enterprise", planName: "Enterprise",
        daysRemaining: null, isGracePeriod: false, expiresAt: tenant.planExpiresAt,
      });
      if (path === "/api/tenant/settings") return json({});
      if (path === "/api/notifications") return json({ notifications: [], unreadCount: 0 });
      if (path === "/api/changelog/whats-new") return json({ showModal: false });
      if (path === "/api/ai/status") return json({ enabled: false });
      if (path === "/api/analytics/pageview") return json({ ok: true });
      if (["/api/projects", "/api/clients", "/api/users"].includes(path)) return json([]);
      if (!platformAdmin) return json({ error: "Access denied" }, 403);
      failures.push(`Unhandled API: ${request.method()} ${path}`);
      return json({ error: "Unhandled test API" }, 404);
    };
    void handle().catch((error) => failures.push(String(error)));
  });
  const edit = async () => {
    await page.waitForSelector('[data-testid="button-edit-tenant-plan-tenant"]');
    await page.click('[data-testid="button-edit-tenant-plan-tenant"]');
    await page.waitForSelector('[data-testid="input-tenant-plan-expiration"]');
  };
  const save = async () => {
    const response = page.waitForResponse((r) =>
      new URL(r.url()).pathname === `/api/platform/tenants/${tenant.id}` && r.request().method() === "PATCH");
    // If clicking fails, don't let this pending wait hide the original error
    // when the browser closes during cleanup.
    void response.catch(() => {});
    await page.evaluate(() => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
        .find((item) => item.textContent === "Save Changes");
      if (!button) throw new Error("Save Changes button missing");
      button.click();
    });
    await response;
  };
  await page.goto(`${origin}/platform/tenants`, { waitUntil: "networkidle0" });
  console.log("tenant plan page loaded");
  await edit();
  assert.equal(await page.$eval('[data-testid="input-tenant-plan-expiration"]', (el) => (el as HTMLInputElement).value), "2026-04-16");
  await save();
  console.log("unchanged plan saved");
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.equal(patches[0].planStatus, "expired");
  assert.equal(patches[0].planExpiresAt, "2026-04-16T17:24:13.589Z", "unrelated save preserves precision");

  await edit();
  await page.click('[data-testid="select-tenant-plan-status"]');
  await page.waitForSelector('[role="option"]');
  await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[role="option"]')]
    .find((el) => el.textContent === "Active")?.click());
  await page.click('[data-testid="button-clear-tenant-plan-expiration"]');
  await save();
  console.log("plan restored and expiration cleared");
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.equal(patches[1].planStatus, "active");
  assert.equal(patches[1].planExpiresAt, null);
  await page.waitForFunction(() => !document.body.innerText.includes("plan has expired"));

  await page.reload({ waitUntil: "networkidle0" });
  await edit();
  await page.screenshot({ path: "/tmp/tenant-plan-mobile.png" });
  assert.equal(await page.$eval('[data-testid="input-tenant-plan-expiration"]', (el) => (el as HTMLInputElement).value), "");
  await page.$eval('[data-testid="input-tenant-plan-expiration"]', (el) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(el, "2027-04-16");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  rejectSave = true;
  await save();
  console.log("failed save surfaced");
  await page.waitForFunction(() => document.body.innerText.includes("Simulated update failure"));
  assert.ok(await page.$('[role="dialog"]'), "failed save keeps editor open");
  assert.equal(tenant.planExpiresAt, null);
  rejectSave = false;
  await save();
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.equal(tenant.planExpiresAt, "2027-04-16T23:59:59.999Z");
  assert.equal(patches.length, 4);
  console.log("renewal saved after retry");
  assert.deepEqual(failures, []);

  platformAdmin = false;
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForFunction(() => location.pathname === "/dashboard");
  assert.equal(await page.$('[data-testid="select-tenant-plan-status"]'), null);
  console.log("tenant plan browser regression passed (mobile edit, save, reload, failure, role protection)");
} catch (error) {
  console.error("Tenant plan browser failure:", error, "Page errors:", failures);
  throw error;
} finally {
  await browser.close();
}