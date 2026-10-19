const _buckets = new Map<string, number[]>();

/**
 * Rate limit in-memory per serverless instance — lớp chặn 1 phía route.
 * Giới hạn innate: không shared giữa các instance Vercel (mỗi instance đếm riêng).
 */
export function checkRate(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (_buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    _buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  _buckets.set(key, hits);
  if (_buckets.size > 5000) {
    for (const [k, v] of _buckets) {
      if (now - v[v.length - 1] > windowMs) _buckets.delete(k);
    }
  }
  return true;
}
