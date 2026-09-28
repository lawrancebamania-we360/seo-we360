import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/auth/cron";
import { runUrlMetricsTick } from "@/lib/cron/url-metrics";

// Daily GA4 + GSC url_metrics sync, split across several hour-staggered
// cron entries (see vercel.json) since the full URL list x 3 periods
// doesn't fit in one invocation. Each tick resumes from wherever the last
// one left off for the day - see lib/cron/url-metrics.ts for the cursor
// design. Idempotent to call more than needed: once today's run is
// "completed", further ticks are instant no-ops.

export const runtime = "nodejs";
export const maxDuration = 300; // Hobby's actual max (not 60s - see git history)

// Leave real margin under the 300s ceiling for the in-flight task + the
// final persist to land safely.
const TICK_BUDGET_MS = 260_000;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const summary = await runUrlMetricsTick(admin, { budgetMs: TICK_BUDGET_MS });

  return NextResponse.json({
    ran_at: new Date().toISOString(),
    ...summary,
  });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
