import { db } from "../db";
import { sql } from "drizzle-orm";

export async function addPaginationIndexes() {
  try {
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_time_entries_tenant_date ON time_entries(tenant_id, date DESC);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_time_entries_person_date ON time_entries(person_id, date DESC);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries(project_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_projects_tenant_status ON projects(tenant_id, status);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_raidd_entries_tenant ON raidd_entries(tenant_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_raidd_entries_project ON raidd_entries(project_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_sows_project_status ON sows(project_id, status);
    `);
    console.log("[startup] Pagination indexes ensured");
  } catch (err: any) {
    console.warn("[startup] Failed to create some pagination indexes:", err.message);
  }
}
