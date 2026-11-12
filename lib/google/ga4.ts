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

    // Ticket 4/6: top 10 for the "Top 10 Page Views" category box.
    const topGainers = [...deltas].sort((a, b) => b.delta - a.delta).filter((d) => d.delta > 0).slice(0, 10);
    const topLosers = [...deltas].sort((a, b) => a.delta - b.delta).filter((d) => d.delta < 0).slice(0, 10);
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

export interface Ga4UrlSnapshot {
  sessions: number;
  engagedSessions: number;
  engagementRate: number;
  averageEngagementTime: number;
  bounceRate: number;
  conversions: number;
  topReferrers: Array<{ source: string; sessions: number }>;
}

/**
 * Per-URL, per-period snapshot for the daily url_metrics sync - core
 * engagement metrics for ONE page over the last `daysAgo` days, plus its top
 * referrer sources. Companion to getGa4UrlAggregates (many URLs, one window);
 * this is one URL, one of several windows (30/60/90d).
 */
export async function getGa4UrlSnapshot(propertyId: string, pagePath: string, daysAgo: 30 | 60 | 90): Promise<Ga4UrlSnapshot> {
  const token = await getGoogleAccessToken(SCOPE);
  const dateRanges = [{ startDate: `${daysAgo}daysAgo`, endDate: "today" }];
  const pageFilter = { filter: { fieldName: "pagePath", stringFilter: { matchType: "EXACT", value: pagePath } } };

  const runQuery = async (body: Record<string, unknown>): Promise<RunReportRow[]> => {
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`GA4 URL-snapshot query failed (${res.status}): ${errBody.slice(0, 300)}`);
    }
    const data = (await res.json()) as { rows?: RunReportRow[] };
    return data.rows ?? [];
  };

  const [mainRows, refRows] = await Promise.all([
    runQuery({
      dateRanges,
      dimensions: [{ name: "pagePath" }],
      metrics: [
        { name: "sessions" }, { name: "engagedSessions" }, { name: "engagementRate" },
        { name: "averageSessionDuration" }, { name: "bounceRate" }, { name: "conversions" },
      ],
      dimensionFilter: pageFilter,
      limit: 1,
    }),
    // Top referrers - separate small query, best-effort.
    runQuery({
      dateRanges,
      dimensions: [{ name: "sessionSource" }],
      metrics: [{ name: "sessions" }],
      dimensionFilter: pageFilter,
      limit: 5,
    }).catch(() => [] as RunReportRow[]),
  ]);

  const m = mainRows[0]?.metricValues ?? [];
  const get = (i: number) => parseFloat(m[i]?.value ?? "0") || 0;

  return {
    sessions: get(0),
    engagedSessions: get(1),
    engagementRate: get(2),
    averageEngagementTime: get(3), // averageSessionDuration - named to match the stored ga_avg_engagement_time column
    bounceRate: get(4),
    conversions: get(5),
    topReferrers: refRows.map((r) => ({
      source: r.dimensionValues[0]?.value ?? "(unknown)",
      sessions: parseInt(r.metricValues[0]?.value ?? "0", 10) || 0,
    })),
  };
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

// ============================================================================
// AI-referral traffic: sessions/conversions/revenue GA4 attributes to an AI
// assistant (ChatGPT, Perplexity, Claude, Gemini, Copilot, ...). Powers the
// Analytics "AI assistants sent you N visits" strip. Best-effort revenue:
// non-ecommerce properties 400 on totalRevenue, so we retry without it.
// (The optional second arg is accepted + ignored so callers ported from Klimb
// that pass a projectId type-check unchanged.)
// ============================================================================

// sessionSource values look like "chatgpt.com", "perplexity.ai". Match KNOWN AI
// domains only (anchored to the domain end + optional subdomain) so a host that
// merely CONTAINS "openai"/"chatgpt" is not miscounted, and NOT bing.com /
// google.com (search engines). Known tradeoff: GA4 attributes Gemini referrals
// to google.com, so Gemini traffic is under-counted here.
const AI_REFERRER = /(?:^|\.)(?:chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|anthropic\.com|gemini\.google\.com|copilot\.microsoft\.com|you\.com|poe\.com|phind\.com|deepseek\.com|grok\.com|x\.ai|mistral\.ai|huggingface\.co)$/i;

export interface Ga4AiReferralSource { source: string; sessions: number; }

export interface Ga4AiReferral {
  connected: boolean;
  reason?: string;
  sessions: number;
  conversions: number;
  /** null = the property has no revenue/ecommerce metric (so we hide the figure). */
  revenue: number | null;
  bySource: Ga4AiReferralSource[];
  /** Session trend vs the prior equal window; null when there's no prior data. */
  trendPct: number | null;
}

export async function getGa4AiReferralTraffic(propertyId: string | null, _projectId?: string): Promise<Ga4AiReferral> {
  const empty: Ga4AiReferral = { connected: false, sessions: 0, conversions: 0, revenue: null, bySource: [], trendPct: null };
  if (!propertyId) return { ...empty, reason: "No GA4 property ID on this project." };
  if (!(await isGoogleServiceAccountConfigured())) return { ...empty, reason: "GA4 not connected." };

  let token: string;
  try {
    token = await getGoogleAccessToken(SCOPE);
  } catch (e) {
    return { ...empty, reason: e instanceof Error ? e.message : "GA4 auth failed" };
  }
  const bySource = async (startDate: string, endDate: string, withRevenue: boolean) => {
    const metrics = [{ name: "sessions" }, { name: "keyEvents" }];
    if (withRevenue) metrics.push({ name: "totalRevenue" });
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ dateRanges: [{ startDate, endDate }], dimensions: [{ name: "sessionSource" }], metrics, limit: 250 }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) throw new Error(`GA4 AI-referral failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    return ((await res.json()) as { rows?: RunReportRow[] }).rows ?? [];
  };

  try {
    let revenueAvailable = true;
    let rows = await bySource("28daysAgo", "today", true).catch(() => { revenueAvailable = false; return null; });
    if (!rows) rows = await bySource("28daysAgo", "today", false);
    const priorRows = await bySource("56daysAgo", "28daysAgo", false).catch(() => [] as RunReportRow[]);

    const aiRows = rows.filter((r) => AI_REFERRER.test(r.dimensionValues[0]?.value ?? ""));
    let sessions = 0, conversions = 0, revenue = 0;
    const sources: Ga4AiReferralSource[] = [];
    for (const r of aiRows) {
      const s = parseInt(r.metricValues[0]?.value ?? "0", 10) || 0;
      sessions += s;
      conversions += parseInt(r.metricValues[1]?.value ?? "0", 10) || 0;
      if (revenueAvailable) revenue += parseFloat(r.metricValues[2]?.value ?? "0") || 0;
      if (s > 0) sources.push({ source: r.dimensionValues[0]?.value ?? "(unknown)", sessions: s });
    }
    const priorSessions = priorRows
      .filter((r) => AI_REFERRER.test(r.dimensionValues[0]?.value ?? ""))
      .reduce((sum, r) => sum + (parseInt(r.metricValues[0]?.value ?? "0", 10) || 0), 0);
    const trendPct = priorSessions === 0 ? (sessions > 0 ? 100 : null) : Math.round(((sessions - priorSessions) / priorSessions) * 100);

    return {
      connected: true,
      sessions,
      conversions,
      revenue: revenueAvailable ? Math.round(revenue) : null,
      bySource: sources.sort((a, b) => b.sessions - a.sessions).slice(0, 5),
      trendPct,
    };
  } catch (e) {
    return { ...empty, reason: e instanceof Error ? e.message : "GA4 request failed" };
  }
}

// ============================================================================
// Organic + earned monthly traffic: sessions grouped by GA4's default channel
// grouping, summed over the channels we treat as "organic / earned". AI-assistant
// referrals usually land in Referral / Unassigned in GA4's default grouping, so
// those are included on purpose. 28-day window = a true "monthly" figure.
// ============================================================================

// Ticket 1: the team's own list - Organic Search + free tools (label only;
// GA4 has no distinguishable "free tools" channel), Direct / Brand, Organic
// Social, Referral, Organic Video, Email, AI Assistant. "Unassigned" is
// deliberately OUT of the counted set now (a change from before) - it drops
// to the "shown for context" footer with the paid channels. Known tradeoff:
// GA4 sometimes buckets AI-referral sessions into Unassigned when it can't
// classify them, so this slightly undercounts AI traffic - flagged, not
// silently absorbed.
const ORGANIC_EARNED_CHANNELS = new Set([
  "Organic Search",
  "Direct",
  "Organic Social",
  "Organic Video",
  "Referral",
  "Email",
  "AI Assistant",
]);

export interface Ga4ChannelRow {
  channel: string;
  sessions: number;
  included: boolean;
  priorSessions: number;
  /** % change vs the prior 28d; null when the prior base is too small (<10). */
  deltaPct: number | null;
}

export interface Ga4OrganicTraffic {
  connected: boolean;
  reason?: string;
  monthlySessions: number;
  priorSessions: number;
  trendPct: number | null;
  byChannel: Ga4ChannelRow[];
}

// Ticket 3: compareRange comes from resolveTrafficCompareRange - the caller
// picks the preset (Last 7/30 days, This month, Last 3/6 months, This year),
// and the current/previous windows (already day-count-normalized for "This
// month"/"This year") are passed in as absolute dates rather than GA4's
// relative "NdaysAgo" shorthand, since only absolute dates can express those
// asymmetric comparison windows.
export async function getGa4OrganicMonthly(
  propertyId: string | null,
  compareRange: { current: { start: string; end: string }; previous: { start: string; end: string } },
): Promise<Ga4OrganicTraffic> {
  const empty: Ga4OrganicTraffic = { connected: false, monthlySessions: 0, priorSessions: 0, trendPct: null, byChannel: [] };
  if (!propertyId) return { ...empty, reason: "No GA4 property ID on this project." };
  if (!(await isGoogleServiceAccountConfigured())) return { ...empty, reason: "GA4 not connected." };

  let token: string;
  try {
    token = await getGoogleAccessToken(SCOPE);
  } catch (e) {
    return { ...empty, reason: e instanceof Error ? e.message : "GA4 auth failed" };
  }

  const byChannel = async (startDate: string, endDate: string): Promise<RunReportRow[]> => {
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: "sessionDefaultChannelGroup" }],
          metrics: [{ name: "sessions" }],
          limit: 50,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) throw new Error(`GA4 organic-traffic failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    return ((await res.json()) as { rows?: RunReportRow[] }).rows ?? [];
  };

  try {
    const [rows, priorRows] = await Promise.all([
      byChannel(compareRange.current.start, compareRange.current.end),
      byChannel(compareRange.previous.start, compareRange.previous.end).catch(() => [] as RunReportRow[]),
    ]);

    const priorByChannel = new Map<string, number>();
    let priorSessions = 0;
    for (const r of priorRows) {
      const channel = r.dimensionValues[0]?.value ?? "(unknown)";
      const sessions = parseInt(r.metricValues[0]?.value ?? "0", 10) || 0;
      priorByChannel.set(channel, (priorByChannel.get(channel) ?? 0) + sessions);
      if (ORGANIC_EARNED_CHANNELS.has(channel)) priorSessions += sessions;
    }

    let monthlySessions = 0;
    const out: Ga4ChannelRow[] = [];
    for (const r of rows) {
      const channel = r.dimensionValues[0]?.value ?? "(unknown)";
      const sessions = parseInt(r.metricValues[0]?.value ?? "0", 10) || 0;
      const included = ORGANIC_EARNED_CHANNELS.has(channel);
      if (included) monthlySessions += sessions;
      const prior = priorByChannel.get(channel) ?? 0;
      const deltaPct = prior >= 10 ? Math.round(((sessions - prior) / prior) * 100) : null;
      out.push({ channel, sessions, included, priorSessions: prior, deltaPct });
    }
    const trendPct = priorSessions === 0
      ? (monthlySessions > 0 ? 100 : null)
      : Math.round(((monthlySessions - priorSessions) / priorSessions) * 100);

    return {
      connected: true,
      monthlySessions,
      priorSessions,
      trendPct,
      byChannel: out.sort((a, b) => b.sessions - a.sessions),
    };
  } catch (e) {
    return { ...empty, reason: e instanceof Error ? e.message : "GA4 request failed" };
  }
}

// Monthly traffic history for the executive goal chart: sessions per calendar
// month, summed over the SAME counted channels as getGa4OrganicMonthly (the
// Analytics nav's Traffic sources total), so the goal line and that card agree.
export interface Ga4MonthlySessions {
  connected: boolean;
  reason?: string;
  months: { month: string; sessions: number }[]; // YYYY-MM, oldest -> newest
}

export async function getGa4MonthlySessions(
  propertyId: string | null,
  startDate: string,
  endDate: string,
): Promise<Ga4MonthlySessions> {
  const empty: Ga4MonthlySessions = { connected: false, months: [] };
  if (!propertyId) return { ...empty, reason: "No GA4 property ID on this project." };
  if (!(await isGoogleServiceAccountConfigured())) return { ...empty, reason: "GA4 not connected." };
  try {
    const token = await getGoogleAccessToken(SCOPE);
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: "yearMonth" }, { name: "sessionDefaultChannelGroup" }],
          metrics: [{ name: "sessions" }],
          limit: 1000,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) throw new Error(`GA4 monthly sessions failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    const rows = ((await res.json()) as { rows?: RunReportRow[] }).rows ?? [];
    const byMonth = new Map<string, number>();
    for (const r of rows) {
      const ym = r.dimensionValues[0]?.value ?? "";
      const channel = r.dimensionValues[1]?.value ?? "";
      if (!/^\d{6}$/.test(ym) || !ORGANIC_EARNED_CHANNELS.has(channel)) continue;
      const key = `${ym.slice(0, 4)}-${ym.slice(4)}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + (parseInt(r.metricValues[0]?.value ?? "0", 10) || 0));
    }
    return {
      connected: true,
      months: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, sessions]) => ({ month, sessions })),
    };
  } catch (e) {
    return { ...empty, reason: e instanceof Error ? e.message : "GA4 request failed" };
  }
}

// The property's reporting timezone (GA4 Admin API). GA4 dateHourMinute values
// are in this zone; HubSpot createdate is UTC — so matching a booking to a CRM
// record needs this to align the two. Falls back to IST (the team's zone).
export async function getGa4PropertyTimezone(propertyId: string | null): Promise<string> {
  const fallback = "Asia/Kolkata";
  if (!propertyId || !(await isGoogleServiceAccountConfigured())) return fallback;
  try {
    const token = await getGoogleAccessToken(SCOPE);
    const res = await fetch(`https://analyticsadmin.googleapis.com/v1beta/properties/${propertyId}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return fallback;
    const j = (await res.json()) as { timeZone?: string };
    return j.timeZone || fallback;
  } catch { return fallback; }
}

// ============================================================================
// Demo bookings — a booking = a session that reached a "next-steps" page (the
// post-demo "What's Next?" guide that only loads after a Calendly booking).
// Counted per channel, PAID excluded (the Analytics demo panel is non-paid
// only), and test traffic (utm_source=claude_test) filtered out. Same GA4 Data
// API + auth path as getGa4OrganicMonthly above.
// ============================================================================

const BOOKING_PAGE_MATCH = "next-steps";
const PAID_CHANNELS = new Set([
  "Paid Search", "Paid Social", "Paid Video", "Paid Shopping", "Paid Other", "Display", "Cross-network",
]);
// Cities whose bookings are excluded as known internal/test traffic (e.g. the
// team tests demos from Jalandhar). Filtered out of both counts and detail rows.
const EXCLUDED_CITIES = ["Jalandhar"];

// pagePath CONTAINS next-steps, NOT test traffic (utm_source=claude_test or an
// excluded city), plus any extra expressions.
function bookingFilter(extra: object[] = []): object {
  return {
    andGroup: {
      expressions: [
        { filter: { fieldName: "pagePath", stringFilter: { matchType: "CONTAINS", value: BOOKING_PAGE_MATCH } } },
        { notExpression: { filter: { fieldName: "sessionSource", stringFilter: { matchType: "EXACT", value: "claude_test" } } } },
        { notExpression: { filter: { fieldName: "city", inListFilter: { values: EXCLUDED_CITIES } } } },
        ...extra,
      ],
    },
  };
}

export interface Ga4DemoChannelRow {
  channel: string;
  bookings: number;
  priorBookings: number;
  deltaPct: number | null;
}
export interface Ga4DemoBookings {
  connected: boolean;
  reason?: string;
  total: number;        // non-paid bookings
  priorTotal: number;
  trendPct: number | null;
  byChannel: Ga4DemoChannelRow[];  // non-paid channels only, desc by bookings
}

export async function getGa4DemoBookings(
  propertyId: string | null,
  compareRange: { current: { start: string; end: string }; previous: { start: string; end: string } },
): Promise<Ga4DemoBookings> {
  const empty: Ga4DemoBookings = { connected: false, total: 0, priorTotal: 0, trendPct: null, byChannel: [] };
  if (!propertyId) return { ...empty, reason: "No GA4 property ID on this project." };
  if (!(await isGoogleServiceAccountConfigured())) return { ...empty, reason: "GA4 not connected." };

  let token: string;
  try { token = await getGoogleAccessToken(SCOPE); }
  catch (e) { return { ...empty, reason: e instanceof Error ? e.message : "GA4 auth failed" }; }

  const byChannel = async (startDate: string, endDate: string): Promise<RunReportRow[]> => {
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate }],
          dimensions: [{ name: "sessionDefaultChannelGroup" }],
          metrics: [{ name: "sessions" }],
          dimensionFilter: bookingFilter(),
          limit: 50,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) throw new Error(`GA4 demo-bookings failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    return ((await res.json()) as { rows?: RunReportRow[] }).rows ?? [];
  };

  try {
    const [rows, priorRows] = await Promise.all([
      byChannel(compareRange.current.start, compareRange.current.end),
      byChannel(compareRange.previous.start, compareRange.previous.end).catch(() => [] as RunReportRow[]),
    ]);

    const priorByChannel = new Map<string, number>();
    let priorTotal = 0;
    for (const r of priorRows) {
      const channel = r.dimensionValues[0]?.value ?? "(unknown)";
      const bookings = parseInt(r.metricValues[0]?.value ?? "0", 10) || 0;
      priorByChannel.set(channel, (priorByChannel.get(channel) ?? 0) + bookings);
      if (!PAID_CHANNELS.has(channel)) priorTotal += bookings;
    }

    let total = 0;
    const out: Ga4DemoChannelRow[] = [];
    for (const r of rows) {
      const channel = r.dimensionValues[0]?.value ?? "(unknown)";
      if (PAID_CHANNELS.has(channel)) continue; // non-paid only
      const bookings = parseInt(r.metricValues[0]?.value ?? "0", 10) || 0;
      if (bookings === 0) continue;
      total += bookings;
      const prior = priorByChannel.get(channel) ?? 0;
      const deltaPct = prior >= 10 ? Math.round(((bookings - prior) / prior) * 100) : null;
      out.push({ channel, bookings, priorBookings: prior, deltaPct });
    }
    const trendPct = priorTotal === 0 ? (total > 0 ? 100 : null) : Math.round(((total - priorTotal) / priorTotal) * 100);

    return { connected: true, total, priorTotal, trendPct, byChannel: out.sort((a, b) => b.bookings - a.bookings) };
  } catch (e) {
    return { ...empty, reason: e instanceof Error ? e.message : "GA4 request failed" };
  }
}

export interface Ga4BookingDetailRow {
  time: string;         // "YYYY-MM-DD HH:MM"
  sourceMedium: string;
  landingPage: string;
  device: string;
  location: string;
  bookings: number;
}

// Per-booking detail for one channel — what the panel loads when a source row is
// expanded. GA4 aggregates identical dimension tuples, so near-simultaneous
// bookings from the same source/page can collapse into one row (directional).
export async function getGa4DemoBookingDetail(
  propertyId: string | null,
  range: { start: string; end: string },
  channel: string,
): Promise<{ ok: boolean; reason?: string; rows: Ga4BookingDetailRow[] }> {
  if (!propertyId) return { ok: false, reason: "No GA4 property ID on this project.", rows: [] };
  if (!(await isGoogleServiceAccountConfigured())) return { ok: false, reason: "GA4 not connected.", rows: [] };

  let token: string;
  try { token = await getGoogleAccessToken(SCOPE); }
  catch (e) { return { ok: false, reason: e instanceof Error ? e.message : "GA4 auth failed", rows: [] }; }

  try {
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate: range.start, endDate: range.end }],
          dimensions: [
            { name: "dateHourMinute" },
            { name: "sessionSourceMedium" },
            { name: "landingPagePlusQueryString" },
            { name: "deviceCategory" },
            { name: "city" },
          ],
          metrics: [{ name: "sessions" }],
          dimensionFilter: bookingFilter([
            { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: channel } } },
          ]),
          orderBys: [{ dimension: { dimensionName: "dateHourMinute" }, desc: true }],
          limit: 250,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) return { ok: false, reason: `GA4 booking-detail failed (${res.status}): ${(await res.text()).slice(0, 160)}`, rows: [] };
    const data = (await res.json()) as { rows?: RunReportRow[] };
    const rows: Ga4BookingDetailRow[] = (data.rows ?? []).map((r) => {
      const raw = r.dimensionValues[0]?.value ?? ""; // YYYYMMDDHHMM
      const time = raw.length === 12
        ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)} ${raw.slice(8, 10)}:${raw.slice(10, 12)}`
        : raw;
      return {
        time,
        sourceMedium: r.dimensionValues[1]?.value ?? "(unknown)",
        landingPage: r.dimensionValues[2]?.value ?? "(not set)",
        device: r.dimensionValues[3]?.value ?? "",
        location: r.dimensionValues[4]?.value ?? "",
        bookings: parseInt(r.metricValues[0]?.value ?? "0", 10) || 0,
      };
    });
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "GA4 request failed", rows: [] };
  }
}

export interface Ga4NonPaidBookingRow {
  channel: string;
  time: string;         // "YYYY-MM-DD HH:MM" in the property timezone
  landingPage: string;
  device: string;
  location: string;
}

// Every NON-PAID next-steps booking as a (channel, minute) row — the raw input
// for matching bookings to HubSpot deals (organic deals). One report across all
// channels; paid channels dropped in code. Test/Jalandhar excluded by bookingFilter.
export async function getGa4NonPaidDemoRows(
  propertyId: string | null,
  range: { start: string; end: string },
): Promise<{ ok: boolean; reason?: string; rows: Ga4NonPaidBookingRow[] }> {
  if (!propertyId) return { ok: false, reason: "No GA4 property ID on this project.", rows: [] };
  if (!(await isGoogleServiceAccountConfigured())) return { ok: false, reason: "GA4 not connected.", rows: [] };
  let token: string;
  try { token = await getGoogleAccessToken(SCOPE); }
  catch (e) { return { ok: false, reason: e instanceof Error ? e.message : "GA4 auth failed", rows: [] }; }

  try {
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate: range.start, endDate: range.end }],
          dimensions: [
            { name: "sessionDefaultChannelGroup" },
            { name: "dateHourMinute" },
            { name: "landingPagePlusQueryString" },
            { name: "deviceCategory" },
            { name: "city" },
          ],
          metrics: [{ name: "sessions" }],
          dimensionFilter: bookingFilter(),
          orderBys: [{ dimension: { dimensionName: "dateHourMinute" }, desc: true }],
          limit: 1000,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) return { ok: false, reason: `GA4 non-paid rows failed (${res.status}): ${(await res.text()).slice(0, 160)}`, rows: [] };
    const data = (await res.json()) as { rows?: RunReportRow[] };
    const rows: Ga4NonPaidBookingRow[] = [];
    for (const r of data.rows ?? []) {
      const channel = r.dimensionValues[0]?.value ?? "(unknown)";
      if (PAID_CHANNELS.has(channel)) continue;
      const raw = r.dimensionValues[1]?.value ?? ""; // YYYYMMDDHHMM
      const time = raw.length === 12
        ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)} ${raw.slice(8, 10)}:${raw.slice(10, 12)}`
        : raw;
      rows.push({
        channel,
        time,
        landingPage: r.dimensionValues[2]?.value ?? "(not set)",
        device: r.dimensionValues[3]?.value ?? "",
        location: r.dimensionValues[4]?.value ?? "",
      });
    }
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "GA4 request failed", rows: [] };
  }
}

// ============================================================================
// Demo CTA aggregate — which button on which page drives demo demand. Reads the
// cta_click event (live since 2 Nov 2026) filtered to cta_type=demo, by its
// registered event-scoped custom dimensions. Aggregate only: GA4's API can't tie
// a specific booking to a specific click (that needs BigQuery), so we report
// clicks by placement/button/page + an overall click->booking rate.
// ============================================================================

const CTA_LIVE_DATE = "2026-11-02"; // GTM cta_click tag went live; no data before this

export interface Ga4CtaButtonRow { location: string; ctaText: string; page: string; clicks: number; }
export interface Ga4DemoCta {
  connected: boolean;
  reason?: string;
  beforeCta: boolean;   // the selected range ends before the tag was live
  totalClicks: number;
  /** Non-paid bookings over the SAME (2 Nov-onward) window as the clicks, so the rate is like-for-like. */
  bookingsSince: number;
  byLocation: { location: string; clicks: number }[];
  byButton: Ga4CtaButtonRow[];
}

export async function getGa4DemoCta(
  propertyId: string | null,
  range: { start: string; end: string },
): Promise<Ga4DemoCta> {
  const empty: Ga4DemoCta = { connected: false, beforeCta: false, totalClicks: 0, bookingsSince: 0, byLocation: [], byButton: [] };
  if (!propertyId) return { ...empty, reason: "No GA4 property ID on this project." };
  if (!(await isGoogleServiceAccountConfigured())) return { ...empty, reason: "GA4 not connected." };
  // Nothing was tracked before the tag went live.
  if (range.end < CTA_LIVE_DATE) return { ...empty, connected: true, beforeCta: true };
  const startDate = range.start < CTA_LIVE_DATE ? CTA_LIVE_DATE : range.start;

  let token: string;
  try { token = await getGoogleAccessToken(SCOPE); }
  catch (e) { return { ...empty, reason: e instanceof Error ? e.message : "GA4 auth failed" }; }

  try {
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate: range.end }],
          dimensions: [
            { name: "customEvent:cta_location" },
            { name: "customEvent:cta_text" },
            { name: "pagePath" },
          ],
          metrics: [{ name: "eventCount" }],
          dimensionFilter: {
            andGroup: {
              expressions: [
                { filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: "cta_click" } } },
                { filter: { fieldName: "customEvent:cta_type", stringFilter: { matchType: "EXACT", value: "demo" } } },
                { notExpression: { filter: { fieldName: "sessionSource", stringFilter: { matchType: "EXACT", value: "claude_test" } } } },
              ],
            },
          },
          orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
          limit: 100,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) return { ...empty, reason: `GA4 demo-CTA failed (${res.status}): ${(await res.text()).slice(0, 160)}` };
    const data = (await res.json()) as { rows?: RunReportRow[] };

    const byLocationMap = new Map<string, number>();
    let totalClicks = 0;
    const byButton: Ga4CtaButtonRow[] = (data.rows ?? []).map((r) => {
      const location = r.dimensionValues[0]?.value || "(not set)";
      const ctaText = r.dimensionValues[1]?.value || "(not set)";
      const page = r.dimensionValues[2]?.value || "(not set)";
      const clicks = parseInt(r.metricValues[0]?.value ?? "0", 10) || 0;
      byLocationMap.set(location, (byLocationMap.get(location) ?? 0) + clicks);
      totalClicks += clicks;
      return { location, ctaText, page, clicks };
    });
    const byLocation = [...byLocationMap.entries()].map(([location, clicks]) => ({ location, clicks })).sort((a, b) => b.clicks - a.clicks);

    // Non-paid bookings over the SAME window as the clicks, so click->booking is like-for-like.
    let bookingsSince = 0;
    try {
      const bres = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: JSON.stringify({
            dateRanges: [{ startDate, endDate: range.end }],
            dimensions: [{ name: "sessionDefaultChannelGroup" }],
            metrics: [{ name: "sessions" }],
            dimensionFilter: bookingFilter(),
            limit: 50,
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (bres.ok) {
        const bj = (await bres.json()) as { rows?: RunReportRow[] };
        for (const r of bj.rows ?? []) {
          const channel = r.dimensionValues[0]?.value ?? "";
          if (PAID_CHANNELS.has(channel)) continue;
          bookingsSince += parseInt(r.metricValues[0]?.value ?? "0", 10) || 0;
        }
      }
    } catch { /* leave bookingsSince at 0 */ }

    return { connected: true, beforeCta: false, totalClicks, bookingsSince, byLocation, byButton };
  } catch (e) {
    return { ...empty, reason: e instanceof Error ? e.message : "GA4 request failed" };
  }
}

// ============================================================================
// Content -> demo funnel (GA4 alpha runFunnelReport). Three steps: reads content
// of a segment -> views /demo/ -> reaches /next-steps/ (booked). Segments:
// blog (/blog/*), guide (/guides/*), marketing (high-intent: solutions/features/
// alternatives/industry/pricing). Step counts come from a no-breakdown funnel;
// the per-page drill-down from a second funnel broken down by landing page.
// Response shape is parsed defensively so an alpha quirk degrades, never breaks.
// ============================================================================

export type FunnelSegment = "blog" | "guide" | "marketing";
export const FUNNEL_SEGMENTS: { key: FunnelSegment; label: string; step1: string }[] = [
  { key: "blog", label: "Blogs", step1: "Reads a blog" },
  { key: "guide", label: "Guides", step1: "Reads a guide" },
  { key: "marketing", label: "Marketing pages", step1: "Views a marketing page" },
];

// Funnel steps only accept a subset of dimensions — pagePath is NOT allowed, so
// use unifiedPagePathScreen ("Page path and screen class"), the dimension GA4's
// own Funnel exploration uses for a page filter.
const PAGE_FIELD = "unifiedPagePathScreen";
const SEGMENT_STEP1: Record<FunnelSegment, object> = {
  blog: { funnelFieldFilter: { fieldName: PAGE_FIELD, stringFilter: { matchType: "CONTAINS", value: "/blog/" } } },
  guide: { funnelFieldFilter: { fieldName: PAGE_FIELD, stringFilter: { matchType: "CONTAINS", value: "/guides/" } } },
  marketing: { funnelFieldFilter: { fieldName: PAGE_FIELD, stringFilter: { matchType: "PARTIAL_REGEXP", value: "^/(solutions|features|alternatives|industry|pricing)" } } },
};

export interface FunnelStep { name: string; users: number; completionRate: number; abandonments: number; abandonmentRate: number; }
export interface FunnelPageRow { page: string; entered: number; viewedDemo: number; booked: number; completionRate: number; }
export interface Ga4ContentFunnel {
  connected: boolean;
  reason?: string;
  segment: FunnelSegment;
  steps: FunnelStep[];
  pages: FunnelPageRow[];
}

type FunnelRow = { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] };

function funnelBody(startDate: string, endDate: string, step1: object, breakdown: boolean) {
  const body: Record<string, unknown> = {
    dateRanges: [{ startDate, endDate }],
    funnel: {
      steps: [
        { name: "Reads content", filterExpression: step1 },
        { name: "Views demo page", filterExpression: { funnelFieldFilter: { fieldName: PAGE_FIELD, stringFilter: { matchType: "CONTAINS", value: "/demo/" } } } },
        { name: "Books a demo", filterExpression: { funnelFieldFilter: { fieldName: PAGE_FIELD, stringFilter: { matchType: "CONTAINS", value: "/next-steps/" } } } },
      ],
    },
  };
  if (breakdown) body.funnelBreakdown = { breakdownDimension: { name: "landingPagePlusQueryString" }, limit: 12 };
  return body;
}

export async function getGa4ContentDemoFunnel(
  propertyId: string | null,
  range: { start: string; end: string },
  segment: FunnelSegment,
): Promise<Ga4ContentFunnel> {
  const empty: Ga4ContentFunnel = { connected: false, segment, steps: [], pages: [] };
  if (!propertyId) return { ...empty, reason: "No GA4 property ID on this project." };
  if (!(await isGoogleServiceAccountConfigured())) return { ...empty, reason: "GA4 not connected." };

  let token: string;
  try { token = await getGoogleAccessToken(SCOPE); }
  catch (e) { return { ...empty, reason: e instanceof Error ? e.message : "GA4 auth failed" }; }

  const call = async (breakdown: boolean): Promise<FunnelRow[]> => {
    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1alpha/properties/${propertyId}:runFunnelReport`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(funnelBody(range.start, range.end, SEGMENT_STEP1[segment], breakdown)),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!res.ok) throw new Error(`GA4 funnel failed (${res.status}): ${(await res.text()).slice(0, 180)}`);
    const json = (await res.json()) as { funnelTable?: { rows?: FunnelRow[] } };
    return json.funnelTable?.rows ?? [];
  };

  try {
    const [plain, broken] = await Promise.all([call(false), call(true).catch(() => [] as FunnelRow[])]);

    // Plain rows: one per step. Metrics per row are
    // [activeUsers, completionRate, abandonments, abandonmentRate, ...] — the
    // FIRST value is activeUsers (what we want); step order = row order.
    const usersByStep = plain.map((r) => parseInt(r.metricValues?.[0]?.value ?? "0", 10) || 0);
    const names = ["Reads content", "Views demo page", "Books a demo"];
    const base = usersByStep[0] || 0;
    const steps: FunnelStep[] = names.map((name, i) => {
      const users = usersByStep[i] ?? 0;
      const next = usersByStep[i + 1] ?? 0;
      const abandonments = i < names.length - 1 ? Math.max(0, users - next) : 0;
      return {
        name,
        users,
        completionRate: base > 0 ? Math.round((users / base) * 1000) / 10 : 0,
        abandonments,
        abandonmentRate: users > 0 ? Math.round((abandonments / users) * 1000) / 10 : 0,
      };
    });

    // Broken-down rows: (step, landingPage) -> users. Build per-page entered(step1)
    // + booked(last step). The step dimension is the FIRST value, the breakdown the
    // second; fall back gracefully if the order differs.
    // Broken-down rows come as (funnel step, landing page). Bucket each page's
    // users at step 1 (entered), step 2 (viewed /demo/) and step 3 (booked). The
    // step name is "N. ...", so the leading number is the step index. GA4 adds a
    // "RESERVED_TOTAL" aggregate page — dropped (the card header shows totals).
    const enteredByPage = new Map<string, number>();
    const viewedByPage = new Map<string, number>();
    const bookedByPage = new Map<string, number>();
    for (const r of broken) {
      const dims = r.dimensionValues ?? [];
      const users = parseInt(r.metricValues?.[0]?.value ?? "0", 10) || 0;
      const stepVal = dims[0]?.value ?? "";
      const page = dims[1]?.value ?? dims[dims.length - 1]?.value ?? "(not set)";
      if (page === "RESERVED_TOTAL") continue;
      const step = parseInt(stepVal, 10); // "2. Views demo page" -> 2
      if (step === 1) enteredByPage.set(page, (enteredByPage.get(page) ?? 0) + users);
      else if (step === 2) viewedByPage.set(page, (viewedByPage.get(page) ?? 0) + users);
      else if (step === 3) bookedByPage.set(page, (bookedByPage.get(page) ?? 0) + users);
    }
    const pages: FunnelPageRow[] = [...enteredByPage.entries()]
      .map(([page, entered]) => {
        const booked = bookedByPage.get(page) ?? 0;
        return { page, entered, viewedDemo: viewedByPage.get(page) ?? 0, booked, completionRate: entered > 0 ? Math.round((booked / entered) * 1000) / 10 : 0 };
      })
      .sort((a, b) => b.entered - a.entered);

    return { connected: true, segment, steps, pages };
  } catch (e) {
    return { ...empty, reason: e instanceof Error ? e.message : "GA4 request failed" };
  }
}
