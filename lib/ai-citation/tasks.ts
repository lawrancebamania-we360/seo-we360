// The run's task list, as a pure function so it can be tested without spending a
// cent: every (prompt x geography x engine x sample) the run will make, and the
// key that identifies a finished one (so a parked run resumes exactly where it
// stopped and nothing is ever run, or billed, twice).

import { normalizeCountry } from "@/lib/geo/countries";
import type { AiEngine } from "./types";

export interface RunTask<P extends { id: string }> {
  p: P;
  engine: AiEngine;
  /** Sample index within (prompt, geography, engine). */
  i: number;
  /** ISO-2 geography this call is made for, or null when none is known. */
  country: string | null;
}

export interface BuildTasksArgs<P extends { id: string; country?: string | null }> {
  prompts: P[];
  engines: AiEngine[];
  samplesFor: (engine: AiEngine) => number;
  aioPromptCap?: number | null;
  promptCapByEngine?: Partial<Record<AiEngine, number>> | null;
  /** Explicit geographies chosen for this run (ISO-2). Every prompt runs in each. */
  countries?: readonly string[] | null;
  /** Used when `countries` is empty: a prompt's own country wins, else this. */
  defaultCountry?: string | null;
}

/** The geographies one prompt runs in: the run's explicit list, else its own country, else the default. */
export function geographiesFor(
  prompt: { country?: string | null },
  countries: readonly string[] | null | undefined,
  defaultCountry: string | null | undefined,
): (string | null)[] {
  if (countries?.length) return [...countries];
  return [normalizeCountry(prompt.country) ?? defaultCountry ?? null];
}

/**
 * Loop order is prompt, then geography, then engine, then sample. A run that is
 * cut short therefore stays balanced across geographies (every geography of a
 * prompt finishes before the next prompt starts) instead of finishing one
 * country completely and never starting another. With a single geography this is
 * exactly the order the run used before geographies existed.
 */
export function buildTasks<P extends { id: string; country?: string | null }>(a: BuildTasksArgs<P>): RunTask<P>[] {
  const tasks: RunTask<P>[] = [];
  for (let pi = 0; pi < a.prompts.length; pi++) {
    const p = a.prompts[pi];
    for (const country of geographiesFor(p, a.countries, a.defaultCountry)) {
      for (const engine of a.engines) {
        // Cap the expensive google_aio engine to the first aioPromptCap prompts
        // (the on-demand cost/time guard) unless a per-engine cap replaces it; any
        // other engine can be capped the same way via promptCapByEngine. The cap
        // is per prompt, so it applies to every geography of that prompt alike.
        const cap = engine === "google_aio"
          ? (a.aioPromptCap ?? a.promptCapByEngine?.[engine])
          : a.promptCapByEngine?.[engine];
        if (cap != null && pi >= cap) continue;
        const samples = a.samplesFor(engine);
        for (let i = 0; i < samples; i++) tasks.push({ p, engine, i, country });
      }
    }
  }
  return tasks;
}

/**
 * Identity of one task. `withCountry` is false for a batch opened before
 * geographies existed (or on a database without the country column): its rows
 * carry no country, so including it would make every finished task look
 * unfinished and a resume would re-run (and re-bill) the whole batch.
 */
export function taskKey(t: { p: { id: string }; engine: string; i: number; country: string | null }, withCountry: boolean): string {
  return withCountry ? `${t.p.id}|${t.country ?? ""}|${t.engine}|${t.i}` : `${t.p.id}|${t.engine}|${t.i}`;
}

/** Same key from a persisted ai_citation_runs row. */
export function rowKey(r: { prompt_id: string; engine: string; run_index: number; country?: string | null }, withCountry: boolean): string {
  return withCountry ? `${r.prompt_id}|${r.country ?? ""}|${r.engine}|${r.run_index}` : `${r.prompt_id}|${r.engine}|${r.run_index}`;
}
