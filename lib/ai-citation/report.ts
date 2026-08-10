// AI Citation - read/aggregation layer for the report UI. Given the RLS-scoped
// supabase client + a project, reads the latest audit batch and rolls it into the
// Gumshoe-style surfaces: composite score + trend, model visibility, persona /
// topic visibility, a competitor leaderboard, the 4 heatmaps (persona/topic/model
// x competitor + persona x topic), top cited sources, and recent answers.
//
// Heatmaps need ai_citation_competitor_hits (migration 20260629000001). If that
// table is missing the competitor columns just read empty (project column still
// works). Everything degrades to an empty state before the first run.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiEngine } from "./types";
import { FUNNEL_STAGES, asBrandSentiment, stageForTags, type BrandSentiment, type FunnelStage } from "./trust";
import { buildQuestionRows, type QuestionRow } from "./question-tracker";

export interface BrandRate { mentionRate: number; citationRate: number; n: number }
/** One heatmap cell: the mention rate plus the raw counts behind it, so the grid
 *  can show both the "58%" and the "7/12" fraction the cell is computed from. */
export interface HeatCellValue { rate: number; num: number; den: number }
/** One persona row of the persona x funnel-stage gap matrix (trust feature 3). */
export interface FunnelMatrixRow { persona: string; cells: Record<FunnelStage, { n: number; mentioned: number }> }
/** Rollup of the post-hoc brand-sentiment tiers over the latest batch (trust feature 2). */
export interface SentimentRollup { recommended: number; withCaveats: number; dismissed: number; unclassified: number; mentioned: number }
export interface AiVisibilityReport {
  hasData: boolean;
  period: string | null;
  composite: number;
  compositePrev: number | null;
  trend: Array<{ period: string; composite: number }>;
  citationRate: number;
  mentionRate: number;
  totalRuns: number;
  promptCount: number;
  projectLabel: string;
  engines: Array<{ engine: AiEngine } & BrandRate>;
  personas: Array<{ persona: string } & BrandRate>;
  topics: Array<{ topic: string } & BrandRate>;
  competitors: Array<{ id: string | null; name: string } & BrandRate>;
  heatmaps: {
    brands: string[]; // column order, brands[0] = the project
    personaByBrand: Array<{ row: string; cells: Record<string, HeatCellValue> }>;
    topicByBrand: Array<{ row: string; cells: Record<string, HeatCellValue> }>;
    modelByBrand: Array<{ row: string; cells: Record<string, HeatCellValue> }>;
    personaByTopic: { topics: string[]; rows: Array<{ row: string; cells: Record<string, HeatCellValue> }> };
  };
  sources: Array<{ domain: string; count: number; isProject: boolean }>;
  answers: Array<{ runId: string; promptText: string; persona: string; topic: string; engine: AiEngine; mentioned: boolean; cited: boolean; position: number | null; snippet: string; sentiment: BrandSentiment | null; createdAt: string }>;
  sentimentRollup: SentimentRollup;
  funnel: { stages: FunnelStage[]; rows: FunnelMatrixRow[] };
  /** Per-question source tracker rows (question-tracker.ts). Every ACTIVE prompt,
   *  including ones the latest run did not reach (runs: 0) - that gap is itself
   *  the "overdue for a re-check" signal, since a truncated run drains across
   *  ticks. Derived from the data already loaded here, so it costs no query. */
  questions: QuestionRow[];
}

type Acc = { n: number; m: number; c: number };
const acc = (): Acc => ({ n: 0, m: 0, c: 0 });
const rate = (a: Acc): BrandRate => ({ mentionRate: a.n ? a.m / a.n : 0, citationRate: a.n ? a.c / a.n : 0, n: a.n });
const UNLABELLED = "Other";

// The composite "AI Visibility" index (0-100), directional. Spec blend was
// 0.40 citation + 0.25 mention + 0.20 SoV + 0.10 position + 0.05 readiness;
// readiness is not fed yet (it stays in Site Health), so the 4 live factors are
// renormalized to sum to 1. Shared by run.ts (stored, for trend) and the report
// headline so they never disagree. Tunable (open decision #6).
export function aiVisibilityComposite(citationRate: number, mentionRate: number, sov: number, positionScore: number): number {
  return Math.round(100 * (0.42 * citationRate + 0.26 * mentionRate + 0.21 * sov + 0.11 * positionScore));
}
// 0..1 from the brand's mention positions: 1.0 if always named first, less as the
// rank slips (1/position averaged over the runs where it was named).
export function positionScoreFrom(positions: Array<number | null | undefined>): number {
  let sum = 0, n = 0;
  for (const p of positions) if (typeof p === "number" && p > 0) { sum += 1 / p; n++; }
  return n ? sum / n : 0;
}
// Share of voice = project mentions / (project + competitor mentions).
export function shareOfVoice(projectMentions: number, competitorMentions: number): number {
  const total = projectMentions + competitorMentions;
  return total > 0 ? projectMentions / total : 0;
}

export async function getAiVisibilityReport(
  supabase: SupabaseClient,
  projectId: string,
): Promise<AiVisibilityReport> {
  const empty = (projectLabel: string): AiVisibilityReport => ({
    hasData: false, period: null, composite: 0, compositePrev: null, trend: [],
    citationRate: 0, mentionRate: 0, totalRuns: 0, promptCount: 0, projectLabel,
    engines: [], personas: [], topics: [], competitors: [],
    heatmaps: { brands: [projectLabel], personaByBrand: [], topicByBrand: [], modelByBrand: [], personaByTopic: { topics: [], rows: [] } },
    sources: [], answers: [],
    sentimentRollup: { recommended: 0, withCaveats: 0, dismissed: 0, unclassified: 0, mentioned: 0 },
    funnel: { stages: FUNNEL_STAGES, rows: [] },
    questions: [],
  });

  const { data: project } = await supabase.from("projects").select("name").eq("id", projectId).maybeSingle();
  const projectLabel = (project?.name as string) || "You";

  const { data: lastRun } = await supabase.from("ai_citation_runs")
    .select("run_batch_id").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const batchId = lastRun?.run_batch_id as string | undefined;
  if (!batchId) return empty(projectLabel);

  const { data: runs } = await supabase.from("ai_citation_runs")
    .select("id, prompt_id, engine, project_mentioned, project_cited, position, answer_text, error, sentiment, created_at")
    .eq("run_batch_id", batchId);
  const runList = (runs ?? []) as Array<{ id: string; prompt_id: string; engine: AiEngine; project_mentioned: boolean; project_cited: boolean; position: number | null; answer_text: string | null; error: string | null; sentiment: string | null; created_at: string }>;
  if (!runList.length) return empty(projectLabel);
  const runIds = runList.map((r) => r.id);

  const [scoresRes, promptsRes, hitsRes, sourcesRes, compRes, watchRes] = await Promise.all([
    supabase.from("ai_visibility_scores").select("period_date, composite_score, citation_sov, mention_sov")
      .eq("project_id", projectId).is("engine", null).order("period_date", { ascending: false }).limit(8),
    supabase.from("ai_citation_prompts").select("id, text, persona, topic, tags, active").eq("project_id", projectId),
    // competitor_id (not just the name) so the question tracker can match a
    // question's watched brand to its hit rows.
    supabase.from("ai_citation_competitor_hits").select("run_id, competitor_id, competitor_name, mentioned, cited").in("run_id", runIds),
    // competitor_id marks a competitor's OWN site, which is how the tracker
    // attributes "cited via their own content" vs via a third party.
    supabase.from("ai_citation_sources").select("run_id, domain, url, is_project, competitor_id").in("run_id", runIds),
    supabase.from("competitors").select("id, name").eq("project_id", projectId),
    // Which brand each question watches. Best-effort in its own query: the column
    // does not exist before migration 20260722000001, and an error here must not
    // take the whole report down - an empty result correctly means "every
    // question watches the project's own brand", which is the default anyway.
    supabase.from("ai_citation_prompts").select("id, brand_of_interest_competitor_id").eq("project_id", projectId),
  ]);

  const scores = (scoresRes.data ?? []) as Array<{ period_date: string; composite_score: number; citation_sov: number | null; mention_sov: number | null }>;
  const prompts = (promptsRes.data ?? []) as Array<{ id: string; text: string; persona: string | null; topic: string | null; tags: string[] | null; active: boolean }>;
  const hits = (hitsRes.data ?? []) as Array<{ run_id: string; competitor_id: string | null; competitor_name: string; mentioned: boolean; cited: boolean }>;
  const sources = (sourcesRes.data ?? []) as Array<{ run_id: string; domain: string | null; url: string | null; is_project: boolean; competitor_id: string | null }>;
  const compList = (compRes.data ?? []) as Array<{ id: string; name: string }>;

  const promptMap = new Map(prompts.map((p) => [p.id, { persona: p.persona || UNLABELLED, topic: p.topic || UNLABELLED, text: p.text }]));
  // Funnel stage per prompt, derived from its intent + branded tags (trust.ts).
  const stageByPrompt = new Map(prompts.map((p) => [p.id, stageForTags(p.tags)]));
  const runMeta = new Map(runList.map((r) => [r.id, { persona: promptMap.get(r.prompt_id)?.persona || UNLABELLED, topic: promptMap.get(r.prompt_id)?.topic || UNLABELLED, engine: r.engine }]));

  const ok = runList.filter((r) => !r.error);
  const okIds = new Set(ok.map((r) => r.id));
  const totalRuns = ok.length;

  // Project rollups.
  const overall = acc();
  const byEngine = new Map<AiEngine, Acc>();
  const byPersona = new Map<string, Acc>();
  const byTopic = new Map<string, Acc>();
  const bump = (map: Map<string, Acc>, key: string, r: { project_mentioned: boolean; project_cited: boolean }) => {
    const a = map.get(key) ?? acc(); a.n++; if (r.project_mentioned) a.m++; if (r.project_cited) a.c++; map.set(key, a);
  };
  for (const r of ok) {
    overall.n++; if (r.project_mentioned) overall.m++; if (r.project_cited) overall.c++;
    const e = byEngine.get(r.engine) ?? acc(); e.n++; if (r.project_mentioned) e.m++; if (r.project_cited) e.c++; byEngine.set(r.engine, e);
    const meta = runMeta.get(r.id)!;
    bump(byPersona, meta.persona, r); bump(byTopic, meta.topic, r);
  }

  // Competitor rollups (mention/citation rate over the same run denominators).
  const compByName = new Map<string, Acc>();      // competitor leaderboard
  const compByPersona = new Map<string, Map<string, number>>(); // persona -> comp -> mentioned count
  const compByTopic = new Map<string, Map<string, number>>();
  const compByEngine = new Map<string, Map<string, number>>();
  for (const h of hits) {
    if (!okIds.has(h.run_id)) continue; // ignore hits from errored runs (denominator excludes them)
    const meta = runMeta.get(h.run_id); if (!meta) continue;
    const a = compByName.get(h.competitor_name) ?? acc(); a.n++; if (h.mentioned) a.m++; if (h.cited) a.c++; compByName.set(h.competitor_name, a);
    if (h.mentioned) {
      const inc = (mm: Map<string, Map<string, number>>, k: string) => {
        const row = mm.get(k) ?? new Map<string, number>(); row.set(h.competitor_name, (row.get(h.competitor_name) ?? 0) + 1); mm.set(k, row);
      };
      inc(compByPersona, meta.persona); inc(compByTopic, meta.topic); inc(compByEngine, meta.engine);
    }
  }

  // Denominators per slice (number of runs), for converting counts -> rates.
  const personaN = new Map<string, number>(); const topicN = new Map<string, number>(); const engineN = new Map<string, number>();
  for (const r of ok) { const m = runMeta.get(r.id)!; personaN.set(m.persona, (personaN.get(m.persona) ?? 0) + 1); topicN.set(m.topic, (topicN.get(m.topic) ?? 0) + 1); engineN.set(m.engine, (engineN.get(m.engine) ?? 0) + 1); }

  // Competitor columns: the tracked competitors that actually appeared, by reach.
  const competitorNames = [...compByName.entries()].sort((a, b) => b[1].m - a[1].m).map(([name]) => name);
  const brands = [projectLabel, ...competitorNames];

  const heatRow = (rowKey: string, projectAcc: Acc | undefined, compCounts: Map<string, number> | undefined, denom: number) => {
    const cells: Record<string, HeatCellValue> = {};
    const pNum = projectAcc?.m ?? 0, pDen = projectAcc?.n ?? 0;
    cells[projectLabel] = { rate: pDen ? pNum / pDen : 0, num: pNum, den: pDen };
    for (const name of competitorNames) {
      const num = compCounts?.get(name) ?? 0;
      cells[name] = { rate: denom ? num / denom : 0, num, den: denom };
    }
    return { row: rowKey, cells };
  };

  const personaByBrand = [...byPersona.keys()].map((p) => heatRow(p, byPersona.get(p), compByPersona.get(p), personaN.get(p) ?? 0));
  const topicByBrand = [...byTopic.keys()].map((t) => heatRow(t, byTopic.get(t), compByTopic.get(t), topicN.get(t) ?? 0));
  const modelByBrand = [...byEngine.keys()].map((e) => heatRow(e, byEngine.get(e), compByEngine.get(e), engineN.get(e) ?? 0));

  // Persona x Topic (project mention rate only).
  const ptTopics = [...byTopic.keys()];
  const ptAccum = new Map<string, Map<string, Acc>>();
  for (const r of ok) {
    const m = runMeta.get(r.id)!;
    const row = ptAccum.get(m.persona) ?? new Map<string, Acc>();
    const cell = row.get(m.topic) ?? acc(); cell.n++; if (r.project_mentioned) cell.m++; row.set(m.topic, cell); ptAccum.set(m.persona, row);
  }
  const personaByTopicRows = [...ptAccum.keys()].map((p) => {
    const cells: Record<string, HeatCellValue> = {};
    for (const t of ptTopics) { const a = ptAccum.get(p)?.get(t); const num = a?.m ?? 0, den = a?.n ?? 0; cells[t] = { rate: den ? num / den : 0, num, den }; }
    return { row: p, cells };
  });

  // Persona x funnel stage (trust feature 3): where in the buyer journey each
  // persona sees the brand named. Red cells (low rate) = the gaps to fix.
  const funnelAccum = new Map<string, Record<FunnelStage, { n: number; mentioned: number }>>();
  const emptyCells = (): Record<FunnelStage, { n: number; mentioned: number }> =>
    Object.fromEntries(FUNNEL_STAGES.map((s) => [s, { n: 0, mentioned: 0 }])) as Record<FunnelStage, { n: number; mentioned: number }>;
  for (const r of ok) {
    const meta = runMeta.get(r.id)!;
    const stage = stageByPrompt.get(r.prompt_id) ?? "awareness";
    const row = funnelAccum.get(meta.persona) ?? emptyCells();
    row[stage].n++;
    if (r.project_mentioned) row[stage].mentioned++;
    funnelAccum.set(meta.persona, row);
  }
  const funnelRows: FunnelMatrixRow[] = [...funnelAccum.entries()].map(([persona, cells]) => ({ persona, cells }));

  // Brand-sentiment rollup (trust feature 2) over the mention rows of this batch.
  // Rows classified by the lazy post-hoc pass carry a tier; the rest read as
  // unclassified until it runs (or when they predate the feature).
  const sentimentRollup: SentimentRollup = { recommended: 0, withCaveats: 0, dismissed: 0, unclassified: 0, mentioned: 0 };
  for (const r of ok) {
    if (!r.project_mentioned) continue;
    sentimentRollup.mentioned++;
    const tier = asBrandSentiment(r.sentiment);
    if (tier === "recommended") sentimentRollup.recommended++;
    else if (tier === "with_caveats") sentimentRollup.withCaveats++;
    else if (tier === "dismissed") sentimentRollup.dismissed++;
    else sentimentRollup.unclassified++;
  }

  // Top cited domains.
  const domainCount = new Map<string, { count: number; isProject: boolean }>();
  for (const s of sources) {
    const d = (s.domain || (s.url ? safeHost(s.url) : "")).toLowerCase();
    if (!d) continue;
    const cur = domainCount.get(d) ?? { count: 0, isProject: false };
    cur.count++; if (s.is_project) cur.isProject = true; domainCount.set(d, cur);
  }
  const topSources = [...domainCount.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 12)
    .map(([domain, v]) => ({ domain, count: v.count, isProject: v.isProject }));

  // Recent answers (prefer ones where we were mentioned, then fill). runId +
  // createdAt let the UI click through to the full stored transcript.
  const answerRows = ok.map((r) => {
    const m = runMeta.get(r.id)!;
    return { runId: r.id, promptText: promptMap.get(r.prompt_id)?.text || "", persona: m.persona, topic: m.topic, engine: r.engine, mentioned: r.project_mentioned, cited: r.project_cited, position: r.position, snippet: (r.answer_text || "").slice(0, 400), sentiment: asBrandSentiment(r.sentiment), createdAt: r.created_at };
  });
  answerRows.sort((a, b) => Number(b.mentioned) - Number(a.mentioned));
  const answers = answerRows.slice(0, 30);

  // Per-question source tracker rows. Pure, over the rows already in memory, so
  // the question list adds no query to the page. Only ACTIVE questions - an
  // archived one is deliberately no longer tracked.
  const watchMap = new Map<string, string | null>(
    ((watchRes.data ?? []) as Array<{ id: string; brand_of_interest_competitor_id: string | null }>)
      .map((w) => [w.id, w.brand_of_interest_competitor_id ?? null]),
  );
  const questions = buildQuestionRows({
    prompts: prompts.filter((p) => p.active !== false),
    runs: runList,
    sources,
    hits,
    watch: watchMap,
    competitorNames: new Map(compList.map((c) => [c.id, c.name])),
    projectLabel,
  });

  const competitorMentions = [...compByName.values()].reduce((s, a) => s + a.m, 0);
  const sov = shareOfVoice(overall.m, competitorMentions);
  const positionScore = positionScoreFrom(ok.map((r) => r.position));
  const latest = scores[0];
  const trend = scores.slice().reverse().map((s) => ({ period: s.period_date, composite: s.composite_score }));

  return {
    hasData: true,
    period: latest?.period_date ?? null,
    // Composite from the SAME latest batch the heatmaps use, so the headline
    // never disagrees with the grid (the stored score row is for the trend).
    composite: aiVisibilityComposite(rate(overall).citationRate, rate(overall).mentionRate, sov, positionScore),
    compositePrev: scores[1]?.composite_score ?? null,
    trend,
    citationRate: rate(overall).citationRate,
    mentionRate: rate(overall).mentionRate,
    totalRuns,
    promptCount: new Set(ok.map((r) => r.prompt_id)).size,
    projectLabel,
    engines: [...byEngine.entries()].map(([engine, a]) => ({ engine, ...rate(a) })),
    personas: [...byPersona.entries()].map(([persona, a]) => ({ persona, ...rate(a) })).sort((a, b) => b.mentionRate - a.mentionRate),
    topics: [...byTopic.entries()].map(([topic, a]) => ({ topic, ...rate(a) })).sort((a, b) => b.mentionRate - a.mentionRate),
    competitors: competitorNames.map((name) => {
      const a = compByName.get(name)!; const found = compList.find((c) => c.name === name);
      return { id: found?.id ?? null, name, mentionRate: totalRuns ? a.m / totalRuns : 0, citationRate: totalRuns ? a.c / totalRuns : 0, n: a.n };
    }),
    heatmaps: { brands, personaByBrand, topicByBrand, modelByBrand, personaByTopic: { topics: ptTopics, rows: personaByTopicRows } },
    sources: topSources,
    answers,
    sentimentRollup,
    funnel: { stages: FUNNEL_STAGES, rows: funnelRows },
    questions,
  };
}

function safeHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}
