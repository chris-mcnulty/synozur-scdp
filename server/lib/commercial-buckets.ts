import { and, eq, ne, sql } from "drizzle-orm";
import {
  commercialBucketAudit,
  commercialBuckets,
  projects,
  timeEntries,
  type TimeEntry,
} from "@shared/schema";
import { db } from "../db";

export const COMMERCIAL_ELIGIBILITY = [
  "eligible",
  "not_eligible",
  "pending_approval",
  "over_capacity",
  "out_of_window",
] as const;

export type CommercialEligibility = typeof COMMERCIAL_ELIGIBILITY[number];

/**
 * Client-invoice eligibility for a commercial attribution. Unclassified time
 * remains compatible only for projects that have not made bucket selection
 * mandatory; once reviewed, recovery is explicit T&M/capped-T&M only.
 */
export function isCommercialTimeRecoverable(input: {
  commercialBucketId?: string | null;
  commercialEligibilityOutcome?: string | null;
  commercialBucketBasis?: string | null;
  commercialBucketsRequired?: boolean | null;
}): boolean {
  const classified = !!(input.commercialBucketId || input.commercialEligibilityOutcome);
  if (!classified) return !input.commercialBucketsRequired;
  return input.commercialEligibilityOutcome === "eligible" &&
    (input.commercialBucketBasis === "tm" || input.commercialBucketBasis === "capped_tm");
}

/** Mirrors the reconciliation SQL predicate for explicit-row validation. */
export function isCommercialReconciliationReviewable(entry: Pick<TimeEntry,
  "submissionStatus" | "locked" | "billedFlag" | "invoiceBatchId" | "vendorInvoiceLineId">): boolean {
  return ["submitted", "approved"].includes(entry.submissionStatus) ||
    entry.locked || entry.billedFlag || !!entry.invoiceBatchId || !!entry.vendorInvoiceLineId;
}

type ClassificationInput = {
  commercialBucketId?: string | null;
  commercialEligibilityOutcome?: string | null;
  commercialApprovalReference?: string | null;
  reason?: string | null;
  /** Manager-only reconciliation action for ordinary work already in the SOW. */
  baselineSow?: boolean;
};

export async function validateCommercialSelection(input: {
  projectId: string;
  date: string;
  tenantId?: string | null;
} & ClassificationInput, database: any = db) {
  input = {
    ...input,
    commercialBucketId: input.commercialBucketId?.trim() || undefined,
    commercialEligibilityOutcome: input.commercialEligibilityOutcome?.trim() || undefined,
    commercialApprovalReference: input.commercialApprovalReference?.trim() || undefined,
  };
  const hasClassification = input.commercialBucketId !== undefined ||
    input.commercialEligibilityOutcome !== undefined ||
    input.commercialApprovalReference !== undefined;
  const [project] = await database.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
  if (!project) throw new Error("Invalid project selected.");
  if (input.tenantId && project.tenantId && project.tenantId !== input.tenantId) {
    throw new Error("Commercial bucket must belong to your active tenant.");
  }
  let outcome = (input.commercialEligibilityOutcome || (input.commercialBucketId ? "eligible" : null)) as CommercialEligibility | null;
  if (outcome && !COMMERCIAL_ELIGIBILITY.includes(outcome)) {
    throw new Error("Invalid commercial eligibility outcome.");
  }
  // Baseline SOW is deliberately represented as a not-eligible attribution
  // without a bucket. This keeps ordinary work out of incremental billing
  // while allowing a commercial-required project to be reconciled.
  if (input.baselineSow) {
    if (input.commercialBucketId || (outcome && outcome !== "not_eligible")) {
      throw new Error("Baseline SOW cannot be assigned to a commercial bucket or marked eligible.");
    }
    return { project, bucket: null, outcome: "not_eligible" as CommercialEligibility, hasClassification: true };
  }
  if (project.commercialBucketsRequired && !input.commercialBucketId) {
    throw new Error("This project requires a commercial bucket. Select an active bucket before saving or submitting this time entry.");
  }
  if (!input.commercialBucketId) {
    if (outcome === "eligible") {
      throw new Error("An eligible commercial classification requires a commercial bucket.");
    }
    return { project, bucket: null, outcome, hasClassification };
  }
  const [bucket] = await database.select().from(commercialBuckets)
    .where(eq(commercialBuckets.id, input.commercialBucketId)).limit(1);
  if (!bucket || bucket.projectId !== input.projectId || !bucket.isActive) {
    throw new Error("Select an active commercial bucket for this project.");
  }
  if (input.tenantId && bucket.tenantId && bucket.tenantId !== input.tenantId) {
    throw new Error("Commercial bucket must belong to your active tenant.");
  }
  // A bucket can configure a normal explicit outcome (notably, original-SOW
  // work that is never eligible for change-order recovery). Preserve an
  // explicitly selected outcome, but apply the bucket rule when the form/API
  // leaves eligibility unspecified.
  if ((!input.commercialEligibilityOutcome || outcome === "pending_approval") &&
      bucket.defaultEligibilityOutcome === "not_eligible") {
    outcome = bucket.defaultEligibilityOutcome as CommercialEligibility;
  }
  if (outcome === "eligible") {
    if (bucket.effectiveStartDate && input.date < bucket.effectiveStartDate ||
        bucket.effectiveEndDate && input.date > bucket.effectiveEndDate) {
      throw new Error("The time-entry date is outside this commercial bucket's effective period.");
    }
    if (bucket.approvalRequired && !input.commercialApprovalReference) {
      throw new Error("An approval reference is required for this commercial bucket.");
    }
  }
  return { project, bucket, outcome, hasClassification };
}

export async function validateRequiredBucketForEntry(
  entry: Pick<TimeEntry, "id" | "projectId" | "date" | "commercialBucketId" | "commercialEligibilityOutcome" | "commercialApprovalReference">,
  tenantId?: string | null,
  database: any = db,
) {
  try {
    return await validateCommercialSelection({
      projectId: entry.projectId,
      date: entry.date,
      tenantId,
      commercialBucketId: entry.commercialBucketId,
      commercialEligibilityOutcome: entry.commercialEligibilityOutcome,
      commercialApprovalReference: entry.commercialApprovalReference,
    }, database);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Time entry ${entry.id} (${entry.date}): ${message}`);
  }
}

/**
 * Applies a reviewed classification and always records a new immutable audit row.
 * Ceiling checks deliberately turn an entry into an exception rather than silently
 * excluding it from review; only eligible time counts toward a capped drawdown.
 */
export async function classifyCommercialTimeEntry(
  entry: TimeEntry,
  userId: string,
  tenantId: string | null | undefined,
  input: ClassificationInput,
  database?: any,
) {
  input = {
    ...input,
    commercialBucketId: input.commercialBucketId?.trim() || undefined,
    commercialEligibilityOutcome: input.commercialEligibilityOutcome?.trim() || undefined,
    commercialApprovalReference: input.commercialApprovalReference?.trim() || undefined,
  };
  const classify = async (executor: any) => {
  const checked = await validateCommercialSelection({
    projectId: entry.projectId,
    date: entry.date,
    tenantId,
    ...input,
  }, executor);
  let outcome = checked.outcome;
  const bucket = checked.bucket;

  if (bucket && outcome === "eligible" && (bucket.hoursCeiling || bucket.dollarCeiling)) {
    // Serializing classifications for one bucket prevents concurrent requests
    // from both consuming the same remaining capped-T&M capacity.
    await executor.execute(sql`SELECT id FROM commercial_buckets WHERE id = ${bucket.id} FOR UPDATE`);
    const used = await executor.select({
      hours: sql<string>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC)), 0)`,
      value: sql<string>`COALESCE(SUM(CAST(${timeEntries.hours} AS NUMERIC) * CAST(${timeEntries.billingRate} AS NUMERIC)), 0)`,
    }).from(timeEntries).where(and(
      eq(timeEntries.commercialBucketId, bucket.id),
      eq(timeEntries.commercialEligibilityOutcome, "eligible"),
      ne(timeEntries.id, entry.id),
    ));
    const usedHours = Number(used[0]?.hours || 0);
    const usedValue = Number(used[0]?.value || 0);
    const entryValue = Number(entry.hours) * Number(entry.billingRate || 0);
    if ((bucket.hoursCeiling && usedHours + Number(entry.hours) > Number(bucket.hoursCeiling)) ||
        (bucket.dollarCeiling && usedValue + entryValue > Number(bucket.dollarCeiling))) {
      outcome = "over_capacity";
    }
  }

  if (!checked.hasClassification && !entry.commercialBucketId && !entry.commercialEligibilityOutcome) {
    return entry;
  }

  const [updated] = await executor.update(timeEntries).set({
    commercialBucketId: input.commercialBucketId ?? null,
    commercialEligibilityOutcome: outcome,
    commercialApprovalReference: input.commercialApprovalReference ?? null,
    commercialClassifiedBy: userId,
    commercialClassifiedAt: new Date(),
  }).where(eq(timeEntries.id, entry.id)).returning();

  await executor.insert(commercialBucketAudit).values({
    tenantId: tenantId || null,
    projectId: entry.projectId,
    timeEntryId: entry.id,
    bucketId: input.commercialBucketId ?? null,
    eligibilityOutcome: outcome || "not_eligible",
    approvalReference: input.commercialApprovalReference ?? null,
    reason: input.reason ?? (input.baselineSow ? "Baseline SOW attribution" : null),
    classifiedBy: userId,
  });
  return updated;
  };
  // The entry update and immutable audit record are committed together.
  return database ? classify(database) : db.transaction(classify);
}