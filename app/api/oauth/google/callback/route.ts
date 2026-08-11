import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  verifyState,
  exchangeCodeForTokens,
  getUserInfo,
  encrypt,
  requestOrigin,
  DEFAULT_SCOPES,
} from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

// Google redirects here after consent. We verify the CSRF state + nonce cookie,
// exchange the code for tokens, encrypt the refresh token, and upsert the GLOBAL
// integrations row (provider='google'). Then bounce back to the Integrations
// page with a ?google=<status> flag the UI turns into a toast.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = requestOrigin(new Headers(request.headers), request.url);
  const back = (status: string) =>
    NextResponse.redirect(`${origin}/dashboard/integrations?google=${status}`);

  const oauthError = url.searchParams.get("error");
  if (oauthError) return back(`error:${encodeURIComponent(oauthError)}`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return back("error:missing_code");

  // CSRF: signed state must verify AND its nonce must match the cookie we set.
  const parsed = verifyState(state);
  const cookieStore = await cookies();
  const nonce = cookieStore.get("g_oauth_nonce")?.value;
  if (!parsed || !nonce || parsed.nonce !== nonce) return back("error:bad_state");

  try {
    await requireAdmin();

    const tokens = await exchangeCodeForTokens(code, origin);
    if (!tokens.refresh_token) {
      // Happens if the user previously granted without prompt=consent. Our start
      // route always forces consent, so this should be rare.
      return back("error:no_refresh_token");
    }
    const info = await getUserInfo(tokens.access_token);

    const admin = createAdminClient();
    const config = {
      auth_type: "oauth",
      refresh_token_encrypted: encrypt(tokens.refresh_token),
      connected_email: info.email,
      scope: tokens.scope ?? [...DEFAULT_SCOPES].join(" "),
      connected_at: new Date().toISOString(),
    };

    // The unique(project_id, provider) constraint doesn't enforce uniqueness for
    // NULL project_id (NULLs are distinct), so upsert-on-conflict would insert a
    // dup. Find-or-update by id instead to keep exactly one global google row.
    const { data: existing } = await admin
      .from("integrations")
      .select("id")
      .eq("provider", "google")
      .is("project_id", null)
      .limit(1);

    if (existing && existing.length > 0) {
      await admin
        .from("integrations")
        .update({
          status: "connected",
          enabled: true,
          last_checked_at: new Date().toISOString(),
          last_error: null,
          config,
        })
        .eq("id", (existing[0] as { id: string }).id);
    } else {
      await admin.from("integrations").insert({
        project_id: null,
        provider: "google",
        status: "connected",
        enabled: true,
        last_checked_at: new Date().toISOString(),
        config,
      });
    }

    const res = back("connected");
    res.cookies.delete("g_oauth_nonce");
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 120) : "exchange_failed";
    return back(`error:${encodeURIComponent(msg)}`);
  }
}
