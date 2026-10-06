// Run sizing + pricing constants shared by the run pipeline (run.ts), the server
// action, and the run dialog. One copy: run.ts is server-only (it pulls in the
// admin Supabase client), so the dialog used to keep a hand-synced duplicate.
// Client-safe: no imports beyond types.

import type { AiEngine } from "./types";

/** Google-AIO samples per prompt. */
export const AIO_N = 1;

// Per-engine sampling, tuned for a controlled ~$5 test run by default.
// ChatGPT/Gemini browse the web so vary more call-to-call, Claude doesn't.
// Google AIO is on-demand and dearest per call, so it stays at 1.
export const DEFAULT_N_BY_ENGINE: Record<AiEngine, number> = { chatgpt: 2, claude: 1, perplexity: 1, google_aio: AIO_N, gemini: 2 };

// Directional per-call cost in cents for metering (NOT shown to users as
// dollars). chatgpt browses via the OpenAI web_search tool (~3c); Claude stays
// cheap; Gemini's grounded-search call is a conservative estimate; Google AIO
// (Apify) is dearest.
export const COST_CENTS: Record<AiEngine, number> = { chatgpt: 3, claude: 1, perplexity: 1, google_aio: 12, gemini: 3 };

/** The on-demand run asks Google AI Overviews only this many questions (cost/time guard). */
export const AIO_ONDEMAND_CAP = 5;

/** Most geographies one run may cover (each multiplies the whole run). */
export const MAX_GEOGRAPHIES = 5;

/**
 * Most adapter calls one run may contain (prompts x geographies x engines x
 * samples). A slice finishes roughly 40 calls in its 38s budget and a batch gets
 * MAX_RESUME_PASSES + 1 slices, so beyond this the tail would be cut off at the
 * continuation limit. The action rejects a bigger run up front with a clear
 * message instead of silently dropping the end of it.
 */
export const MAX_RUN_TASKS = 300;

/** Rough wall-clock for a run of `tasks` calls: ~40 calls per slice, ~40s per slice. For a "keep this tab open" hint only. */
export function estimateRunMinutes(tasks: number): number {
  return Math.max(1, Math.ceil((Math.ceil(tasks / 40) * 40) / 60));
}
