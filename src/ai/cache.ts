interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();

function cacheKey(prefix: string, input: string) {
  return `${prefix}:${input}`;
}

export function setCached<T>(prefix: string, input: string, value: T, ttlMs = 5 * 60 * 1000) {
  memoryCache.set(cacheKey(prefix, input), { value, expiresAt: Date.now() + ttlMs });
}

export function getCached<T>(prefix: string, input: string): T | null {
  const entry = memoryCache.get(cacheKey(prefix, input));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(cacheKey(prefix, input));
    return null;
  }
  return entry.value as T;
}

export function clearCache(prefix?: string) {
  if (!prefix) {
    memoryCache.clear();
    return;
  }
  for (const currentKey of memoryCache.keys()) {
    if (currentKey.startsWith(`${prefix}:`)) {
      memoryCache.delete(currentKey);
    }
  }
}
