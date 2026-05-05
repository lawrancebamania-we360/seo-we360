import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOpportunityPools } from "@/lib/google/gsc-opportunities";
import type { Project } from "@/lib/types/database";

// Admin-only endpoint that pulls GSC Search Analytics for the last 90 days and
// upserts two opportunity pools into the `keywords` table:
//   - striking_distance: pos 11-20 with ≥100 impressions, non-brand
//   - zero_click:        ≤1 click with ≥200 impressions, non-brand
//
// These are the two content-pool buckets the 100K Plan §2.5 calls out as the
// highest-ROI workstreams for Months 1-2. Re-running the route is idempotent —
// we upsert on (project_id, keyword) so existing rows get their metadata
// refreshed without duplicating.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (me as { role?: string } | null)?.role;
  if (role !== "super_admin" && role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const projectIdParam = url.searchParams.get("project_id");

  const admin = createAdminClient();
  const { data: projects } = await admin.from("projects").select("*").eq("is_active", true);
  const activeProjects = ((projects ?? []) as Project[]).filter(
    (p) => !projectIdParam || p.id === projectIdParam
  );
  if (activeProjects.length === 0) {
    return NextResponse.json({ error: "no active project" }, { status: 404 });
  }

  const results: Record<string, unknown>[] = [];

  for (const project of activeProjects) {
    const { connected, reason, pools } = await getOpportunityPools(project.gsc_property_url, {
      windowDays: 90,
      minStrikingImpr: 100,
      minZeroClickImpr: 200,
    });
    if (!connected || !pools) {
      results.push({ project_id: project.id, skipped: reason });
      continue;
    }

    const keywordRowsMap = new Map<string, {
      project_id: string;
      keyword: string;
      current_rank: number | null;
      target_rank: number | null;
      priority: "critical" | "high" | "medium" | "low";
      intent: null;
      source: "gsc";
      trend: "new";
      cluster: string;
      target_page: string | null;
      created_by: string;
    }>();

    // Striking distance — priority=high, target top 10
    for (const r of pools.strikingDistance) {
      keywordRowsMap.set(r.query, {
        project_id: project.id,
        keyword: r.query,
        current_rank: Math.round(r.position),
        target_rank: 5,
        priority: "high",
        intent: null,
        source: "gsc",
        trend: "new",
        cluster: "striking-distance",
        target_page: r.page,
        created_by: user.id,
      });
    }
    // Zero-click — priority=medium, target top 5 (intent/CTR problem)
    for (const r of pools.zeroClick) {
      // Don't overwrite a striking-distance row with a zero-click one
      if (keywordRowsMap.has(r.query)) continue;
      keywordRowsMap.set(r.query, {
        project_id: project.id,
        keyword: r.query,
        current_rank: r.position > 0 ? Math.round(r.position) : null,
        target_rank: 5,
        priority: "medium",
        intent: null,
        source: "gsc",
        trend: "new",
        cluster: "zero-click-high-impression",
        target_page: r.page,
        created_by: user.id,
      });
    }

    const keywordRows = [...keywordRowsMap.values()];

    // Batch upsert so we don't hit row-size limits
    const BATCH = 100;
    let upserted = 0;
    for (let i = 0; i < keywordRows.length; i += BATCH) {
      const chunk = keywordRows.slice(i, i + BATCH);
      const { error } = await admin
        .from("keywords")
        .upsert(chunk, { onConflict: "project_id,keyword" });
      if (!error) upserted += chunk.length;
    }

    results.push({
      project_id: project.id,
      totals: pools.totals,
      striking_distance: pools.strikingDistance.length,
      zero_click: pools.zeroClick.length,
      alternative_vs: pools.alternativeVs.length,
      upserted_into_keywords: upserted,
    });
  }

  return NextResponse.json({ ok: true, results });
}
