import { describe, expect, it } from "./_harness.js";
import { normalizeProjectTimeEntryRow } from "../server/storage/time-entries.js";
import { canAccessProjectTime, clearRetainedProjectLocalLinks, isFinanciallyImmutable } from "../server/lib/project-time-workbench.js";
import { classifyCommercialTimeEntry } from "../server/lib/commercial-buckets.js";

function row(overrides: Record<string, any> = {}) {
  return {
    time_entries: {
      id: "time-1",
      personId: "person-1",
      projectId: "project-1",
      submissionStatus: "draft",
      commercialBucketId: null,
      commercialEligibilityOutcome: null,
      ...overrides,
    },
    users: { id: "person-1", name: "Ada" },
    projects: { id: "project-1", name: "Delivery" },
    clients: { id: "client-1", name: "Client" },
    commercial_buckets: null,
    time_assignment: null,
    time_direct_stage: null,
    time_assignment_stage: null,
    time_direct_stage_epic: null,
    time_assignment_epic: null,
    time_direct_workstream: null,
    time_assignment_workstream: null,
    time_covered_milestone: null,
  };
}

describe("project time normalized read model", () => {
  it("uses assignment hierarchy as a fallback for legacy entries", () => {
    const source = row();
    source.time_assignment = { id: "a-1", taskDescription: "Architecture" };
    source.time_assignment_stage = { id: "s-1", name: "Discover" };
    source.time_assignment_epic = { id: "e-1", name: "Platform" };
    source.time_assignment_workstream = { id: "w-1", name: "Advisory" };
    const result = normalizeProjectTimeEntryRow(source);
    expect(result.assignmentLabel).toBe("Architecture");
    expect(result.stageLabel).toBe("Discover");
    expect(result.epicLabel).toBe("Platform");
    expect(result.workstreamLabel).toBe("Advisory");
  });

  it("gives explicit entry hierarchy precedence over assignment fallback", () => {
    const source = row();
    source.time_direct_stage = { id: "s-direct", name: "Build" };
    source.time_assignment_stage = { id: "s-assignment", name: "Discover" };
    source.time_direct_stage_epic = { id: "e-direct", name: "Launch" };
    source.time_assignment_epic = { id: "e-assignment", name: "Platform" };
    source.time_direct_workstream = { id: "w-direct", name: "Engineering" };
    source.time_assignment_workstream = { id: "w-assignment", name: "Advisory" };
    const result = normalizeProjectTimeEntryRow(source);
    expect(result.normalizedProjectStageId).toBe("s-direct");
    expect(result.epicId).toBe("e-direct");
    expect(result.normalizedWorkstreamId).toBe("w-direct");
  });

  it("represents baseline terms and no-value states explicitly without revenue", () => {
    const baseline = normalizeProjectTimeEntryRow(row({ commercialEligibilityOutcome: "not_eligible" }));
    expect(baseline.commercialTreatmentState).toBe("baseline_terms");
    expect(baseline.commercialTreatmentLabel).toBe("Baseline terms");
    expect("revenue" in baseline).toBe(false);

    const unclassified = normalizeProjectTimeEntryRow(row());
    expect(unclassified.commercialTreatmentState).toBe("no_value");
    expect(unclassified.commercialTreatmentLabel).toBe("No commercial value");
  });

  it("exposes a specific read-only reason for invoice facts", () => {
    const result = normalizeProjectTimeEntryRow(row({ vendorInvoiceLineId: "vendor-line-1" }));
    expect(result.immutable).toBe(true);
    expect(result.readOnlyReason).toBe("Matched to a vendor invoice line");
  });

  it("keeps fixed-fee and retainer buckets as treatment labels, not revenue", () => {
    for (const basis of ["fixed_fee", "retainer"]) {
      const source = row({ commercialBucketId: `bucket-${basis}`, commercialEligibilityOutcome: "eligible" });
      source.commercial_buckets = { id: `bucket-${basis}`, label: "Contract terms", basis };
      const result = normalizeProjectTimeEntryRow(source);
      expect(result.commercialTreatmentState).toBe("bucket");
      expect(result.commercialBucketBasis).toBe(basis);
      expect("revenue" in result).toBe(false);
    }
  });
});

describe("baseline classification audit service", () => {
  it("writes the synthetic baseline classification and immutable audit together", async () => {
    const auditRows: any[] = [];
    const database: any = {
      select() {
        return { from() { return { where() { return { async limit() { return [{
          id: "project-1", tenantId: "tenant-1", commercialBucketsRequired: true,
        }]; } }; } }; } };
      },
      update() {
        return { set(values: any) { return { where() { return { async returning() {
          return [{ id: "time-1", projectId: "project-1", ...values }];
        } }; } }; } };
      },
      insert() {
        return { values(values: any) { auditRows.push(values); return Promise.resolve(); } };
      },
    };
    const result = await classifyCommercialTimeEntry({
      id: "time-1", projectId: "project-1", date: "2026-06-01", hours: "1",
      billingRate: "100", commercialBucketId: null, commercialEligibilityOutcome: null,
    } as any, "manager-1", "tenant-1", { baselineSow: true }, database);
    expect(result.commercialBucketId).toBeNull();
    expect(result.commercialEligibilityOutcome).toBe("not_eligible");
    expect(auditRows[0].reason).toBe("Baseline SOW attribution");
    expect(auditRows[0].eligibilityOutcome).toBe("not_eligible");
  });

  it("clears baseline treatment to the distinct no-value state when eligibility is explicitly null", async () => {
    const database: any = {
      select() {
        return { from() { return { where() { return { async limit() { return [{
          id: "project-1", tenantId: "tenant-1", commercialBucketsRequired: false,
        }]; } }; } }; } };
      },
      update() {
        return { set(values: any) { return { where() { return { async returning() {
          return [{
            id: "time-1", projectId: "project-1", date: "2026-06-01",
            commercialBucketId: null, commercialEligibilityOutcome: "not_eligible", ...values,
          }];
        } }; } }; } };
      },
      insert() {
        return { values() { return Promise.resolve(); } };
      },
    };
    const result = await classifyCommercialTimeEntry({
      id: "time-1", projectId: "project-1", date: "2026-06-01", hours: "1",
      billingRate: "100", commercialBucketId: null, commercialEligibilityOutcome: "not_eligible",
    } as any, "manager-1", "tenant-1", {
      commercialBucketId: null,
      commercialEligibilityOutcome: null,
      baselineSow: false,
    }, database);

    expect(result.commercialEligibilityOutcome).toBeNull();
    expect(normalizeProjectTimeEntryRow(row({
      commercialBucketId: result.commercialBucketId,
      commercialEligibilityOutcome: result.commercialEligibilityOutcome,
    })).commercialTreatmentState).toBe("no_value");
  });
});

describe("project time workbench mutation guards", () => {
  it("makes every financial attribution immutable regardless of role", () => {
    for (const financialState of [
      { locked: true },
      { billedFlag: true },
      { invoiceBatchId: "invoice-batch-1" },
      { vendorInvoiceLineId: "vendor-line-1" },
    ]) {
      expect(isFinanciallyImmutable(financialState)).toBe(true);
    }
    expect(isFinanciallyImmutable({ locked: false, billedFlag: false })).toBe(false);
  });

  it("clears retained source-project hierarchy on a project move", () => {
    const moved = clearRetainedProjectLocalLinks("project-a", { projectId: "project-b", description: "Moved" });
    expect(moved).toEqual({
      projectId: "project-b", description: "Moved", allocationId: null,
      projectStageId: null, workstreamId: null, milestoneId: null,
    });
  });

  it("preserves explicitly supplied destination hierarchy for route-level validation", () => {
    const moved = clearRetainedProjectLocalLinks("project-a", {
      projectId: "project-b", allocationId: "destination-allocation", projectStageId: "destination-stage",
    });
    expect(moved).toEqual({
      projectId: "project-b", allocationId: "destination-allocation", projectStageId: "destination-stage",
      workstreamId: null, milestoneId: null,
    });
  });

  it("denies a PM outside their project while retaining privileged role access", () => {
    expect(canAccessProjectTime("pm", "pm-a", "pm-b")).toBe(false);
    expect(canAccessProjectTime("pm", "pm-a", "pm-a")).toBe(true);
    expect(canAccessProjectTime("billing-admin", "admin-a", "pm-b")).toBe(true);
  });

  it("denies a PM project move when the destination has a different PM", () => {
    const sourceProject = { id: "project-a", pm: "pm-a" };
    const destinationProject = { id: "project-b", pm: "pm-b" };
    expect(canAccessProjectTime("pm", "pm-a", sourceProject.pm)).toBe(true);
    // PATCH invokes this same helper again after resolving projectId's
    // destination, before hierarchy validation or any transaction write.
    expect(canAccessProjectTime("pm", "pm-a", destinationProject.pm)).toBe(false);
  });
});