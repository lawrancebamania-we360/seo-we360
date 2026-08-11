// Permissive rate-limit shim for the imported AI-Visibility actions. We360 is an
// internal tool with a trusted, small user base, so the abuse-bounding rate
// limiter Klimb needed is a no-op here: every call is allowed. Signature matches
// the call sites: rateLimit(key, limit, windowSeconds) → true when allowed.

export async function rateLimit(_key: string, _limit: number, _windowSeconds: number): Promise<boolean> {
  return true;
}

/** Client IP for rate-limit keys. Permissive shim — a constant is fine since
 *  rateLimit() always allows. Accepts a Headers object or anything. */
export function clientIp(_headers?: unknown): string {
  return "0.0.0.0";
}

/** 429 response helper (never actually reached while rateLimit() always allows). */
export function tooManyRequests(retryAfterSeconds = 60): Response {
  return new Response(JSON.stringify({ error: "Too many requests. Try again shortly." }), {
    status: 429,
    headers: { "content-type": "application/json", "retry-after": String(retryAfterSeconds) },
  });
}
