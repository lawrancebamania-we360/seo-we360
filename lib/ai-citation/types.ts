// AI Citation - shared types. See PLAN-ai-citation.md (">> RESUME HERE <<").

// The engines we query. ChatGPT + Claude run on the existing callPlatformLLM
// (Anthropic/OpenAI). Perplexity is a new adapter (sonar, returns citations
// natively). Google AIO reuses the existing best-effort runAiOverviewTracker.
export type AiEngine = "chatgpt" | "claude" | "perplexity" | "google_aio";

export const AI_ENGINES: AiEngine[] = ["chatgpt", "claude", "perplexity", "google_aio"];

export const ENGINE_LABEL: Record<AiEngine, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  perplexity: "Perplexity",
  google_aio: "Google AI Overviews",
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
