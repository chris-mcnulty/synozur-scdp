import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import express from "express";
import type { Server } from "node:http";
import puppeteer from "puppeteer";
import { build } from "esbuild";
import { buildIntelligenceReview, type IntelligenceEstimate, type IntelligenceHistory } from "../server/services/estimate-intelligence-engine";

// Isolated real-component harness; never signs in, bypasses app auth, writes to
// the database, or calls an AI provider. All business data below is synthetic.
const base: IntelligenceEstimate = {
  id: "estimate", name: "Data platform migration", clientId: "client", estimateType: "detailed", costCurrency: "USD",
  lines: [{ description: "Build migration", adjustedHours: "100", costRate: "50", isSalaried: false }],
};
const history: IntelligenceHistory[] = ["A", "B", "C"].map(projectId => ({
  projectId, projectName: `Example migration ${projectId}`, clientId: "client", costCurrency: "USD",
  baseline: "Approved snapshot v1", estimate: { ...base, id: `baseline-${projectId}`, lines: [
    { description: "Migration build and testing QA", adjustedHours: "100", fixedCostOverride: "5000", isSalaried: false },
  ] }, limitations: [],
  actuals: [{ hours: "125", actualCostAmount: "6250", costRate: "50", isSalaried: false, submissionStatus: "approved" }],
}));
const full = buildIntelligenceReview(base, history, true);
const hidden = buildIntelligenceReview(base, history, false);
const sparse = buildIntelligenceReview(base, [{ ...history[0], actuals: [] }], false);
const bundle = await build({
  stdin: {
    contents: `
      import React, { useState } from "react";
      import { createRoot } from "react-dom/client";
      import { EstimateIntelligencePanel } from "./client/src/components/estimates/estimate-intelligence-panel";
      function Harness() {
        const [context, setContext] = useState({ id: "full", tenant: "one", role: "admin" });
        window.showContext = (id, tenant = "one", role = "admin") => setContext({ id, tenant, role });
        return <main style={{maxWidth:1100, margin:"32px auto", padding:"16px"}}>
          <EstimateIntelligencePanel key={context.id + context.tenant + context.role} estimateId={context.id} />
        </main>;
      }
      createRoot(document.getElementById("root")).render(<Harness />);
    `, resolveDir: process.cwd(), loader: "tsx",
  },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  alias: { "@": `${process.cwd()}/client/src`, "@shared": `${process.cwd()}/shared` },
});
const css = execFileSync("node_modules/.bin/tailwindcss", [
  "-i", "client/src/index.css", "--content", "client/src/components/estimates/estimate-intelligence-panel.tsx", "--minify",
], { encoding: "utf8", maxBuffer: 4_000_000, stdio: ["ignore", "pipe", "pipe"] });
const requests: Array<{ id: string; body: any }> = [];
let rejectNext = false;
const app = express();
app.use(express.json());
app.use("/fonts", express.static("client/public/fonts"));
app.get("/", (_req, res) => res.type("html").send('<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/test.js"></script>'));
app.get("/test.js", (_req, res) => res.type("js").send(bundle.outputFiles[0].text));
app.get("/style.css", (_req, res) => res.type("css").send(css));
app.post("/api/estimates/:id/intelligence", async (req, res) => {
  requests.push({ id: req.params.id, body: req.body });
  if (rejectNext) { rejectNext = false; return res.status(503).json({ message: "Synthetic evidence outage" }); }
  if (req.params.id === "slow") await new Promise(resolve => setTimeout(resolve, 800));
  if (req.params.id === "sparse") return res.json(sparse);
  if (req.params.id === "hidden") return res.json(hidden);
  if (req.params.id === "malicious") return res.json({ ...hidden, comparables: [
    { ...hidden.comparables[0], projectName: "<img src=x onerror=alert(1)>", projectUrl: "javascript:alert(1)" },
  ] });
  return res.json(full);
});
const server = await new Promise<Server>(resolve => {
  const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
});
const origin = `http://127.0.0.1:${(server.address() as any).port}`;
const candidates = readdirSync("/nix/store").filter(name =>
  /^.{32}-chromium-\d/.test(name) && existsSync(`/nix/store/${name}/bin/chromium`));
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH ||
  `/nix/store/${candidates.find(name => name.includes("-chromium-131.")) || candidates[0]}/bin/chromium`;
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
try {
  browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.setViewport({ width: 1280, height: 1000 });
  await page.goto(origin, { waitUntil: "networkidle0" });
  const text = () => page.evaluate(() => document.body.innerText);
  const click = (label: string) => page.evaluate(label => {
    const button = [...document.querySelectorAll("button")].find(b => b.innerText.trim() === label);
    if (!button) throw new Error(`Button not found: ${label}`);
    button.click();
  }, label);
  const waitText = (value: string) => page.waitForFunction(value => document.body.innerText.includes(value), {}, value);
  const open = async (id: string, tenant = "one", role = "admin") => {
    await page.evaluate((id, tenant, role) => (window as any).showContext(id, tenant, role), id, tenant, role);
    await waitText("Open intelligence review");
    await click("Open intelligence review");
    await waitText("Review historical evidence");
  };
  assert.equal(requests.length, 0, "opening the estimate must not request history automatically");
  await click("Open intelligence review");
  assert.equal(requests.length, 0, "opening the panel must not request history automatically");
  await click("Review historical evidence");
  await waitText("Historical evidence available");
  assert.match(await text(), /3 usable effort comparisons/);
  assert.match(await text(), /25%/);
  assert.match(await text(), /Time-linked service cost/);
  assert.match(await text(), /testing \/ QA coverage/);
  assert.ok(await page.$('a[href="/projects/A"]'));
  assert.ok(await page.$('a[href="/estimates/baseline-A"]'));
  assert.deepEqual(requests[0], { id: "full", body: {} });
  mkdirSync("generated-artifacts", { recursive: true });
  await page.screenshot({ path: "generated-artifacts/estimate-intelligence-desktop.png", fullPage: true });

  await page.setViewport({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "phone layout must not overflow");
  await page.screenshot({ path: "generated-artifacts/estimate-intelligence-mobile.png", fullPage: true });
  await open("hidden");
  await click("Review historical evidence");
  await waitText("Historical evidence available");
  assert.ok(!(await text()).includes("Time-linked service cost"));
  assert.ok(!(await text()).includes("6,250"));

  await open("sparse");
  await click("Review historical evidence");
  await waitText("Not enough comparable evidence");
  assert.match(await text(), /Not available/);
  assert.match(await text(), /0 usable effort comparisons/);

  await open("retry");
  rejectNext = true;
  await click("Review historical evidence");
  await waitText("Synthetic evidence outage");
  assert.ok(await page.$('[role="alert"]'));
  await click("Retry");
  await waitText("Historical evidence available");

  await open("slow");
  await click("Review historical evidence");
  await page.waitForSelector('[role="status"]');
  await open("next", "two", "pm");
  await new Promise(resolve => setTimeout(resolve, 1000));
  assert.ok(!(await text()).includes("Example migration"), "a late old-tenant response must not render");
  await open("full", "one", "admin");
  await click("Review historical evidence");
  await waitText("Historical evidence available");
  await open("full", "one", "pm");
  assert.ok(!(await text()).includes("6,250"), "role changes must clear privileged evidence");

  await open("malicious");
  await click("Review historical evidence");
  await waitText("<img src=x onerror=alert(1)>");
  assert.equal(await page.$('img[src="x"]'), null);
  assert.equal(await page.$('a[href^="javascript:"]'), null);
  assert.deepEqual(errors, []);
  console.log("PASS: real estimate panel — on-demand review, evidence links, exact metrics, cost hiding, sparse evidence, retry, tenant/role resets, safe text, and responsive layouts.");
} finally {
  await browser?.close();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
