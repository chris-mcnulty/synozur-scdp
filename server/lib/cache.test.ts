/**
 * Regression tests for the in-process LRU cache module and getProjects query budget.
 *
 * Run standalone:  npx tsx server/lib/cache.test.ts
 */

import assert from "node:assert/strict";
import { getCached, invalidate, invalidatePrefix, getCacheStats } from "./cache";

async function testCacheModule() {
  console.log("cache module unit tests");

  let calls = 0;
  const loader = async () => { calls++; return { val: 42 }; };

  const r1 = await getCached("test:key1", 5000, loader);
  assert.equal(r1.val, 42, "first call returns loader value");
  assert.equal(calls, 1, "loader called once on cache miss");

  const r2 = await getCached("test:key1", 5000, loader);
  assert.equal(r2.val, 42, "second call returns cached value");
  assert.equal(calls, 1, "loader not called again on cache hit");

  const stats = getCacheStats();
  const s = stats["test:key1"];
  assert.equal(s.hits, 1, `expected 1 hit, got ${s.hits}`);
  assert.equal(s.misses, 1, `expected 1 miss, got ${s.misses}`);
  assert.equal(s.hitRatio, 50, `expected 50% hit ratio, got ${s.hitRatio}`);

  invalidate("test:key1");
  assert.equal(getCacheStats()["test:key1"].invalidations, 1, "invalidation recorded");

  let calls2 = 0;
  await getCached("prefix:a", 5000, async () => { calls2++; return "a"; });
  await getCached("prefix:b", 5000, async () => { calls2++; return "b"; });
  assert.equal(calls2, 2, "both prefix entries loaded");
  invalidatePrefix("prefix:");
  assert.equal(getCacheStats()["prefix:a"].invalidations, 1, "prefix:a invalidated");
  assert.equal(getCacheStats()["prefix:b"].invalidations, 1, "prefix:b invalidated");

  console.log("  passed");
}

/**
 * Instruments pool.query to count DB round-trips for one getProjects() call.
 * getProjects must issue at most 2 queries regardless of project count:
 *   1. projects + clients + PM join
 *   2. UNION ALL for approved-SOW budget totals + billable burn totals
 * If the projects table is empty the early-return fires after query 1, which
 * is still within the <= 2 bound.
 */
async function testGetProjectsQueryCount() {
  console.log("getProjects query-count regression test");

  const { pool } = await import("../db");
  const { storage } = await import("../storage");

  let queryCount = 0;
  const original = pool.query.bind(pool) as typeof pool.query;
  (pool as unknown as { query: typeof pool.query }).query = (
    (...args: Parameters<typeof pool.query>) => {
      queryCount++;
      return (original as (...a: typeof args) => ReturnType<typeof pool.query>)(...args);
    }
  ) as typeof pool.query;

  try {
    await storage.getProjects();
    assert.ok(queryCount <= 2, `expected <= 2 queries, got ${queryCount} — N+1 regression`);
    console.log(`  passed (${queryCount} query round-trip(s))`);
  } finally {
    (pool as unknown as { query: typeof pool.query }).query = original;
  }
}

(async () => {
  try {
    await testCacheModule();
    await testGetProjectsQueryCount();
    console.log("all tests passed");
    process.exit(0);
  } catch (err) {
    console.error("FAILED:", err);
    process.exit(1);
  }
})();
