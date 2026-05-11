// Composio REST API client.
//
// We use Composio's REST API directly (not their MCP server) for two reasons:
//   1. Their MCP plugin has a buggy manifest right now (missing type/title
//      on userConfig fields) which blocks `/plugin install`.
//   2. The manual `claude mcp add` route registers the MCP server but
//      doesn't surface the 7 meta-tools to Claude Code reliably.
//
// REST works the same locally and on production, has a well-documented
// shape, and is what the Composio docs themselves use in their examples.
//
// API docs: https://docs.composio.dev/reference

const COMPOSIO_BASE = "https://backend.composio.dev/api/v3.1";

function apiKey(): string {
  const key = process.env.COMPOSIO_API_KEY;
  if (!key) throw new Error("COMPOSIO_API_KEY not set. Add it to .env.local.");
  return key;
}

// The entity / user_id under which the Composio connections live. Composio
// scopes connected accounts per user, so every tool execution must pass the
// user_id that owns the GA4 / GSC connection. We initiated both connections
// under "lawrance" during setup — override via env if you re-OAuth under a
// different name.
function entityId(): string {
  return process.env.COMPOSIO_ENTITY_ID ?? "lawrance";
}

// Generic action execution. Tool slugs look like `GOOGLE_ANALYTICS_RUN_REPORT`
// and `GOOGLE_SEARCH_CONSOLE_QUERY_ANALYTICS` — find the exact slug for any
// connector at https://app.composio.dev/toolkits/<app>.
export async function executeAction<T = unknown>(
  toolSlug: string,
  input: Record<string, unknown>,
  options: { connectedAccountId?: string; userId?: string } = {},
): Promise<{ data: T; successful: boolean; error?: unknown }> {
  const url = `${COMPOSIO_BASE}/tools/execute/${toolSlug}`;
  // Every call must include user_id so Composio can pick the right
  // connected account. Default comes from COMPOSIO_ENTITY_ID env, but caller
  // can override on a per-call basis.
  const body: Record<string, unknown> = {
    arguments: input,
    user_id: options.userId ?? entityId(),
  };
  if (options.connectedAccountId) body.connected_account_id = options.connectedAccountId;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": apiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  let json: { data?: T; successful?: boolean; error?: unknown };
  try {
    json = JSON.parse(text) as { data?: T; successful?: boolean; error?: unknown };
  } catch {
    throw new Error(`Composio ${toolSlug}: HTTP ${resp.status}: ${text.slice(0, 500)}`);
  }

  if (!resp.ok || json.successful === false) {
    // Composio's error field is sometimes a string and sometimes an object —
    // stringify defensively so we don't blow up the logs with [object Object].
    const errMsg = typeof json.error === "string"
      ? json.error
      : json.error
        ? JSON.stringify(json.error)
        : `HTTP ${resp.status}`;
    throw new Error(`Composio ${toolSlug}: ${errMsg} (full response: ${text.slice(0, 400)})`);
  }

  return { data: json.data as T, successful: json.successful ?? true, error: json.error };
}

// ============ GA4 Data API ============
//
// We use `runReport` for the per-URL metrics pull. Composio's slug for this
// is GOOGLE_ANALYTICS_RUN_REPORT (single report) — verify the exact slug at
// app.composio.dev/toolkits/google_analytics if a call returns 404.

export interface GA4Metric {
  rows: Array<{
    dimensionValues: Array<{ value: string }>;
    metricValues: Array<{ value: string }>;
  }>;
  rowCount?: number;
}

export async function ga4RunReport(params: {
  propertyId: string;                       // e.g. "273620287"
  startDaysAgo: number;                     // 30, 60, or 90
  endDaysAgo?: number;                      // defaults to 0 (today)
  dimensions: string[];                     // e.g. ["pagePath"]
  metrics: string[];                        // e.g. ["sessions", "engagedSessions"]
  pageFilter?: string;                      // exact pagePath match
  limit?: number;
}): Promise<GA4Metric> {
  const start = `${params.startDaysAgo}daysAgo`;
  const end = params.endDaysAgo ? `${params.endDaysAgo}daysAgo` : "today";

  const input: Record<string, unknown> = {
    property: `properties/${params.propertyId}`,
    dateRanges: [{ startDate: start, endDate: end }],
    dimensions: params.dimensions.map((name) => ({ name })),
    metrics: params.metrics.map((name) => ({ name })),
    limit: params.limit ?? 100,
  };
  if (params.pageFilter) {
    input.dimensionFilter = {
      filter: {
        fieldName: "pagePath",
        stringFilter: { matchType: "EXACT", value: params.pageFilter },
      },
    };
  }

  const result = await executeAction<GA4Metric>("GOOGLE_ANALYTICS_RUN_REPORT", input);
  return result.data;
}

// Aggregated GA4 metrics for a single URL × period.
export interface UrlGa4Snapshot {
  sessions: number;
  engagedSessions: number;
  engagementRate: number;
  averageEngagementTime: number;
  bounceRate: number;
  conversions: number;
  topReferrers: Array<{ source: string; sessions: number }>;
}

export async function ga4UrlSnapshot(propertyId: string, pagePath: string, daysAgo: 30 | 60 | 90): Promise<UrlGa4Snapshot> {
  // Main metrics
  const report = await ga4RunReport({
    propertyId,
    startDaysAgo: daysAgo,
    dimensions: ["pagePath"],
    metrics: ["sessions", "engagedSessions", "engagementRate", "averageSessionDuration", "bounceRate", "conversions"],
    pageFilter: pagePath,
    limit: 1,
  });
  const row = report.rows?.[0];
  const m = row?.metricValues ?? [];
  const get = (i: number) => parseFloat(m[i]?.value ?? "0") || 0;

  // Top referrers — separate small query
  let topReferrers: Array<{ source: string; sessions: number }> = [];
  try {
    const refReport = await ga4RunReport({
      propertyId,
      startDaysAgo: daysAgo,
      dimensions: ["sessionSource"],
      metrics: ["sessions"],
      pageFilter: pagePath,
      limit: 5,
    });
    topReferrers = (refReport.rows ?? []).map((r) => ({
      source: r.dimensionValues[0]?.value ?? "(unknown)",
      sessions: parseInt(r.metricValues[0]?.value ?? "0", 10) || 0,
    }));
  } catch {
    // Referrer query is optional — main metrics still useful if it fails.
  }

  return {
    sessions: get(0),
    engagedSessions: get(1),
    engagementRate: get(2),
    averageEngagementTime: get(3),
    bounceRate: get(4),
    conversions: get(5),
    topReferrers,
  };
}

// ============ GSC Search Analytics ============

export interface GSCRow {
  keys: string[];     // dimension values in order
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCResponse {
  rows?: GSCRow[];
  responseAggregationType?: string;
}

export async function gscSearchAnalytics(params: {
  siteUrl: string;                          // e.g. "https://we360.ai/" or "sc-domain:we360.ai"
  startDaysAgo: number;
  endDaysAgo?: number;
  dimensions: Array<"query" | "page" | "country" | "device" | "date">;
  pageUrl?: string;                         // exact page match filter
  rowLimit?: number;
}): Promise<GSCResponse> {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const start = new Date(today); start.setDate(start.getDate() - params.startDaysAgo);
  const end = new Date(today); end.setDate(end.getDate() - (params.endDaysAgo ?? 0));

  // Composio expects flat snake_case fields, not the nested GSC requestBody
  // shape Google's own API uses.
  const args: Record<string, unknown> = {
    site_url: params.siteUrl,
    start_date: iso(start),
    end_date: iso(end),
    dimensions: params.dimensions,
    row_limit: params.rowLimit ?? 25,
  };
  if (params.pageUrl) {
    args.dimension_filter_groups = [
      { filters: [{ dimension: "page", operator: "equals", expression: params.pageUrl }] },
    ];
  }

  // Composio's actual slug for GSC search-analytics query (verified via
  // dashboard toolkit list at app.composio.dev/toolkits/google_search_console).
  const result = await executeAction<GSCResponse>("GOOGLE_SEARCH_CONSOLE_SEARCH_ANALYTICS_QUERY", args);
  return result.data;
}

// Aggregated GSC metrics for a single URL × period.
export interface UrlGscSnapshot {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  topQueries: Array<{ query: string; clicks: number; impressions: number; position: number }>;
}

export async function gscUrlSnapshot(siteUrl: string, pageUrl: string, daysAgo: 30 | 60 | 90): Promise<UrlGscSnapshot> {
  // Get per-query breakdown filtered to this page.
  const queryResp = await gscSearchAnalytics({
    siteUrl,
    startDaysAgo: daysAgo,
    dimensions: ["query"],
    pageUrl,
    rowLimit: 25,
  });

  const rows = queryResp.rows ?? [];
  const clicks = rows.reduce((s, r) => s + (r.clicks || 0), 0);
  const impressions = rows.reduce((s, r) => s + (r.impressions || 0), 0);
  // Clicks-weighted average position; falls back to simple avg if no clicks.
  const avgPosition = clicks > 0
    ? rows.reduce((s, r) => s + (r.position || 0) * (r.clicks || 0), 0) / clicks
    : rows.length > 0
      ? rows.reduce((s, r) => s + (r.position || 0), 0) / rows.length
      : 0;

  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: avgPosition,
    topQueries: rows.slice(0, 10).map((r) => ({
      query: r.keys[0] ?? "",
      clicks: r.clicks,
      impressions: r.impressions,
      position: r.position,
    })),
  };
}

// ============ URL helpers ============

// GSC expects a full URL; GA4 expects a pagePath.
export function urlToPagePath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + (u.search ?? "");
  } catch {
    return url;
  }
}
