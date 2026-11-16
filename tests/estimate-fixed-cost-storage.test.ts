import { describe, it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({ current: {} as any, saved: {} as any }));
vi.mock("../server/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => [state.current] }) }),
    update: () => ({ set: (value: any) => {
      state.saved = value;
      return { where: () => ({ returning: async () => [{ ...state.current, ...value }] }) };
    } }),
  },
}));
import { estimatesMethods } from "../server/storage/estimates";

describe("persisted fixed cost", () => {
  const update = (data: any) => estimatesMethods.updateEstimateLineItem!.call({} as any, "line", data);
  it("saves a fixed cost without changing price or factors", async () => {
    state.current = { rate: "1000", costRate: "0", adjustedHours: "1.27", totalAmount: "1270.50", fixedCostOverride: null };
    const result = await update({ fixedCostOverride: "1000" });
    expect(result.totalCost).toBe("1000");
    expect(result.margin).toBe("270.5");
    expect(result.marginPercent).toBe("21.29");
    expect(state.saved.rate).toBeUndefined();
    expect(state.saved.totalAmount).toBeUndefined();
    expect(state.saved.adjustedHours).toBeUndefined();
  });
  it("survives recalculation, rate refresh and stale client cost values", async () => {
    state.current = { rate: "1000", costRate: "1000", adjustedHours: "1.27", totalAmount: "1270", fixedCostOverride: "1000" };
    const result = await update({ adjustedHours: "2", totalAmount: "2000", totalCost: "2000", costRate: "1000" });
    expect(result.totalCost).toBe("1000");
    expect(result.margin).toBe("1000");
    expect(result.fixedCostOverride).toBe("1000");
  });
  it("explicit removal restores calculated cost", async () => {
    state.current = { rate: "100", costRate: "20", adjustedHours: "2", totalAmount: "200", fixedCostOverride: "1000" };
    expect((await update({ fixedCostOverride: null })).totalCost).toBe("40");
  });
});
