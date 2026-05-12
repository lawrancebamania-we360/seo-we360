// Shared SERP helper — runs apify/google-search-scraper for a single keyword
// and returns top organic, PAA, related searches, featured snippet ownership,
// AI Overview status, and our own ranking.
//
// Used by:
//   - createTaskFromAuditFinding (sync, on audit → sprint)
//   - scripts/composio/backfill-serp.ts (one-shot backfill)
//   - scripts/composio/weekly-content-gap.ts (Sunday cron — only the
//     content-gap actor lives in that script; SERP is the cheap warm-up)
//
// Cost: ~$0.005 per call on Apify free plan. Always wrap in try/catch so a
// transient Apify outage never blocks task creation.

const PROJECT_DOMAIN = "we360.ai";

export interface SerpResult {
  ourPosition: number | null;
  ownsFeaturedSnippet: boolean;
  topOrganicUrls: string[];
  paaQuestions: string[];
  relatedSearches: string[];
  aiOverviewPresent: boolean;
  projectCitedInAi: boolean;
}

export async function callSerp(kw: string, retries = 1): Promise<SerpResult | null> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    // Hard-fail loudly in development so we don't silently skip enrichment.
    // Server actions catch this and degrade gracefully — the task still
    // gets created, just without SERP data.
    throw new Error("APIFY_TOKEN missing — cannot run SERP enrichment");
  }

  const slug = "apify~google-search-scraper";
  const url = `https://api.apify.com/v2/acts/${slug}/run-sync-get-dataset-items?token=${token}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          queries: kw,
          countryCode: "in",
          mobileResults: false,
          resultsPerPage: 10,
          maxPagesPerQuery: 1,
        }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (attempt < retries) {
          await sleep(5000);
          continue;
        }
        throw new Error(`SERP HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      const items = await res.json() as Array<{
        organicResults?: Array<{ url?: string; position?: number }>;
        peopleAlsoAsk?: Array<{ question: string }>;
        relatedQueries?: Array<{ title: string }>;
        featuredSnippet?: { url?: string } | null;
        aiOverview?: { content?: string; sources?: Array<{ url?: string }> } | null;
      }>;
      const item = items[0];
      if (!item) return null;

      const allUrls = (item.organicResults ?? []).map((r) => r.url).filter(Boolean) as string[];
      const ours = (item.organicResults ?? []).find((r) => {
        try { return r.url ? new URL(r.url).hostname.replace(/^www\./, "").endsWith(PROJECT_DOMAIN) : false; }
        catch { return false; }
      });
      const ownsFs = !!(item.featuredSnippet?.url && (() => {
        try { return new URL(item.featuredSnippet!.url!).hostname.replace(/^www\./, "").endsWith(PROJECT_DOMAIN); }
        catch { return false; }
      })());
      const aoSources = item.aiOverview?.sources ?? [];
      const projectCited = aoSources.some((s) => {
        try { return s.url ? new URL(s.url).hostname.replace(/^www\./, "").endsWith(PROJECT_DOMAIN) : false; }
        catch { return false; }
      });

      return {
        ourPosition: ours?.position ?? null,
        ownsFeaturedSnippet: ownsFs,
        topOrganicUrls: trimToTopN(allUrls, 5),
        paaQuestions: (item.peopleAlsoAsk ?? []).map((q) => q.question).slice(0, 8),
        relatedSearches: (item.relatedQueries ?? []).map((r) => r.title).slice(0, 8),
        aiOverviewPresent: !!(item.aiOverview && (item.aiOverview.content || aoSources.length > 0)),
        projectCitedInAi: projectCited,
      };
    } catch (e) {
      if (attempt < retries) { await sleep(5000); continue; }
      throw e;
    }
  }
  return null;
}

// Filter out our own domain + obvious aggregators (Reddit, Quora, YouTube,
// Wikipedia, Amazon, LinkedIn) — those aren't useful as competitor refs
// for an outline.
function trimToTopN(urls: string[], n: number): string[] {
  return urls.filter((u) => {
    try {
      const host = new URL(u).hostname.replace(/^www\./, "");
      if (host.endsWith(PROJECT_DOMAIN)) return false;
      if (/(reddit|quora|youtube|wikipedia|amazon|linkedin)\.com$/i.test(host)) return false;
      return true;
    } catch { return false; }
  }).slice(0, n);
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// ============= Brief / data_backing merge helpers =============

export interface BriefSeed {
  target_keyword?: string;
  intent?: string;
  word_count_target?: number;
  recommended_h1?: string;
  recommended_h2s?: string[];
  recommended_h3s?: string[];
  sections_breakdown?: string[];
  paa_questions?: string[];
  internal_links?: string[];
  competitor_refs?: string[];
  writer_notes?: string[];
  secondary_keywords?: string[];
  generated_by?: string;
  enriched_at?: string;        // ISO timestamp — sentinel for "this task has been SERP-enriched"
}

// Merge a SerpResult into an existing (or empty) brief. Idempotent: re-runs
// dedupe and don't double-count. Sets `enriched_at` so a backfill cron
// knows to skip tasks that already have SERP data.
export function mergeSerpIntoBrief(existing: BriefSeed | null, kw: string, serp: SerpResult): BriefSeed {
  const e = existing ?? {};
  return {
    ...e,
    target_keyword: e.target_keyword || kw,
    intent: e.intent || "informational",
    word_count_target: e.word_count_target || 1500,
    recommended_h1: e.recommended_h1 || "",
    sections_breakdown: e.sections_breakdown ?? [],
    internal_links: e.internal_links ?? [],
    recommended_h2s: e.recommended_h2s ?? [],
    recommended_h3s: e.recommended_h3s ?? [],
    paa_questions: dedupe([...(e.paa_questions ?? []), ...serp.paaQuestions]).slice(0, 8),
    competitor_refs: dedupe([...(e.competitor_refs ?? []), ...serp.topOrganicUrls]).slice(0, 8),
    secondary_keywords: dedupe([...(e.secondary_keywords ?? []), ...serp.relatedSearches]).slice(0, 12),
    writer_notes: dedupe([
      ...(e.writer_notes ?? []),
      ...(serp.ownsFeaturedSnippet
        ? ["✅ We currently own the featured snippet — defend it."]
        : (serp.paaQuestions.length > 0
            ? ["PAA box exists — answer at least one PAA Q in <60 words near top to win the snippet."]
            : [])),
      ...(serp.aiOverviewPresent
        ? [`AI Overview appears for this query${serp.projectCitedInAi ? " AND we are cited (defend the citation)." : " but we are NOT cited (target an answer-capsule + FAQ schema to win citation)."}`]
        : []),
    ]),
    generated_by: "apify-enrich-light",
    enriched_at: new Date().toISOString(),
  };
}

// Build the human-readable enrichment summary that gets appended to
// data_backing (below the GSC backing line). The block is bounded by
// "\n\n---\n**Apify enrichment …**" so re-runs can strip and replace.
export function formatSerpEnrichmentSummary(serp: SerpResult): string {
  const date = new Date().toISOString().slice(0, 10);
  const lines = [
    `\n\n---\n**Apify enrichment (${date})**`,
    `SERP: ${serp.topOrganicUrls.length} top-organic competitors, ${serp.paaQuestions.length} PAA Qs, ${serp.relatedSearches.length} related searches. ${serp.ourPosition != null ? `We rank position ${serp.ourPosition} today (live SERP).` : "We don't appear in the top 10 today."}`,
    serp.aiOverviewPresent
      ? `AI Overview: PRESENT${serp.projectCitedInAi ? " — we are cited." : " — we are NOT cited."}`
      : `AI Overview: not triggered for this query.`,
    serp.ownsFeaturedSnippet
      ? `Featured snippet: WE OWN IT.`
      : (serp.paaQuestions.length > 0 ? `Featured snippet: none, but PAA exists.` : `Featured snippet: none.`),
  ];
  return lines.join("\n");
}

// Strip any prior `--- **Apify enrichment …**` block so re-runs replace
// instead of stacking duplicate summaries.
export function stripPriorEnrichment(s: string): string {
  const idx = s.indexOf("\n\n---\n**Apify enrichment");
  return idx >= 0 ? s.slice(0, idx) : s;
}

function dedupe(arr: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
    let s: string;
    if (typeof raw === "string") s = raw;
    else if (raw && typeof raw === "object") {
      const o = raw as Record<string, unknown>;
      s = String(o.question ?? o.url ?? o.title ?? o.text ?? o.value ?? JSON.stringify(o));
    } else if (raw == null) continue;
    else s = String(raw);
    const trimmed = s.trim();
    const k = trimmed.toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(trimmed);
  }
  return out;
}
