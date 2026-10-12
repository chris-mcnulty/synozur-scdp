import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import puppeteer from "puppeteer";

const origin = process.env.TEST_APP_ORIGIN || "http://127.0.0.1:5000";
// Check the built assets, not just the dev-server routes, so publishing cannot
// silently drop the guides again. Run npm run build first.
for (const guide of ["SCDP-User-Guide.md", "SCDP-Administrator-Guide.md"]) {
  const expected = readFileSync(`docs/user-guide/${guide}`, "utf8");
  for (const prefix of ["docs/user-guide", "user-guide"]) {
    assert.equal(readFileSync(`dist/public/${prefix}/${guide}`, "utf8"), expected);
    const response = await fetch(`${origin}/${prefix}/${guide}`, { signal: AbortSignal.timeout(15_000) });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/markdown/);
    assert.equal(await response.text(), expected);
  }
}
for (const file of ["docs/USER_GUIDE.md", "client/public/docs/USER_GUIDE.md", "client/public/USER_GUIDE.md"]) {
  const content = readFileSync(file, "utf8");
  assert.ok(content.includes("](/docs/user-guide/SCDP-User-Guide.md)"));
  assert.ok(content.includes("](/docs/user-guide/SCDP-Administrator-Guide.md)"));
  assert.ok(!content.includes("](user-guide/"));
}
console.log("Built documentation assets, guide URLs and links passed.");

const browsers = readdirSync("/nix/store")
  .filter((name) => /^.{32}-chromium-\d/.test(name))
  .sort((a, b) => Number(a.includes("-chromium-131.")) - Number(b.includes("-chromium-131.")))
  .reverse()
  .map((name) => `/nix/store/${name}/bin/chromium`);
const chromium = process.env.PUPPETEER_EXECUTABLE_PATH || browsers.find(existsSync);
assert.ok(chromium, "Environment Chromium is required");
const browser = await puppeteer.launch({
  executablePath: chromium, headless: true, timeout: 20_000,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
});
const failures: string[] = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => failures.push(String(error)));
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const handle = async () => {
      const url = new URL(request.url());
      if (url.origin !== origin || !url.pathname.startsWith("/api/")) return request.continue();
      const json = (body: unknown) => request.respond({
        status: 200, contentType: "application/json", body: JSON.stringify(body),
      });
      const path = url.pathname;
      if (path === "/api/auth/user") return json({
        id: "guide-user", name: "Guide User", email: "guide@example.test",
        role: "admin", platformRole: "global_admin", tenantId: "guide-tenant",
      });
      if (path === "/api/auth/tenants") return json({
        activeTenantId: "guide-tenant",
        tenants: [{ id: "guide-tenant", name: "Guide Test", role: "admin", isActive: true }],
      });
      if (path === "/api/settings") return json([]);
      if (path === "/api/environment") return json({
        environment: "Development", isProduction: false, nodeEnv: "development", replitDeployment: "",
      });
      if (path === "/api/tenant/plan-status") return json({
        status: "active", planType: "enterprise", planName: "Enterprise",
        daysRemaining: null, isGracePeriod: false, expiresAt: null,
      });
      if (path === "/api/tenant/settings") return json({});
      if (path === "/api/notifications") return json({ notifications: [], unreadCount: 0 });
      if (path === "/api/changelog/whats-new") return json({ showModal: false });
      if (path === "/api/ai/status") return json({ enabled: false });
      if (path === "/api/analytics/pageview") return json({ ok: true });
      if (["/api/projects", "/api/clients", "/api/users"].includes(path)) return json([]);
      failures.push(`Unhandled API: ${path}`);
      return json({ error: "Unhandled test API" });
    };
    void handle().catch((error) => failures.push(String(error)));
  });
  await page.setViewport({ width: 402, height: 874, isMobile: true, hasTouch: true });
  await page.goto(`${origin}/about`, { waitUntil: "networkidle0" });
  const trigger = '[data-testid="button-scdp-easter-egg"]';
  await page.waitForSelector(trigger);
  await page.tap(trigger);
  await page.waitForFunction(() => document.querySelector('[role="tooltip"]')?.textContent?.includes("Sterling Cooper Draper Pryce"));
  console.log("Mobile tap revealed the Easter egg.");
  await page.screenshot({ path: "/tmp/scdp-easter-egg-mobile.png" });
  await page.keyboard.press("Escape");
  await page.waitForSelector('[role="tooltip"]', { hidden: true });

  await page.setViewport({ width: 1280, height: 900, isMobile: false, hasTouch: false });
  await page.goto(`${origin}/about`, { waitUntil: "networkidle0" });
  await page.waitForSelector(trigger);
  await page.hover(trigger);
  await page.waitForSelector('[role="tooltip"]', { visible: true });
  await page.keyboard.press("Escape");
  await page.waitForSelector('[role="tooltip"]', { hidden: true });
  await page.mouse.move(0, 0);
  await page.focus(trigger);
  await page.keyboard.press("Enter");
  await page.waitForSelector('[role="tooltip"]', { visible: true });
  await page.keyboard.press("Escape");
  await page.waitForSelector('[role="tooltip"]', { hidden: true });
  assert.deepEqual(failures, []);
  console.log("Documentation regression passed: built guides, dev URLs, mobile tap, desktop hover, keyboard and Escape.");
} finally {
  await browser.close();
}
