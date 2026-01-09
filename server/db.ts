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

// Enhanced pool configuration for Replit production stability
export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 10,                        // Maximum pool size
  maxUses: 7500,                  // Max uses before connection replacement
  allowExitOnIdle: false,         // Keep connections alive
  idleTimeoutMillis: 30000,       // 30s idle timeout (increased from 10s)
  connectionTimeoutMillis: 10000, // 10s connection timeout
});

// Track pool health metrics
let poolErrorCount = 0;
let lastPoolError: Date | null = null;
let poolHealthy = true;

// Handle pool connection errors with automatic recovery tracking
pool.on('error', (err) => {
  poolErrorCount++;
  lastPoolError = new Date();
  poolHealthy = false;
  console.error('[DB-POOL] Connection error:', {
    message: err.message,
    errorCount: poolErrorCount,
    timestamp: lastPoolError.toISOString()
  });
  
  // Reset health status after 30 seconds if no new errors
  setTimeout(() => {
    if (lastPoolError && Date.now() - lastPoolError.getTime() > 30000) {
      poolHealthy = true;
      console.log('[DB-POOL] Pool health restored after error recovery period');
    }
  }, 30000);
});

// Pool connect event for logging
pool.on('connect', () => {
  poolHealthy = true;
});

// Export pool health for monitoring endpoints
export function getPoolHealth() {
  return {
    healthy: poolHealthy,
    errorCount: poolErrorCount,
    lastError: lastPoolError?.toISOString() || null,
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  };
}

// Graceful pool test function for health checks
export async function testPoolConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    poolHealthy = true;
    return true;
  } catch (error) {
    poolHealthy = false;
    console.error('[DB-POOL] Health check failed:', error);
    return false;
  }
}

export const db = drizzle({ client: pool, schema });