import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/auth/cron";
import { runInfluencerPostSync } from "@/lib/cron/influencer-posts";

// Daily influencer-post sync: reactions / comments / reposts for every LinkedIn
// collab post during its first 15 days, plus a one-time lookup of the we360.ai
// links in the post and the influencer's comment. See lib/cron/influencer-posts.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const summary = await runInfluencerPostSync(createAdminClient());
  return NextResponse.json(summary);
}

export async function POST(request: NextRequest) {
  return GET(request);
}
