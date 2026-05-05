import { getGoogleAccessToken, isGoogleServiceAccountConfigured } from "./auth";

const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export interface Ga4PageRow {
  pagePath: string;
  views: number;
  avgSessionDuration: number;
  bounceRate: number;
}

export interface Ga4WeeklyDelta {
  page: string;
  thisWeek: number;
  lastWeek: number;
  delta: number;
  deltaPct: number;
}

export interface Ga4WeeklySummary {
  connected: boolean;
  reason?: string;
  topGainers: Ga4WeeklyDelta[];
  topLosers: Ga4WeeklyDelta[];
  totalViewsThisWeek: number;
  totalViewsLastWeek: number;
  totalDeltaPct: number;
}

export interface Ga4FreshnessRow {
  page: string;
  viewsLast7d: number;
  viewsPrior30d: number;
  viewsPrior90d: number;
  decayPct: number;
  status: "fresh" | "stable" | "declining" | "decaying";
}

interface RunReportRow {
  dimensionValues: { value: string }[];
  metricValues: { value: string }[];
}

async function runReport(
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<RunReportRow[]> {
  const token = await getGoogleAccessToken(SCOPE);
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "pagePath" }],
        metrics: [
          { name: "screenPageViews" },
          { name: "averageSessionDuration" },
          { name: "bounceRate" },
        ],
        limit: 100,
      }),
      signal: AbortSignal.timeout(12000),
    }
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GA4 runReport failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { rows?: RunReportRow[] };
  return data.rows ?? [];
}

/**
 * Returns week-over-week page traffic delta: which pages gained / lost the most
 * page views this week compared to the prior 7 days.
 * Returns { connected: false, reason } when credentials are missing — the UI
 * uses this to show a "Connect GA4" placeholder instead of an error.
 */
export async function getGa4WeeklyDelta(propertyId: string | null): Promise<Ga4WeeklySummary> {
  if (!propertyId) {
    return { connected: false, reason: "No GA4 property ID on this project. Add it from Projects.", topGainers: [], topLosers: [], totalViewsThisWeek: 0, totalViewsLastWeek: 0, totalDeltaPct: 0 };
  }
  if (!(await isGoogleServiceAccountConfigured())) {
    return { connected: false, reason: "Google service-account JSON not set. Go to Integrations → GA4 to add it.", topGainers: [], topLosers: [], totalViewsThisWeek: 0, totalViewsLastWeek: 0, totalDeltaPct: 0 };
  }

  try {
    const [thisWeek, lastWeek] = await Promise.all([
      runReport(propertyId, "7daysAgo", "today"),
      runReport(propertyId, "14daysAgo", "7daysAgo"),
    ]);

    const thisMap = new Map<string, number>();
    let totalThis = 0;
    for (const row of thisWeek) {
      const path = row.dimensionValues[0]?.value ?? "";
      const views = parseInt(row.metricValues[0]?.value ?? "0", 10);
      thisMap.set(path, views);
      totalThis += views;
    }
    const lastMap = new Map<string, number>();
    let totalLast = 0;
    for (const row of lastWeek) {
      const path = row.dimensionValues[0]?.value ?? "";
      const views = parseInt(row.metricValues[0]?.value ?? "0", 10);
      lastMap.set(path, views);
      totalLast += views;
    }

    const allPaths = new Set([...thisMap.keys(), ...lastMap.keys()]);
    const deltas: Ga4WeeklyDelta[] = [];
    for (const page of allPaths) {
      const now = thisMap.get(page) ?? 0;
      const prev = lastMap.get(page) ?? 0;
      const delta = now - prev;
      const deltaPct = prev === 0 ? (now > 0 ? 100 : 0) : Math.round(((now - prev) / prev) * 100);
      deltas.push({ page, thisWeek: now, lastWeek: prev, delta, deltaPct });
    }

    const topGainers = [...deltas].sort((a, b) => b.delta - a.delta).filter((d) => d.delta > 0).slice(0, 5);
    const topLosers = [...deltas].sort((a, b) => a.delta - b.delta).filter((d) => d.delta < 0).slice(0, 5);
    const totalDeltaPct = totalLast === 0 ? 0 : Math.round(((totalThis - totalLast) / totalLast) * 100);

    return {
      connected: true,
      topGainers,
      topLosers,
      totalViewsThisWeek: totalThis,
      totalViewsLastWeek: totalLast,
      totalDeltaPct,
    };
  } catch (e) {
    return {
      connected: false,
      reason: e instanceof Error ? e.message : "GA4 request failed",
      topGainers: [],
      topLosers: [],
      totalViewsThisWeek: 0,
      totalViewsLastWeek: 0,
      totalDeltaPct: 0,
    };
  }
}

// ============================================================
// Per-URL aggregates over a long window — used by the blog-audit pipeline
// to make D/M/M decisions on every blog URL.
// ============================================================

export interface Ga4UrlAggregate {
  pagePath: string;
  sessions: number;
  engagedSessions: number;
  pageviews: number;
  avgEngagementTimeSec: number;
}

/**
 * Pull per-URL aggregates over a long window. Optionally filters by URL
 * substring to limit to blog posts only.
 *
 * GA4 returns `pagePath` (e.g. "/blog/employee-monitoring") not full URLs.
 * Caller needs to prefix with the project domain to match GSC URLs.
 */
export async function getGa4UrlAggregates(args: {
  propertyId: string;
  windowDays: number;
  pathContains?: string;
}): Promise<Ga4UrlAggregate[]> {
  const token = await getGoogleAccessToken(SCOPE);
  const startDate = `${args.windowDays}daysAgo`;
  const endDate = "today";

  // GA4 supports up to 250K rows but our blog count is much smaller.
  const body: Record<string, unknown> = {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "pagePath" }],
    metrics: [
      { name: "sessions" },
      { name: "engagedSessions" },
      { name: "screenPageViews" },
      { name: "averageSessionDuration" },
    ],
    limit: 100000,
  };
  if (args.pathContains) {
    body.dimensionFilter = {
      filter: {
        fieldName: "pagePath",
        stringFilter: { matchType: "CONTAINS", value: args.pathContains },
      },
    };
  }

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${args.propertyId}:runReport`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    }
  );
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`GA4 URL-aggregate query failed (${res.status}): ${errBody.slice(0, 300)}`);
  }
  const data = (await res.json()) as { rows?: RunReportRow[] };
  const out: Ga4UrlAggregate[] = [];
  for (const r of data.rows ?? []) {
    const pagePath = r.dimensionValues[0]?.value ?? "";
    if (!pagePath) continue;
    out.push({
      pagePath,
      sessions: parseInt(r.metricValues[0]?.value ?? "0", 10) || 0,
      engagedSessions: parseInt(r.metricValues[1]?.value ?? "0", 10) || 0,
      pageviews: parseInt(r.metricValues[2]?.value ?? "0", 10) || 0,
      avgEngagementTimeSec: parseFloat(r.metricValues[3]?.value ?? "0") || 0,
    });
  }
  return out;
}

// Content freshness: compares each page's last-7-day traffic against a
// 90-day baseline (days 60-150 ago, so we're not polluting the baseline with
// the current decline). Pages below 50% of baseline daily avg are "decaying"
// and earn an auto-created refresh task.
export async function getGa4FreshnessDecay(
  propertyId: string | null
): Promise<{ connected: boolean; reason?: string; rows: Ga4FreshnessRow[] }> {
  if (!propertyId) return { connected: false, reason: "No GA4 property ID", rows: [] };
  if (!(await isGoogleServiceAccountConfigured())) return { connected: false, reason: "Google service account not configured", rows: [] };

  try {
    // last 7d (recent signal) + days 30-60 ago (recent baseline) + days 60-150 ago (stable baseline)
    const [last7, prior30, prior90] = await Promise.all([
      runReport(propertyId, "7daysAgo", "today"),
      runReport(propertyId, "60daysAgo", "30daysAgo"),
      runReport(propertyId, "150daysAgo", "60daysAgo"),
    ]);

    const toMap = (rows: RunReportRow[]) => {
      const m = new Map<string, number>();
      for (const r of rows) {
        const path = r.dimensionValues[0]?.value ?? "";
        const views = parseInt(r.metricValues[0]?.value ?? "0", 10);
        m.set(path, views);
      }
      return m;
    };
    const m7 = toMap(last7);
    const m30 = toMap(prior30);
    const m90 = toMap(prior90);

    const allPaths = new Set([...m7.keys(), ...m30.keys(), ...m90.keys()]);
    const out: Ga4FreshnessRow[] = [];
    for (const page of allPaths) {
      const v7 = m7.get(page) ?? 0;
      const v30 = m30.get(page) ?? 0;
      const v90 = m90.get(page) ?? 0;

      // Normalize to daily averages so window sizes don't bias the comparison.
      const daily7 = v7 / 7;
      const daily90 = v90 / 90;
      let decayPct = 0;
      if (daily90 > 0) {
        decayPct = Math.round(((daily7 - daily90) / daily90) * 100);
      } else if (daily7 > 0) {
        decayPct = 100;
      }

      // Status: decaying = <50% of baseline and had meaningful baseline traffic
      let status: Ga4FreshnessRow["status"] = "stable";
      if (daily90 >= 1 && daily7 < daily90 * 0.5) status = "decaying";
      else if (daily90 >= 1 && daily7 < daily90 * 0.8) status = "declining";
      else if (daily7 >= daily90 * 1.2 && daily7 >= 2) status = "fresh";

      out.push({
        page,
        viewsLast7d: v7,
        viewsPrior30d: v30,
        viewsPrior90d: v90,
        decayPct,
        status,
      });
    }

    // Rank worst decay first so the writer-queue prioritizes pages that need help most
    out.sort((a, b) => a.decayPct - b.decayPct);
    return { connected: true, rows: out };
  } catch (e) {
    return { connected: false, reason: e instanceof Error ? e.message : "GA4 request failed", rows: [] };
  }
}
