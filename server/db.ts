import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// Configure Neon WebSocket with error handling
neonConfig.webSocketConstructor = ws;
neonConfig.pipelineConnect = false; // Disable pipeline mode for better error handling

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Create pool with enhanced error handling and connection limits
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 10,
  maxUses: 7500,
  allowExitOnIdle: false,
  idleTimeoutMillis: 10000,
});

// Handle pool connection errors
pool.on('error', (err) => {
  console.error('Database pool error:', err);
});

export const db = drizzle({ client: pool, schema });