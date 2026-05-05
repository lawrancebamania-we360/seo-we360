// Typed wrappers around the 5 Apify actors that power the intelligence layer.
// Each wrapper returns structured data ready for insertion into the corresponding
// Supabase table. All calls fail gracefully when APIFY_TOKEN is missing or the
// actor times out — the caller is expected to check the `skipped` / `error` field.

const APIFY_BASE = "https://api.apify.com/v2/acts";
// apify/google-search-scraper takes ~7s per query and doesn't internally
// parallelise much, so a 20-query batch needs ~60s. We bumped from 18s →
// 55s to stop SERP + AI Overview from timing out before the dataset returns.
// Fast actors (DA, backlinks) still finish well inside this budget.
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

// ==========================================================================
// 1. SERP Rank + Features  — apify/google-search-scraper
// ==========================================================================
interface SerpActorOrganicResult {
  title: string;
  url: string;
  position: number;
  description?: string;
}
interface SerpActorItem {
  searchQuery?: { term?: string };
  organicResults?: SerpActorOrganicResult[];
  peopleAlsoAsk?: Array<{ question: string; answer?: string }>;
  relatedQueries?: Array<{ title: string; url?: string }>;
  featuredSnippet?: { title?: string; url?: string; description?: string } | null;
  resultsTotal?: number;
  aiOverview?: { content?: string; sources?: Array<{ title?: string; url?: string; snippet?: string }> } | null;
}

export interface SerpRankingResult {
  keyword: string;
  position: number | null;
  url: string | null;
  owns_featured_snippet: boolean;
  owns_paa: boolean;
  paa_questions: string[];
  related_searches: string[];
  total_results: number | null;
}

// AI Overview detection is folded in: apify/google-search-scraper already
// returns `aiOverview` on each SERP item, so we extract it here and emit one
// AiOverviewResult per query in the same call. This replaces the separate
// clearpath/google-ai-overview actor (which cost $0.24/run and returned 0
// rows for our B2B queries anyway).
export interface AiOverviewResult {
  keyword: string;
  ai_overview_appeared: boolean;
  project_cited: boolean;
  cited_url: string | null;
  ai_overview_text: string | null;
  cited_sources: Array<{ title: string; url: string; snippet: string }>;
}

export async function runSerpRankTracker(args: {
  token: string;
  keywords: string[];
  projectDomain: string;
  country?: string;
  device?: "desktop" | "mobile";
}): Promise<{
  results: SerpRankingResult[];
  ai_overview_results: AiOverviewResult[];
  cost_estimate_usd: number;
}> {
  const actorId = "apify/google-search-scraper";
  const queries = args.keywords.map((k) => k.trim()).filter(Boolean);
  if (queries.length === 0) return { results: [], ai_overview_results: [], cost_estimate_usd: 0 };

  const items = await runActor<object, SerpActorItem>(actorId, args.token, {
    queries: queries.join("\n"),
    // Actor requires lowercase 2-letter ISO code. `project.country` is stored
    // uppercase ("IN") so normalize here.
    countryCode: (args.country ?? "in").toLowerCase(),
    mobileResults: (args.device ?? "desktop") === "mobile",
    resultsPerPage: 20,
    maxPagesPerQuery: 1,
  });

  if (!items) return { results: [], ai_overview_results: [], cost_estimate_usd: 0 };

  const domainBase = args.projectDomain.replace(/^www\./, "");
  const hostOwnedByProject = (u: string | undefined | null): boolean => {
    if (!u) return false;
    try { return new URL(u).hostname.replace(/^www\./, "").endsWith(domainBase); }
    catch { return false; }
  };

  const results: SerpRankingResult[] = [];
  const ai_overview_results: AiOverviewResult[] = [];

  for (const item of items) {
    const keyword = item.searchQuery?.term ?? "";
    if (!keyword) continue;

    // ---- SERP ranking ----
    const organicHit = item.organicResults?.find((r) => hostOwnedByProject(r.url));
    results.push({
      keyword,
      position: organicHit?.position ?? null,
      url: organicHit?.url ?? null,
      owns_featured_snippet: hostOwnedByProject(item.featuredSnippet?.url),
      owns_paa: !!item.peopleAlsoAsk?.length,
      paa_questions: (item.peopleAlsoAsk ?? []).map((q) => q.question).slice(0, 8),
      related_searches: (item.relatedQueries ?? []).map((r) => r.title).slice(0, 8),
      total_results: item.resultsTotal ?? null,
    });

    // ---- AI Overview (folded in from the same SERP response) ----
    const ao = item.aiOverview;
    const aoSources = (ao?.sources ?? []).filter((s): s is { title: string; url: string; snippet: string } =>
      !!s.url && !!s.title
    ).map((s) => ({ title: s.title, url: s.url, snippet: s.snippet ?? "" }));
    const projectCitation = aoSources.find((s) => hostOwnedByProject(s.url));
    ai_overview_results.push({
      keyword,
      ai_overview_appeared: !!(ao && (ao.content || aoSources.length > 0)),
      project_cited: !!projectCitation,
      cited_url: projectCitation?.url ?? null,
      ai_overview_text: ao?.content ?? null,
      cited_sources: aoSources,
    });
  }

  const cost = (queries.length / 1000) * 1.80;
  return { results, ai_overview_results, cost_estimate_usd: Number(cost.toFixed(4)) };
}

// ==========================================================================
// 2. Backlink Profile — pro100chok/ahrefs-seo-tools
// ==========================================================================
interface AhrefsBacklinkItem {
  sourceUrl?: string;
  url_from?: string;
  targetUrl?: string;
  anchor?: string;
  anchorText?: string;
  isDofollow?: boolean;
  dofollow?: boolean;
  firstSeen?: string;
  first_seen?: string;
}

export interface BacklinkProfileResult {
  total_backlinks: number;
  referring_domains: number;
  dofollow_count: number;
  nofollow_count: number;
  top_backlinks: Array<{ source_url: string; anchor: string; dofollow: boolean; first_seen: string | null }>;
  top_anchors: Array<{ anchor: string; count: number }>;
}

export async function runBacklinkProfile(args: {
  token: string;
  projectDomain: string;
  maxResults?: number;
}): Promise<{ result: BacklinkProfileResult | null; cost_estimate_usd: number }> {
  const actorId = "pro100chok/ahrefs-seo-tools";
  const limit = args.maxResults ?? 200;

  // Actor's `mode` enum is {exact, subdomains, prefix, domain} — describes
  // target match scope, not report type. "domain" = all subdomains + exact
  // which is what we want for a backlink audit on a root domain.
  const items = await runActor<object, AhrefsBacklinkItem>(actorId, args.token, {
    mode: "domain",
    target: args.projectDomain,
    limit,
  });

  if (!items || items.length === 0) return { result: null, cost_estimate_usd: 0 };

  const normalized = items.map((it) => ({
    source_url: it.sourceUrl ?? it.url_from ?? "",
    anchor: (it.anchor ?? it.anchorText ?? "").trim(),
    dofollow: it.isDofollow ?? it.dofollow ?? false,
    first_seen: it.firstSeen ?? it.first_seen ?? null,
  })).filter((it) => it.source_url.length > 0);

  const refDomainSet = new Set<string>();
  for (const it of normalized) {
    try { refDomainSet.add(new URL(it.source_url).hostname.replace(/^www\./, "")); } catch { /* ignore */ }
  }
  const anchorCount = new Map<string, number>();
  for (const it of normalized) {
    if (!it.anchor) continue;
    anchorCount.set(it.anchor, (anchorCount.get(it.anchor) ?? 0) + 1);
  }
  const dofollowCount = normalized.filter((it) => it.dofollow).length;

  const result: BacklinkProfileResult = {
    total_backlinks: normalized.length,
    referring_domains: refDomainSet.size,
    dofollow_count: dofollowCount,
    nofollow_count: normalized.length - dofollowCount,
    top_backlinks: normalized.slice(0, 50),
    top_anchors: [...anchorCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([anchor, count]) => ({ anchor, count })),
  };
  const cost = (normalized.length / 1000) * 5;
  return { result, cost_estimate_usd: Number(cost.toFixed(4)) };
}

// ==========================================================================
// 4. Domain Authority — zhorex/domain-authority-checker
// ==========================================================================
interface DomainAuthorityItem {
  domain?: string;
  domainScore?: number;
  httpStatus?: number;
  sslValid?: boolean;
  domainAgeYears?: number;
  hasSitemap?: boolean;
  hasRobots?: boolean;
  technologies?: string[];
}

export interface DomainAuthorityResult {
  domain: string;
  is_project_domain: boolean;
  da_score: number | null;
  http_healthy: boolean;
  ssl_valid: boolean;
  domain_age_days: number | null;
  has_sitemap: boolean;
  has_robots: boolean;
  tech_stack: string[];
}

export async function runDomainAuthority(args: {
  token: string;
  projectDomain: string;
  competitorDomains: string[];
}): Promise<{ results: DomainAuthorityResult[]; cost_estimate_usd: number }> {
  const actorId = "zhorex/domain-authority-checker";
  const allDomains = [args.projectDomain, ...args.competitorDomains].map((d) =>
    d.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/^www\./, "")
  );

  if (allDomains.length === 0) return { results: [], cost_estimate_usd: 0 };

  const items = await runActor<object, DomainAuthorityItem>(actorId, args.token, {
    domains: allDomains,
  });
  if (!items) return { results: [], cost_estimate_usd: 0 };

  const projectDomainClean = args.projectDomain.replace(/^www\./, "");
  const results: DomainAuthorityResult[] = items.map((item) => ({
    domain: item.domain ?? "",
    is_project_domain: (item.domain ?? "").replace(/^www\./, "") === projectDomainClean,
    da_score: item.domainScore ?? null,
    http_healthy: (item.httpStatus ?? 0) >= 200 && (item.httpStatus ?? 0) < 400,
    ssl_valid: item.sslValid ?? false,
    domain_age_days: item.domainAgeYears != null ? Math.round(item.domainAgeYears * 365) : null,
    has_sitemap: item.hasSitemap ?? false,
    has_robots: item.hasRobots ?? false,
    tech_stack: item.technologies ?? [],
  })).filter((r) => r.domain.length > 0);

  const cost = allDomains.length * 0.003;
  return { results, cost_estimate_usd: Number(cost.toFixed(4)) };
}

// ==========================================================================
// 5. Content Gap — apilab/ai-content-gap-agent
// ==========================================================================
//
// IMPORTANT: the actor's actual response schema (verified live 2026-04-27)
// is NOT what its docs initially suggested. Real keys returned per item:
//   { keyword, missingTopics[], angleSuggestions[], contentOutline (markdown
//     string with `## H2` / `### H3` lines), topUrls[], redditTitles[],
//     paaQuestions[] }
// The earlier wrapper expected `suggestedOutline` / `missingSubtopics` /
// `suggestedKeywords` — those keys don't exist, which is why every prior
// caller got empty H2/H3 arrays back. We parse the markdown outline here
// to recover H2 + H3 headings.
interface ContentGapItem {
  keyword?: string;
  missingTopics?: string[];
  angleSuggestions?: string[];
  contentOutline?: string;
  topUrls?: string[];
  redditTitles?: string[];
  paaQuestions?: string[];
}

export interface ContentGapResult {
  keyword: string;
  // Outline derived from contentOutline markdown — flat lists of headings
  suggested_outline: Array<{ h2: string; h3: string[] }>;
  // Topics competitors cover that we should address
  missing_subtopics: string[];
  // Differentiation angles vs current top-rankers
  angle_suggestions: string[];
  // Top SERP URLs the actor saw (use as competitor refs)
  top_urls: string[];
  // Reddit thread titles (research signal, not always populated)
  reddit_titles: string[];
  // People-also-ask questions the actor extracted (supplement SERP scraper PAA)
  paa_questions: string[];
}

function parseOutlineMarkdown(md: string): Array<{ h2: string; h3: string[] }> {
  const groups: Array<{ h2: string; h3: string[] }> = [];
  let current: { h2: string; h3: string[] } | null = null;
  for (const rawLine of md.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("## ")) {
      if (current) groups.push(current);
      current = { h2: line.replace(/^##\s+(\d+\.\s*)?/, "").trim(), h3: [] };
    } else if (line.startsWith("### ") && current) {
      current.h3.push(line.replace(/^###\s+(\d+\.\d+\.?\s*)?/, "").trim());
    }
  }
  if (current) groups.push(current);
  return groups;
}

export async function runContentGap(args: {
  token: string;
  keywords: string[];
  projectDomain: string;
  competitorDomains: string[];
  // Default 90s — content-gap actor regularly takes 30-70s; the standard
  // 55s SERP timeout is too short for it.
  timeoutMs?: number;
}): Promise<{ results: ContentGapResult[]; cost_estimate_usd: number }> {
  const actorId = "apilab/ai-content-gap-agent";
  const queries = args.keywords.map((k) => k.trim()).filter(Boolean).slice(0, 10);
  if (queries.length === 0) return { results: [], cost_estimate_usd: 0 };

  const collected: ContentGapResult[] = [];
  for (const kw of queries) {
    const items = await runActor<object, ContentGapItem>(actorId, args.token, {
      keyword: kw,
      projectDomain: args.projectDomain,
      competitorDomains: args.competitorDomains,
    }, args.timeoutMs ?? 90_000);
    if (!items || items.length === 0) continue;
    const it = items[0];
    collected.push({
      keyword: it.keyword ?? kw,
      suggested_outline: parseOutlineMarkdown(it.contentOutline ?? ""),
      missing_subtopics: it.missingTopics ?? [],
      angle_suggestions: it.angleSuggestions ?? [],
      top_urls: it.topUrls ?? [],
      reddit_titles: it.redditTitles ?? [],
      paa_questions: it.paaQuestions ?? [],
    });
  }

  const cost = queries.length * 0.0162;
  return { results: collected, cost_estimate_usd: Number(cost.toFixed(4)) };
}
