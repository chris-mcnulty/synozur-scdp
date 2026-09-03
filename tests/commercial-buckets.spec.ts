import { describe, expect, it } from "./_harness.js";
import { validateCommercialSelection } from "../server/lib/commercial-buckets.js";

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
});