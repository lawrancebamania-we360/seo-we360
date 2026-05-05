import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runFullSiteAudit } from "@/lib/cron/phase-1-audit";
import { verifyCompletedTasks } from "@/lib/cron/phase-2-tasks";
import { runPageSpeed } from "@/lib/cron/phase-4-cwv";
import { updateKeywordRankings } from "@/lib/cron/phase-5-rankings";
import { recalculatePillarScores } from "@/lib/cron/phase-7-pillars";
import { checkCompetitors } from "@/lib/cron/phase-8-competitors";
import { runCannibalization, runFreshness } from "@/lib/cron/phase-10-gsc-ga4-weekly";
import { isCronAuthorized } from "@/lib/auth/cron";

// Daily audit cron.
// - Monday: handled by /api/cron/blog-discovery (Apify), this endpoint skips.
// - Tuesday: FULL audit — all pages + new tasks + pillar recalc + PageSpeed.
// - Wed–Sun: LIGHT verify — only re-check URLs with open tasks, refresh CWV + pillars.
// - Wednesday also refreshes competitors.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: projects } = await supabase.from("projects").select("*").eq("is_active", true);
  const day = new Date().getUTCDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat

  const results: Record<string, unknown> = {};

  for (const project of projects ?? []) {
    const projResult: Record<string, unknown> = { domain: project.domain, day };

    try {
      if (day === 1) {
        projResult.skipped = "Mondays handled by /api/cron/blog-discovery";
      } else if (day === 2) {
        projResult.phase1 = await runFullSiteAudit(supabase, project);
        projResult.phase4 = await runPageSpeed(supabase, project);
        projResult.phase7 = await recalculatePillarScores(supabase, project);
      } else {
        projResult.phase2 = await verifyCompletedTasks(supabase, project);
        projResult.phase4 = await runPageSpeed(supabase, project);
        projResult.phase5 = await updateKeywordRankings(supabase, project);
        projResult.phase7 = await recalculatePillarScores(supabase, project);
        if (day === 3) {
          projResult.phase8 = await checkCompetitors(supabase, project);
          projResult.cannibalization = await runCannibalization(supabase, project);
          projResult.freshness = await runFreshness(supabase, project);
        }
      }
    } catch (e) {
      projResult.error = e instanceof Error ? e.message : String(e);
    }

    results[project.id] = projResult;
  }

  return NextResponse.json({ ok: true, ran_at: new Date().toISOString(), day, results });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
