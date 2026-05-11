// Write one (url × period) metric row into url_metrics. Called by the
// skill once per URL × period after Claude has the GSC + GA4 numbers in
// hand from its Composio MCP tool calls.
//
// Usage:
//   npx tsx scripts/composio/write-metric.ts <run_id> <project_id> <path/to/metric.json>
//
// metric.json shape:
//   {
//     "url": "...",
//     "period": "30d",
//     "gsc_clicks": 0, "gsc_impressions": 0, "gsc_ctr": 0, "gsc_position": 0,
//     "gsc_top_queries": [],
//     "ga_sessions": 0, "ga_engaged_sessions": 0, "ga_engagement_rate": 0,
//     "ga_avg_engagement_time": 0, "ga_bounce_rate": 0, "ga_conversions": 0,
//     "ga_top_referrers": []
//   }
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readFileSync } from "fs";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);

(async () => {
  const runId = process.argv[2];
  const projectId = process.argv[3];
  const metricPath = process.argv[4];
  if (!runId || !projectId || !metricPath) {
    console.error("Usage: write-metric.ts <run_id> <project_id> <metric.json>");
    process.exit(2);
  }

  const m = JSON.parse(readFileSync(metricPath, "utf-8")) as Record<string, unknown>;

  const row = {
    project_id: projectId,
    url: m.url,
    period: m.period,
    gsc_clicks: m.gsc_clicks ?? 0,
    gsc_impressions: m.gsc_impressions ?? 0,
    gsc_ctr: m.gsc_ctr ?? 0,
    gsc_position: m.gsc_position ?? 0,
    gsc_top_queries: m.gsc_top_queries ?? [],
    ga_sessions: m.ga_sessions ?? 0,
    ga_engaged_sessions: m.ga_engaged_sessions ?? 0,
    ga_engagement_rate: m.ga_engagement_rate ?? 0,
    ga_avg_engagement_time: m.ga_avg_engagement_time ?? 0,
    ga_bounce_rate: m.ga_bounce_rate ?? 0,
    ga_conversions: m.ga_conversions ?? 0,
    ga_top_referrers: m.ga_top_referrers ?? [],
    snapshot_date: new Date().toISOString().slice(0, 10),
    source_run_id: runId,
  };

  const { error } = await admin
    .from("url_metrics")
    .upsert(row, { onConflict: "project_id,url,period,snapshot_date" });
  if (error) { console.error("upsert failed:", error.message); process.exit(1); }

  // Bump the run's success counter.
  const { data: run } = await admin
    .from("url_metrics_runs")
    .select("urls_succeeded")
    .eq("id", runId)
    .single();
  await admin
    .from("url_metrics_runs")
    .update({ urls_succeeded: ((run as { urls_succeeded: number } | null)?.urls_succeeded ?? 0) + 1 })
    .eq("id", runId);

  console.log(JSON.stringify({ ok: true, url: m.url, period: m.period }));
})().catch((e) => { console.error("Crash:", e); process.exit(1); });
