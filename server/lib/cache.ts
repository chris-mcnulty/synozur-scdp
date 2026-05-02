interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  invalidations: number;
}

const MAX_ENTRIES = 500;

// Insertion-order Map gives O(1) LRU eviction: delete the first key when full.
const store = new Map<string, CacheEntry<unknown>>();
const stats = new Map<string, CacheStats>();

function evictIfFull(): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value as string;
    store.delete(oldest);
  }
}

function getOrCreateStats(key: string): CacheStats {
  let s = stats.get(key);
  if (!s) {
    s = { hits: 0, misses: 0, invalidations: 0 };
    stats.set(key, s);
  }
  return s;
}

export async function getCached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = store.get(key) as CacheEntry<T> | undefined;

  if (entry && entry.expiresAt > now) {
    // Move to end of Map (most-recently-used) so it survives eviction longer.
    store.delete(key);
    store.set(key, entry);
    getOrCreateStats(key).hits++;
    return entry.value;
  }

  getOrCreateStats(key).misses++;
  const value = await loader();
  store.delete(key);
  evictIfFull();
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export function setCached<T>(key: string, ttlMs: number, value: T): void {
  store.delete(key);
  evictIfFull();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidate(key: string): void {
  if (store.has(key)) {
    store.delete(key);
    getOrCreateStats(key).invalidations++;
  }
}

export function invalidatePrefix(prefix: string): void {
  const keysToDelete: string[] = [];
  store.forEach((_val: CacheEntry<unknown>, k: string) => {
    if (k.startsWith(prefix)) keysToDelete.push(k);
  });
  for (const k of keysToDelete) {
    store.delete(k);
    getOrCreateStats(k).invalidations++;
  }
}

export function getCacheStats(): Record<string, { hits: number; misses: number; invalidations: number; hitRatio: number }> {
  const result: Record<string, { hits: number; misses: number; invalidations: number; hitRatio: number }> = {};
  stats.forEach((s: CacheStats, key: string) => {
    const total = s.hits + s.misses;
    result[key] = {
      hits: s.hits,
      misses: s.misses,
      invalidations: s.invalidations,
      hitRatio: total > 0 ? Math.round((s.hits / total) * 10000) / 100 : 0,
    };
  });
  return result;
}

export function getCacheSize(): number {
  return store.size;
}
