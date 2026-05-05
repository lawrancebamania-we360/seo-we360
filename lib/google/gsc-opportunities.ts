import { getGoogleAccessToken, isGoogleServiceAccountConfigured } from "./auth";
import { isBrandQuery } from "./brand-regex";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export interface OpportunityRow {
  query: string;
  page: string | null;
  clicks: number;
  impressions: number;
  position: number;
  ctr: number;
}

export interface OpportunityPools {
  strikingDistance: OpportunityRow[];   // pos 11-20, ≥ 100 impressions, non-brand
  zeroClick: OpportunityRow[];          // clicks ≤ 1, ≥ 200 impressions, non-brand
  alternativeVs: OpportunityRow[];      // non-brand queries containing alternative|vs|compare
  totals: {
    totalQueries: number;
    brandQueries: number;
    nonBrandQueries: number;
    nonBrandClicks: number;
    nonBrandImpressions: number;
  };
}

interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  position: number;
  ctr: number;
}

function dateOffset(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

// Pulls all queries for a window, paginating until GSC stops returning rows.
// 25,000 is GSC's per-request cap; the while-loop handles sites that exceed it.
async function pullAllQueries(
  siteUrl: string,
  startDate: string,
  endDate: string
): Promise<GscRow[]> {
  const token = await getGoogleAccessToken(SCOPE);
  const all: GscRow[] = [];
  let startRow = 0;
  const rowLimit = 25000;
  while (true) {
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: ["query", "page"],
          rowLimit,
          startRow,
        }),
        signal: AbortSignal.timeout(20000),
      }
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GSC query failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as { rows?: GscRow[] };
    const rows = data.rows ?? [];
    all.push(...rows);
    if (rows.length < rowLimit) break;
    startRow += rowLimit;
    if (startRow >= 100_000) break; // safety cap — 100K rows is plenty for any tenant
  }
  return all;
}

const ALT_VS_PATTERN = /\b(alternative|alternatives|vs\.?|versus|compare|comparison|competitor|competitors)\b/i;

/**
 * Pull GSC opportunity pools that drive the 100K plan's Month 1–2 actions.
 *
 * Tuneable via options.
 *   - windowDays: lookback (default 90 per plan)
 *   - minStrikingImpr: 100 per plan §2.5
 *   - minZeroClickImpr: 200 per plan §2.5
 *   - strikingPosMin/Max: 11-20 inclusive per plan
 */
export async function getOpportunityPools(
  siteUrl: string | null,
  options: {
    windowDays?: number;
    minStrikingImpr?: number;
    minZeroClickImpr?: number;
    strikingPosMin?: number;
    strikingPosMax?: number;
  } = {}
): Promise<{ connected: boolean; reason?: string; pools: OpportunityPools | null }> {
  if (!siteUrl) return { connected: false, reason: "No GSC property URL on this project.", pools: null };
  if (!(await isGoogleServiceAccountConfigured())) {
    return { connected: false, reason: "Google service-account JSON not configured.", pools: null };
  }
  const windowDays = options.windowDays ?? 90;
  const minStrikingImpr = options.minStrikingImpr ?? 100;
  const minZeroClickImpr = options.minZeroClickImpr ?? 200;
  const posMin = options.strikingPosMin ?? 11;
  const posMax = options.strikingPosMax ?? 20;

  try {
    const rows = await pullAllQueries(siteUrl, dateOffset(windowDays + 3), dateOffset(3));

    // Collapse multiple (query, page) rows per query → keep the single best-
    // performing page per query. Striking-distance reporting is per-query, but
    // we surface the landing page so writers know which URL to rewrite.
    type Agg = OpportunityRow & { isBrand: boolean };
    const byQuery = new Map<string, Agg>();
    for (const r of rows) {
      const query = r.keys[0]?.toLowerCase().trim();
      const page = r.keys[1] ?? null;
      if (!query) continue;
      const prev = byQuery.get(query);
      // Sum clicks + impressions across pages for the same query; pick the
      // best-performing page (most clicks) as the "canonical" landing page.
      if (!prev) {
        byQuery.set(query, {
          query,
          page,
          clicks: r.clicks,
          impressions: r.impressions,
          position: r.position,
          ctr: r.ctr,
          isBrand: isBrandQuery(query),
        });
      } else {
        prev.clicks += r.clicks;
        prev.impressions += r.impressions;
        // Weight position by impressions so the avg isn't skewed by low-traffic pages
        prev.position =
          (prev.position * (prev.impressions - r.impressions) + r.position * r.impressions) /
          (prev.impressions || 1);
        if (r.clicks > (prev.page === page ? 0 : -1)) prev.page = page;
      }
    }

    const all = [...byQuery.values()];

    // Overall totals (for the Non-brand summary card)
    let brandCount = 0, nbCount = 0, nbClicks = 0, nbImpressions = 0;
    for (const q of all) {
      if (q.isBrand) brandCount++;
      else {
        nbCount++;
        nbClicks += q.clicks;
        nbImpressions += q.impressions;
      }
    }

    // Pools
    const strikingDistance = all
      .filter((q) => !q.isBrand && q.impressions >= minStrikingImpr && q.position >= posMin && q.position <= posMax)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 500)
      .map((q) => ({ query: q.query, page: q.page, clicks: q.clicks, impressions: q.impressions, position: Number(q.position.toFixed(1)), ctr: Number((q.ctr * 100).toFixed(2)) }));

    const zeroClick = all
      .filter((q) => !q.isBrand && q.clicks <= 1 && q.impressions >= minZeroClickImpr)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 1000)
      .map((q) => ({ query: q.query, page: q.page, clicks: q.clicks, impressions: q.impressions, position: Number(q.position.toFixed(1)), ctr: Number((q.ctr * 100).toFixed(2)) }));

    const alternativeVs = all
      .filter((q) => !q.isBrand && ALT_VS_PATTERN.test(q.query) && q.impressions >= 20)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 200)
      .map((q) => ({ query: q.query, page: q.page, clicks: q.clicks, impressions: q.impressions, position: Number(q.position.toFixed(1)), ctr: Number((q.ctr * 100).toFixed(2)) }));

    return {
      connected: true,
      pools: {
        strikingDistance,
        zeroClick,
        alternativeVs,
        totals: {
          totalQueries: all.length,
          brandQueries: brandCount,
          nonBrandQueries: nbCount,
          nonBrandClicks: nbClicks,
          nonBrandImpressions: nbImpressions,
        },
      },
    };
  } catch (e) {
    return { connected: false, reason: e instanceof Error ? e.message : "GSC request failed", pools: null };
  }
}
