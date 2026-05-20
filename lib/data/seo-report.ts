// SEO Report data layer.
//
// Powers /dashboard/reports — a CEO/SEO-Head facing view of COMPLETED work
// (blog posts + web pages shipped to Published). For each completed task we
// join: the live GSC + GA4 metrics (url_metrics, 90d window), sitemap.xml
// membership, and a computed health + issues verdict.
//
// Off-domain pages (e.g. posts published to Medium) can't be tracked by our
// GSC/GA4 sync or appear in the we360.ai sitemap — they're surfaced with a
// distinct "external" health so they aren't false-flagged.

import { createClient } from "@/lib/supabase/server";
import type { UrlMetric } from "@/lib/types/url-metrics";

const OWN_HOST = "we360.ai";
const SITEMAP_URL = "https://we360.ai/sitemap.xml";

export type ReportHealth = "winning" | "watch" | "problem" | "external";

export interface SeoReportRow {
  taskId: string;
  title: string;
  kind: "blog_task" | "web_task";
  taskType: string | null;
  targetKeyword: string | null;
  liveUrl: string | null;          // published_url ?? url
  completedAt: string | null;
  daysLive: number | null;
  assigneeName: string | null;
  aiVerificationStatus: string | null;
  isExternal: boolean;             // published off the we360.ai domain
  inSitemap: boolean | null;       // null = not applicable (external / no url)
  metrics: {
    clicks: number;
    impressions: number;
    ctr: number;          // 0-1
    position: number;
    sessions: number;
    engagementRate: number; // 0-1
    conversions: number;
  } | null;                 // null = no url_metrics row (off-domain / not yet synced)
  health: ReportHealth;
  issues: string[];
}

export interface SeoReportRollup {
  shipped: number;
  rankingTop10: number;
  rankingTop3: number;
  zeroTraffic: number;       // we360.ai pages, 30d+ live, 0 clicks + 0 sessions
  totalClicks: number;
  totalImpressions: number;
  problemCount: number;
  externalCount: number;
}

export interface SeoReportSnapshot {
  rows: SeoReportRow[];
  rollup: SeoReportRollup;
}

interface ReportFilters {
  start?: string;   // ISO date — filter completed_at >=
  end?: string;     // ISO date — filter completed_at <=
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
    // PostgREST returns embedded resources as an array; normalize below.
    assignee: { name: string } | { name: string }[] | null;
  };
  const tasks = (tasksData ?? []) as unknown as TaskRow[];

  // Embedded profile join may come back as an array — flatten to one name.
  const assigneeName = (a: TaskRow["assignee"]): string | null => {
    if (!a) return null;
    if (Array.isArray(a)) return a[0]?.name ?? null;
    return a.name ?? null;
  };

  // ---- 2. url_metrics (90d window) keyed by normalized URL
  const { data: metricsData } = await supabase
    .from("url_metrics_latest")
    .select("*")
    .eq("project_id", projectId)
    .eq("period", "90d");
  const metricByUrl = new Map<string, UrlMetric>();
  for (const m of (metricsData ?? []) as UrlMetric[]) {
    metricByUrl.set(normalizeUrl(m.url), m);
  }

  // ---- 3. Sitemap membership set (cached fetch, 1h)
  const sitemapSet = await fetchSitemapUrlSet();

  // ---- 4. Build rows
  const rows: SeoReportRow[] = [];
  for (const t of tasks) {
    const liveUrl = t.published_url ?? t.url ?? null;
    const isExternal = liveUrl ? !isOwnDomain(liveUrl) : false;
    const daysLive = t.completed_at
      ? Math.floor((Date.now() - new Date(t.completed_at).getTime()) / 86400000)
      : null;

    const metricRow = liveUrl && !isExternal ? metricByUrl.get(normalizeUrl(liveUrl)) ?? null : null;
    const metrics = metricRow
      ? {
          clicks: metricRow.gsc_clicks,
          impressions: metricRow.gsc_impressions,
          ctr: metricRow.gsc_ctr,
          position: metricRow.gsc_position,
          sessions: metricRow.ga_sessions,
          engagementRate: metricRow.ga_engagement_rate,
          conversions: metricRow.ga_conversions,
        }
      : null;

    const inSitemap = liveUrl && !isExternal ? sitemapSet.has(normalizeUrl(liveUrl)) : null;

    const { health, issues } = computeHealth({ isExternal, inSitemap, metrics, daysLive });

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
      isExternal,
      inSitemap,
      metrics,
      health,
      issues,
    });
  }

  // ---- 5. Sort: problem -> watch -> winning -> external, then days live desc
  const order: Record<ReportHealth, number> = { problem: 0, watch: 1, winning: 2, external: 3 };
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
    zeroTraffic: rows.filter((r) => !r.isExternal && r.metrics && (r.daysLive ?? 0) >= 30 && r.metrics.clicks === 0 && r.metrics.sessions === 0).length,
    totalClicks: rows.reduce((s, r) => s + (r.metrics?.clicks ?? 0), 0),
    totalImpressions: rows.reduce((s, r) => s + (r.metrics?.impressions ?? 0), 0),
    problemCount: rows.filter((r) => r.health === "problem").length,
    externalCount: rows.filter((r) => r.isExternal).length,
  };

  return { rows, rollup };
}

// ---- Health + issues computation ----

function computeHealth(args: {
  isExternal: boolean;
  inSitemap: boolean | null;
  metrics: SeoReportRow["metrics"];
  daysLive: number | null;
}): { health: ReportHealth; issues: string[] } {
  const { isExternal, inSitemap, metrics, daysLive } = args;
  const issues: string[] = [];

  // External pages (Medium etc.) — we can't track them. Single info issue.
  if (isExternal) {
    return {
      health: "external",
      issues: ["Published off-domain — GSC/GA4/sitemap tracking not available"],
    };
  }

  const tooNew = (daysLive ?? 0) < 30;

  // Sitemap — always check; missing is a hard problem (Google can't find it).
  if (inSitemap === false) issues.push("Not in sitemap");

  if (!metrics) {
    // No url_metrics row — page not yet picked up by the daily sync.
    if (!tooNew) issues.push("No metrics yet — not in url_metrics");
    return { health: inSitemap === false ? "problem" : "watch", issues };
  }

  // Traffic / indexing flags — exempt for pages < 30 days live.
  if (!tooNew) {
    if (metrics.clicks === 0 && metrics.sessions === 0) issues.push("No traffic (0 clicks, 0 sessions)");
    if (metrics.impressions === 0) issues.push("No impressions — not indexed or off-target");
  }
  if (metrics.impressions > 0 && metrics.position > 20) issues.push(`Poor ranking (position ${metrics.position.toFixed(0)})`);
  if (metrics.position > 0 && metrics.position <= 10 && metrics.ctr < 0.01 && metrics.impressions > 0) {
    issues.push("Low CTR — ranks top 10 but weak title/meta");
  }
  if (metrics.engagementRate < 0.3 && metrics.sessions >= 50) issues.push("Low engagement (<30%)");
  if (metrics.sessions >= 100 && metrics.conversions === 0) issues.push("Traffic but 0 conversions");

  // Health verdict — worst-case wins.
  let health: ReportHealth;
  const hardProblem =
    inSitemap === false ||
    (!tooNew && metrics.clicks === 0 && metrics.sessions === 0) ||
    (metrics.impressions > 0 && metrics.position > 20);
  if (hardProblem) {
    health = "problem";
  } else if (
    tooNew ||
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

// Fetch sitemap.xml -> Set of normalized URLs. Handles sitemap-index
// recursion one level deep. Cached for an hour via Next's fetch cache.
async function fetchSitemapUrlSet(): Promise<Set<string>> {
  const set = new Set<string>();
  try {
    const locs = await fetchSitemapLocs(SITEMAP_URL, 0);
    for (const u of locs) set.add(normalizeUrl(u));
  } catch {
    // On sitemap fetch failure, return empty — inSitemap becomes false for
    // everything. The report still renders; the issue chip just over-fires
    // until the next successful fetch.
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
