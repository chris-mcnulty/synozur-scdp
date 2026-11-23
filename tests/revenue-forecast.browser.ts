import assert from "node:assert/strict";
import { existsSync, readdirSync, mkdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import express from "express";
import { build } from "esbuild";
import puppeteer from "puppeteer";
import type { Server } from "node:http";
import { aggregateForecast, monthAt, type ForecastSource, type ForecastTiming } from "../shared/revenue-forecast";

// Isolated real UI + mock API. Never authenticates against the real application,
// changes commercial records, or calls HubSpot.
const bundle = await build({
  stdin: {
    contents: `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
      import { RevenueForecastView } from "./client/src/components/forecast/revenue-forecast-view";
      const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
      client.setQueryData(["/api/auth/user"], {id:"test-user",role:"billing-admin",primaryTenantId:"test-tenant"});
      createRoot(document.getElementById("root")).render(<QueryClientProvider client={client}><RevenueForecastView /></QueryClientProvider>);
    `, resolveDir: process.cwd(), loader: "tsx",
  },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  alias: { "@": `${process.cwd()}/client/src`, "@shared": `${process.cwd()}/shared` },
});
// Build the actual application styles for a realistic isolated rendering.
mkdirSync("generated-artifacts/forecast", { recursive: true });
execFileSync("node_modules/.bin/tailwindcss", ["-i", "client/src/index.css", "-o", "generated-artifacts/forecast/test.css"], { stdio: "pipe" });
const start = new Date().toISOString().slice(0, 7);
let mode = "connected";
let assumption: ForecastTiming | null = null;
let failSave = false;
let lastQuery = "";
const writes: any[] = [];
const sources = (): ForecastSource[] => [
  { key: "sow:contract", kind: "sow", id: "contract", name: "Committed consulting", clientId: "c1", clientName: "North client",
    currency: "USD", amount: 12000, sourceAmount: 12000, bucket: "committed", probability: 1,
    bookingMonth: start, deliveryStart: start, deliveryEnd: monthAt(start, 2), excludedReason: null,
    warnings: [], timingBasis: "Even allocation over signed service months", href: "/projects/p1" },
  { key: "deal:opportunity", kind: "deal", id: "opportunity", name: "Strategy opportunity", clientId: "c2", clientName: "South client",
    currency: "EUR", amount: assumption?.serviceAmount ?? 10000, sourceAmount: 10000, bucket: "pipeline", probability: .5,
    bookingMonth: start, deliveryStart: assumption?.deliveryStart ?? null, deliveryEnd: assumption?.deliveryEnd ?? null,
    excludedReason: assumption ? null : "Service-only CRM amount not confirmed", warnings: ["Confirm services, excluding pass-through expenses."],
    timingBasis: assumption ? "Saved forecast assumption" : "Close month is bookings only", href: "/crm/deals",
    ...(assumption ? { assumption: { ...assumption, updatedAt: new Date().toISOString(), updatedBy: "Test reviewer" } } : {}),
  },
];
const app = express();
app.use(express.json());
app.get("/", (_req, res) => res.type("html").send('<html><head><link rel="stylesheet" href="/test.css"></head><body><div id="root"></div><script src="/test.js"></script></body></html>'));
app.get("/test.js", (_req, res) => res.type("js").send(bundle.outputFiles[0].text));
app.get("/test.css", (_req, res) => res.type("css").send(readFileSync("generated-artifacts/forecast/test.css", "utf8")));
app.use("/fonts", express.static("client/public/fonts"));
app.get("/api/analytics/revenue-forecast", (req, res) => {
  lastQuery = req.originalUrl;
  if (mode === "error") return res.status(503).json({ message: "Synthetic forecast load failure" });
  const rows = mode === "empty" ? [] : sources();
  res.json({
    ...aggregateForecast(rows, String(req.query.start), String(req.query.end), req.query.clientId as string | undefined),
    clients: [{ id: "c1", name: "North client" }, { id: "c2", name: "South client" }],
    refreshedAt: new Date().toISOString(),
    crm: { status: mode === "disconnected" ? "disconnected" : "connected", message: mode === "disconnected" ? "Pipeline is unavailable, not zero." : "Live CRM", fetchedAt: mode === "disconnected" ? null : new Date().toISOString() },
  });
});
app.put("/api/analytics/revenue-forecast/assumptions/:kind/:id", (req, res) => {
  if (failSave) return res.status(503).json({ message: "Synthetic save failure" });
  writes.push(req.body);
  assumption = req.body;
  res.json({ id: "saved", ...req.body });
});
app.delete("/api/analytics/revenue-forecast/assumptions/:kind/:id", (_req, res) => { assumption = null; res.status(204).end(); });
const server = await new Promise<Server>(resolve => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
const origin = `http://127.0.0.1:${(server.address() as any).port}`;
const candidates = readdirSync("/nix/store").filter(name => /^.{32}-chromium-\d/.test(name) && existsSync(`/nix/store/${name}/bin/chromium`));
const chromium = process.env.PUPPETEER_EXECUTABLE_PATH || `/nix/store/${candidates.find(name => name.includes("-chromium-131.")) || candidates[0]}/bin/chromium`;
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
const errors: string[] = [];
try {
  browser = await puppeteer.launch({ executablePath: chromium, headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  page.on("pageerror", error => errors.push(String(error)));
  await page.setViewport({ width: 1440, height: 1100 });
  await page.goto(origin);
  await page.waitForSelector('[data-source-key="deal:opportunity"]');
  assert.ok((await page.content()).includes("12,000.00"));
  const deal = '[data-source-key="deal:opportunity"]';
  await page.click(`${deal} > button`);
  await page.waitForSelector(`${deal} textarea`);
  const clickText = async (text: string) => {
    const buttons = await page.$$("button");
    for (const button of buttons) {
      if ((await button.evaluate(el => el.textContent))?.trim() === text) { await button.click(); return; }
    }
    throw new Error(`Button not found: ${text}`);
  };
  const fill = async (selector: string, value: string) => {
    await page.$eval(selector, (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!;
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
  };
  await clickText("Save assumption");
  await page.waitForFunction(() => document.body.innerText.includes("Confirm the service-only amount"));
  assert.equal(writes.length, 0);
  await fill(`${deal} input[type="month"]:nth-of-type(1)`, start);
  const months = await page.$$(`${deal} input[type="month"]`);
  await months[1].evaluate((el, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, monthAt(start, 1));
  await fill(`${deal} input[type="number"]`, "8000");
  await fill(`${deal} textarea`, "Exclude 2000 travel; deliver over two service months");
  failSave = true;
  await clickText("Save assumption");
  await page.waitForFunction(() => document.body.innerText.includes("Synthetic save failure"));
  assert.equal(writes.length, 0);
  failSave = false;
  await clickText("Save assumption");
  await page.waitForFunction(() => document.body.innerText.includes("Saved and refreshed"));
  assert.equal(writes[0].serviceAmount, 8000);
  assert.equal(writes[0].deliveryEnd, monthAt(start, 1));
  await page.reload();
  await page.waitForSelector(deal);
  await page.click(`${deal} > button`);
  await page.waitForSelector(`${deal} textarea`);
  assert.equal(await page.$eval(`${deal} input[type="number"]`, el => (el as HTMLInputElement).value), "8000");
  mkdirSync("generated-artifacts/forecast", { recursive: true });
  await page.screenshot({ path: "generated-artifacts/forecast/desktop.jpg", fullPage: true });
  await clickText("Reset to source");
  await page.waitForFunction(() => document.body.innerText.includes("Service-only CRM amount not confirmed"));
  assert.equal(assumption, null);
  // Client filtering is sent to the API and only its sources remain visible.
  await page.click('[role="combobox"]');
  await page.waitForSelector('[role="option"]');
  const options = await page.$$('[role="option"]');
  for (const option of options) if ((await option.evaluate(el => el.textContent))?.includes("North client")) await option.click();
  await page.waitForFunction(() => !document.querySelector('[data-source-key="deal:opportunity"]'));
  assert.ok(lastQuery.includes("clientId=c1"));
  await page.setViewport({ width: 390, height: 844 });
  await page.screenshot({ path: "generated-artifacts/forecast/mobile.jpg", fullPage: true });
  mode = "disconnected";
  await clickText("Refresh sources");
  await page.waitForFunction(() => document.body.innerText.includes("Pipeline is unavailable, not zero"));
  mode = "error";
  await clickText("Refresh sources");
  await page.waitForFunction(() => document.body.innerText.includes("Forecast could not be loaded"));
  mode = "empty";
  await clickText("Retry");
  await page.waitForFunction(() => document.body.innerText.includes("No source records found"));
  assert.deepEqual(errors, []);
  console.log("Forecast browser checks passed: arithmetic display, missing amount validation, save failure, save/reload/reset, client filtering, desktop/mobile, disconnected/error/empty states.");
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
