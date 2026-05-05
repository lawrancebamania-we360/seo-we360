import { getGoogleAccessToken, isGoogleServiceAccountConfigured } from "./auth";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export interface GscQueryDelta {
  query: string;
  page: string;
  thisWeekClicks: number;
  lastWeekClicks: number;
  thisWeekImpressions: number;
  lastWeekImpressions: number;
  positionDelta: number;
  thisWeekPosition: number;
  lastWeekPosition: number;
}

export interface GscWeeklySummary {
  connected: boolean;
  reason?: string;
  topGainers: GscQueryDelta[];
  topLosers: GscQueryDelta[];
  positionImprovers: GscQueryDelta[];
  positionDropers: GscQueryDelta[];
  totalClicksThisWeek: number;
  totalClicksLastWeek: number;
}

export interface CannibalizationHit {
  query: string;
  competing_urls: Array<{ url: string; clicks: number; impressions: number; position: number }>;
  url_count: number;
  total_clicks: number;
  total_impressions: number;
  severity: "low" | "medium" | "high";
  click_split_ratio: number;
}

interface GscQueryRow {
  keys: string[];
  clicks: number;
  impressions: number;
  position: number;
}

async function queryRange(
  siteUrl: string,
  startDate: string,
  endDate: string
): Promise<GscQueryRow[]> {
  const token = await getGoogleAccessToken(SCOPE);
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ["query", "page"],
        rowLimit: 200,
      }),
      signal: AbortSignal.timeout(12000),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GSC query failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { rows?: GscQueryRow[] };
  return data.rows ?? [];
}

function dateOffset(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

export async function getGscWeeklyDelta(siteUrl: string | null): Promise<GscWeeklySummary> {
  if (!siteUrl) {
    return { connected: false, reason: "No GSC property URL on this project.", topGainers: [], topLosers: [], positionImprovers: [], positionDropers: [], totalClicksThisWeek: 0, totalClicksLastWeek: 0 };
  }
  if (!(await isGoogleServiceAccountConfigured())) {
    return { connected: false, reason: "Google service-account JSON not set.", topGainers: [], topLosers: [], positionImprovers: [], positionDropers: [], totalClicksThisWeek: 0, totalClicksLastWeek: 0 };
  }

  try {
    // GSC has 2-3 day lag — use 3-10 days ago for "this week" and 10-17 for "last week"
    const [thisWeek, lastWeek] = await Promise.all([
      queryRange(siteUrl, dateOffset(10), dateOffset(3)),
      queryRange(siteUrl, dateOffset(17), dateOffset(10)),
    ]);

    const thisMap = new Map<string, GscQueryRow>();
    for (const r of thisWeek) thisMap.set(`${r.keys[0]}|${r.keys[1]}`, r);
    const lastMap = new Map<string, GscQueryRow>();
    for (const r of lastWeek) lastMap.set(`${r.keys[0]}|${r.keys[1]}`, r);

    const allKeys = new Set([...thisMap.keys(), ...lastMap.keys()]);
    const deltas: GscQueryDelta[] = [];
    for (const key of allKeys) {
      const [query, page] = key.split("|");
      const t = thisMap.get(key);
      const l = lastMap.get(key);
      const tClicks = t?.clicks ?? 0;
      const lClicks = l?.clicks ?? 0;
      // Position delta: LOWER is better, so improvement = lastPos - thisPos
      const tPos = t?.position ?? 0;
      const lPos = l?.position ?? 0;
      deltas.push({
        query,
        page,
        thisWeekClicks: tClicks,
        lastWeekClicks: lClicks,
        thisWeekImpressions: t?.impressions ?? 0,
        lastWeekImpressions: l?.impressions ?? 0,
        thisWeekPosition: tPos,
        lastWeekPosition: lPos,
        positionDelta: lPos && tPos ? lPos - tPos : 0,
      });
    }

    const topGainers = [...deltas]
      .map((d) => ({ ...d, clickDelta: d.thisWeekClicks - d.lastWeekClicks }))
      .filter((d) => d.clickDelta > 0)
      .sort((a, b) => b.clickDelta - a.clickDelta)
      .slice(0, 5);
    const topLosers = [...deltas]
      .map((d) => ({ ...d, clickDelta: d.thisWeekClicks - d.lastWeekClicks }))
      .filter((d) => d.clickDelta < 0)
      .sort((a, b) => a.clickDelta - b.clickDelta)
      .slice(0, 5);
    const positionImprovers = [...deltas]
      .filter((d) => d.positionDelta > 1 && d.thisWeekImpressions > 0)
      .sort((a, b) => b.positionDelta - a.positionDelta)
      .slice(0, 5);
    const positionDropers = [...deltas]
      .filter((d) => d.positionDelta < -1 && d.lastWeekImpressions > 0)
      .sort((a, b) => a.positionDelta - b.positionDelta)
      .slice(0, 5);

    const totalClicksThisWeek = thisWeek.reduce((s, r) => s + r.clicks, 0);
    const totalClicksLastWeek = lastWeek.reduce((s, r) => s + r.clicks, 0);

    return {
      connected: true,
      topGainers,
      topLosers,
      positionImprovers,
      positionDropers,
      totalClicksThisWeek,
      totalClicksLastWeek,
    };
  } catch (e) {
    return {
      connected: false,
      reason: e instanceof Error ? e.message : "GSC request failed",
      topGainers: [],
      topLosers: [],
      positionImprovers: [],
      positionDropers: [],
      totalClicksThisWeek: 0,
      totalClicksLastWeek: 0,
    };
  }
}

// Detects keyword cannibalization: queries where 2+ URLs from the project's
// domain are both ranking and absorbing impressions. Severity scales with how
// evenly the clicks/impressions are split — a dominant winner is less bad
// than two pages fighting for the same crown.
// ============================================================
// Per-URL aggregates over a long window — used by the blog-audit pipeline
// to make D/M/M decisions on every blog URL.
// ============================================================

export interface GscUrlAggregate {
  url: string;
  clicks: number;
  impressions: number;
  position: number;        // average position over the window
  ctr: number;             // 0..1
}

interface GscPageRow {
  keys: string[];          // [page]
  clicks: number;
  impressions: number;
  position: number;
  ctr: number;
}

/**
 * Pull per-URL aggregates over a long window, paginating through GSC's
 * 25K-row cap until exhausted. Optionally filters by URL substring (e.g.
 * "/blog/" to limit to blog posts only).
 *
 * Returns one row per URL with totals across the window. CTR + position
 * are GSC-computed averages on the aggregated row, NOT recomputed by us.
 */
export async function getGscUrlAggregates(args: {
  siteUrl: string;
  windowDays: number;
  urlContains?: string;
}): Promise<GscUrlAggregate[]> {
  const token = await getGoogleAccessToken(SCOPE);
  const startDate = new Date(Date.now() - args.windowDays * 86400000).toISOString().slice(0, 10);
  const endDate = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10); // GSC has ~3-day lag

  const all: GscPageRow[] = [];
  let startRow = 0;
  const rowLimit = 25000;
  while (true) {
    const body: Record<string, unknown> = {
      startDate,
      endDate,
      dimensions: ["page"],
      rowLimit,
      startRow,
    };
    if (args.urlContains) {
      body.dimensionFilterGroups = [{
        filters: [{ dimension: "page", operator: "contains", expression: args.urlContains }],
      }];
    }
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(args.siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      }
    );
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`GSC URL-aggregate query failed (${res.status}): ${errBody.slice(0, 300)}`);
    }
    const data = (await res.json()) as { rows?: GscPageRow[] };
    const rows = data.rows ?? [];
    all.push(...rows);
    if (rows.length < rowLimit) break;
    startRow += rowLimit;
    if (startRow >= 200_000) break; // safety cap
  }

  return all.map((r) => ({
    url: r.keys[0] ?? "",
    clicks: r.clicks,
    impressions: r.impressions,
    position: r.position,
    ctr: r.ctr,
  })).filter((r) => r.url.length > 0);
}

export async function getGscCannibalization(
  siteUrl: string | null,
  options: { minImpressionsPerUrl?: number } = {}
): Promise<{ connected: boolean; reason?: string; hits: CannibalizationHit[] }> {
  if (!siteUrl) return { connected: false, reason: "No GSC property URL", hits: [] };
  if (!(await isGoogleServiceAccountConfigured())) return { connected: false, reason: "Google service account not configured", hits: [] };

  const minImp = options.minImpressionsPerUrl ?? 10;
  try {
    // 28-day window gives enough signal without over-weighting one-off ranking spikes
    const rows = await queryRange(siteUrl, dateOffset(31), dateOffset(3));

    // Group by query → collect URLs
    const byQuery = new Map<string, GscQueryRow[]>();
    for (const r of rows) {
      const query = r.keys[0];
      const page = r.keys[1];
      if (!query || !page) continue;
      if (!byQuery.has(query)) byQuery.set(query, []);
      byQuery.get(query)!.push(r);
    }

    const hits: CannibalizationHit[] = [];
    for (const [query, pages] of byQuery.entries()) {
      const eligible = pages.filter((p) => p.impressions >= minImp);
      if (eligible.length < 2) continue;

      const totalClicks = eligible.reduce((s, p) => s + p.clicks, 0);
      const totalImpressions = eligible.reduce((s, p) => s + p.impressions, 0);
      const sorted = [...eligible].sort((a, b) => b.clicks - a.clicks);
      // click_split_ratio: 1 = evenly split, 0 = one URL owns everything
      const topClicks = sorted[0].clicks;
      const clickSplitRatio = totalClicks === 0 ? 0 : 1 - (topClicks / totalClicks);

      // Severity rules:
      //  - high: 3+ URLs OR split >= 0.4 with total_clicks >= 20
      //  - medium: 2 URLs with split >= 0.2 and total_impressions >= 100
      //  - low: everything else that cleared the minImp threshold
      let severity: "low" | "medium" | "high" = "low";
      if (eligible.length >= 3 || (clickSplitRatio >= 0.4 && totalClicks >= 20)) severity = "high";
      else if (clickSplitRatio >= 0.2 && totalImpressions >= 100) severity = "medium";

      hits.push({
        query,
        competing_urls: sorted.map((p) => ({
          url: p.keys[1]!,
          clicks: p.clicks,
          impressions: p.impressions,
          position: Number(p.position.toFixed(1)),
        })),
        url_count: eligible.length,
        total_clicks: totalClicks,
        total_impressions: totalImpressions,
        severity,
        click_split_ratio: Number(clickSplitRatio.toFixed(2)),
      });
    }

    // Rank hits: high severity first, then by total clicks
    hits.sort((a, b) => {
      const sevWeight = { high: 3, medium: 2, low: 1 } as const;
      const sevDiff = sevWeight[b.severity] - sevWeight[a.severity];
      return sevDiff !== 0 ? sevDiff : b.total_clicks - a.total_clicks;
    });

    return { connected: true, hits };
  } catch (e) {
    return { connected: false, reason: e instanceof Error ? e.message : "GSC request failed", hits: [] };
  }
}
