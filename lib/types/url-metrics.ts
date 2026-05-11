// Shared types for url_metrics — the central GSC + GA4 store.
// Populated daily by the local Claude Code skill via Composio; read by
// the blog audit page, task detail dialog, web tasks list, and the brief
// data_backing auto-fill.

export type MetricPeriod = "30d" | "60d" | "90d";

export interface UrlTopQuery {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface UrlTopReferrer {
  source: string;
  sessions: number;
}

export interface UrlMetric {
  id: string;
  project_id: string;
  url: string;
  period: MetricPeriod;
  // GSC
  gsc_clicks: number;
  gsc_impressions: number;
  gsc_ctr: number;            // 0-1
  gsc_position: number;       // avg position
  gsc_top_queries: UrlTopQuery[] | null;
  // GA4
  ga_sessions: number;
  ga_engaged_sessions: number;
  ga_engagement_rate: number; // 0-1
  ga_avg_engagement_time: number; // seconds
  ga_bounce_rate: number;     // 0-1
  ga_conversions: number;
  ga_top_referrers: UrlTopReferrer[] | null;
  // Lifecycle
  snapshot_date: string;
  pulled_at: string;
  source_run_id: string | null;
}

export interface UrlMetricsRun {
  id: string;
  project_id: string;
  started_at: string;
  finished_at: string | null;
  urls_total: number;
  urls_succeeded: number;
  urls_failed: number;
  status: "running" | "completed" | "failed";
  error_message: string | null;
}

// Format a url_metric row as the human-readable data_backing string that
// shows up in the task detail dialog + gets pasted into the AI prompt.
export function formatDataBacking(m: UrlMetric): string {
  const lines: string[] = [];
  lines.push(`Live GSC (last ${m.period}):`);
  lines.push(`  • ${m.gsc_clicks.toLocaleString()} clicks, ${m.gsc_impressions.toLocaleString()} impressions`);
  lines.push(`  • avg position ${m.gsc_position.toFixed(1)}, CTR ${(m.gsc_ctr * 100).toFixed(2)}%`);
  if (m.gsc_top_queries && m.gsc_top_queries.length > 0) {
    lines.push(`  • top queries: ${m.gsc_top_queries.slice(0, 5).map((q) => `"${q.query}" (${q.clicks}c/${q.impressions}i, pos ${q.position.toFixed(1)})`).join(", ")}`);
  }
  lines.push("");
  lines.push(`Live GA4 (last ${m.period}):`);
  lines.push(`  • ${m.ga_sessions.toLocaleString()} sessions, ${m.ga_engaged_sessions.toLocaleString()} engaged`);
  lines.push(`  • engagement rate ${(m.ga_engagement_rate * 100).toFixed(1)}%, avg time ${m.ga_avg_engagement_time}s`);
  if (m.ga_top_referrers && m.ga_top_referrers.length > 0) {
    lines.push(`  • top referrers: ${m.ga_top_referrers.slice(0, 3).map((r) => `${r.source} (${r.sessions})`).join(", ")}`);
  }
  return lines.join("\n");
}

// Decision helper — used by the blog audit page on top of url_metrics.
export function classifyUrl(m: UrlMetric): "prune" | "merge" | "refresh" | "keep" {
  // Prune: invisible to Google AND no traffic
  if (m.gsc_impressions === 0 && m.ga_sessions === 0) return "prune";

  // Refresh: striking distance (position 8-20) with non-zero impressions
  if (m.gsc_position >= 8 && m.gsc_position <= 20 && m.gsc_impressions > 50) return "refresh";

  // Merge: low engagement, low traffic, low position — likely cannibalized
  if (m.gsc_position > 30 && m.ga_sessions < 20 && m.ga_engagement_rate < 0.3) return "merge";

  // Keep: top 10, decent engagement, or just performing
  return "keep";
}
