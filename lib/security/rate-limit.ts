// Permissive rate-limit shim for the imported AI-Visibility actions. We360 is an
// internal tool with a trusted, small user base, so the abuse-bounding rate
// limiter Klimb needed is a no-op here: every call is allowed. Signature matches
// the call sites: rateLimit(key, limit, windowSeconds) → true when allowed.

export async function rateLimit(_key: string, _limit: number, _windowSeconds: number): Promise<boolean> {
  return true;
}
