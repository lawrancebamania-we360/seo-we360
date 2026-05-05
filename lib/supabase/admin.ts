import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Service-role client — bypasses RLS. SERVER-ONLY. Never ship to client bundle.
// Use in: cron endpoints, webhooks, admin bootstrap scripts.
// Database generic deferred — see lib/supabase/server.ts.
export function createAdminClient() {
  const e = env();
  return createSupabaseClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
