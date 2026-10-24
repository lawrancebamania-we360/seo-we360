import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/auth/cron";
import { runContentDistributionSync } from "@/lib/cron/content-distribution";

// Daily content-distribution sync: fetch each feed-capable platform (dev.to,
// Medium, Substack, Tumblr, Blogger, the web2.0 WordPress blogs) and record
// every post as a Backlink Submission + a Team Target credit. Deduped, so this
// is safe to run more than once a day. LinkedIn / Quora / Google Sites / ghost /
// telegra.ph have no public feed and are pulled via Claude-in-Chrome instead.
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const summary = await runContentDistributionSync(admin);
  return NextResponse.json(summary);
}

export async function POST(request: NextRequest) {
  return GET(request);
}
