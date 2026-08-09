interface CacheEntry<T = any> {
  value: T;
  expiresAt: number | null;
  tags: string[];
}

class InMemoryCache {
  private cache: Map<string, CacheEntry>;

  constructor() {
    this.cache = new Map();
  }

  get<T = any>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set<T = any>(key: string, value: T, ttlMs = 0, tags: string[] = []): void {
    const expiresAt = ttlMs > 0 ? Date.now() + ttlMs : null;
    this.cache.set(key, { value, expiresAt, tags });
  }

  invalidateByTag(tag: string): void {
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags && entry.tags.includes(tag)) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}

export const appCache = new InMemoryCache();
