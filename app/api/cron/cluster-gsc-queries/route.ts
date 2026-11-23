import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/auth/cron";
import { isMissingColumn } from "@/lib/ai-citation/run-state";
import { refreshClusterGscQueries } from "@/lib/blog-clusters/gsc-refresh";

// Weekly Blog Clusters GSC-queries refresh (GC-2). For every project with a
// Search Console property, refreshes its clusters - least-recently refreshed
// first - until the time budget runs out; the next run picks up the rest.
// Each refresh only assigns NEW, untouched queries (Claude, keyword fallback);
// anything a person assigned is never overwritten.

export const runtime = "nodejs";
export const maxDuration = 300;

const BUDGET_MS = 240_000;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const admin = createAdminClient();

  const { data: projects } = await admin.from("projects").select("id, gsc_property_url").not("gsc_property_url", "is", null);
  const results: Array<{ clusterId: string; ok: boolean; fetched: number; added: number; ai: string; error?: string }> = [];
  let budgetHit = false;

  for (const p of (projects ?? []) as { id: string; gsc_property_url: string }[]) {
    const res = await admin.from("topic_clusters").select("id, gsc_refresh").eq("project_id", p.id);
    if (res.error && isMissingColumn(res.error.message)) {
      return NextResponse.json({ ran_at: new Date().toISOString(), skipped: "Migration 20261123000001 not applied yet." });
    }
    const clusters = ((res.data ?? []) as { id: string; gsc_refresh: { at?: string } | null }[])
      .sort((a, b) => (a.gsc_refresh?.at ?? "").localeCompare(b.gsc_refresh?.at ?? ""));
    for (const c of clusters) {
      if (Date.now() - startedAt > BUDGET_MS) { budgetHit = true; break; }
      const r = await refreshClusterGscQueries(admin, { projectId: p.id, clusterId: c.id, siteUrl: p.gsc_property_url });
      results.push({ clusterId: c.id, ok: r.ok, fetched: r.fetched, added: r.added, ai: r.ai, error: r.error ?? r.aiError ?? undefined });
    }
    if (budgetHit) break;
  }

  return NextResponse.json({ ran_at: new Date().toISOString(), refreshed: results.length, budgetHit, results });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
