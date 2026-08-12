import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runCompetitorKeywordPhase } from "@/lib/cron/phase-11-competitor-keywords";
import { isCronAuthorized } from "@/lib/auth/cron";
import type { Project } from "@/lib/types/database";

// Per-project monthly competitor-keyword refresh endpoint (santhej/website-
// traffic-intel). Split out from /refresh-intelligence into its own route —
// and therefore its own 60s Vercel function budget — because it's up to 6
// sequential Apify calls (1 batched overview + up to 5 keyword_gap, one per
// competitor); chaining it after phase-9's own ~80s intelligence run would
// blow a shared Hobby-plan budget. Called fire-and-forget alongside
// /refresh-intelligence from /api/cron/monthly-intelligence.
// Auth: CRON_SECRET bearer token only.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;
  const admin = createAdminClient();
  const { data: project } = await admin.from("projects").select("*").eq("id", projectId).single();
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const result = await runCompetitorKeywordPhase(admin, project as Project);

  return NextResponse.json({ ok: true, project_id: projectId, competitor_keywords: result });
}
