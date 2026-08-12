// Typed wrapper around santhej/website-traffic-intel — the richest-data actor
// picked for competitor keyword rankings (see the Competitors-screen pricing
// discussion: $0.10/domain overview [$0.16 from 2026-08-23], $0.05/keyword-gap
// comparison, $0.001 start fee — no subscription).
//
// OUTPUT SCHEMA verified 2026-08-12 via `npx tsx scripts/debug-santhej-actor.ts`
// against a real token. Two things the documented input schema didn't reveal:
//   1. Every dataset item is snake_case (estimated_monthly_organic_traffic,
//      organic_keyword_count, search_volume, ...), not camelCase.
//   2. Each run's dataset includes a trailing `run_summary` record alongside
//      the real data record(s) — must filter on `record_type`, not just map
//      every item. `keyword_gap` mode in particular returns ONE record per
//      target/competitor pair with the actual keyword rows NESTED under
//      `shared_keywords`, not one record per keyword.

const APIFY_BASE = "https://api.apify.com/v2/acts";
const DEFAULT_TIMEOUT_MS = 55_000;

function actorUrl(actorId: string, token: string): string {
  const slug = actorId.replace("/", "~");
  return `${APIFY_BASE}/${slug}/run-sync-get-dataset-items?token=${token}`;
}

async function runActor<Input extends object, Output>(
  actorId: string,
  token: string,
  input: Input,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Output[] | null> {
  try {
    const res = await fetch(actorUrl(actorId, token), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[apify] ${actorId} failed: HTTP ${res.status} · ${body.slice(0, 300)}`);
      return null;
    }
    return (await res.json()) as Output[];
  } catch (e) {
    console.error(`[apify] ${actorId} threw: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

const ACTOR_ID = "santhej/website-traffic-intel";

// DataForSEO-style numeric market codes (the actor's `locationCode` field) for
// the countries this app actually serves. Falls back to India — this app's
// default market (see phase-9-intelligence.ts: `project.country ?? "in"`).
const LOCATION_CODES: Record<string, string> = {
  in: "2356",
  us: "2840",
  gb: "2826",
  au: "2036",
  ca: "2124",
  ae: "2784",
};
function locationCodeFor(countryIso2: string | null | undefined): string {
  return LOCATION_CODES[(countryIso2 ?? "in").toLowerCase()] ?? LOCATION_CODES.in;
}

function cleanDomain(d: string): string {
  return d.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/^www\./, "");
}

// Pricing changes 2026-08-23 (per the actor's store listing) — keep cost
// tracking accurate across the change without a code deploy on that date.
const OVERVIEW_PRICE_HIKE_AT = new Date("2026-08-23T00:00:00Z").getTime();
function overviewPricePerDomain(): number {
  return Date.now() >= OVERVIEW_PRICE_HIKE_AT ? 0.16 : 0.10;
}
const GAP_PRICE_PER_COMPARISON = 0.05;
const START_FEE = 0.001;

// ==========================================================================
// "overview" mode — batched: pass every competitor domain in one run, billed
// per domain regardless of batching.
// ==========================================================================
interface OverviewActorItem {
  record_type?: string;
  domain?: string;
  estimated_monthly_organic_traffic?: number;
  organic_keyword_count?: number;
  top_keywords?: Array<{
    keyword?: string;
    position?: number;
    search_volume?: number;
    cpc?: number;
  }>;
}

export interface CompetitorDomainOverview {
  domain: string;
  estimated_traffic: number | null;
  keywords_ranked: number | null;
  top_keywords: Array<{ keyword: string; position: number | null; volume: number | null; cpc: number | null }>;
}

export async function runCompetitorDomainOverview(args: {
  token: string;
  domains: string[];
  country?: string;
  maxKeywords?: number;
  timeoutMs?: number;
}): Promise<{ results: CompetitorDomainOverview[]; cost_estimate_usd: number }> {
  const domains = args.domains.map(cleanDomain).filter(Boolean);
  if (domains.length === 0) return { results: [], cost_estimate_usd: 0 };

  const items = await runActor<object, OverviewActorItem>(ACTOR_ID, args.token, {
    mode: "overview",
    domains,
    locationCode: locationCodeFor(args.country),
    languageCode: "en",
    maxKeywords: args.maxKeywords ?? 30,
    maxCompetitors: 1,
  }, args.timeoutMs);
  if (!items) return { results: [], cost_estimate_usd: 0 };

  const results: CompetitorDomainOverview[] = items
    .filter((it) => it.record_type == null || it.record_type === "domain_overview")
    .map((it) => {
      const rawKeywords = it.top_keywords ?? [];
      return {
        domain: cleanDomain(it.domain ?? ""),
        estimated_traffic: it.estimated_monthly_organic_traffic ?? null,
        keywords_ranked: it.organic_keyword_count ?? null,
        top_keywords: rawKeywords
          .map((k) => ({
            keyword: k.keyword ?? "",
            position: k.position ?? null,
            volume: k.search_volume ?? null,
            cpc: k.cpc ?? null,
          }))
          .filter((k) => k.keyword.length > 0),
      };
    }).filter((r) => r.domain.length > 0);

  const cost = domains.length * overviewPricePerDomain() + START_FEE;
  return { results, cost_estimate_usd: Number(cost.toFixed(4)) };
}

// ==========================================================================
// "keyword_gap" mode — one target-vs-competitor pair per call.
// ==========================================================================
interface GapKeywordRow {
  keyword?: string;
  search_volume?: number;
  cpc?: number;
  target_position?: number | null;
  competitor_position?: number | null;
}

interface GapActorItem {
  record_type?: string;
  shared_keywords?: GapKeywordRow[];
}

export interface CompetitorKeywordGapRow {
  keyword: string;
  our_position: number | null;
  competitor_position: number | null;
  volume: number | null;
  cpc: number | null;
}

// A tiny local intent heuristic — mirrors phase-6-apify.ts's `intentFor` but
// collapsed to the 2 buckets the Keyword-gap panel actually renders.
function intentFor(keyword: string): "Commercial" | "Informational" {
  return /\bbuy|cost|price|cheap|best|top|vs|compare|alternative|software|tool\b/i.test(keyword)
    ? "Commercial"
    : "Informational";
}

function priorityFor(volume: number | null): "High" | "Medium" | "Low" {
  if (volume == null) return "Low";
  if (volume >= 2000) return "High";
  if (volume >= 500) return "Medium";
  return "Low";
}

export async function runCompetitorKeywordGap(args: {
  token: string;
  projectDomain: string;
  competitorDomain: string;
  country?: string;
  maxGapKeywords?: number;
  timeoutMs?: number;
}): Promise<{ results: Array<CompetitorKeywordGapRow & { priority: "High" | "Medium" | "Low"; intent: string }>; cost_estimate_usd: number }> {
  const target = cleanDomain(args.projectDomain);
  const competitor = cleanDomain(args.competitorDomain);
  if (!target || !competitor) return { results: [], cost_estimate_usd: 0 };

  const items = await runActor<object, GapActorItem>(ACTOR_ID, args.token, {
    mode: "keyword_gap",
    target,
    competitor,
    locationCode: locationCodeFor(args.country),
    languageCode: "en",
    maxGapKeywords: args.maxGapKeywords ?? 30,
  }, args.timeoutMs);
  if (!items) return { results: [], cost_estimate_usd: 0 };

  const rows: CompetitorKeywordGapRow[] = items
    .filter((it) => it.record_type == null || it.record_type === "keyword_gap")
    .flatMap((it) => it.shared_keywords ?? [])
    .map((k) => ({
      keyword: k.keyword ?? "",
      our_position: k.target_position ?? null,
      competitor_position: k.competitor_position ?? null,
      volume: k.search_volume ?? null,
      cpc: k.cpc ?? null,
    }))
    .filter((r) => r.keyword.length > 0 && r.competitor_position != null);

  // Keep genuine GAPS only — the actor's mode returns the full overlap set
  // (keywords both sides rank for), but the panel promises "terms rivals rank
  // for where you're weak or absent". A 2-position buffer avoids flagging
  // near-ties as gaps.
  const gaps = rows.filter((r) => r.our_position == null || r.our_position > (r.competitor_position ?? 0) + 2);
  gaps.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));

  const cost = GAP_PRICE_PER_COMPARISON + START_FEE;
  return {
    results: gaps.map((r) => ({ ...r, priority: priorityFor(r.volume), intent: intentFor(r.keyword) })),
    cost_estimate_usd: Number(cost.toFixed(4)),
  };
}
