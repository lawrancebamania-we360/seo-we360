// Daily GA4 + GSC url_metrics sync, resumable across several Vercel Cron
// invocations - the full URL list x 3 periods doesn't fit in one 300s
// Hobby function budget, so this is split into a handful of hour-staggered
// crons (see vercel.json) that all call runUrlMetricsTick() and each pick
// up wherever the previous one left off for the day.
//
// State lives on url_metrics_runs (one row per project per day - see
// supabase/migrations/20260928140001_url_metrics_cursor.sql):
//   - url_list:   the deduped URL list for the day, built once by whichever
//                 batch runs first
//   - next_index: a flat cursor into the virtual (url x period) task array,
//                 so a batch can stop mid-URL without losing periods it
//                 already finished
//   - urls_succeeded / urls_failed: reused here as TASK-level counts (not
//                 read by any UI - purely forensic), since a URL's periods
//                 can now be split across different ticks
//
// Auth, scheduling and the actual API calls (getGa4UrlSnapshot /
// getGscUrlSnapshot) are native "Connect with Google" - no third-party
// broker, same token resolver every other live GA4/GSC read in the app uses.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getGa4UrlSnapshot } from "@/lib/google/ga4";
import { getGscUrlSnapshot } from "@/lib/google/gsc";

const PROJECT_ID = "11111111-1111-4111-8111-000000000001";
const GA4_PROPERTY_ID = "273620287";
const GSC_SITE_URL = "https://we360.ai/";
const SITEMAP_URL = "https://we360.ai/sitemap.xml";
export const PERIODS = [30, 60, 90] as const;

// Hard cap on URLs per day so an accidentally enormous sitemap doesn't blow
// every batch's time budget on a single day.
const URL_CAP = 500;
const ALLOWED_HOST = "we360.ai";
const FIXED_URLS = [
  "https://we360.ai/",
  "https://we360.ai/pricing",
  "https://we360.ai/contact",
];

// Persist next_index/counters every N tasks rather than every single one -
// bounds how much progress a hard timeout can lose without hammering the DB.
const PERSIST_EVERY = 5;

interface RunRow {
  id: string;
  status: "running" | "completed" | "failed";
  url_list: string[] | null;
  next_index: number;
  urls_succeeded: number | null;
  urls_failed: number | null;
}

export interface TickSummary {
  ok: boolean;
  status: "completed" | "in_progress" | "already_done" | "failed";
  runId: string | null;
  urlsTotal: number;
  tasksTotal: number;
  tasksDoneNow: number; // completed during THIS tick
  nextIndex: number;
  error?: string;
}

export async function runUrlMetricsTick(admin: SupabaseClient, opts: { budgetMs: number }): Promise<TickSummary> {
  const deadline = Date.now() + opts.budgetMs;
  const today = new Date().toISOString().slice(0, 10);

  let run = await findTodayRun(admin, today);
  if (!run) run = await createTodayRun(admin, today);

  const urls = run.url_list ?? [];
  const tasksTotal = urls.length * PERIODS.length;

  if (run.status === "completed") {
    return { ok: true, status: "already_done", runId: run.id, urlsTotal: urls.length, tasksTotal, tasksDoneNow: 0, nextIndex: run.next_index };
  }
  if (run.status === "failed") {
    return { ok: false, status: "failed", runId: run.id, urlsTotal: urls.length, tasksTotal, tasksDoneNow: 0, nextIndex: run.next_index, error: "today's run already failed - will retry tomorrow" };
  }

  let idx = run.next_index;
  let succeeded = run.urls_succeeded ?? 0;
  let failed = run.urls_failed ?? 0;
  let doneNow = 0;
  let sinceLastPersist = 0;

  const persist = async (status?: "completed") => {
    const patch: Record<string, unknown> = { next_index: idx, urls_succeeded: succeeded, urls_failed: failed };
    if (status) { patch.status = status; patch.finished_at = new Date().toISOString(); }
    await admin.from("url_metrics_runs").update(patch).eq("id", run!.id);
    sinceLastPersist = 0;
  };

  try {
    while (idx < tasksTotal) {
      if (Date.now() > deadline) break;
      const urlIdx = Math.floor(idx / PERIODS.length);
      const periodIdx = idx % PERIODS.length;
      const url = urls[urlIdx];
      const period = PERIODS[periodIdx];
      const pagePath = urlToPagePath(url);

      try {
        const [gsc, ga] = await Promise.all([
          getGscUrlSnapshot(GSC_SITE_URL, url, period).catch((e) => {
            console.error(`[url-metrics] GSC failed for ${url} (${period}d): ${e instanceof Error ? e.message : e}`);
            return { clicks: 0, impressions: 0, ctr: 0, position: 0, topQueries: [] };
          }),
          getGa4UrlSnapshot(GA4_PROPERTY_ID, pagePath, period).catch((e) => {
            console.error(`[url-metrics] GA4 failed for ${url} (${period}d): ${e instanceof Error ? e.message : e}`);
            return { sessions: 0, engagedSessions: 0, engagementRate: 0, averageEngagementTime: 0, bounceRate: 0, conversions: 0, topReferrers: [] };
          }),
        ]);
        await writeMetric(admin, run.id, url, period, gsc, ga);
        succeeded++;
      } catch (e) {
        failed++;
        console.error(`[url-metrics] task failed for ${url} (${period}d): ${e instanceof Error ? e.message : e}`);
      }

      idx++;
      doneNow++;
      sinceLastPersist++;
      if (sinceLastPersist >= PERSIST_EVERY) await persist();
      // Light politeness delay - native GA4/GSC quotas are far more generous
      // than Composio's old broker limit, this just avoids bursting either API.
      await sleep(150);
    }
  } finally {
    if (idx >= tasksTotal) await persist("completed");
    else if (sinceLastPersist > 0) await persist();
  }

  return {
    ok: true,
    status: idx >= tasksTotal ? "completed" : "in_progress",
    runId: run.id,
    urlsTotal: urls.length,
    tasksTotal,
    tasksDoneNow: doneNow,
    nextIndex: idx,
  };
}

async function findTodayRun(admin: SupabaseClient, runDate: string): Promise<RunRow | null> {
  const { data } = await admin
    .from("url_metrics_runs")
    .select("id, status, url_list, next_index, urls_succeeded, urls_failed")
    .eq("project_id", PROJECT_ID)
    .eq("run_date", runDate)
    .maybeSingle();
  return (data as RunRow | null) ?? null;
}

async function createTodayRun(admin: SupabaseClient, runDate: string): Promise<RunRow> {
  const urlList = await buildUrlList(admin);
  const { data, error } = await admin
    .from("url_metrics_runs")
    .insert({
      project_id: PROJECT_ID,
      run_date: runDate,
      status: "running",
      url_list: urlList,
      next_index: 0,
      urls_total: urlList.length,
      urls_succeeded: 0,
      urls_failed: 0,
    })
    .select("id, status, url_list, next_index, urls_succeeded, urls_failed")
    .single();
  if (!error) return data as RunRow;
  // Race: another batch created today's row between our findTodayRun() miss
  // and this insert (two crons firing close together). Fall back to it.
  const existing = await findTodayRun(admin, runDate);
  if (existing) return existing;
  throw error;
}

async function writeMetric(
  admin: SupabaseClient,
  runId: string,
  url: string,
  period: 30 | 60 | 90,
  gsc: Awaited<ReturnType<typeof getGscUrlSnapshot>>,
  ga: Awaited<ReturnType<typeof getGa4UrlSnapshot>>,
): Promise<void> {
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
  const { error } = await admin.from("url_metrics").upsert(row, { onConflict: "project_id,url,period,snapshot_date" });
  if (error) throw error;
}

// ---- URL discovery (sitemap + task URLs + fixed list, deduped, capped) ----

async function buildUrlList(admin: SupabaseClient): Promise<string[]> {
  const set = new Set<string>(FIXED_URLS);

  try {
    const sitemapUrls = await fetchSitemapUrls(SITEMAP_URL);
    for (const u of sitemapUrls) set.add(normalize(u));
  } catch (e) {
    console.error(`[url-metrics] sitemap fetch failed: ${e instanceof Error ? e.message : e}`);
  }

  const { data } = await admin
    .from("tasks")
    .select("published_url, url")
    .eq("project_id", PROJECT_ID);
  for (const t of (data ?? []) as Array<{ published_url: string | null; url: string | null }>) {
    if (t.published_url) set.add(normalize(t.published_url));
    if (t.url && t.url.startsWith("http")) set.add(normalize(t.url));
  }

  let urls = [...set].filter((u) => isOwnDomain(u)).sort();
  if (urls.length > URL_CAP) urls = urls.slice(0, URL_CAP);
  return urls;
}

function urlToPagePath(url: string): string {
  try { const u = new URL(url); return u.pathname + (u.search ?? ""); }
  catch { return url; }
}

function normalize(url: string): string {
  try { const u = new URL(url); u.hash = ""; return u.toString(); }
  catch { return url; }
}

function isOwnDomain(url: string): boolean {
  try { return new URL(url).hostname.endsWith(ALLOWED_HOST); }
  catch { return false; }
}

// Fetch a sitemap and recursively expand sitemap-index entries one level
// deep. Same cache-busting + Google Drive rewrite as the old script - see
// git history for the reasoning.
async function fetchSitemapUrls(url: string, depth = 0): Promise<string[]> {
  if (depth > 2) return [];
  const base = rewriteDriveDownload(url);
  const cacheBuster = `_t=${Date.now()}`;
  const fetchUrl = base + (base.includes("?") ? "&" : "?") + cacheBuster;

  const resp = await fetch(fetchUrl, {
    cache: "no-store",
    headers: {
      "User-Agent": "We360-SEO-Sync/1.0",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
    },
  });
  if (!resp.ok) throw new Error(`sitemap ${url} returned HTTP ${resp.status}`);
  const xml = await resp.text();

  if (/<sitemapindex\b/i.test(xml)) {
    const subs = extractLocs(xml);
    const all: string[] = [];
    for (const sub of subs) {
      try { all.push(...(await fetchSitemapUrls(sub, depth + 1))); }
      catch (e) { console.error(`[url-metrics] sub-sitemap ${sub} failed: ${e instanceof Error ? e.message : e}`); }
    }
    return all;
  }
  return extractLocs(xml);
}

function extractLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const u = decodeXmlEntities(m[1].trim());
    if (u.startsWith("http")) out.push(u);
  }
  return out;
}

// we360.ai's sitemap currently points to Google Drive - the default
// download URL serves an HTML "virus scan warning" interstitial, not the
// XML. Rewrite to drive.usercontent.google.com with &confirm=t.
function rewriteDriveDownload(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname !== "drive.google.com") return url;
    const id = u.searchParams.get("id");
    if (!id) return url;
    return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
  } catch { return url; }
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
