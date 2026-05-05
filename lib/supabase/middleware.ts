import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

// URL scheme:
//   /                  -> redirect to /dashboard/overview or /login (root page handles it)
//   /login             -> Google-only sign-in for @we360.ai accounts
//   /auth/callback     -> OAuth callback (kept at /auth so Google Console URL stays stable)
//   /dashboard/*       -> authed app
//
// Unauthed landing on /dashboard/* -> kicked to /login with ?next=...
// Authed landing on /login -> bounced to /dashboard/overview

const PUBLIC_PATHS = [
  "/", "/login", "/auth/callback",
  // Dev-only bypass route. We let it through the middleware unconditionally;
  // the page itself calls notFound() outside NODE_ENV=development. Keeping
  // the env check at the middleware layer broke when process.env.NODE_ENV
  // came back undefined inside the edge proxy runtime — easier to single-
  // source the gate inside the page.
  "/dev-login",
];
const AUTH_ONLY_WHEN_LOGGED_OUT = ["/login"];
// All /api/* routes handle their own auth (user session, CRON_SECRET Bearer
// token, or public). The middleware's job is page-route gating — it should
// not intercept API traffic or it breaks self-invoking pipelines like
// /api/projects/[id]/kickoff → /api/projects/[id]/kickoff?phase=audit.
const ALWAYS_ALLOW_PREFIXES = ["/_next", "/favicon", "/api"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const e = env();
  const supabase = createServerClient(
    e.NEXT_PUBLIC_SUPABASE_URL,
    e.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
  const isAlwaysAllowed = ALWAYS_ALLOW_PREFIXES.some((p) => path.startsWith(p));

  // Unauthed trying to access anything protected -> login (with next for deep-link return)
  if (!user && !isPublic && !isAlwaysAllowed) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Authed user sitting on login -> send to dashboard
  if (user && AUTH_ONLY_WHEN_LOGGED_OUT.some((p) => path === p)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard/overview";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
