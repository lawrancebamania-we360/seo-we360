import { createBrowserClient } from "@supabase/ssr";

// Browser bundle: can't import lib/env (it reads server-only vars). Next.js
// inlines NEXT_PUBLIC_* at build time, so non-null assertions are the
// idiomatic pattern here. Database generic deferred — see lib/supabase/server.ts.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
