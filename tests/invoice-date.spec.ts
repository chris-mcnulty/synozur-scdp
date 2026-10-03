import fs from "node:fs";
import { describe, expect, it } from "./_harness.js";

const storage = fs.readFileSync(
  new URL("../server/storage/invoicing.ts", import.meta.url), "utf8",
);
const finalize = storage.slice(
  storage.indexOf("async finalizeBatch("),
  storage.indexOf("async reviewBatch("),
);
const unfinalize = storage.slice(
  storage.indexOf("async unfinalizeBatch("),
  storage.indexOf("async updateBatchAsOfDate("),
);

describe("invoice date lifecycle", () => {
  it("preserves the current database date, using today only for an unset date", () => {
    expect(finalize).toContain("asOfDate: sql`COALESCE(${invoiceBatches.asOfDate}, CURRENT_DATE)`");
    expect(finalize.includes("asOfDate: sql`CURRENT_DATE`")).toBe(false);
    // Referencing the column, not the earlier SELECT snapshot, also preserves
    // a date saved while finalization is underway.
    expect(finalize.includes("asOfDate: batch.asOfDate")).toBe(false);
  });

  it("keeps the actual finalization timestamp separate from the invoice date", () => {
    expect(finalize).toContain("finalizedAt: sql`now()`");
    expect(finalize).toContain("finalizedBy: userId");
    expect(finalize.includes("asOfDateUpdatedAt:")).toBe(false);
    expect(finalize.includes("asOfDateUpdatedBy:")).toBe(false);
  });

  it("does not clear the chosen date when reopening an invoice", () => {
    expect(unfinalize).toContain("finalizedAt: null");
    expect(unfinalize.includes("asOfDate:")).toBe(false);
  });
});