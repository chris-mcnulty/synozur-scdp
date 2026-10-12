import { describe, expect, it } from "vitest";
import {
  NO_ASSIGNMENT_BUCKET, ASSIGNMENT_BUCKET_HELP, assignmentBucketLabel,
  assignmentBucketWindowWarning, matchesAssignmentBucket, canManageAssignmentBuckets,
} from "../assignment-commercial-buckets";

const buckets = [
  { id: "advisory", label: "Execution advisory", isActive: true, effectiveStartDate: "2026-08-18", effectiveEndDate: "2026-10-23" },
  { id: "recovery", label: "Recovery", isActive: false },
];

describe("optional assignment commercial controls", () => {
  it("does not conflate no mapping with reviewed historical baseline", () => {
    expect(assignmentBucketLabel(null, buckets)).toBe("No bucket (baseline / not assigned)");
    expect(assignmentBucketLabel(undefined, buckets)).toBe(NO_ASSIGNMENT_BUCKET);
    expect(ASSIGNMENT_BUCKET_HELP).toContain("no additional commercial terms");
    expect(ASSIGNMENT_BUCKET_HELP).toContain("does not mean historical time");
  });
  it("keeps archived and unavailable imported mappings visible", () => {
    expect(assignmentBucketLabel("recovery", buckets)).toBe("Recovery (archived)");
    expect(assignmentBucketLabel("deleted", buckets)).toContain("deleted");
  });
  it("filters null/omitted mappings independently from allocation baseline flags", () => {
    expect(matchesAssignmentBucket(null, "none")).toBe(true);
    expect(matchesAssignmentBucket(undefined, "none")).toBe(true);
    expect(matchesAssignmentBucket("recovery", "none")).toBe(false);
    expect(matchesAssignmentBucket("recovery", "recovery")).toBe(true);
    expect(matchesAssignmentBucket(null, "all")).toBe(true);
  });
  it("uses inclusive calendar windows and warns without mutating schedules", () => {
    const assignment = { plannedStartDate: "2026-08-17", plannedEndDate: "2026-10-24", status: "completed" };
    const before = { ...assignment };
    expect(assignmentBucketWindowWarning(buckets[0], assignment.plannedStartDate, assignment.plannedEndDate)).toContain("You can still save");
    expect(assignment).toEqual(before);
    expect(assignmentBucketWindowWarning(buckets[0], "2026-08-18T00:00:00Z", "2026-10-23")).toBeNull();
    expect(assignmentBucketWindowWarning(undefined, "2026-01-01", "2026-12-01")).toBeNull();
    expect(assignmentBucketWindowWarning(buckets[1], "2026-01-01", null)).toBeNull();
    expect(assignmentBucketWindowWarning(buckets[0], null, null)).toBeNull();
  });
  it("allows admins, portfolio managers and only this project's PM", () => {
    expect(canManageAssignmentBuckets({ id: "a", role: "admin" }, "p")).toBe(true);
    expect(canManageAssignmentBuckets({ id: "a", role: "portfolio-manager" }, "p")).toBe(true);
    expect(canManageAssignmentBuckets({ id: "p", role: "pm" }, "p")).toBe(true);
    expect(canManageAssignmentBuckets({ id: "other", role: "pm" }, "p")).toBe(false);
    expect(canManageAssignmentBuckets({ id: "p", role: "billing-admin" }, "p")).toBe(false);
    expect(canManageAssignmentBuckets(null, "p")).toBe(false);
  });
});
