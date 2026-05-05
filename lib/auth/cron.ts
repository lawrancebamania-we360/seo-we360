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
