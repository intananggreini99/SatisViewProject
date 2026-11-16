// Cache sederhana di memori (data dashboard hanya berubah saat pipeline berjalan).
export function createCache(ttlMs) {
  const store = new Map();
  return {
    async wrap(key, producer) {
      const now = Date.now();
      const hit = store.get(key);
      if (hit && hit.expires > now) return hit.value;
      const value = await producer();
      store.set(key, { value, expires: now + ttlMs });
      if (store.size > 500) {
        for (const [k, entry] of store) if (entry.expires <= now) store.delete(k);
      }
      return value;
    },
    clear() {
      store.clear();
    },
  };
}
