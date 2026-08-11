import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/get-user";
import { buildAuthUrl, signState, requestOrigin } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

// Kick off the Google consent flow. Admin-only. Sets a short-lived httpOnly
// nonce cookie that the callback checks against the signed state (CSRF guard),
// then redirects the browser to Google's consent screen.
export async function GET(request: Request) {
  await requireAdmin();

  const origin = requestOrigin(new Headers(request.headers), request.url);
  const nonce = crypto.randomBytes(16).toString("hex");
  const state = signState({ nonce });

  const res = NextResponse.redirect(buildAuthUrl(state, origin));
  res.cookies.set("g_oauth_nonce", nonce, {
    httpOnly: true,
    secure: origin.startsWith("https"),
    sameSite: "lax", // sent on the top-level GET redirect back from Google
    maxAge: 600,
    path: "/",
  });
  return res;
}
