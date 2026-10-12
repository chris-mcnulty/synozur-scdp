import { and, eq, inArray, sql } from "drizzle-orm";
import { commercialBuckets, projectAllocations, projects } from "@shared/schema";
import { db } from "../db";
import { z } from "zod";

export const assignmentBucketSelection = z.string().trim().min(1).nullable().optional();
export const bulkAssignmentBucketInput = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500).refine(ids => new Set(ids).size === ids.length, "Duplicate assignment IDs"),
  commercialBucketId: assignmentBucketSelection.refine(value => value !== undefined, "Select a bucket or explicitly clear"),
});

export async function validateAssignmentBucket(projectId: string, tenantId: string, value: unknown, existing?: string | null, tx: any = db) {
  const id = assignmentBucketSelection.parse(value);
  const [project] = await tx.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)));
  if (!project) throw new Error("Project is outside your active tenant.");
  if (id == null) return;
  const [bucket] = await tx.select().from(commercialBuckets).where(and(
    eq(commercialBuckets.id, id), eq(commercialBuckets.projectId, projectId), eq(commercialBuckets.tenantId, tenantId),
  ));
  if (!bucket || ((!bucket.isActive || bucket.archivedAt) && id !== existing)) {
    throw new Error("Select an active commercial bucket for this project.");
  }
}

export async function bulkSetAssignmentBucket(projectId: string, tenantId: string, input: unknown, database: any = db) {
  const parsed = bulkAssignmentBucketInput.parse(input);
  return database.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT id FROM project_allocations WHERE project_id=${projectId}
      AND tenant_id=${tenantId} AND id IN (${sql.join(parsed.ids.map(id => sql`${id}`), sql`,`)})
      ORDER BY id FOR UPDATE`);
    const rows = await tx.select().from(projectAllocations).where(and(
      eq(projectAllocations.projectId, projectId), eq(projectAllocations.tenantId, tenantId),
      inArray(projectAllocations.id, parsed.ids), eq(projectAllocations.isBaseline, false),
    ));
    if (rows.length !== parsed.ids.length) throw new Error("One or more assignments are missing, baseline snapshots, or outside this project.");
    await validateAssignmentBucket(projectId, tenantId, parsed.commercialBucketId, undefined, tx);
    // Commercial-only edits never win a Planner task/date conflict or change time.
    return tx.update(projectAllocations).set({ commercialBucketId: parsed.commercialBucketId })
      .where(and(eq(projectAllocations.projectId, projectId), eq(projectAllocations.tenantId, tenantId), inArray(projectAllocations.id, parsed.ids))).returning();
  });
}
