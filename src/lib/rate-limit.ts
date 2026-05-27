/**
 * Tiny in-memory rate limiter. Keyed by an arbitrary string (typically an IP).
 * Acceptable for single-instance Vercel functions — under load, this works as
 * defense-in-depth, not a hard cap. Tokens are UUIDs so brute-force is already
 * impractical; this exists to slow automated probing.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  opts: { max: number; windowMs: number }
): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    const resetAt = now + opts.windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: opts.max - 1, resetAt };
  }
  if (bucket.count >= opts.max) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt };
  }
  bucket.count += 1;
  return { ok: true, remaining: opts.max - bucket.count, resetAt: bucket.resetAt };
}

export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
