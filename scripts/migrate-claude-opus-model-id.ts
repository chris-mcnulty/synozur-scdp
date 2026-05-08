// One-off data migration: rename claude-opus-4-1 → claude-opus-4.7 in ai_configuration
import { db } from '../server/db.js';
import { sql } from 'drizzle-orm';

async function migrateClaudeOpusModelId() {
  console.log('Checking for stale claude-opus-4-1 model IDs in ai_configuration...');

  const stale = await db.execute(
    sql`SELECT COUNT(*)::int AS count FROM ai_configuration WHERE active_model = 'claude-opus-4-1'`
  );

  const count = (stale.rows[0] as { count: number }).count;

  if (count === 0) {
    console.log('No rows found with active_model = "claude-opus-4-1". Nothing to do.');
    process.exit(0);
  }

  console.log(`Found ${count} row(s) to update.`);

  await db.execute(
    sql`UPDATE ai_configuration SET active_model = 'claude-opus-4.7' WHERE active_model = 'claude-opus-4-1'`
  );

  console.log(`Updated ${count} row(s). Migration complete.`);
  process.exit(0);
}

migrateClaudeOpusModelId().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
