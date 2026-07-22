class InMemoryCache {
  constructor() {
    this.cache = new Map();
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttlMs = 0, tags = []) {
    const expiresAt = ttlMs > 0 ? Date.now() + ttlMs : null;
    this.cache.set(key, { value, expiresAt, tags });
  }

  invalidateByTag(tag) {
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags && entry.tags.includes(tag)) {
        this.cache.delete(key);
      }
    }
  }

  clear() {
    this.cache.clear();
  }
}

export const appCache = new InMemoryCache();
