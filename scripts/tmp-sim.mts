import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.NEON_DATABASE_URL });
await pool.query("DELETE FROM _schema_migrations WHERE filename = '0006_multi_currency_estimates.sql'");
console.log('removed 0006 from tracker to simulate prod state');
await pool.end();
