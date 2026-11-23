import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isCronAuthorized } from "@/lib/auth/cron";
import { isMissingColumn } from "@/lib/ai-citation/run-state";
import { planClusterGscPages } from "@/lib/blog-clusters/gsc-plan";

// Weekly Blog Clusters planning step (GC-15..GC-19), run after the GSC-queries
// refresh by the same GitHub workflow. Per cluster: Google's US mobile top 3
// (Apify), a read of our page and the top-3 pages, then one Claude plan per
// page. Each call works to a deadline; a cluster that isn't finished is picked
// up by the next call (everything is cached). `budgetHit` tells the caller to
// call again. Clusters planned in the last 6 hours count as done (one pass per
// run); ?since=<ISO time> forces a pass over clusters planned before that.

export const runtime = "nodejs";
export const maxDuration = 300;

const DEADLINE_MS = 250_000;     // stop starting new work after this
const NEXT_CLUSTER_MS = 120_000; // only start another cluster while under this
const FRESH_MS = 6 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const deadline = startedAt + DEADLINE_MS;
  const admin = createAdminClient();
  const sinceParam = request.nextUrl.searchParams.get("since");
  const sinceMs = sinceParam && !Number.isNaN(Date.parse(sinceParam)) ? Date.parse(sinceParam) : startedAt - FRESH_MS;

  const { data: projects } = await admin.from("projects").select("id, gsc_property_url").not("gsc_property_url", "is", null);
  const results: Array<{ clusterId: string; ok: boolean; done: boolean; serpChecked: number; pagesRead: number; pagesPlanned: number; termsPlanned: number; errors: string[]; error?: string }> = [];
  let budgetHit = false;

  for (const p of (projects ?? []) as { id: string }[]) {
    const res = await admin.from("topic_clusters").select("id, gsc_plan").eq("project_id", p.id);
    if (res.error && isMissingColumn(res.error.message)) {
      return NextResponse.json({ ran_at: new Date().toISOString(), skipped: "Migration 20261125000001 not applied yet." });
    }
    const clusters = ((res.data ?? []) as { id: string; gsc_plan: { at?: string } | null }[])
      .filter((c) => !c.gsc_plan?.at || Date.parse(c.gsc_plan.at) < sinceMs)
      .sort((a, b) => (a.gsc_plan?.at ?? "").localeCompare(b.gsc_plan?.at ?? ""));
    for (const c of clusters) {
      if (Date.now() - startedAt > NEXT_CLUSTER_MS) { budgetHit = true; break; }
      const r = await planClusterGscPages(admin, { projectId: p.id, clusterId: c.id, deadline });
      results.push({ clusterId: c.id, ...r });
      if (!r.ok) {
        // Can't plan this cluster at all (e.g. migration) - record and move on.
        await admin.from("topic_clusters").update({ gsc_plan: { at: new Date().toISOString(), error: r.error ?? "failed" } }).eq("id", c.id);
        continue;
      }
      if (r.done) {
        await admin.from("topic_clusters").update({
          gsc_plan: { at: new Date().toISOString(), termsPlanned: r.termsPlanned, pagesPlanned: r.pagesPlanned, errors: r.errors.slice(0, 5) },
        }).eq("id", c.id);
      } else {
        budgetHit = true; // ran out of time mid-cluster - the next call continues it
        break;
      }
    }
    if (budgetHit) break;
  }

  return NextResponse.json({ ran_at: new Date().toISOString(), planned: results.length, budgetHit, results });
}
