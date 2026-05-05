import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/auth/cron";
import { env } from "@/lib/env";

// Monthly intelligence refresh — runs 1st of every month at 03:00 UTC.
// Hobby-safe pattern: this cron does NOT do the heavy work itself. It
// fire-and-forget triggers the per-project /refresh-intelligence endpoint for
// every active project. Each project then gets its own 60s Vercel function
// budget — so we stay within Hobby limits regardless of project count.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: projects } = await supabase.from("projects")
    .select("id, domain, name").eq("is_active", true);
  const rows = (projects ?? []) as Array<{ id: string; domain: string; name: string }>;

  const e = env();
  const baseUrl = e.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const triggered: Array<{ project_id: string; domain: string }> = [];

  for (const project of rows) {
    // fire-and-forget — each per-project endpoint gets its own 60s budget
    fetch(`${baseUrl}/api/projects/${project.id}/refresh-intelligence`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${e.CRON_SECRET ?? ""}`,
      },
    }).catch(() => { /* swallow — project's own run log will reflect failure */ });
    triggered.push({ project_id: project.id, domain: project.domain });
  }

  return NextResponse.json({
    ok: true,
    ran_at: new Date().toISOString(),
    projects_triggered: triggered.length,
    projects: triggered,
    note: "Each project processes in its own 60s Vercel function budget. Check intelligence_runs + keyword_cannibalization + content_freshness tables in ~5 min for results.",
  });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
