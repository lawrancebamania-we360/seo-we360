// Read API for url_metrics (We360 storage model).
//
// Unlike Klimb's daily-granularity url_metrics, We360 stores ONE PRE-AGGREGATED
// row per (project_id × url × period), where period ∈ '30d'|'60d'|'90d' and
// snapshot_date marks when the daily sync wrote it. So a windowed read here just
// selects the rows for the requested period and keeps the latest snapshot per
// url — no read-time aggregation needed. The returned UrlMetricWindow shape is
// kept identical to Klimb's so the Analytics "Page engagement" section (and any
// other consumer) can be reused unchanged.

import { createClient } from "@/lib/supabase/server";

export type MetricWindow = "30d" | "60d" | "90d";

export interface UrlTopQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr?: number;
  position: number;
}

export interface UrlTopReferrer { source: string; sessions: number; }

export interface UrlMetricWindow {
  url: string;
  window: MetricWindow;
  // GSC
  gsc_clicks: number;
  gsc_impressions: number;
  gsc_ctr: number;
  gsc_position: number;
  gsc_top_queries: UrlTopQuery[];
  // GA4
  ga_sessions: number;
  ga_engaged_sessions: number;
  ga_engagement_rate: number;
  ga_avg_engagement_time: number;
  ga_bounce_rate: number;
  ga_conversions: number;
  ga_top_referrers: UrlTopReferrer[];
  // Metadata
  days_covered: number;
  latest_captured_on: string | null;
}

function windowDays(w: MetricWindow): number {
  return w === "30d" ? 30 : w === "60d" ? 60 : 90;
}

interface PeriodRow {
  url: string;
  period: MetricWindow;
  gsc_clicks: number | null;
  gsc_impressions: number | null;
  gsc_ctr: number | null;
  gsc_position: number | null;
  gsc_top_queries: UrlTopQuery[] | null;
  ga_sessions: number | null;
  ga_engaged_sessions: number | null;
  ga_engagement_rate: number | null;
  ga_avg_engagement_time: number | null;
  ga_bounce_rate: number | null;
  ga_conversions: number | null;
  ga_top_referrers: UrlTopReferrer[] | null;
  snapshot_date: string | null;
}

/** Map a stored period row into the shared UrlMetricWindow shape. */
function toWindow(win: MetricWindow, r: PeriodRow): UrlMetricWindow {
  return {
    url: r.url,
    window: win,
    gsc_clicks: Number(r.gsc_clicks) || 0,
    gsc_impressions: Number(r.gsc_impressions) || 0,
    gsc_ctr: Number(r.gsc_ctr) || 0,
    gsc_position: Number(r.gsc_position) || 0,
    gsc_top_queries: (r.gsc_top_queries ?? []).slice(0, 10),
    ga_sessions: Number(r.ga_sessions) || 0,
    ga_engaged_sessions: Number(r.ga_engaged_sessions) || 0,
    ga_engagement_rate: Number(r.ga_engagement_rate) || 0,
    ga_avg_engagement_time: Number(r.ga_avg_engagement_time) || 0,
    ga_bounce_rate: Number(r.ga_bounce_rate) || 0,
    ga_conversions: Number(r.ga_conversions) || 0,
    ga_top_referrers: (r.ga_top_referrers ?? []).slice(0, 5),
    days_covered: windowDays(win),
    latest_captured_on: r.snapshot_date,
  };
}

/**
 * Project-scoped: the top pages by traffic over the window, each as a windowed
 * UrlMetricWindow (so the caller has bounce/engagement/conversions/referrers).
 * Powers the Analytics "Page engagement" table. Pages with zero sessions are
 * dropped (nothing to say about engagement), and the highest-traffic pages win
 * the `limit` cap. RLS-scoped via the table's has_project_access policy.
 */
export async function getTopPagesByEngagement(
  projectId: string,
  win: MetricWindow = "30d",
  limit = 25,
): Promise<UrlMetricWindow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("url_metrics")
    .select(
      "url, period, gsc_clicks, gsc_impressions, gsc_ctr, gsc_position, gsc_top_queries, ga_sessions, ga_engaged_sessions, ga_engagement_rate, ga_avg_engagement_time, ga_bounce_rate, ga_conversions, ga_top_referrers, snapshot_date",
    )
    .eq("project_id", projectId)
    .eq("period", win)
    .order("snapshot_date", { ascending: false });

  const rows = (data ?? []) as PeriodRow[];
  // Keep only the latest snapshot per url (rows arrive newest-first).
  const seen = new Set<string>();
  const out: UrlMetricWindow[] = [];
  for (const r of rows) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    out.push(toWindow(win, r));
  }
  return out
    .filter((m) => m.ga_sessions > 0)
    .sort((a, b) => b.ga_sessions - a.ga_sessions)
    .slice(0, limit);
}
