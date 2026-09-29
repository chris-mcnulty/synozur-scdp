import { describe, expect, it } from "./_harness.js";
import { markDirty, markSaved, matchesSavedSnapshot } from "../client/src/components/time-grid/state.js";

const row = {
  id: "tmp-row",
  state: "saving" as const,
  date: "2026-09-28",
  projectId: "platinum",
  hours: "2",
  billable: true,
  description: "Delivery work",
  milestoneId: "",
  allocationId: "",
  commercialBucketId: "",
  commercialEligibilityOutcome: "",
  commercialApprovalReference: "",
};

describe("timesheet grid autosave snapshots", () => {
  it("does not acknowledge a bucket chosen while an earlier save is in flight", () => {
    const selected = {
      ...row,
      commercialBucketId: "fixed-price",
      commercialEligibilityOutcome: "eligible",
    };
    expect(matchesSavedSnapshot(selected, row)).toBe(false);
    const next = matchesSavedSnapshot(selected, row) ? markSaved(selected, "server-row") : markDirty({ ...selected, serverId: "server-row", id: "server-row" });
    expect(next.state).toBe("dirty");
    expect(next.commercialBucketId).toBe("fixed-price");
    expect(next.serverId).toBe("server-row");
  });

  it("acknowledges an unchanged save snapshot", () => {
    expect(matchesSavedSnapshot({ ...row }, row)).toBe(true);
    expect(markSaved(row, "server-row").state).toBe("saved");
  });

  it("resends a changed approval reference instead of losing it", () => {
    expect(matchesSavedSnapshot({ ...row, commercialApprovalReference: "approved" }, row)).toBe(false);
  });
});