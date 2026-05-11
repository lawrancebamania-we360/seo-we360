// End-to-end daily sync: pull GA4 + GSC for every tracked URL × 30/60/90
// day windows, write to url_metrics. One Node entrypoint, no MCP needed.
//
// Usage: npx tsx scripts/composio/sync-url-metrics.ts
//
// Reads COMPOSIO_API_KEY from .env.local. Pulls URLs from the tasks table
// plus a fixed list of important pages. Sleeps 350ms between calls to stay
// well under Composio's rate limit (20K-100K/10min depending on plan).
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { ga4UrlSnapshot, gscUrlSnapshot, urlToPagePath } from "@/lib/integrations/composio";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);

const PROJECT_ID = "11111111-1111-4111-8111-000000000001";
const GA4_PROPERTY_ID = "273620287";
const GSC_SITE_URL = "https://we360.ai/";
const PERIODS = [30, 60, 90] as const;

const FIXED_URLS = [
  "https://we360.ai/",
  "https://we360.ai/pricing",
  "https://we360.ai/contact",
];

async function listUrls(): Promise<string[]> {
  const { data } = await admin
    .from("tasks")
    .select("published_url, url")
    .eq("project_id", PROJECT_ID);

  const set = new Set<string>(FIXED_URLS);
  for (const t of (data ?? []) as Array<{ published_url: string | null; url: string | null }>) {
    if (t.published_url) set.add(normalize(t.published_url));
    if (t.url && t.url.startsWith("http")) set.add(normalize(t.url));
  }
  return [...set].sort();
}

function normalize(url: string): string {
  try { const u = new URL(url); u.hash = ""; return u.toString(); }
  catch { return url; }
}

async function startRun(): Promise<string> {
  const { data, error } = await admin
    .from("url_metrics_runs")
    .insert({ project_id: PROJECT_ID, status: "running" })
    .select("id")
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

async function writeMetric(runId: string, url: string, period: 30 | 60 | 90, gsc: Awaited<ReturnType<typeof gscUrlSnapshot>>, ga: Awaited<ReturnType<typeof ga4UrlSnapshot>>): Promise<void> {
  const row = {
    project_id: PROJECT_ID,
    url,
    period: `${period}d`,
    gsc_clicks: gsc.clicks,
    gsc_impressions: gsc.impressions,
    gsc_ctr: gsc.ctr,
    gsc_position: gsc.position,
    gsc_top_queries: gsc.topQueries,
    ga_sessions: ga.sessions,
    ga_engaged_sessions: ga.engagedSessions,
    ga_engagement_rate: ga.engagementRate,
    ga_avg_engagement_time: Math.round(ga.averageEngagementTime),
    ga_bounce_rate: ga.bounceRate,
    ga_conversions: ga.conversions,
    ga_top_referrers: ga.topReferrers,
    snapshot_date: new Date().toISOString().slice(0, 10),
    source_run_id: runId,
  };
  const { error } = await admin
    .from("url_metrics")
    .upsert(row, { onConflict: "project_id,url,period,snapshot_date" });
  if (error) throw error;
}

async function bumpCounter(runId: string, field: "urls_succeeded" | "urls_failed"): Promise<void> {
  const { data } = await admin
    .from("url_metrics_runs")
    .select(field)
    .eq("id", runId)
    .single();
  const current = (data as Record<string, number> | null)?.[field] ?? 0;
  await admin
    .from("url_metrics_runs")
    .update({ [field]: current + 1 })
    .eq("id", runId);
}

async function finishRun(runId: string, urlsTotal: number, errorMsg?: string): Promise<void> {
  await admin
    .from("url_metrics_runs")
    .update({
      finished_at: new Date().toISOString(),
      urls_total: urlsTotal,
      status: errorMsg ? "failed" : "completed",
      error_message: errorMsg ?? null,
    })
    .eq("id", runId);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

(async () => {
  console.log("Sync url_metrics — start");
  const runId = await startRun();
  console.log(`  run_id=${runId}\n`);

  const urls = await listUrls();
  console.log(`  ${urls.length} URLs to process × ${PERIODS.length} periods = ${urls.length * PERIODS.length} metric rows\n`);

  let urlIdx = 0;
  for (const url of urls) {
    urlIdx++;
    const pagePath = urlToPagePath(url);
    let urlOk = true;

    for (const period of PERIODS) {
      try {
        console.log(`  [${urlIdx}/${urls.length}] ${url}  (${period}d)`);
        const [gsc, ga] = await Promise.all([
          gscUrlSnapshot(GSC_SITE_URL, url, period).catch((e) => {
            console.error(`    GSC failed: ${e instanceof Error ? e.message : e}`);
            return { clicks: 0, impressions: 0, ctr: 0, position: 0, topQueries: [] };
          }),
          ga4UrlSnapshot(GA4_PROPERTY_ID, pagePath, period).catch((e) => {
            console.error(`    GA4 failed: ${e instanceof Error ? e.message : e}`);
            return { sessions: 0, engagedSessions: 0, engagementRate: 0, averageEngagementTime: 0, bounceRate: 0, conversions: 0, topReferrers: [] };
          }),
        ]);
        await writeMetric(runId, url, period, gsc, ga);
        console.log(`    ✓ gsc=${gsc.clicks}c/${gsc.impressions}i  ga=${ga.sessions}s`);
        await sleep(350);
      } catch (e) {
        urlOk = false;
        console.error(`    ✗ ${e instanceof Error ? e.message : e}`);
      }
    }

    await bumpCounter(runId, urlOk ? "urls_succeeded" : "urls_failed");
  }

  await finishRun(runId, urls.length);
  console.log(`\nSync complete — run_id=${runId}`);
})().catch(async (e) => {
  console.error("Crash:", e instanceof Error ? e.message : e);
  process.exit(1);
});
