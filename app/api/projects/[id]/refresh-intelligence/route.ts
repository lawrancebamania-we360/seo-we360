import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runIntelligencePhase } from "@/lib/cron/phase-9-intelligence";
import { runCannibalization, runFreshness } from "@/lib/cron/phase-10-gsc-ga4-weekly";
import { isCronAuthorized } from "@/lib/auth/cron";
import type { Project } from "@/lib/types/database";

// Per-project monthly refresh endpoint.
// Called fire-and-forget from /api/cron/monthly-intelligence so that each
// project gets its own 60s Vercel function budget (Hobby-safe).
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

  const p = project as Project;

  // Run the 5-actor intelligence + cannibalization + freshness in parallel.
  const [intelligence, cannibalization, freshness] = await Promise.allSettled([
    runIntelligencePhase(admin, p),
    runCannibalization(admin, p),
    runFreshness(admin, p),
  ]);

  return NextResponse.json({
    ok: true,
    project_id: projectId,
    intelligence: intelligence.status === "fulfilled" ? intelligence.value : { error: String(intelligence.reason) },
    cannibalization: cannibalization.status === "fulfilled" ? cannibalization.value : { error: String(cannibalization.reason) },
    freshness: freshness.status === "fulfilled" ? freshness.value : { error: String(freshness.reason) },
  });
}
