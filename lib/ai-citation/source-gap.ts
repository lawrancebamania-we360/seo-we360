// AI Citation - Build 3: Source-Gap engine.
//
// Ranks the THIRD-PARTY domains AI pulls its answers from (review sites,
// directories, blogs, forums - not the project and not a tracked competitor's own
// site) and flags the ones that cite COMPETITORS but never cite US. Those are the
// off-site outreach targets: places AI already trusts where earning a mention puts
// us in the answer too.
//
// Computed live from ai_citation_sources for the latest run batch (no new storage;
// the persisted layer is only the outreach tracker in ai_citation_outreach). DA /
// authority chips need a backlink source (Moz/Apify) and are deferred to v2 - the
// Apify budget is nearly tapped, so v1 ranks by citation frequency alone.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface SourceGapRow {
  domain: string;
  /** A representative cited page URL for this domain, if the engine returned one. */
  url: string | null;
  /** Total times AI cited this domain across the latest batch. */
  citations: number;
  /** Appears in at least one answer where WE were also cited. */
  citesYou: boolean;
  /** Appears in at least one answer where a COMPETITOR was cited. */
  citesCompetitor: boolean;
  /** citesCompetitor && !citesYou -> an outreach target. */
  isGap: boolean;
  /** Domain Authority (0-100) IF we already have it cached in the domain_authority
   *  table - a free read, no Apify spend. null = not scored yet (the UI offers an
   *  on-demand metered "Get authority scores" fetch). */
  da: number | null;
}

export interface SourceGapReport {
  hasData: boolean;
  /** Outreach targets (gaps), ranked by citation frequency desc. */
  targets: SourceGapRow[];
  /** Every third-party domain AI cited, ranked - context for the targets. */
  allThirdParty: SourceGapRow[];
}

const EMPTY: SourceGapReport = { hasData: false, targets: [], allThirdParty: [] };

export async function getSourceGapReport(
  supabase: SupabaseClient,
  projectId: string,
): Promise<SourceGapReport> {
  // Same anchor as report.ts: the latest run batch for the project.
  const { data: lastRun } = await supabase.from("ai_citation_runs")
    .select("run_batch_id").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const batchId = (lastRun?.run_batch_id as string | undefined) ?? undefined;
  if (!batchId) return EMPTY;

  const { data: runs } = await supabase.from("ai_citation_runs")
    .select("id, project_cited, error").eq("run_batch_id", batchId);
  const runList = (runs ?? []) as Array<{ id: string; project_cited: boolean; error: string | null }>;
  const okRunIds = runList.filter((r) => !r.error).map((r) => r.id);
  if (okRunIds.length === 0) return EMPTY;
  const projectCitedRuns = new Set(runList.filter((r) => !r.error && r.project_cited).map((r) => r.id));

  const [hitsRes, sourcesRes, daRes] = await Promise.all([
    // Runs where a competitor was actually CITED (not just mentioned).
    supabase.from("ai_citation_competitor_hits").select("run_id, cited").in("run_id", okRunIds),
    supabase.from("ai_citation_sources").select("run_id, domain, url, is_project, competitor_id").in("run_id", okRunIds),
    // Cached Domain Authority for any domain we've already scored (free read; the
    // intelligence cron + the on-demand outreach scorer both write here).
    supabase.from("domain_authority").select("domain, da_score, checked_at").eq("project_id", projectId),
  ]);
  const hits = (hitsRes.data ?? []) as Array<{ run_id: string; cited: boolean }>;
  const sources = (sourcesRes.data ?? []) as Array<{ run_id: string; domain: string | null; url: string | null; is_project: boolean; competitor_id: string | null }>;
  const competitorCitedRuns = new Set(hits.filter((h) => h.cited).map((h) => h.run_id));

  // Latest DA per (normalized) domain - the table can hold several snapshots over
  // time. normDomain MUST match the write-side clean() in scoreOutreachDomains (and
  // the row key below) or freshly-scored chips never match their cache row.
  const daByDomain = new Map<string, { score: number | null; at: string }>();
  for (const d of (daRes.data ?? []) as Array<{ domain: string; da_score: number | null; checked_at: string }>) {
    const key = normDomain(d.domain);
    if (!key) continue;
    const cur = daByDomain.get(key);
    if (!cur || d.checked_at > cur.at) daByDomain.set(key, { score: d.da_score, at: d.checked_at });
  }

  // Aggregate the THIRD-PARTY citations (not us, not a competitor's own site) by
  // domain, tracking which runs each appeared in + a representative URL.
  type Agg = { domain: string; url: string | null; citations: number; youRun: boolean; compRun: boolean };
  const byDomain = new Map<string, Agg>();
  for (const s of sources) {
    const domain = normDomain(s.domain || (s.url ? safeHost(s.url) : ""));
    if (!domain) continue;
    if (s.is_project) continue;        // our own site is not an outreach target
    if (s.competitor_id) continue;     // a competitor's OWN site is not a third-party source
    const a = byDomain.get(domain) ?? { domain, url: null, citations: 0, youRun: false, compRun: false };
    a.citations++;
    if (!a.url && s.url) a.url = s.url;
    if (projectCitedRuns.has(s.run_id)) a.youRun = true;
    if (competitorCitedRuns.has(s.run_id)) a.compRun = true;
    byDomain.set(domain, a);
  }

  const rows: SourceGapRow[] = [...byDomain.values()]
    .map((a) => ({
      domain: a.domain,
      url: a.url,
      citations: a.citations,
      citesYou: a.youRun,
      citesCompetitor: a.compRun,
      isGap: a.compRun && !a.youRun,
      da: daByDomain.get(a.domain)?.score ?? null,
    }))
    .sort((x, y) => y.citations - x.citations);

  return {
    hasData: rows.length > 0,
    targets: rows.filter((r) => r.isGap).slice(0, 25),
    allThirdParty: rows.slice(0, 50),
  };
}

function safeHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

// Canonical domain key. MUST stay identical to clean() in scoreOutreachDomains so
// a domain stored by the on-demand scorer reads back under the same key here.
function normDomain(s: string | null | undefined): string {
  return (s || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}
