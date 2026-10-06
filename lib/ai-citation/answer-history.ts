// AI-Visibility answer HISTORY: every answer from every check, for the Sample
// answers tab. The latest-check report (report.ts) only knows the newest run
// batch of the ACTIVE prompts; this reads across all checks so an older check, or
// a persona whose prompts are now paused, is never invisible.
//
// Two reads, both read-only and RLS-scoped (the caller passes the user's client):
//   getPersonaHistory  one paged scan of the category's OK runs -> one card per
//                      persona (counts across ALL checks) + its list of checks.
//                      Light columns only; no answer text.
//   getCheckAnswers    ONE (persona, check): the answers, mentioned first, paged
//                      25 at a time; answer text is fetched for the page only and
//                      cut to a snippet; cited links come from ai_citation_sources.
//
// Both survive a database that has not had migration 20261006000001 applied yet
// (no prompt_text / country columns -> the prompt's current wording, no geography)
// and a pre-category schema (no category column -> scoped by project only).
//
// A "check" is a run_batch_id; runs without one are grouped by their UTC day
// under the key "d:YYYY-MM-DD". Runs with an error carry no answer and are
// excluded everywhere.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumn } from "./run-state";
import { SNAPSHOT_COLS, withSnapshotCols } from "./snapshot-columns";
import { asBrandSentiment, type BrandSentiment } from "./trust";
import { buildAnswerLinks, type AnswerLink, type RawAnswerSource } from "./answer-links";
import type { AiEngine } from "./types";

/** PostgREST returns at most this many rows per request. */
const PAGE = 1000;
/** Most runs one history scan reads (newest first). Years of headroom at weekly checks. */
export const HISTORY_ROW_CAP = 20_000;
/** Answers returned per request for one check. */
export const CHECK_PAGE_SIZE = 25;
/** Longest list of runs one check may hold for a persona (a check is never split across pages). */
const CHECK_ROW_CAP = 5000;
/** How many ids go into one `.in()` filter, so the request URL stays short. */
const ID_CHUNK = 10;
/** Snippet length shown on an answer card. */
export const SNIPPET_CHARS = 280;

/** What a persona is called when its prompt has none (same label as report.ts). */
export const UNLABELLED_PERSONA = "Other";

// ---- Public types --------------------------------------------------------------

/** One check (run batch) of one persona. */
export interface PersonaHistoryCheck {
  /** run_batch_id, or "d:YYYY-MM-DD" for runs that have none. */
  key: string;
  /** Earliest created_at among this persona's answers in the check (ISO). */
  date: string;
  answers: number;
  /** How many of those answers named the project. */
  mentioned: number;
  /** Distinct ISO-2 geographies the check's answers were requested for. Empty when not recorded. */
  geographies: string[];
}

export interface PersonaHistoryCard {
  persona: string;
  /** Distinct questions ever asked (normalized wording), across every check. */
  asked: number;
  /** How many of those questions ever got a mention (any check, engine or geography). */
  mentioned: number;
  /** How many of those questions ever got a citation. */
  cited: number;
  /** Successful answers across every check. */
  answers: number;
  /** Distinct asked questions whose prompt is tagged "branded". */
  brandedCount: number;
  /** Distinct active questions the persona has right now. */
  activeQuestions: number;
  /** True when the persona has no active question (only history is left). */
  paused: boolean;
  /** created_at of the persona's newest answer (ISO), or null when it has none. */
  lastCheckedAt: string | null;
  /** Newest check first. */
  checks: PersonaHistoryCheck[];
}

export interface PersonaHistory {
  personas: PersonaHistoryCard[];
  /** True when the scan hit HISTORY_ROW_CAP, so only the newest runs are counted. */
  truncated: boolean;
}

export interface HistoryAnswer {
  runId: string;
  /** The question AS IT WAS ASKED for this answer. */
  promptText: string;
  engine: AiEngine;
  /** ISO-2 geography the answer was requested for, when recorded. */
  country: string | null;
  createdAt: string;
  mentioned: boolean;
  cited: boolean;
  position: number | null;
  sentiment: BrandSentiment | null;
  /** First SNIPPET_CHARS characters of the answer, whitespace collapsed. Never the full text. */
  snippet: string;
  /** Cited links, your own site first. */
  links: AnswerLink[];
}

export interface CheckAnswersPage {
  items: HistoryAnswer[];
  /** All of the persona's answers in this check. */
  total: number;
  /** Offset to pass for the next page, or null when this was the last one. */
  nextOffset: number | null;
}

// ---- Small pure helpers --------------------------------------------------------

/** Same question, ignoring case, spacing and a trailing ? . ! */
export function normalizeQuestion(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim().replace(/[?.!]+$/, "").trim();
}

/** The check a run belongs to: its batch id, else its UTC day. */
export function checkKeyOf(runBatchId: string | null | undefined, createdAt: string): string {
  return runBatchId || `d:${createdAt.slice(0, 10)}`;
}

const ISO2 = /^[A-Z]{2}$/;
function cleanCountry(raw: string | null | undefined): string | null {
  const c = raw?.trim().toUpperCase();
  return c && ISO2.test(c) ? c : null;
}

const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ---- Reads ---------------------------------------------------------------------

interface PromptRow { id: string; text: string; persona: string | null; tags: string[] | null; active: boolean | null }

interface ScanRow {
  id: string;
  prompt_id: string;
  run_batch_id: string | null;
  project_mentioned: boolean;
  project_cited: boolean;
  created_at: string;
  prompt_text?: string | null;
  country?: string | null;
}

interface CheckRow {
  id: string;
  prompt_id: string;
  engine: AiEngine;
  project_mentioned: boolean;
  project_cited: boolean;
  position: number | null;
  sentiment: string | null;
  created_at: string;
  prompt_text?: string | null;
  country?: string | null;
}

/** Which optional pieces of the schema this database has, learned as queries run. */
interface Mode { snap: boolean; scoped: boolean }

/**
 * Run one runs-table page, degrading for a database that is missing the snapshot
 * columns (prompt_text, country) and/or the category column. `mode` is shared and
 * updated, so after the first page every later page goes straight to the form that
 * works.
 */
async function runPage<R extends { error: { message: string } | null }>(
  mode: Mode,
  make: (snap: boolean, scoped: boolean) => PromiseLike<R>,
): Promise<R> {
  const attempt = async (): Promise<R> => {
    if (!mode.snap) return make(false, mode.scoped);
    let used = true;
    const res = await withSnapshotCols((s) => { used = s; return make(s, mode.scoped); });
    mode.snap = used;
    return res;
  };
  let res = await attempt();
  if (res.error && mode.scoped && isMissingColumn(res.error.message)) {
    mode.scoped = false; // pre-category schema: single-category by necessity
    mode.snap = true;
    res = await attempt();
  }
  return res;
}

/** Every prompt of the category, ACTIVE OR NOT (a paused persona's questions still matter). */
async function loadPrompts(supabase: SupabaseClient, projectId: string, category: string): Promise<PromptRow[]> {
  const build = (scoped: boolean, from: number) => {
    let q = supabase.from("ai_citation_prompts").select("id, text, persona, tags, active").eq("project_id", projectId);
    if (scoped) q = q.eq("category", category);
    return q.order("id", { ascending: true }).range(from, from + PAGE - 1);
  };
  let scoped = true;
  const out: PromptRow[] = [];
  for (;;) {
    let res = await build(scoped, out.length);
    if (res.error && scoped && isMissingColumn(res.error.message)) {
      scoped = false;
      res = await build(scoped, out.length);
    }
    if (res.error) throw new Error(res.error.message);
    const batch = (res.data ?? []) as PromptRow[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

/** The category's OK runs (newest first), light columns only, up to HISTORY_ROW_CAP. */
async function scanOkRuns(
  supabase: SupabaseClient,
  projectId: string,
  category: string,
): Promise<{ rows: ScanRow[]; truncated: boolean }> {
  const mode: Mode = { snap: true, scoped: true };
  const build = (from: number, count: boolean) => (snap: boolean, scoped: boolean) => {
    let q = supabase.from("ai_citation_runs")
      .select(
        `id, prompt_id, run_batch_id, project_mentioned, project_cited, created_at${snap ? SNAPSHOT_COLS : ""}`,
        count ? { count: "exact" } : undefined,
      )
      .eq("project_id", projectId)
      .is("error", null);
    if (scoped) q = q.eq("category", category);
    return q
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE - 1);
  };

  const first = await runPage(mode, build(0, true));
  if (first.error) throw new Error(first.error.message);
  const rows = ((first.data ?? []) as unknown as ScanRow[]).slice();
  const total = first.count ?? (rows.length < PAGE ? rows.length : null);

  if (total !== null) {
    // The first page told us how many pages there are: fetch the rest in parallel.
    const starts: number[] = [];
    for (let f = PAGE; f < Math.min(total, HISTORY_ROW_CAP); f += PAGE) starts.push(f);
    const rest = await Promise.all(starts.map((f) => runPage(mode, build(f, false))));
    for (const res of rest) {
      if (res.error) throw new Error(res.error.message);
      rows.push(...((res.data ?? []) as unknown as ScanRow[]));
    }
    return { rows: rows.slice(0, HISTORY_ROW_CAP), truncated: total > HISTORY_ROW_CAP };
  }

  // No count from the server (should not happen): walk the pages one by one.
  let last = rows.length;
  while (last === PAGE && rows.length < HISTORY_ROW_CAP) {
    const res = await runPage(mode, build(rows.length, false));
    if (res.error) throw new Error(res.error.message);
    const batch = (res.data ?? []) as unknown as ScanRow[];
    rows.push(...batch);
    last = batch.length;
  }
  return { rows: rows.slice(0, HISTORY_ROW_CAP), truncated: last === PAGE && rows.length >= HISTORY_ROW_CAP };
}

// Same rule as report.ts (`p.persona || UNLABELLED`, no trimming), so a persona has
// the identical name in the grid, in "By answer" and in the latest-check "By question" view.
const personaOf = (p: PromptRow | undefined): string => p?.persona || UNLABELLED_PERSONA;

/** The wording this answer was asked with: its own snapshot, else the prompt's current text. */
const askedText = (snapshot: string | null | undefined, p: PromptRow | undefined): string =>
  snapshot?.trim() || p?.text?.trim() || "";

/**
 * Runs + prompts -> one card per persona. Pure. Personas are those with at least
 * one OK run, plus personas of currently active prompts (even with no answers).
 */
export function buildPersonaCards(rows: ScanRow[], prompts: PromptRow[]): PersonaHistoryCard[] {
  const promptById = new Map(prompts.map((p) => [p.id, p]));

  type CheckAcc = { date: string; answers: number; mentioned: number; geos: Set<string> };
  type Acc = {
    questions: Map<string, { mentioned: boolean; cited: boolean }>;
    branded: Set<string>;
    active: Set<string>;
    answers: number;
    last: string | null;
    checks: Map<string, CheckAcc>;
  };
  const byPersona = new Map<string, Acc>();
  const accFor = (persona: string): Acc => {
    let a = byPersona.get(persona);
    if (!a) {
      a = { questions: new Map(), branded: new Set(), active: new Set(), answers: 0, last: null, checks: new Map() };
      byPersona.set(persona, a);
    }
    return a;
  };

  for (const p of prompts) {
    if (p.active === false) continue;
    const q = normalizeQuestion(p.text ?? "");
    accFor(personaOf(p)).active.add(q || p.id);
  }

  for (const r of rows) {
    const p = promptById.get(r.prompt_id);
    const asked = askedText(r.prompt_text, p);
    if (!asked) continue; // nothing to label the answer with
    const a = accFor(personaOf(p));
    const qkey = normalizeQuestion(asked) || asked;

    const q = a.questions.get(qkey) ?? { mentioned: false, cited: false };
    if (r.project_mentioned) q.mentioned = true;
    if (r.project_cited) q.cited = true;
    a.questions.set(qkey, q);
    if (p?.tags?.includes("branded")) a.branded.add(qkey);

    a.answers++;
    if (!a.last || time(r.created_at) > time(a.last)) a.last = r.created_at;

    const key = checkKeyOf(r.run_batch_id, r.created_at);
    const c = a.checks.get(key) ?? { date: r.created_at, answers: 0, mentioned: 0, geos: new Set<string>() };
    c.answers++;
    if (r.project_mentioned) c.mentioned++;
    if (time(r.created_at) < time(c.date)) c.date = r.created_at;
    const country = cleanCountry(r.country);
    if (country) c.geos.add(country);
    a.checks.set(key, c);
  }

  const cards: PersonaHistoryCard[] = [];
  for (const [persona, a] of byPersona) {
    if (a.answers === 0 && a.active.size === 0) continue;
    const checks: PersonaHistoryCheck[] = [...a.checks.entries()]
      .map(([key, c]) => ({ key, date: c.date, answers: c.answers, mentioned: c.mentioned, geographies: [...c.geos].sort() }))
      .sort((x, y) => time(y.date) - time(x.date) || x.key.localeCompare(y.key));
    let mentioned = 0;
    let cited = 0;
    for (const q of a.questions.values()) { if (q.mentioned) mentioned++; if (q.cited) cited++; }
    cards.push({
      persona,
      asked: a.questions.size,
      mentioned,
      cited,
      answers: a.answers,
      brandedCount: a.branded.size,
      activeQuestions: a.active.size,
      paused: a.active.size === 0,
      lastCheckedAt: a.last,
      checks,
    });
  }

  // Live personas first, then the best covered, then the most asked.
  cards.sort((x, y) =>
    Number(x.paused) - Number(y.paused)
    || (y.asked ? y.mentioned / y.asked : 0) - (x.asked ? x.mentioned / x.asked : 0)
    || y.asked - x.asked
    || x.persona.localeCompare(y.persona));
  return cards;
}

/** Every persona that was ever asked, with counts across ALL checks. Read-only. */
export async function getPersonaHistory(
  supabase: SupabaseClient,
  projectId: string,
  category: string,
): Promise<PersonaHistory> {
  const [{ rows, truncated }, prompts] = await Promise.all([
    scanOkRuns(supabase, projectId, category),
    loadPrompts(supabase, projectId, category),
  ]);
  return { personas: buildPersonaCards(rows, prompts), truncated };
}

/** One check's runs for the project/category (light columns), OK runs only. */
async function loadCheckRows(
  supabase: SupabaseClient,
  projectId: string,
  category: string,
  checkKey: string,
): Promise<CheckRow[]> {
  const day = /^d:(\d{4}-\d{2}-\d{2})$/.exec(checkKey)?.[1] ?? null;
  const nextDay = day ? new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : null;

  const mode: Mode = { snap: true, scoped: true };
  const build = (from: number) => (snap: boolean, scoped: boolean) => {
    let q = supabase.from("ai_citation_runs")
      .select(`id, prompt_id, engine, project_mentioned, project_cited, position, sentiment, created_at${snap ? SNAPSHOT_COLS : ""}`)
      .eq("project_id", projectId)
      .is("error", null);
    if (scoped) q = q.eq("category", category);
    q = day
      ? q.is("run_batch_id", null).gte("created_at", `${day}T00:00:00Z`).lt("created_at", `${nextDay}T00:00:00Z`)
      : q.eq("run_batch_id", checkKey);
    return q
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE - 1);
  };

  const out: CheckRow[] = [];
  while (out.length < CHECK_ROW_CAP) {
    const res = await runPage(mode, build(out.length));
    if (res.error) throw new Error(res.error.message);
    const batch = (res.data ?? []) as unknown as CheckRow[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

const cleanSnippet = (text: string | null | undefined): string =>
  (text ?? "").replace(/\s+/g, " ").trim().slice(0, SNIPPET_CHARS);

/**
 * One persona's answers in ONE check, mentioned first, then cited, then by
 * question / engine / geography. Returns CHECK_PAGE_SIZE of them from `offset`,
 * each with its snippet and cited links. Answer text is read for that page only
 * and only ever returned as a snippet.
 */
export async function getCheckAnswers(
  supabase: SupabaseClient,
  projectId: string,
  category: string,
  persona: string,
  checkKey: string,
  offset: number,
): Promise<CheckAnswersPage> {
  const [runs, prompts] = await Promise.all([
    loadCheckRows(supabase, projectId, category, checkKey),
    loadPrompts(supabase, projectId, category),
  ]);
  const promptById = new Map(prompts.map((p) => [p.id, p]));

  const mine: Array<{ run: CheckRow; asked: string; country: string | null }> = [];
  for (const run of runs) {
    const p = promptById.get(run.prompt_id);
    if (personaOf(p) !== persona) continue;
    const asked = askedText(run.prompt_text, p);
    if (!asked) continue;
    mine.push({ run, asked, country: cleanCountry(run.country) });
  }

  mine.sort((a, b) =>
    Number(b.run.project_mentioned) - Number(a.run.project_mentioned)
    || Number(b.run.project_cited) - Number(a.run.project_cited)
    || a.asked.toLowerCase().localeCompare(b.asked.toLowerCase())
    || String(a.run.engine).localeCompare(String(b.run.engine))
    || (a.country ?? "").localeCompare(b.country ?? "")
    || a.run.id.localeCompare(b.run.id));

  const total = mine.length;
  const start = Math.max(0, Math.floor(offset));
  const page = mine.slice(start, start + CHECK_PAGE_SIZE);
  const nextOffset = start + CHECK_PAGE_SIZE < total ? start + CHECK_PAGE_SIZE : null;
  if (!page.length) return { items: [], total, nextOffset: null };

  // Phase 2: answer text (for the snippet) and cited sources, for this page only.
  const idChunks = chunk(page.map((m) => m.run.id), ID_CHUNK);
  const [textChunks, sourceChunks] = await Promise.all([
    Promise.all(idChunks.map((ids) => supabase.from("ai_citation_runs").select("id, answer_text").in("id", ids))),
    Promise.all(idChunks.map(async (ids) => {
      const rows: Array<{ run_id: string; domain: string | null; url: string | null; title: string | null; is_project: boolean }> = [];
      for (;;) {
        const res = await supabase.from("ai_citation_sources")
          .select("run_id, domain, url, title, is_project")
          .in("run_id", ids)
          .order("id", { ascending: true })
          .range(rows.length, rows.length + PAGE - 1);
        if (res.error) throw new Error(res.error.message);
        const batch = (res.data ?? []) as typeof rows;
        rows.push(...batch);
        if (batch.length < PAGE) break;
      }
      return rows;
    })),
  ]);

  const snippetById = new Map<string, string>();
  for (const res of textChunks) {
    if (res.error) throw new Error(res.error.message);
    for (const t of (res.data ?? []) as Array<{ id: string; answer_text: string | null }>) {
      snippetById.set(t.id, cleanSnippet(t.answer_text));
    }
  }
  const linksByRun = buildAnswerLinks(
    sourceChunks.flat().map((s): RawAnswerSource => ({
      runId: s.run_id, domain: s.domain, url: s.url, title: s.title, isProject: s.is_project,
    })),
  );

  return {
    total,
    nextOffset,
    items: page.map(({ run, asked, country }) => ({
      runId: run.id,
      promptText: asked,
      engine: run.engine,
      country,
      createdAt: run.created_at,
      mentioned: !!run.project_mentioned,
      cited: !!run.project_cited,
      position: run.position ?? null,
      sentiment: asBrandSentiment(run.sentiment),
      snippet: snippetById.get(run.id) ?? "",
      links: linksByRun.get(run.id) ?? [],
    })),
  };
}
