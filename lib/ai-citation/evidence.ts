// AI-Visibility evidence reads: the raw-transcript click-through behind every
// number in the report. Given the RLS-scoped supabase client, resolve the SAME
// latest run batch the report renders, filter its answers by the clicked slice
// (engine / persona / topic / funnel stage / competitor / mentioned / cited /
// sentiment), and page through them; a single answer can then be expanded to its
// FULL stored transcript (ai_citation_runs.answer_text, capped at 8000 chars at
// write time) plus its cited sources and the names to highlight.
//
// Read-only and RLS-scoped on purpose: this powers viewer-facing UI, never
// mutates, and must stay cheap (light columns for the list, full answer_text
// only for the current page / a single transcript).

import type { SupabaseClient } from "@supabase/supabase-js";
import { hostFromUrl } from "@/lib/url";
import type { AiEngine } from "./types";
import { asBrandSentiment, stageForTags, type BrandSentiment, type EvidenceFilter } from "./trust";

export const EVIDENCE_PAGE_SIZE = 20;

export interface EvidenceItem {
  runId: string;
  promptText: string;
  persona: string;
  topic: string;
  engine: AiEngine;
  mentioned: boolean;
  cited: boolean;
  position: number | null;
  sentiment: BrandSentiment | null;
  createdAt: string;
  snippet: string;
}

export interface EvidencePage {
  total: number;
  pageSize: number;
  items: EvidenceItem[];
}

const UNLABELLED = "Other";

type RunRow = {
  id: string;
  prompt_id: string;
  engine: AiEngine;
  project_mentioned: boolean;
  project_cited: boolean;
  position: number | null;
  sentiment: string | null;
  created_at: string;
};

async function latestBatchId(supabase: SupabaseClient, projectId: string): Promise<string | null> {
  const { data } = await supabase.from("ai_citation_runs")
    .select("run_batch_id").eq("project_id", projectId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data?.run_batch_id as string | null) ?? null;
}

export async function getAnswerEvidence(
  supabase: SupabaseClient,
  projectId: string,
  filter: EvidenceFilter,
  page: number,
): Promise<EvidencePage> {
  const emptyPage: EvidencePage = { total: 0, pageSize: EVIDENCE_PAGE_SIZE, items: [] };
  const batchId = await latestBatchId(supabase, projectId);
  if (!batchId) return emptyPage;

  // Light columns for the whole batch (a batch is bounded: prompts x engines x
  // samples, a few hundred rows), full answer_text only for the final page.
  const [runsRes, promptsRes] = await Promise.all([
    supabase.from("ai_citation_runs")
      .select("id, prompt_id, engine, project_mentioned, project_cited, position, sentiment, created_at")
      .eq("run_batch_id", batchId).is("error", null),
    supabase.from("ai_citation_prompts")
      .select("id, text, persona, topic, tags").eq("project_id", projectId),
  ]);
  const runs = (runsRes.data ?? []) as RunRow[];
  if (!runs.length) return emptyPage;
  const prompts = (promptsRes.data ?? []) as Array<{ id: string; text: string; persona: string | null; topic: string | null; tags: string[] | null }>;
  const promptMap = new Map(prompts.map((p) => [p.id, p]));

  // Competitor slices come from the hits side-table (same join the report uses).
  // Degrades to an empty result if the table is missing (pre-migration).
  let competitorRunIds: Set<string> | null = null;
  if (filter.competitor) {
    const { data: hits } = await supabase.from("ai_citation_competitor_hits")
      .select("run_id").in("run_id", runs.map((r) => r.id)).eq("competitor_name", filter.competitor);
    competitorRunIds = new Set(((hits ?? []) as Array<{ run_id: string }>).map((h) => h.run_id));
  }

  const matches = runs.filter((r) => {
    const p = promptMap.get(r.prompt_id);
    if (filter.engine && r.engine !== filter.engine) return false;
    if (filter.persona && (p?.persona || UNLABELLED) !== filter.persona) return false;
    if (filter.topic && (p?.topic || UNLABELLED) !== filter.topic) return false;
    if (filter.stage && stageForTags(p?.tags) !== filter.stage) return false;
    if (filter.mentioned && !r.project_mentioned) return false;
    if (filter.cited && !r.project_cited) return false;
    if (filter.sentiment && asBrandSentiment(r.sentiment) !== filter.sentiment) return false;
    if (competitorRunIds && !competitorRunIds.has(r.id)) return false;
    return true;
  });

  // Mentioned answers first (the interesting ones), then cited, then newest.
  matches.sort((a, b) =>
    Number(b.project_mentioned) - Number(a.project_mentioned)
    || Number(b.project_cited) - Number(a.project_cited)
    || b.created_at.localeCompare(a.created_at));

  const start = Math.max(0, page) * EVIDENCE_PAGE_SIZE;
  const pageRows = matches.slice(start, start + EVIDENCE_PAGE_SIZE);
  if (!pageRows.length) return { total: matches.length, pageSize: EVIDENCE_PAGE_SIZE, items: [] };

  const { data: snippetRows } = await supabase.from("ai_citation_runs")
    .select("id, answer_text").in("id", pageRows.map((r) => r.id));
  const snippetById = new Map(((snippetRows ?? []) as Array<{ id: string; answer_text: string | null }>)
    .map((s) => [s.id, (s.answer_text || "").replace(/\s+/g, " ").trim().slice(0, 280)]));

  return {
    total: matches.length,
    pageSize: EVIDENCE_PAGE_SIZE,
    items: pageRows.map((r) => {
      const p = promptMap.get(r.prompt_id);
      return {
        runId: r.id,
        promptText: p?.text || "",
        persona: p?.persona || UNLABELLED,
        topic: p?.topic || UNLABELLED,
        engine: r.engine,
        mentioned: r.project_mentioned,
        cited: r.project_cited,
        position: r.position,
        sentiment: asBrandSentiment(r.sentiment),
        createdAt: r.created_at,
        snippet: snippetById.get(r.id) ?? "",
      };
    }),
  };
}

// ---- Full transcript for one answer ------------------------------------------

export interface TranscriptSource {
  domain: string | null;
  url: string | null;
  title: string | null;
  isProject: boolean;
  isCompetitor: boolean;
}

export interface AnswerTranscript {
  runId: string;
  promptText: string;
  persona: string | null;
  topic: string | null;
  engine: AiEngine;
  createdAt: string;
  mentioned: boolean;
  cited: boolean;
  position: number | null;
  sentiment: BrandSentiment | null;
  /** The FULL stored answer (capped at 8000 chars at write time). Empty when the
   *  engine errored on this call. */
  answerText: string;
  error: string | null;
  /** Names/aliases to highlight as "you" (mirrors run.ts's brand aliases). */
  brandNames: string[];
  /** Tracked competitor names to highlight as rivals. */
  competitorNames: string[];
  sources: TranscriptSource[];
}

export async function getAnswerTranscript(
  supabase: SupabaseClient,
  projectId: string,
  runId: string,
): Promise<AnswerTranscript | null> {
  const { data: run } = await supabase.from("ai_citation_runs")
    .select("id, prompt_id, engine, project_mentioned, project_cited, position, sentiment, created_at, answer_text, error")
    .eq("id", runId).eq("project_id", projectId).maybeSingle();
  if (!run) return null;

  const [promptRes, sourcesRes, projectRes, compsRes] = await Promise.all([
    supabase.from("ai_citation_prompts").select("text, persona, topic").eq("id", run.prompt_id as string).maybeSingle(),
    supabase.from("ai_citation_sources").select("domain, url, title, is_project, competitor_id").eq("run_id", runId),
    supabase.from("projects").select("name, domain").eq("id", projectId).maybeSingle(),
    supabase.from("competitors").select("name").eq("project_id", projectId),
  ]);

  const project = projectRes.data as { name: string | null; domain: string | null } | null;
  // Same alias derivation as run.ts, so the highlight can never disagree with
  // what detection considered "the brand" (name + host + host-sans-TLD).
  const host = hostFromUrl(project?.domain);
  const brandNames = [...new Set([project?.name, host, host.split(".")[0]]
    .map((s) => (s ?? "").trim())
    .filter((s) => s.length >= 2))];
  const competitorNames = (((compsRes.data ?? []) as Array<{ name: string | null }>)
    .map((c) => (c.name ?? "").trim())
    .filter((n) => n.length >= 2));

  const prompt = promptRes.data as { text: string; persona: string | null; topic: string | null } | null;
  return {
    runId: run.id as string,
    promptText: prompt?.text || "",
    persona: prompt?.persona ?? null,
    topic: prompt?.topic ?? null,
    engine: run.engine as AiEngine,
    createdAt: run.created_at as string,
    mentioned: (run.project_mentioned as boolean) ?? false,
    cited: (run.project_cited as boolean) ?? false,
    position: (run.position as number | null) ?? null,
    sentiment: asBrandSentiment(run.sentiment),
    answerText: (run.answer_text as string | null) ?? "",
    error: (run.error as string | null) ?? null,
    brandNames,
    competitorNames,
    sources: ((sourcesRes.data ?? []) as Array<{ domain: string | null; url: string | null; title: string | null; is_project: boolean; competitor_id: string | null }>)
      .map((s) => ({ domain: s.domain, url: s.url, title: s.title, isProject: s.is_project, isCompetitor: !!s.competitor_id })),
  };
}
