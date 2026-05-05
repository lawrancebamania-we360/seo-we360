import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "@/lib/types/database";
import { getGscCannibalization } from "@/lib/google/gsc";
import { getGa4FreshnessDecay } from "@/lib/google/ga4";

// Runs weekly inside the daily-audit cron:
//  - Cannibalization detector: flags queries where 2+ project URLs compete
//  - Content freshness tracker: flags pages whose traffic decayed vs 90d baseline
// Both replace prior snapshots so the dashboard always reads the latest.
// Decaying pages auto-generate a "refresh content" task.

export interface CannibalizationRunResult {
  connected: boolean;
  reason?: string;
  hits_inserted: number;
  high_severity: number;
}

export interface FreshnessRunResult {
  connected: boolean;
  reason?: string;
  pages_tracked: number;
  decaying: number;
  refresh_tasks_created: number;
}

export async function runCannibalization(
  supabase: SupabaseClient,
  project: Project
): Promise<CannibalizationRunResult> {
  const { connected, reason, hits } = await getGscCannibalization(project.gsc_property_url);
  if (!connected) return { connected: false, reason, hits_inserted: 0, high_severity: 0 };

  // Replace prior snapshot so the UI shows the current state
  await supabase.from("keyword_cannibalization").delete().eq("project_id", project.id);

  if (hits.length === 0) return { connected: true, hits_inserted: 0, high_severity: 0 };

  const rows = hits.map((h) => ({
    project_id: project.id,
    query: h.query,
    competing_urls: h.competing_urls,
    url_count: h.url_count,
    total_clicks: h.total_clicks,
    total_impressions: h.total_impressions,
    severity: h.severity,
    click_split_ratio: h.click_split_ratio,
  }));
  await supabase.from("keyword_cannibalization").insert(rows);

  return {
    connected: true,
    hits_inserted: hits.length,
    high_severity: hits.filter((h) => h.severity === "high").length,
  };
}

export async function runFreshness(
  supabase: SupabaseClient,
  project: Project
): Promise<FreshnessRunResult> {
  const { connected, reason, rows } = await getGa4FreshnessDecay(project.ga4_property_id);
  if (!connected) return { connected: false, reason, pages_tracked: 0, decaying: 0, refresh_tasks_created: 0 };

  // Replace prior snapshot
  await supabase.from("content_freshness").delete().eq("project_id", project.id);

  if (rows.length === 0) return { connected: true, pages_tracked: 0, decaying: 0, refresh_tasks_created: 0 };

  const inserted = rows.map((r) => ({
    project_id: project.id,
    page_path: r.page,
    views_last_7d: r.viewsLast7d,
    views_prior_30d: r.viewsPrior30d,
    views_prior_90d: r.viewsPrior90d,
    decay_pct: r.decayPct,
    status: r.status,
  }));
  await supabase.from("content_freshness").insert(inserted);

  // Auto-create refresh tasks for decaying pages that don't already have one open
  let refreshTasks = 0;
  const decayingPages = rows.filter((r) => r.status === "decaying").slice(0, 5);
  for (const r of decayingPages) {
    const taskTitle = `Refresh content: ${r.page}`;
    const { data: existing } = await supabase
      .from("tasks").select("id").eq("project_id", project.id)
      .eq("title", taskTitle).neq("status", "completed").maybeSingle();
    if (existing) continue;

    const { error } = await supabase.from("tasks").insert({
      project_id: project.id,
      title: taskTitle,
      kind: "task",
      source: "cron_audit",
      priority: "medium",
      pillar: "aeo",
      issue: `Traffic down ${Math.abs(r.decayPct)}% vs 90-day baseline (${r.viewsLast7d} last 7d vs ${r.viewsPrior90d} over prior 90d).`,
      impl: "Refresh the article: update stats, add new sections, improve intro, add current-year examples. Re-submit to GSC for indexing.",
      status: "backlog",
    });
    if (!error) refreshTasks++;
  }

  return {
    connected: true,
    pages_tracked: rows.length,
    decaying: rows.filter((r) => r.status === "decaying").length,
    refresh_tasks_created: refreshTasks,
  };
}
