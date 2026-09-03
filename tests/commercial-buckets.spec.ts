import { describe, expect, it } from "./_harness.js";
import { isCommercialReconciliationReviewable, isCommercialTimeRecoverable, validateCommercialSelection } from "../server/lib/commercial-buckets.js";

function selectionDatabase(project: any, bucket: any) {
  let reads = 0;
  return {
    select() {
      return {
        from() {
          return {
            where() {
              return {
                async limit() {
                  return [reads++ === 0 ? project : bucket];
                },
              };
            },
          };
        },
      };
    },
  };
}

describe("commercial bucket contributor submissions", () => {
  it("keeps an approval-required bucket pending without requiring an approval reference", async () => {
    const result = await validateCommercialSelection({
      projectId: "project-1",
      date: "2026-06-15",
      tenantId: "tenant-1",
      commercialBucketId: "bucket-advisory",
      commercialEligibilityOutcome: "pending_approval",
    }, selectionDatabase(
      { id: "project-1", tenantId: "tenant-1", commercialBucketsRequired: true },
      {
        id: "bucket-advisory",
        projectId: "project-1",
        tenantId: "tenant-1",
        isActive: true,
        approvalRequired: true,
        defaultEligibilityOutcome: "eligible",
        effectiveStartDate: "2026-05-01",
        effectiveEndDate: "2026-08-31",
      },
    ));

    expect(result.outcome).toBe("pending_approval");
  });

  it("requires an active bucket even when eligibility is pending", async () => {
    let message = "";
    try {
      await validateCommercialSelection({
        projectId: "project-1",
        date: "2026-06-15",
        tenantId: "tenant-1",
        commercialEligibilityOutcome: "pending_approval",
      }, selectionDatabase(
        { id: "project-1", tenantId: "tenant-1", commercialBucketsRequired: true },
        null,
      ));
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/requires a commercial bucket/i);
  });

  it("does not force a bucket for projects where classification is optional", async () => {
    const result = await validateCommercialSelection({
      projectId: "project-1",
      date: "2026-06-15",
      tenantId: "tenant-1",
      commercialEligibilityOutcome: "not_eligible",
    }, selectionDatabase(
      { id: "project-1", tenantId: "tenant-1", commercialBucketsRequired: false },
      null,
    ));
    expect(result.bucket).toBeNull();
    expect(result.outcome).toBe("not_eligible");
  });

  it("allows a billing manager to attribute historical ordinary work to Baseline SOW", async () => {
    const result = await validateCommercialSelection({
      projectId: "project-1",
      date: "2026-04-30",
      tenantId: "tenant-1",
      baselineSow: true,
    }, selectionDatabase(
      { id: "project-1", tenantId: "tenant-1", commercialBucketsRequired: true },
      null,
    ));
    expect(result.bucket).toBeNull();
    expect(result.outcome).toBe("not_eligible");
    expect(result.hasClassification).toBe(true);
  });

  it("rejects a baseline attribution that attempts to bill through a bucket", async () => {
    let message = "";
    try {
      await validateCommercialSelection({
        projectId: "project-1",
        date: "2026-04-30",
        tenantId: "tenant-1",
        baselineSow: true,
        commercialBucketId: "bucket-1",
      }, selectionDatabase(
        { id: "project-1", tenantId: "tenant-1", commercialBucketsRequired: true },
        null,
      ));
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/Baseline SOW/i);
  });
});

describe("commercial invoice recovery guard", () => {
  it("keeps legacy unclassified time billable only before buckets are required", () => {
    expect(isCommercialTimeRecoverable({ commercialBucketsRequired: false })).toBe(true);
    expect(isCommercialTimeRecoverable({ commercialBucketsRequired: true })).toBe(false);
  });

  it("requires explicit eligible T&M attribution for classified time", () => {
    for (const outcome of ["not_eligible", "pending_approval", "over_capacity", "out_of_window"]) {
      expect(isCommercialTimeRecoverable({
        commercialBucketId: "bucket-1",
        commercialBucketBasis: "tm",
        commercialEligibilityOutcome: outcome,
      })).toBe(false);
    }
    expect(isCommercialTimeRecoverable({
      commercialBucketId: "bucket-1", commercialBucketBasis: "fixed_fee", commercialEligibilityOutcome: "eligible",
    })).toBe(false);
    expect(isCommercialTimeRecoverable({
      commercialBucketId: "bucket-1", commercialBucketBasis: "retainer", commercialEligibilityOutcome: "eligible",
    })).toBe(false);
    expect(isCommercialTimeRecoverable({
      commercialBucketId: "bucket-1", commercialBucketBasis: "capped_tm", commercialEligibilityOutcome: "eligible",
    })).toBe(true);
  });
});

describe("commercial reconciliation reviewability", () => {
  const base = {
    submissionStatus: "draft",
    locked: false,
    billedFlag: false,
    invoiceBatchId: null,
    vendorInvoiceLineId: null,
  } as any;

  it("includes submitted/approved and historical invoice attribution", () => {
    expect(isCommercialReconciliationReviewable({ ...base, submissionStatus: "submitted" })).toBe(true);
    expect(isCommercialReconciliationReviewable({ ...base, submissionStatus: "approved" })).toBe(true);
    expect(isCommercialReconciliationReviewable({ ...base, submissionStatus: "draft", billedFlag: true })).toBe(true);
    expect(isCommercialReconciliationReviewable({ ...base, submissionStatus: "rejected", locked: true })).toBe(true);
    expect(isCommercialReconciliationReviewable({ ...base, invoiceBatchId: "batch-1" })).toBe(true);
    expect(isCommercialReconciliationReviewable({ ...base, vendorInvoiceLineId: "vendor-line-1" })).toBe(true);
  });

  it("excludes plain draft and rejected entries", () => {
    expect(isCommercialReconciliationReviewable(base)).toBe(false);
    expect(isCommercialReconciliationReviewable({ ...base, submissionStatus: "rejected" })).toBe(false);
  });
});