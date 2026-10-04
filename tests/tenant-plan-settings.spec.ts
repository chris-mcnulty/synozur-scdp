import fs from "node:fs";
import { describe, expect, it } from "./_harness.js";
import { expirationDatePayload, expirationDateValue, planExpirationDateSchema, tenantPlanUpdateSchema } from "../shared/tenant-plan-settings.js";

describe("tenant plan settings", () => {
  it("clears an old expiration and restores active status explicitly", () => {
    expect(tenantPlanUpdateSchema.parse({
      planStatus: "active", planExpiresAt: expirationDatePayload("", "2026-04-16T17:24:13.589Z"),
    })).toEqual({ planStatus: "active", planExpiresAt: null });
  });

  it("preserves the precise expiration when the date has not changed", () => {
    const original = "2026-04-16T17:24:13.589Z";
    expect(expirationDateValue(original)).toBe("2026-04-16");
    expect(expirationDatePayload("2026-04-16", original)).toBe(original);
  });

  it("sets a changed date through the end of the specified UTC day", () => {
    const iso = expirationDatePayload("2027-04-16", "2026-04-16T17:24:13.589Z");
    expect(iso).toBe("2027-04-16T23:59:59.999Z");
    const parsed = tenantPlanUpdateSchema.parse({ planExpiresAt: iso });
    expect(parsed.planExpiresAt instanceof Date).toBe(true);
    expect(parsed.planExpiresAt?.toISOString()).toBe(iso!);
  });

  it("does not implicitly change omitted plan fields", () => {
    expect(tenantPlanUpdateSchema.parse({})).toEqual({});
    expect(tenantPlanUpdateSchema.parse({ planStatus: "suspended" })).toEqual({ planStatus: "suspended" });
    expect(expirationDateValue(null)).toBe("");
  });

  it("rejects unknown statuses and invalid or ambiguous dates", () => {
    expect(tenantPlanUpdateSchema.safeParse({ planStatus: "anything" }).success).toBe(false);
    expect(tenantPlanUpdateSchema.safeParse({ planExpiresAt: "2027-04-16" }).success).toBe(false);
    expect(tenantPlanUpdateSchema.safeParse({ planExpiresAt: "" }).success).toBe(false);
    expect(planExpirationDateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(planExpirationDateSchema.safeParse("invalid").success).toBe(false);
    expect(planExpirationDateSchema.safeParse("2028-02-29").success).toBe(true);
  });

  it("keeps plan updates restricted to authenticated platform admins", () => {
    const source = fs.readFileSync(new URL("../server/routes/platform.ts", import.meta.url), "utf8");
    expect(source).toContain('app.patch("/api/platform/tenants/:id", requireAuth, requirePlatformAdmin');
    expect(source).toContain("tenantSchema.partial().parse(req.body)");
    expect(source).toContain("extend(tenantPlanUpdateSchema.shape)");
  });
});