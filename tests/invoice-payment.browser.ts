import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import express from "express";
import { build } from "esbuild";
import puppeteer from "puppeteer";
import type { Server } from "node:http";
import { paymentFixtures } from "./invoice-payment-fixtures";
import { calculateInvoiceTotals } from "../shared/invoice-totals";

// Isolated real-component harness: no app auth bypass and no real database writes.
// Keep the dialog mounted to exercise reset-on-open and changing invoice identity.
const bundle = await build({
  stdin: {
    contents: `
      import React, { useState } from "react";
      import { createRoot } from "react-dom/client";
      import { QueryClientProvider } from "@tanstack/react-query";
      import { queryClient } from "./client/src/lib/queryClient";
      import { PaymentStatusDialog } from "./client/src/components/billing/payment-status-dialog";
      function Harness() {
        const [batch, setBatch] = useState(null);
        const [open, setOpen] = useState(false);
        window.showBatch = (value) => { setBatch(value); setOpen(true); };
        window.setOpen = setOpen;
        return <QueryClientProvider client={queryClient}>
          {batch && <PaymentStatusDialog open={open} onClose={() => setOpen(false)} batch={batch} />}
        </QueryClientProvider>;
      }
      createRoot(document.getElementById("root")).render(<Harness />);
    `,
    resolveDir: process.cwd(), loader: "tsx",
  },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  alias: { "@": `${process.cwd()}/client/src`, "@shared": `${process.cwd()}/shared` },
});
const receipts: Record<string, any> = {};
const patches: any[] = [];
let rejectSave = false;
const app = express();
app.use(express.json());
app.get("/", (_req, res) => res.type("html").send('<div id="root"></div><script src="/test.js"></script>'));
app.get("/test.js", (_req, res) => res.type("js").send(bundle.outputFiles[0].text));
app.patch("/api/invoice-batches/:id/payment-status", (req, res) => {
  patches.push({ batchId: req.params.id, ...req.body });
  if (rejectSave) return res.status(503).json({ message: "Synthetic save failure" });
  receipts[req.params.id] = { batchId: req.params.id, ...req.body };
  res.json(receipts[req.params.id]);
});
const server = await new Promise<Server>(resolve => {
  const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
});
const origin = `http://127.0.0.1:${(server.address() as any).port}`;
const candidates = readdirSync("/nix/store")
  .filter(name => /^.{32}-chromium-\d/.test(name) && existsSync(`/nix/store/${name}/bin/chromium`));
const chromium = process.env.PUPPETEER_EXECUTABLE_PATH ||
  `/nix/store/${candidates.find(name => name.includes("-chromium-131.")) || candidates[0]}/bin/chromium`;
let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
const errors: string[] = [];
try {
  browser = await puppeteer.launch({
    executablePath: chromium, headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto(origin, { waitUntil: "networkidle0" });
  await page.waitForFunction(() => typeof (window as any).showBatch === "function");
  const show = async (batch: any) => {
    await page.evaluate(value => (window as any).showBatch(value), batch);
    await page.waitForSelector('[role="dialog"]');
    await page.waitForFunction(id => document.querySelector('[role="dialog"] code')?.textContent === id, {}, batch.batchId);
  };
  const amount = () => page.$eval<HTMLInputElement, []>('[data-testid="input-payment-amount"]', el => el.value);
  const fill = async (selector: string, value: string) => {
    await page.$eval(selector, (element, input) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(element, input);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
  };
  const save = async () => {
    await page.click('[data-testid="button-update-payment"]');
    await page.waitForSelector('[role="dialog"]', { hidden: true });
  };
  for (const [index, fixture] of paymentFixtures.entries()) {
    const totals = calculateInvoiceTotals(fixture, "taxableSubtotal" in fixture ? fixture.taxableSubtotal : undefined);
    const batch = {
      ...fixture, taxAmount: totals.tax, batchId: `SYNTHETIC-${index}`, totalAmount: Number(fixture.totalAmount),
      status: "finalized", paymentStatus: "unpaid",
    };
    await show(batch);
    const breakdown = await page.$eval('[data-testid="invoice-payment-breakdown"]', el => el.textContent || "");
    assert.ok(breakdown.includes("Subtotal") && breakdown.includes("Tax") && breakdown.includes("Total including tax"));
    if (totals.discount) assert.ok(breakdown.includes("Discount"));
    await page.click('label[for="paid"]');
    assert.equal(await amount(), fixture.gross.toFixed(2), fixture.name);
    await fill('[data-testid="input-payment-date"]', "2025-08-17");
    await save();
    assert.equal(receipts[batch.batchId].paymentAmount, fixture.gross.toFixed(2));
    assert.equal(receipts[batch.batchId].paymentDate, "2025-08-17");
    await show({ ...batch, ...receipts[batch.batchId] });
    assert.equal(await amount(), fixture.gross.toFixed(2));
    assert.equal(await page.$eval<HTMLInputElement, []>('[data-testid="input-payment-date"]', el => el.value), "2025-08-17");
    await page.click('[data-testid="button-cancel-payment"]');
  }

  const base = { batchId: "PARTIAL", totalAmount: 1000, taxAmount: 100, status: "finalized", paymentStatus: "unpaid" };
  // Amount defaults must work on opening the payment form, not only when
  // changing a radio selection. Saved receipt amounts must never be inferred away.
  for (const paymentStatus of ["paid", "partial"]) {
    for (const paymentAmount of [undefined, null, ""]) {
      await show({ ...base, batchId: `EMPTY-${paymentStatus}-${String(paymentAmount)}`, paymentStatus, paymentAmount });
      assert.equal(await amount(), "1100.00", `${paymentStatus}: missing amount defaults to tax-inclusive total`);
      assert.equal(await page.$('[role="status"]'), null, "An absent receipt amount is not reported as recorded zero cash");
      await page.click('[data-testid="button-cancel-payment"]');
    }
  }
  for (const paymentAmount of ["300.00", "0.00"]) {
    await show({ ...base, batchId: `RECORDED-${paymentAmount}`, paymentStatus: "paid", paymentAmount });
    assert.equal(await amount(), paymentAmount, "Opening a recorded receipt preserves its cash amount");
    await page.click('[data-testid="button-cancel-payment"]');
  }
  await show({ ...base, batchId: "NEW-PARTIAL" });
  await page.click('label[for="partial"]');
  assert.equal(await amount(), "1100.00", "A new payment defaults to the full gross amount");
  await fill('[data-testid="input-payment-amount"]', "");
  await page.click('label[for="paid"]');
  assert.equal(await amount(), "1100.00", "Selecting paid fills a deliberately cleared amount");
  await fill('[data-testid="input-payment-amount"]', "987.65");
  await page.click('label[for="partial"]');
  await page.click('label[for="paid"]');
  assert.equal(await amount(), "987.65", "A nonempty deliberate amount is preserved");
  await page.click('[data-testid="button-cancel-payment"]');

  await show(base);
  await page.click('label[for="partial"]');
  await fill('[data-testid="input-payment-amount"]', "501.23");
  await fill('[data-testid="input-payment-date"]', "2024-02-29");
  await page.click('label[for="paid"]');
  assert.equal(await amount(), "501.23", "A deliberate amount is not overwritten by status changes");
  rejectSave = true;
  await page.click('[data-testid="button-update-payment"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="button-update-payment"]')?.textContent?.includes("Update Payment Status"));
  assert.equal(await amount(), "501.23", "Failed save preserves input");
  rejectSave = false;
  await save();
  await show({ ...base, ...receipts.PARTIAL });
  assert.equal(await amount(), "501.23");
  assert.ok(await page.$('[role="status"]'), "Historical mismatch is identified, never rewritten");
  await page.click('label[for="partial"]');
  await save();
  assert.equal(receipts.PARTIAL.paymentStatus, "partial");
  assert.equal(receipts.PARTIAL.paymentAmount, "501.23");

  await show({ ...base, ...receipts.PARTIAL });
  await fill('[data-testid="input-payment-amount"]', "777");
  await show({ ...base, batchId: "OTHER", totalAmount: 200, taxAmount: 0 });
  await page.waitForSelector('#unpaid[data-state="checked"]');
  assert.equal(await page.$('[data-testid="input-payment-amount"]'), null, "Another invoice starts unpaid");
  await page.click('label[for="paid"]');
  assert.equal(await amount(), "200.00");
  await page.click('[data-testid="button-cancel-payment"]');

  await show({ ...base, ...receipts.PARTIAL });
  assert.equal(await amount(), "501.23");
  await fill('[data-testid="input-payment-amount"]', "888");
  await page.click('[data-testid="button-cancel-payment"]');
  await show({ ...base, ...receipts.PARTIAL });
  assert.equal(await amount(), "501.23", "Reopening discards unsaved edits");
  assert.equal(await page.$eval<HTMLInputElement, []>('[data-testid="input-payment-date"]', el => el.value), "2024-02-29");
  assert.deepEqual(errors, []);
  console.log(`Invoice payment browser regression passed (${paymentFixtures.length} gross fixtures, empty paid/partial defaults, saved receipt preservation, cleared fields, save/reopen, explicit amount/date, partial, failure, batch switching).`);
} catch (error) {
  console.error("Invoice payment browser failure:", error, "Page errors:", errors);
  throw error;
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
