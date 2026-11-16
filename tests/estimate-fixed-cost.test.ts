import { describe, it, expect } from "vitest";
import { estimateLineCost } from "../shared/estimate-cost";
import { insertEstimateLineItemSchema } from "../shared/schema";

describe("fixed estimate line cost", () => {
  it("does not multiply a fixed total by effort or cost rate", () => {
    for (const adjustedHours of ["1", "1.27", "80", "0"]) {
      expect(estimateLineCost({ fixedCostOverride: "1200.00", adjustedHours, costRate: "1200" })).toBe(1200);
    }
  });
  it("preserves zero and returns to calculated costing when cleared", () => {
    expect(estimateLineCost({ fixedCostOverride: "0", adjustedHours: "10", costRate: "20" })).toBe(0);
    expect(estimateLineCost({ fixedCostOverride: null, adjustedHours: "10", costRate: "20" })).toBe(200);
    expect(estimateLineCost({ adjustedHours: "10", costRate: "20" })).toBe(200);
  });
  it("validates partial updates including explicit clearing", () => {
    const schema = insertEstimateLineItemSchema.partial();
    for (const fixedCostOverride of ["1200.00", "0", null]) {
      expect(schema.safeParse({ fixedCostOverride }).success).toBe(true);
    }
    for (const fixedCostOverride of ["-1", "NaN", "Infinity", "12abc", "", "1.234", "100000000"]) {
      expect(schema.safeParse({ fixedCostOverride }).success).toBe(false);
    }
  });
});
