// End-to-end daily sync: pull GA4 + GSC for every tracked URL × 30/60/90
// day windows, write to url_metrics. One Node entrypoint, no MCP needed.
//
// Usage: npx tsx scripts/composio/sync-url-metrics.ts
//
// Reads COMPOSIO_API_KEY from .env.local. Coverage: every <loc> in the
// site's sitemap (handles sitemap indexes one level deep), plus URLs
// referenced by task rows, plus a small fixed list of critical pages.
// All three sources are deduped. Sleeps 350ms between calls to stay
// under Composio's rate limit (20K-100K/10min depending on plan).
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
const SITEMAP_URL = "https://we360.ai/sitemap.xml";
const PERIODS = [30, 60, 90] as const;

// Hard cap on URLs per run so an accidentally enormous sitemap doesn't
// blow the GitHub Action timeout or burn Composio quota on a single day.
// Adjust upward later if you genuinely have more pages worth syncing.
const URL_CAP = 500;

// Restrict sitemap URLs to we360.ai paths only — outbound links from
// the sitemap (rare but possible) get filtered out.
const ALLOWED_HOST = "we360.ai";

const FIXED_URLS = [
  "https://we360.ai/",
  "https://we360.ai/pricing",
  "https://we360.ai/contact",
];

async function listUrls(): Promise<string[]> {
  const set = new Set<string>(FIXED_URLS);

  // 1. Sitemap — every public URL the site advertises to search engines.
  //    This is the canonical "everything we want indexed" list.
  try {
    const sitemapUrls = await fetchSitemapUrls(SITEMAP_URL);
    for (const u of sitemapUrls) set.add(normalize(u));
    console.log(`  sitemap: ${sitemapUrls.length} URLs`);
  } catch (e) {
    console.error(`  sitemap fetch failed: ${e instanceof Error ? e.message : e}`);
    console.error("  continuing with task URLs only");
  }

  // 2. Task URLs — catches things in flight that may not be in sitemap yet
  //    (e.g. blog tasks where the published_url was filled before indexing).
  const { data } = await admin
    .from("tasks")
    .select("published_url, url")
    .eq("project_id", PROJECT_ID);
  for (const t of (data ?? []) as Array<{ published_url: string | null; url: string | null }>) {
    if (t.published_url) set.add(normalize(t.published_url));
    if (t.url && t.url.startsWith("http")) set.add(normalize(t.url));
  }

  // Cap so a runaway sitemap can't burn the whole Composio quota.
  let urls = [...set].filter((u) => isOwnDomain(u)).sort();
  if (urls.length > URL_CAP) {
    console.log(`  ⚠ capping ${urls.length} URLs to ${URL_CAP} (raise URL_CAP if needed)`);
    urls = urls.slice(0, URL_CAP);
  }
  return urls;
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
// deep. Returns the union of all <loc> values found. Same-domain filter
// happens in listUrls().
async function fetchSitemapUrls(url: string, depth = 0): Promise<string[]> {
  if (depth > 2) return [];                          // guard against loops
  // we360.ai's sitemap currently points to Google Drive — the default
  // download URL serves an HTML "virus scan warning" interstitial, not
  // the XML. Rewrite to drive.usercontent.google.com with &confirm=t.
  const fetchUrl = rewriteDriveDownload(url);
  const resp = await fetch(fetchUrl, {
    headers: { "User-Agent": "We360-SEO-Sync/1.0" },
  });
  if (!resp.ok) throw new Error(`sitemap ${url} returned HTTP ${resp.status}`);
  const xml = await resp.text();

  // Sitemap index — contains <sitemap><loc>...</loc></sitemap> entries
  // pointing to sub-sitemaps. Fetch each, recurse.
  if (/<sitemapindex\b/i.test(xml)) {
    const subs = extractLocs(xml);
    const all: string[] = [];
    for (const sub of subs) {
      try {
        const inner = await fetchSitemapUrls(sub, depth + 1);
        all.push(...inner);
      } catch (e) {
        console.error(`    sub-sitemap ${sub} failed: ${e instanceof Error ? e.message : e}`);
      }
    }
    return all;
  }

  // Plain urlset — <url><loc>...</loc></url> entries.
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

// Sitemaps follow XML rules — `&` becomes `&amp;` etc. If we hand a raw
// `&amp;` URL to fetch() it 400s. Decode the five standard entities.
// Rewrite a Google Drive "uc?export=download&id=X" URL into the
// userdrive form that bypasses the interstitial. No-op for any URL
// that isn't a drive.google.com download link.
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
