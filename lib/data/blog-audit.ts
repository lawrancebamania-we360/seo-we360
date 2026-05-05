import { createClient } from "@/lib/supabase/server";

export interface BlogAuditRun {
  id: string;
  pulled_at: string;
  total_urls: number;
  gsc_window_days: number;
  ga4_window_days: number;
  notes: string | null;
}

export type BlogAuditDecision = "prune" | "merge" | "refresh" | "keep";
export type BlogAuditStatus = "todo" | "in_progress" | "done" | "skipped";
export type BlogAuditPriority = "critical" | "high" | "medium" | "low";

export interface BlogAuditRow {
  id: string;
  url: string;
  gsc_clicks: number;
  gsc_impressions: number;
  gsc_position: number | null;
  gsc_ctr: number | null;
  ga4_sessions: number;
  ga4_engaged_sessions: number;
  ga4_avg_engagement_time_sec: number | null;
  decision: BlogAuditDecision;
  decision_reason: string | null;
  merge_target_url: string | null;
  merge_target_score: number | null;
  priority: BlogAuditPriority;
  status: BlogAuditStatus;
  action_taken_at: string | null;
  action_notes: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch the latest audit run + its rows. Returns null run when no audit
 * has been done yet — UI shows an empty-state with "run the script" hint.
 */
export async function getLatestBlogAudit(projectId: string): Promise<{
  run: BlogAuditRun | null;
  rows: BlogAuditRow[];
}> {
  const supabase = await createClient();
  const { data: runs } = await supabase
    .from("blog_audit_runs")
    .select("id, pulled_at, total_urls, gsc_window_days, ga4_window_days, notes")
    .eq("project_id", projectId)
    .order("pulled_at", { ascending: false })
    .limit(1);
  const run = (runs?.[0] ?? null) as BlogAuditRun | null;
  if (!run) return { run: null, rows: [] };

  const { data: rows } = await supabase
    .from("blog_audit")
    .select("*")
    .eq("project_id", projectId)
    .eq("run_id", run.id)
    .order("gsc_impressions", { ascending: false });
  return { run, rows: (rows ?? []) as BlogAuditRow[] };
}
