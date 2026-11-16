// Pembatas laju sederhana di memori (jendela geser per kunci, mis. alamat IP).
// Cukup untuk satu instance API; di belakang Nginx alamat asli diambil dari
// X-Forwarded-For (app.set('trust proxy', 1)).
export function createRateLimiter({ limit, windowMs, now = () => Date.now() }) {
  const hits = new Map();

  function prune(key, t) {
    const list = (hits.get(key) ?? []).filter((ts) => t - ts < windowMs);
    if (list.length) hits.set(key, list);
    else hits.delete(key);
    return list;
  }

  const timer = setInterval(() => {
    const t = now();
    for (const key of hits.keys()) prune(key, t);
  }, Math.max(windowMs, 10_000));
  timer.unref?.();

  return {
    /** Catat satu percobaan. Hasil: { allowed, retryAfterSeconds }. */
    hit(key) {
      const t = now();
      const list = prune(key, t);
      if (list.length >= limit) {
        const retryAfterMs = windowMs - (t - list[0]);
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
      }
      list.push(t);
      hits.set(key, list);
      return { allowed: true, retryAfterSeconds: 0 };
    },
    reset(key) {
      hits.delete(key);
    },
    size() {
      return hits.size;
    },
  };
}
