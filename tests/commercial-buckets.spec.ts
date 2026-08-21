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
});