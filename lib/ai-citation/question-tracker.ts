// AI Citation - per-QUESTION source tracker.
//
// The Sources tab answers "which domains does AI cite for us, overall?" - one
// project-wide ranking over the latest batch. This module answers the narrower,
// more actionable question: for ONE tracked question, which sources are winning
// it, how is that mix moving across check-ins, and did the brand we care about
// get cited?
//
// NOTHING here is measured or stored fresh. A "check-in" is just one run batch
// (each is dated), and every share is derived at read time from the
// ai_citation_runs / ai_citation_sources rows that run already wrote. Nothing
// prunes those rows, so the full history is available immediately - no waiting
// months for a trend to appear.
//
// Two reads, deliberately split by cost:
//   - buildQuestionRows() is PURE and runs inside getAiVisibilityReport() on data
//     it has already fetched for the latest batch, so the question list costs the
//     page ZERO extra queries.
//   - getQuestionHistory() is lazy (server action, on expand) and is bounded to a
//     SINGLE prompt across the last MAX_CHECK_INS batches, so it stays small even
//     on a project with 50 questions and a year of weekly runs.
//
// Brand of interest: NULL = the project's own brand (project_cited on the run
// row); otherwise a tracked competitor (its ai_citation_competitor_hits row).
// Both are already detected per run, so switching a question's watched brand
// re-reads the whole existing history rather than needing a re-run.

import type { SupabaseClient } from "@supabase/supabase-js";

/** How many check-ins the history view goes back. Weekly cadence -> ~3 months. */
export const MAX_CHECK_INS = 12;
/** Distinct domains kept as their own column/series; the rest fold into "Other"
 *  so every check-in's shares sum to exactly 100 with nothing hidden. */
export const MAX_TRACKED_DOMAINS = 8;
/** No check-in in this long = the question is flagged overdue for a re-check.
 *  Runs are weekly, so this is three consecutive misses. */
export const OVERDUE_DAYS = 21;
/** Bucket label for everything outside the top domains. */
export const OTHER_DOMAIN = "Other";

export type QuestionFlag = "double_down" | "declining";

export interface QuestionSourceShare {
  domain: string;
  /** Raw number of citations of this domain across the question's answers. */
  citations: number;
  /** Whole-percent share of this check-in. Shares in a check-in sum to 100. */
  pct: number;
  /** This is the watched brand's OWN site (their content won the citation). */
  isBrandSite: boolean;
}

export interface QuestionCheckIn {
  /** run_batch_id, or a date key for pre-batch rows. Stable per check-in. */
  key: string;
  /** UTC date of the check-in (YYYY-MM-DD). */
  date: string;
  /** Successful answers for this question in this check-in. */
  runs: number;
  shares: QuestionSourceShare[];
  /** Was the watched brand CITED in any answer to this question? */
  cited: boolean;
  /** Was it merely named, without a citation? */
  mentioned: boolean;
  /** Best-effort attribution for the citation: the brand's own domain when AI
   *  cited it directly, else the third-party domain most present in the answers
   *  where the brand was cited. null when not cited, or when the engine returned
   *  no sources to attribute it to. Heuristic - labelled as such in the UI. */
  citedVia: string | null;
}

/** One row of the question LIST view. */
export interface QuestionRow {
  promptId: string;
  text: string;
  persona: string | null;
  topic: string | null;
  /** Display name of the brand this question watches. */
  brandLabel: string;
  /** true = the project's own brand (the default). */
  brandIsProject: boolean;
  /** Watched competitor id, or null for the project's own brand. */
  brandCompetitorId: string | null;
  /** Most-cited source in the latest check-in. */
  topSource: { domain: string; pct: number } | null;
  cited: boolean;
  mentioned: boolean;
  /** Answers behind the latest check-in. 0 = this question was not in that run. */
  runs: number;
  /** ISO timestamp of the latest answer for this question, across all history. */
  lastCheckedAt: string | null;
  daysSinceCheck: number | null;
  overdue: boolean;
}

/** A column of the source x brand matrix: you, or one tracked competitor. */
export interface BrandColumn {
  key: string;
  label: string;
  /** Registrable domain, for the logo + the "this source IS their site" test. */
  domain: string | null;
  isProject: boolean;
}

/** One row of the source x brand matrix - who wins the citations on this domain. */
export interface SourceBrandRow {
  domain: string;
  /** Total citations of this domain across the window. */
  citations: number;
  /** brand key -> citations on this source we could attribute to that brand. */
  byBrand: Record<string, number>;
  /** Citations we could NOT tie to any tracked brand. Deliberately surfaced
   *  rather than hidden: on real data this is usually the largest bucket
   *  (generic listicles that name many operators at once). */
  unattributed: number;
  /** Set when this domain IS a tracked brand's own site. */
  ownedBy: string | null;
  /** A representative cited page, so the row can link out to the real thing. */
  sampleUrl: string | null;
  sampleTitle: string | null;
}

export interface SourceMatrix {
  /** Column order: you first, then competitors that actually appeared. */
  brands: BrandColumn[];
  rows: SourceBrandRow[];
  /** Tracked competitors that never appeared on any source in this window -
   *  worth saying out loud rather than rendering as empty columns. */
  absentCompetitors: string[];
}

export interface QuestionHistory {
  promptId: string;
  text: string;
  brandLabel: string;
  brandIsProject: boolean;
  brandCompetitorId: string | null;
  /** Who wins each cited source (question 2 of the tracker). */
  sourceMatrix: SourceMatrix;
  /** Column order of the history table + series order of the trend, ranked by
   *  total citations across the window. Always includes OTHER_DOMAIN last when
   *  anything folded into it. */
  domains: string[];
  /** Oldest -> newest, so the table and the chart read left-to-right in time. */
  checkIns: QuestionCheckIn[];
  /** domain -> manual "double down" / "declining" judgement. */
  flags: Record<string, QuestionFlag>;
}

// ---------------------------------------------------------------------------
// Shared row shapes. These mirror exactly what report.ts already selects, so the
// list view can be computed from its in-memory data with no extra round trip.
// ---------------------------------------------------------------------------

export interface TrackerRunRow {
  id: string;
  prompt_id: string;
  error: string | null;
  project_mentioned: boolean;
  project_cited: boolean;
  created_at: string;
  run_batch_id?: string | null;
}
export interface TrackerSourceRow {
  run_id: string;
  domain: string | null;
  url: string | null;
  is_project: boolean;
  competitor_id: string | null;
  /** The cited page's title, when the engine returned one. Used for brand
   *  attribution - a page titled "Skyhigh India | Tandem near Delhi" is about
   *  that brand even though it sits on a third-party domain. */
  title?: string | null;
}
export interface TrackerHitRow {
  run_id: string;
  competitor_id: string | null;
  mentioned: boolean;
  cited: boolean;
}

/** Canonical domain key. Kept identical to source-gap.ts's normDomain so a domain
 *  reads back under the same key in both surfaces (and so a stored flag matches). */
export function normDomain(s: string | null | undefined): string {
  return (s || "").trim().toLowerCase()
    .replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
}

function safeHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

function domainOf(s: TrackerSourceRow): string {
  return normDomain(s.domain || (s.url ? safeHost(s.url) : ""));
}

/** Whole percents that sum to exactly 100 (largest-remainder). Avoids the "our
 *  columns add up to 99%" complaint that makes a share table look broken. */
export function toPercents(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= 0) return counts.map(() => 0);
  const raw = counts.map((c) => (c / total) * 100);
  const out = raw.map(Math.floor);
  let remainder = 100 - out.reduce((a, b) => a + b, 0);
  const byFrac = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < byFrac.length && remainder > 0; k++, remainder--) out[byFrac[k].i]++;
  return out;
}

// ---------------------------------------------------------------------------
// The core per-(question, check-in) computation, shared by the list and the
// history so the two can never disagree about a number.
// ---------------------------------------------------------------------------

interface CheckInInput {
  key: string;
  date: string;
  /** Already filtered to ONE prompt in ONE batch, errored runs removed. */
  runs: TrackerRunRow[];
  sourcesByRun: Map<string, TrackerSourceRow[]>;
  hitsByRun: Map<string, TrackerHitRow[]>;
  /** null = watch the project's own brand. */
  watchCompetitorId: string | null;
  /** When set, shares are bucketed into exactly these domains (+ OTHER_DOMAIN),
   *  so a history table keeps stable columns across check-ins. */
  domainWhitelist?: Set<string>;
}

function computeCheckIn(input: CheckInInput): QuestionCheckIn {
  const { runs, sourcesByRun, hitsByRun, watchCompetitorId, domainWhitelist } = input;

  // Was the watched brand named / cited anywhere in this check-in's answers?
  let cited = false;
  let mentioned = false;
  const citedRunIds = new Set<string>();
  for (const r of runs) {
    if (watchCompetitorId === null) {
      if (r.project_cited) { cited = true; citedRunIds.add(r.id); }
      if (r.project_mentioned) mentioned = true;
    } else {
      for (const h of hitsByRun.get(r.id) ?? []) {
        if (h.competitor_id !== watchCompetitorId) continue;
        if (h.cited) { cited = true; citedRunIds.add(r.id); }
        if (h.mentioned) mentioned = true;
      }
    }
  }
  // A citation implies a mention; older rows are not always consistent about it.
  if (cited) mentioned = true;

  // Is this source row the watched brand's OWN site?
  const isBrandSite = (s: TrackerSourceRow) =>
    watchCompetitorId === null ? s.is_project : s.competitor_id === watchCompetitorId;

  // Citation counts by domain across every successful answer to this question.
  const counts = new Map<string, { citations: number; isBrandSite: boolean }>();
  for (const r of runs) {
    for (const s of sourcesByRun.get(r.id) ?? []) {
      const d = domainOf(s);
      if (!d) continue;
      const key = domainWhitelist && !domainWhitelist.has(d) ? OTHER_DOMAIN : d;
      const cur = counts.get(key) ?? { citations: 0, isBrandSite: false };
      cur.citations++;
      if (key !== OTHER_DOMAIN && isBrandSite(s)) cur.isBrandSite = true;
      counts.set(key, cur);
    }
  }

  // Without a whitelist (the list view) fold the long tail in here instead, so a
  // single check-in's shares are still readable and still sum to 100.
  let ranked = [...counts.entries()]
    .map(([domain, v]) => ({ domain, ...v }))
    .sort((a, b) => b.citations - a.citations);
  if (!domainWhitelist && ranked.length > MAX_TRACKED_DOMAINS) {
    const head = ranked.slice(0, MAX_TRACKED_DOMAINS);
    const tail = ranked.slice(MAX_TRACKED_DOMAINS);
    head.push({
      domain: OTHER_DOMAIN,
      citations: tail.reduce((s, t) => s + t.citations, 0),
      isBrandSite: false,
    });
    ranked = head;
  }
  // "Other" always sorts last regardless of size - it is a bucket, not a source.
  ranked.sort((a, b) =>
    (a.domain === OTHER_DOMAIN ? 1 : 0) - (b.domain === OTHER_DOMAIN ? 1 : 0)
    || b.citations - a.citations);

  const pcts = toPercents(ranked.map((r) => r.citations));
  const shares: QuestionSourceShare[] = ranked.map((r, i) => ({
    domain: r.domain, citations: r.citations, pct: pcts[i], isBrandSite: r.isBrandSite,
  }));

  // Attribution: prefer the brand's own site when AI cited it directly, else the
  // third-party domain most present in the answers where the brand was cited.
  let citedVia: string | null = null;
  if (cited) {
    const inCitedRuns = new Map<string, number>();
    let ownSite: string | null = null;
    for (const runId of citedRunIds) {
      for (const s of sourcesByRun.get(runId) ?? []) {
        const d = domainOf(s);
        if (!d) continue;
        if (isBrandSite(s)) { ownSite ??= d; continue; }
        inCitedRuns.set(d, (inCitedRuns.get(d) ?? 0) + 1);
      }
    }
    citedVia = ownSite
      ?? [...inCitedRuns.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      ?? null;
  }

  return { key: input.key, date: input.date, runs: runs.length, shares, cited, mentioned, citedVia };
}

// ---------------------------------------------------------------------------
// Source x brand attribution.
//
// "Which brand won this citation?" is answerable three ways, in descending
// confidence. Measured on real data, the three together cover about a third of
// citations; the rest are generic listicles that name many operators at once and
// have no single winner. Those are reported as `unattributed` rather than
// guessed at or dropped - a source with a big unattributed block is exactly the
// page worth opening yourself.
//
// Deliberately NOT inferred from co-occurrence (brand and source appearing in
// the same answer): one answer citing 5 sources and naming 3 brands would
// manufacture 15 pairings, nearly all of them false.
// ---------------------------------------------------------------------------

/** Attribute one cited page to a tracked brand, or null when we cannot tell. */
export function attributeSource(s: TrackerSourceRow, brands: BrandColumn[]): string | null {
  // 1. EXACT - the run pipeline already flagged this as the project's own site.
  if (s.is_project) return brands.find((b) => b.isProject)?.key ?? null;
  // 2. EXACT - or as a specific competitor's own site.
  if (s.competitor_id) {
    const byId = brands.find((b) => b.key === s.competitor_id);
    if (byId) return byId.key;
  }
  const domain = domainOf(s);
  // 3. EXACT - domain matches a brand's own domain (covers rows written before
  //    competitor_id was populated, and competitors stored name-only).
  const byDomain = brands.find((b) => b.domain && (domain === b.domain || domain.endsWith(`.${b.domain}`)));
  if (byDomain) return byDomain.key;
  // 4. STRONG - the cited page's title or URL names the brand. Requires a name
  //    of 4+ chars so short/generic names cannot match half the web.
  const hay = `${s.title ?? ""} ${s.url ?? ""}`.toLowerCase();
  if (hay.trim()) {
    const byName = brands.find((b) => b.label.length >= 4 && hay.includes(b.label.toLowerCase()));
    if (byName) return byName.key;
  }
  return null;
}

/** Build the "who wins each source" matrix over one question's cited pages. */
export function buildSourceMatrix(sources: TrackerSourceRow[], brands: BrandColumn[]): SourceMatrix {
  const rows = new Map<string, SourceBrandRow>();
  const brandTotals = new Map<string, number>();

  for (const s of sources) {
    const domain = domainOf(s);
    if (!domain) continue;
    const row = rows.get(domain) ?? {
      domain, citations: 0, byBrand: {}, unattributed: 0,
      ownedBy: null, sampleUrl: null, sampleTitle: null,
    };
    row.citations++;
    if (!row.sampleUrl && s.url) { row.sampleUrl = s.url; row.sampleTitle = s.title ?? null; }

    // Does this domain BELONG to a tracked brand (rather than merely mention one)?
    if (!row.ownedBy) {
      const owner = brands.find((b) => b.domain && (domain === b.domain || domain.endsWith(`.${b.domain}`)));
      if (owner) row.ownedBy = owner.key;
      else if (s.is_project) row.ownedBy = brands.find((b) => b.isProject)?.key ?? null;
    }

    const winner = attributeSource(s, brands);
    if (winner) {
      row.byBrand[winner] = (row.byBrand[winner] ?? 0) + 1;
      brandTotals.set(winner, (brandTotals.get(winner) ?? 0) + 1);
    } else {
      row.unattributed++;
    }
    rows.set(domain, row);
  }

  // Only render columns for brands that actually turned up; a tracked
  // competitor that never appears is said in words instead of as a dead column.
  const present = brands.filter((b) => b.isProject || (brandTotals.get(b.key) ?? 0) > 0);
  const absentCompetitors = brands
    .filter((b) => !b.isProject && (brandTotals.get(b.key) ?? 0) === 0)
    .map((b) => b.label);

  return {
    brands: present,
    rows: [...rows.values()].sort((a, b) => b.citations - a.citations),
    absentCompetitors,
  };
}

/** Batch key for a run. Falls back to its date for rows written before
 *  run_batch_id was stamped, so no history is silently dropped. */
function batchKeyOf(r: TrackerRunRow): string {
  return r.run_batch_id || `date:${r.created_at.slice(0, 10)}`;
}

function groupBy<T, K>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = m.get(k);
    if (list) list.push(r); else m.set(k, [r]);
  }
  return m;
}

const daysBetween = (a: number, b: number) => Math.floor((a - b) / 86_400_000);

// ---------------------------------------------------------------------------
// List view - PURE, called from getAiVisibilityReport with data already fetched.
// ---------------------------------------------------------------------------

export interface BuildQuestionRowsInput {
  prompts: Array<{ id: string; text: string; persona: string | null; topic: string | null }>;
  /** Runs of the LATEST batch only (what the report already holds). */
  runs: TrackerRunRow[];
  sources: TrackerSourceRow[];
  hits: TrackerHitRow[];
  /** promptId -> watched competitor id. Missing/null = the project's own brand.
   *  Empty map before the migration is applied, which is the correct default. */
  watch: Map<string, string | null>;
  /** competitor id -> display name, for the brand label. */
  competitorNames: Map<string, string>;
  projectLabel: string;
  /** promptId -> ISO timestamp of its most recent answer across ALL history.
   *  Falls back to this batch's runs when not supplied. */
  lastSeen?: Map<string, string>;
  /** Injected for deterministic tests; defaults to now. */
  nowMs?: number;
}

export function buildQuestionRows(input: BuildQuestionRowsInput): QuestionRow[] {
  const { prompts, runs, sources, hits, watch, competitorNames, projectLabel } = input;
  const nowMs = input.nowMs ?? Date.now();

  const ok = runs.filter((r) => !r.error);
  const sourcesByRun = groupBy(sources, (s) => s.run_id);
  const hitsByRun = groupBy(hits, (h) => h.run_id);
  const runsByPrompt = groupBy(ok, (r) => r.prompt_id);

  return prompts.map((p) => {
    const mine = runsByPrompt.get(p.id) ?? [];
    const watchId = watch.get(p.id) ?? null;
    const brandLabel = watchId ? (competitorNames.get(watchId) ?? "Competitor") : projectLabel;

    // Latest answer for this question: prefer the full-history lookup, else this
    // batch. null when the question has never been run.
    const latestInBatch = mine.reduce<string | null>(
      (acc, r) => (!acc || r.created_at > acc ? r.created_at : acc), null);
    const lastCheckedAt = input.lastSeen?.get(p.id) ?? latestInBatch;
    const daysSinceCheck = lastCheckedAt
      ? Math.max(0, daysBetween(nowMs, Date.parse(lastCheckedAt)))
      : null;

    const checkIn = computeCheckIn({
      key: "latest",
      date: (latestInBatch ?? "").slice(0, 10),
      runs: mine,
      sourcesByRun,
      hitsByRun,
      watchCompetitorId: watchId,
    });
    // "Other" is never the headline source - it is not somewhere you can act.
    const top = checkIn.shares.find((s) => s.domain !== OTHER_DOMAIN) ?? null;

    return {
      promptId: p.id,
      text: p.text,
      persona: p.persona,
      topic: p.topic,
      brandLabel,
      brandIsProject: watchId === null,
      brandCompetitorId: watchId,
      topSource: top ? { domain: top.domain, pct: top.pct } : null,
      cited: checkIn.cited,
      mentioned: checkIn.mentioned,
      runs: checkIn.runs,
      lastCheckedAt,
      daysSinceCheck,
      // Never overdue before the first run - "not started" is a different state.
      overdue: daysSinceCheck !== null && daysSinceCheck > OVERDUE_DAYS,
    };
  });
}

// ---------------------------------------------------------------------------
// History view - lazy, one question, bounded to MAX_CHECK_INS batches.
// ---------------------------------------------------------------------------

/** Full check-in history for ONE question. Reads through the caller's RLS-scoped
 *  client, so it can only ever see projects the viewer has access to. */
export async function getQuestionHistory(
  supabase: SupabaseClient,
  projectId: string,
  promptId: string,
): Promise<QuestionHistory | null> {
  const { data: promptRow } = await supabase
    .from("ai_citation_prompts")
    .select("id, text, project_id")
    .eq("id", promptId).eq("project_id", projectId).maybeSingle();
  if (!promptRow) return null;
  const prompt = promptRow as { id: string; text: string };

  // Watched brand. Best-effort: the column does not exist before the migration,
  // in which case every question correctly falls back to the project's brand.
  let watchId: string | null = null;
  const { data: watchRow } = await supabase
    .from("ai_citation_prompts")
    .select("brand_of_interest_competitor_id")
    .eq("id", promptId).maybeSingle();
  if (watchRow) watchId = (watchRow as { brand_of_interest_competitor_id: string | null }).brand_of_interest_competitor_id ?? null;

  const [projectRes, competitorRes, runsRes, flagsRes] = await Promise.all([
    supabase.from("projects").select("name, domain").eq("id", projectId).maybeSingle(),
    // ALL tracked competitors, not just the watched one - they are the columns
    // of the source x brand matrix.
    supabase.from("competitors").select("id, name, url").eq("project_id", projectId),
    // Every answer to this question, newest first. Bounded well above
    // MAX_CHECK_INS x engines x samples so the window is always fully covered.
    supabase.from("ai_citation_runs")
      .select("id, prompt_id, error, project_mentioned, project_cited, created_at, run_batch_id")
      .eq("project_id", projectId).eq("prompt_id", promptId)
      .order("created_at", { ascending: false }).limit(1000),
    supabase.from("ai_citation_question_flags")
      .select("source_domain, flag").eq("prompt_id", promptId),
  ]);

  const project = (projectRes.data as { name?: string; domain?: string } | null);
  const projectLabel = project?.name || "You";
  const competitors = (competitorRes.data ?? []) as Array<{ id: string; name: string; url: string | null }>;
  const brandLabel = watchId
    ? (competitors.find((c) => c.id === watchId)?.name || "Competitor")
    : projectLabel;

  // Columns of the source x brand matrix: you first, then every tracked
  // competitor. Keys are competitor ids so they match ai_citation_sources.
  const brandColumns: BrandColumn[] = [
    { key: "__project__", label: projectLabel, domain: normDomain(project?.domain), isProject: true },
    ...competitors.map((c) => ({ key: c.id, label: c.name, domain: normDomain(c.url) || null, isProject: false })),
  ];

  const allRuns = (runsRes.data ?? []) as TrackerRunRow[];
  const ok = allRuns.filter((r) => !r.error);
  const flags: Record<string, QuestionFlag> = {};
  for (const f of (flagsRes.data ?? []) as Array<{ source_domain: string; flag: QuestionFlag }>) {
    flags[normDomain(f.source_domain)] = f.flag;
  }

  const emptyMatrix: SourceMatrix = { brands: [], rows: [], absentCompetitors: [] };
  if (!ok.length) {
    return { promptId, text: prompt.text, brandLabel, brandIsProject: watchId === null, brandCompetitorId: watchId, sourceMatrix: emptyMatrix, domains: [], checkIns: [], flags };
  }

  // Group into check-ins, newest first, and keep only the most recent window.
  const byBatch = groupBy(ok, batchKeyOf);
  const batches = [...byBatch.entries()]
    .map(([key, rows]) => ({
      key,
      rows,
      // The check-in's date is when the run STARTED (its earliest answer), so a
      // batch that drains across midnight is not split across two dates.
      date: rows.reduce((min, r) => (r.created_at < min ? r.created_at : min), rows[0].created_at).slice(0, 10),
    }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, MAX_CHECK_INS);

  const runIds = batches.flatMap((b) => b.rows.map((r) => r.id));
  const [sourcesRes, hitsRes] = await Promise.all([
    supabase.from("ai_citation_sources")
      .select("run_id, domain, url, title, is_project, competitor_id").in("run_id", runIds),
    supabase.from("ai_citation_competitor_hits")
      .select("run_id, competitor_id, mentioned, cited").in("run_id", runIds),
  ]);
  const sources = (sourcesRes.data ?? []) as TrackerSourceRow[];
  const hits = (hitsRes.data ?? []) as TrackerHitRow[];
  const sourcesByRun = groupBy(sources, (s) => s.run_id);
  const hitsByRun = groupBy(hits, (h) => h.run_id);

  // Stable column set: the top domains by TOTAL citations across the whole
  // window, so a source that appears in only some check-ins still keeps its
  // column (reading 0% where it was absent) instead of shifting the table.
  const totals = new Map<string, number>();
  for (const s of sources) {
    const d = domainOf(s);
    if (d) totals.set(d, (totals.get(d) ?? 0) + 1);
  }
  const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_TRACKED_DOMAINS);
  const whitelist = new Set(top.map(([d]) => d));
  const hasOther = totals.size > whitelist.size;
  const domains = [...top.map(([d]) => d), ...(hasOther ? [OTHER_DOMAIN] : [])];

  const checkIns = batches
    .map((b) => computeCheckIn({
      key: b.key,
      date: b.date,
      runs: b.rows,
      sourcesByRun,
      hitsByRun,
      watchCompetitorId: watchId,
      domainWhitelist: whitelist,
    }))
    .reverse(); // oldest -> newest, so table + chart read left-to-right in time

  return {
    promptId, text: prompt.text, brandLabel,
    brandIsProject: watchId === null, brandCompetitorId: watchId,
    // Built over the SAME source rows the shares use, so the two tables can
    // never disagree about how many times a domain was cited.
    sourceMatrix: buildSourceMatrix(sources, brandColumns),
    domains, checkIns, flags,
  };
}
