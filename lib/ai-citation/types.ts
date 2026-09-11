// AI Citation - shared types. See PLAN-ai-citation.md (">> RESUME HERE <<").

// The engines we query. ChatGPT + Claude run on the existing callPlatformLLM
// (Anthropic/OpenAI). Gemini is a new adapter (Google AI Studio, grounded search,
// returns citations natively). Google AIO reuses the existing best-effort
// runAiOverviewTracker. "perplexity" stays in the type + ENGINE_ADAPTERS for
// historical run rows and easy re-enable, but is retired from every
// user-visible engine list (AI_ENGINES) - see engines/perplexity.ts's header.
export type AiEngine = "chatgpt" | "claude" | "perplexity" | "google_aio" | "gemini";

// We360 sells 2 products; AI Visibility scans + reports on each independently
// (own prompts, own runs, own composite score), with room for more later. Every
// prompt/run/batch/score row carries this (see the category migration).
export type AiVisibilityCategory = "employee_monitoring" | "workforce_analytics";
export const AI_VISIBILITY_CATEGORIES: AiVisibilityCategory[] = ["employee_monitoring", "workforce_analytics"];
export const CATEGORY_LABEL: Record<AiVisibilityCategory, string> = {
  employee_monitoring: "Employee Monitoring",
  workforce_analytics: "Workforce Analytics",
};
export const DEFAULT_CATEGORY: AiVisibilityCategory = "workforce_analytics";

// The user-visible/active roster. Perplexity intentionally excluded (retired,
// not deleted - re-add it here to bring it back).
export const AI_ENGINES: AiEngine[] = ["chatgpt", "claude", "gemini", "google_aio"];

export const ENGINE_LABEL: Record<AiEngine, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  perplexity: "Perplexity",
  google_aio: "Google AI Overviews",
  gemini: "Gemini",
};

// A source an answer cited (domain and/or url).
export interface EngineCitation {
  domain?: string;
  url?: string;
  title?: string;
  snippet?: string;
}

// What one engine returns for one prompt run. A failed engine returns ok:false
// (never throws to the caller) so one dead engine cannot fail a whole audit.
export interface EngineResult {
  engine: AiEngine;
  ok: boolean;
  answerText: string;
  citations: EngineCitation[];
  error?: string;
  /** Actual per-call cost in cents for the path actually taken (e.g. ChatGPT's
   *  web_search vs its plain-completion fallback differ). run.ts meters this when
   *  set, else falls back to the static COST_CENTS estimate. */
  costCents?: number;
}

// Every engine adapter implements this. country localizes the query;
// projectDomain + apifyToken are only used by the Google AIO adapter (the others
// ignore them).
export interface EngineRunOpts {
  country?: string;
  projectDomain?: string;
  apifyToken?: string;
  /** Absolute epoch-ms deadline for the whole batch. An adapter that may chain
   *  calls (e.g. ChatGPT web_search + a fallback) sizes its timeouts to what's left
   *  so it can never overrun the run budget / Vercel function cap. */
  deadlineMs?: number;
}

export interface EngineAdapter {
  engine: AiEngine;
  // True when this engine has the key/creds it needs RIGHT NOW. run.ts skips
  // engines that are not configured, so Claude / Perplexity / Google AIO stay
  // dormant (never recording failures) until their keys are added.
  isConfigured(): boolean;
  run(prompt: string, opts?: EngineRunOpts): Promise<EngineResult>;
}
