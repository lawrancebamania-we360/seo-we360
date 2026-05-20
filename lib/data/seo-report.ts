// SEO Report data layer.
//
// Powers /dashboard/reports — a CEO/SEO-Head facing view of COMPLETED work
// (blog posts + web pages shipped to Published) that live ON the we360.ai
// website. For each completed task we:
//   1. Verify the page is actually live (HTTP fetch of the published URL)
//   2. Check whether it appears in we360.ai/sitemap.xml
//   3. Join live GSC + GA4 metrics (url_metrics) — 90d window for display,
//      30d vs 90d to compute a ranking-trend arrow
//   4. Compute a Health verdict + Issues list
//
// Pages published off the we360.ai domain (e.g. on Medium) are EXCLUDED —
// this report is about pages on our own site.

import { createClient } from "@/lib/supabase/server";
import type { UrlMetric } from "@/lib/types/url-metrics";

const OWN_HOST = "we360.ai";
const SITEMAP_URL = "https://we360.ai/sitemap.xml";

export type ReportHealth = "winning" | "watch" | "problem";

export interface PositionTrend {
  delta: number;                          // absolute positions moved vs baseline
  direction: "up" | "down" | "flat";      // up = ranking improved
  baseline: number;                       // the 90-day average it's compared against
}

export interface SeoReportRow {
  taskId: string;
  title: string;
  kind: "blog_task" | "web_task";
  taskType: string | null;
  targetKeyword: string | null;
  liveUrl: string | null;
  completedAt: string | null;
  daysLive: number | null;
  assigneeName: string | null;
  aiVerificationStatus: string | null;
  pageExists: boolean | null;             // HTTP check — null if no URL
  inSitemap: boolean | null;
  metrics: {
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
    sessions: number;
    engagementRate: number;
    conversions: number;
  } | null;
  positionTrend: PositionTrend | null;    // 30d vs 90d ranking movement
  health: ReportHealth;
  issues: string[];
}

export interface SeoReportRollup {
  shipped: number;
  rankingTop10: number;
  rankingTop3: number;
  zeroTraffic: number;
  totalClicks: number;
  totalImpressions: number;
  problemCount: number;
  notLiveCount: number;       // pages that failed the HTTP existence check
}

export interface SeoReportSnapshot {
  rows: SeoReportRow[];
  rollup: SeoReportRollup;
}

interface ReportFilters {
  start?: string;
  end?: string;
}

export async function getSeoReport(projectId: string, filters: ReportFilters = {}): Promise<SeoReportSnapshot> {
  const supabase = await createClient();

  // ---- 1. Completed blog + web tasks
  let q = supabase
    .from("tasks")
    .select("id, title, kind, task_type, target_keyword, url, published_url, completed_at, ai_verification_status, assignee:profiles!team_member_id(name)")
    .eq("project_id", projectId)
    .eq("status", "done")
    .in("kind", ["blog_task", "web_task"]);
  if (filters.start) q = q.gte("completed_at", filters.start);
  if (filters.end) q = q.lte("completed_at", `${filters.end}T23:59:59`);
  const { data: tasksData } = await q.order("completed_at", { ascending: false });

  type TaskRow = {
    id: string; title: string; kind: "blog_task" | "web_task"; task_type: string | null;
    target_keyword: string | null; url: string | null; published_url: string | null;
    completed_at: string | null; ai_verification_status: string | null;
    assignee: { name: string } | { name: string }[] | null;
  };
  const tasks = (tasksData ?? []) as unknown as TaskRow[];
  const assigneeName = (a: TaskRow["assignee"]): string | null => {
    if (!a) return null;
    if (Array.isArray(a)) return a[0]?.name ?? null;
    return a.name ?? null;
  };

  // Only keep tasks whose live URL is on the we360.ai domain — Medium and
  // other off-domain posts are excluded from this report entirely.
  const onDomain = tasks.filter((t) => {
    const live = t.published_url ?? t.url;
    return live ? isOwnDomain(live) : false;
  });

  // ---- 2. url_metrics — pull 30d + 90d so we can show a ranking trend
  const { data: metricsData } = await supabase
    .from("url_metrics_latest")
    .select("*")
    .eq("project_id", projectId)
    .in("period", ["30d", "90d"]);
  const m90 = new Map<string, UrlMetric>();
  const m30 = new Map<string, UrlMetric>();
  for (const m of (metricsData ?? []) as UrlMetric[]) {
    const key = normalizeUrl(m.url);
    if (m.period === "90d") m90.set(key, m);
    else if (m.period === "30d") m30.set(key, m);
  }

  // ---- 3. Sitemap membership set + live-URL HTTP checks (parallel)
  const sitemapSet = await fetchSitemapUrlSet();
  const liveUrls = [...new Set(onDomain.map((t) => t.published_url ?? t.url).filter(Boolean) as string[])];
  const liveStatus = await checkUrlsLive(liveUrls);

  // ---- 4. Build rows
  const rows: SeoReportRow[] = [];
  for (const t of onDomain) {
    const liveUrl = t.published_url ?? t.url ?? null;
    const key = liveUrl ? normalizeUrl(liveUrl) : "";
    const daysLive = t.completed_at
      ? Math.floor((Date.now() - new Date(t.completed_at).getTime()) / 86400000)
      : null;

    const metricRow = m90.get(key) ?? null;
    const recent = m30.get(key) ?? null;

    // Position shown = the CURRENT rank (last 30 days), not the 90-day
    // average. This keeps the headline number consistent with the trend
    // arrow below — number ± delta always equals the 90-day baseline.
    // Fall back to the 90-day figure when there's no recent-window data.
    const hasRecentPos = !!recent && recent.gsc_position > 0 && recent.gsc_impressions > 0;
    const currentPosition = hasRecentPos
      ? recent!.gsc_position
      : (metricRow?.gsc_position ?? 0);

    const metrics = metricRow
      ? {
          clicks: metricRow.gsc_clicks,
          impressions: metricRow.gsc_impressions,
          ctr: metricRow.gsc_ctr,
          position: currentPosition,          // current (30d) rank
          sessions: metricRow.ga_sessions,
          engagementRate: metricRow.ga_engagement_rate,
          conversions: metricRow.ga_conversions,
        }
      : null;

    // Ranking trend — current (30d) vs the 90-day average baseline. Lower
    // position is better; current < baseline means the page climbed since
    // the work landed. delta + direction are derived from these two so the
    // UI can render "#current ▲/▼ delta" with the math always checking out.
    let positionTrend: PositionTrend | null = null;
    if (metricRow && hasRecentPos && metricRow.gsc_position > 0) {
      const baseline = metricRow.gsc_position;
      const improvement = baseline - recent!.gsc_position; // + = climbed
      positionTrend = {
        delta: Math.abs(improvement),
        direction: improvement > 0.3 ? "up" : improvement < -0.3 ? "down" : "flat",
        baseline,
      };
    }

    const inSitemap = liveUrl ? sitemapSet.has(key) : null;
    const pageExists = liveUrl ? (liveStatus.get(liveUrl) ?? null) : null;

    const { health, issues } = computeHealth({ pageExists, inSitemap, metrics, daysLive });

    rows.push({
      taskId: t.id,
      title: t.title,
      kind: t.kind,
      taskType: t.task_type,
      targetKeyword: t.target_keyword,
      liveUrl,
      completedAt: t.completed_at,
      daysLive,
      assigneeName: assigneeName(t.assignee),
      aiVerificationStatus: t.ai_verification_status,
      pageExists,
      inSitemap,
      metrics,
      positionTrend,
      health,
      issues,
    });
  }

  // ---- 5. Sort: problem -> watch -> winning, then days live desc
  const order: Record<ReportHealth, number> = { problem: 0, watch: 1, winning: 2 };
  rows.sort((a, b) => {
    const ho = order[a.health] - order[b.health];
    if (ho !== 0) return ho;
    return (b.daysLive ?? 0) - (a.daysLive ?? 0);
  });

  // ---- 6. Rollup
  const rollup: SeoReportRollup = {
    shipped: rows.length,
    rankingTop10: rows.filter((r) => r.metrics && r.metrics.impressions > 0 && r.metrics.position > 0 && r.metrics.position <= 10).length,
    rankingTop3: rows.filter((r) => r.metrics && r.metrics.impressions > 0 && r.metrics.position > 0 && r.metrics.position <= 3).length,
    zeroTraffic: rows.filter((r) => r.metrics && (r.daysLive ?? 0) >= 30 && r.metrics.clicks === 0 && r.metrics.sessions === 0).length,
    totalClicks: rows.reduce((s, r) => s + (r.metrics?.clicks ?? 0), 0),
    totalImpressions: rows.reduce((s, r) => s + (r.metrics?.impressions ?? 0), 0),
    problemCount: rows.filter((r) => r.health === "problem").length,
    notLiveCount: rows.filter((r) => r.pageExists === false).length,
  };

  return { rows, rollup };
}

// ---- Health + issues ----

function computeHealth(args: {
  pageExists: boolean | null;
  inSitemap: boolean | null;
  metrics: SeoReportRow["metrics"];
  daysLive: number | null;
}): { health: ReportHealth; issues: string[] } {
  const { pageExists, inSitemap, metrics, daysLive } = args;
  const issues: string[] = [];
  const tooNew = (daysLive ?? 0) < 30;

  // Existence + discoverability — the two checks the user explicitly asked
  // for: is the page actually live, and is it in the sitemap.
  if (pageExists === false) issues.push("Page not reachable — published URL returns an error or 404");
  if (inSitemap === false) issues.push("Not in sitemap — Google may not discover it");

  if (!metrics) {
    if (!tooNew) issues.push("No metrics yet — page isn't in url_metrics (run the daily sync)");
  } else {
    if (!tooNew) {
      if (metrics.clicks === 0 && metrics.sessions === 0) issues.push("No traffic — 0 clicks and 0 sessions");
      if (metrics.impressions === 0) issues.push("No impressions — not indexed or off-target");
    }
    if (metrics.impressions > 0 && metrics.position > 20) issues.push(`Poor ranking — average position ${metrics.position.toFixed(0)}`);
    if (metrics.position > 0 && metrics.position <= 10 && metrics.ctr < 0.01 && metrics.impressions > 0) {
      issues.push("Low CTR — ranks top 10 but the title/meta isn't earning clicks");
    }
    if (metrics.engagementRate < 0.3 && metrics.sessions >= 50) issues.push("Low engagement — under 30% engaged sessions");
    if (metrics.sessions >= 100 && metrics.conversions === 0) issues.push("Traffic but 0 conversions");
  }

  // Verdict — worst-case wins.
  const hardProblem =
    pageExists === false ||
    inSitemap === false ||
    (metrics != null && !tooNew && metrics.clicks === 0 && metrics.sessions === 0) ||
    (metrics != null && metrics.impressions > 0 && metrics.position > 20);
  let health: ReportHealth;
  if (hardProblem) {
    health = "problem";
  } else if (
    tooNew ||
    !metrics ||
    (metrics.impressions > 0 && metrics.position > 10) ||
    (!tooNew && metrics.clicks < 10) ||
    (metrics.engagementRate < 0.3 && metrics.sessions >= 50)
  ) {
    health = "watch";
  } else {
    health = "winning";
  }
  return { health, issues };
}

// ---- Live-URL HTTP checks ----
//
// Fetch each published URL to confirm the page actually exists. 200-399 =
// live, 4xx/5xx or network error = not live. Cached for an hour so report
// reloads don't re-hammer the site.
async function checkUrlsLive(urls: string[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  await Promise.all(
    urls.map(async (url) => {
      try {
        const resp = await fetch(url, {
          method: "GET",
          redirect: "follow",
          headers: { "User-Agent": "We360-SEO-Report/1.0" },
          signal: AbortSignal.timeout(10_000),
          next: { revalidate: 3600 },
        });
        out.set(url, resp.status >= 200 && resp.status < 400);
      } catch {
        out.set(url, false);
      }
    }),
  );
  return out;
}

// ---- URL helpers ----

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    let path = u.pathname.toLowerCase();
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return host + path;
  } catch {
    return url.toLowerCase().replace(/\/$/, "");
  }
}

function isOwnDomain(url: string): boolean {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase().endsWith(OWN_HOST);
  } catch {
    return false;
  }
}

async function fetchSitemapUrlSet(): Promise<Set<string>> {
  const set = new Set<string>();
  try {
    const locs = await fetchSitemapLocs(SITEMAP_URL, 0);
    for (const u of locs) set.add(normalizeUrl(u));
  } catch {
    /* empty set on failure — inSitemap over-fires until next good fetch */
  }
  return set;
}

async function fetchSitemapLocs(url: string, depth: number): Promise<string[]> {
  if (depth > 2) return [];
  const resp = await fetch(url, {
    headers: { "User-Agent": "We360-SEO-Report/1.0" },
    next: { revalidate: 3600 },
  });
  if (!resp.ok) return [];
  const xml = await resp.text();
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) =>
    decodeXmlEntities(m[1].trim()),
  );
  if (/<sitemapindex\b/i.test(xml)) {
    const all: string[] = [];
    for (const sub of locs) {
      try {
        all.push(...(await fetchSitemapLocs(sub, depth + 1)));
      } catch {
        /* skip failed sub-sitemap */
      }
    }
    return all;
  }
  return locs;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
