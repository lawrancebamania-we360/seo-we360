import { getGoogleAccessToken, isGoogleServiceAccountConfigured } from "./auth";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

// Google's URL Inspection API returns the same data as "Inspect URL" in the
// GSC UI. It's rate-limited: 2,000 requests/day per property, 600/minute burst.
// We batch at ~3 req/sec (1 every 350ms) to stay well under the burst cap.

export interface IndexInspectResult {
  url: string;
  verdict: string | null;                  // PASS | PARTIAL | FAIL | NEUTRAL
  coverage_state: string | null;           // "Submitted and indexed" etc.
  robots_txt_state: string | null;
  indexing_state: string | null;
  page_fetch_state: string | null;
  google_canonical: string | null;
  user_canonical: string | null;
  last_crawl_time: string | null;          // ISO
  mobile_usability_verdict: string | null;
  rich_results_verdict: string | null;
  error?: string;
}

interface InspectResponse {
  inspectionResult?: {
    indexStatusResult?: {
      verdict?: string;
      coverageState?: string;
      robotsTxtState?: string;
      indexingState?: string;
      pageFetchState?: string;
      googleCanonical?: string;
      userCanonical?: string;
      lastCrawlTime?: string;
    };
    mobileUsabilityResult?: { verdict?: string };
    richResultsResult?: { verdict?: string };
  };
}

export async function inspectUrl(
  siteUrl: string,
  url: string,
  languageCode = "en-US"
): Promise<IndexInspectResult> {
  const token = await getGoogleAccessToken(SCOPE);
  const res = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ inspectionUrl: url, siteUrl, languageCode }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    const body = await res.text();
    return {
      url,
      verdict: null,
      coverage_state: null,
      robots_txt_state: null,
      indexing_state: null,
      page_fetch_state: null,
      google_canonical: null,
      user_canonical: null,
      last_crawl_time: null,
      mobile_usability_verdict: null,
      rich_results_verdict: null,
      error: `HTTP ${res.status}: ${body.slice(0, 200)}`,
    };
  }
  const data = (await res.json()) as InspectResponse;
  const idx = data.inspectionResult?.indexStatusResult ?? {};
  const mob = data.inspectionResult?.mobileUsabilityResult ?? {};
  const rich = data.inspectionResult?.richResultsResult ?? {};
  return {
    url,
    verdict: idx.verdict ?? null,
    coverage_state: idx.coverageState ?? null,
    robots_txt_state: idx.robotsTxtState ?? null,
    indexing_state: idx.indexingState ?? null,
    page_fetch_state: idx.pageFetchState ?? null,
    google_canonical: idx.googleCanonical ?? null,
    user_canonical: idx.userCanonical ?? null,
    last_crawl_time: idx.lastCrawlTime ?? null,
    mobile_usability_verdict: mob.verdict ?? null,
    rich_results_verdict: rich.verdict ?? null,
  };
}

export async function inspectUrls(
  siteUrl: string,
  urls: string[],
  options: { concurrency?: number; throttleMs?: number; maxUrls?: number } = {}
): Promise<IndexInspectResult[]> {
  if (!(await isGoogleServiceAccountConfigured())) {
    throw new Error("Google service-account JSON not configured");
  }
  const { concurrency = 2, throttleMs = 350, maxUrls = 500 } = options;
  const capped = urls.slice(0, maxUrls);
  const results: IndexInspectResult[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < capped.length) {
      const i = cursor++;
      const url = capped[i];
      try {
        const r = await inspectUrl(siteUrl, url);
        results.push(r);
      } catch (e) {
        results.push({
          url,
          verdict: null, coverage_state: null, robots_txt_state: null, indexing_state: null,
          page_fetch_state: null, google_canonical: null, user_canonical: null,
          last_crawl_time: null, mobile_usability_verdict: null, rich_results_verdict: null,
          error: e instanceof Error ? e.message : "unknown",
        });
      }
      // Throttle between requests within the same worker
      if (cursor < capped.length) await new Promise((r) => setTimeout(r, throttleMs));
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

// Convenience summary used by the indexation dashboard card.
export function summarizeIndexation(results: IndexInspectResult[]) {
  const total = results.length;
  let pass = 0, partial = 0, fail = 0, neutral = 0, errored = 0;
  const byState = new Map<string, number>();
  for (const r of results) {
    if (r.error) { errored++; continue; }
    if (r.verdict === "PASS") pass++;
    else if (r.verdict === "PARTIAL") partial++;
    else if (r.verdict === "FAIL") fail++;
    else neutral++;
    const state = r.coverage_state ?? "Unknown";
    byState.set(state, (byState.get(state) ?? 0) + 1);
  }
  return {
    total,
    pass,
    partial,
    fail,
    neutral,
    errored,
    indexedPct: total === 0 ? 0 : Math.round((pass / total) * 100),
    byCoverageState: [...byState.entries()]
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count),
  };
}
