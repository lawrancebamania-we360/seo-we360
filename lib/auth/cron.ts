import { env } from "@/lib/env";

// Vercel Cron + our internal fan-out fetches authenticate with a single shared
// secret in the Authorization header: `Bearer <CRON_SECRET>`. This helper keeps
// the check in one place so every cron route guards it the same way.
//
// Returns `true` if the request is authorised, `false` otherwise. Caller decides
// how to respond — typically 401.
export function isCronAuthorized(headerValue: string | null): boolean {
  const { CRON_SECRET } = env();
  if (!CRON_SECRET) return false;
  return headerValue === `Bearer ${CRON_SECRET}`;
}

/**
 * Run `fn` under a named lock. Klimb uses a TTL DB row-lock so Vercel +
 * cron-job.org double-scheduling can't double-run. We360 is an internal,
 * low-concurrency tool with manual-only AI-Visibility runs, so this is a
 * pass-through: it simply runs `fn` and returns its result (never null). The
 * imported actions call it to serialize per-project runs; run.ts's own
 * prompt×engine×run_index dedupe already prevents any double-billing if two
 * slices ever overlap. Returns `T | null` to match the call sites.
 */
export async function withCronLock<T>(
  _key: string,
  _ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  return fn();
}
