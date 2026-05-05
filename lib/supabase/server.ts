import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

// Database generic intentionally NOT threaded here — the generated
// lib/types/supabase.ts is available, but many columns are JSONB narrowed at
// the app layer (Entitlements, BlogBrief, apify_keywords) and FK relationships
// return SelectQueryError shapes unless every join is re-authored. Threading
// <Database> is tracked as a follow-up refactor; casts at the call site are
// the interim pattern.
export async function createClient() {
  const cookieStore = await cookies();
  const e = env();

  return createServerClient(
    e.NEXT_PUBLIC_SUPABASE_URL,
    e.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — cookie mutation handled by middleware.
          }
        },
      },
    }
  );
}
