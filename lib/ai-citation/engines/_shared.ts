// Shared helpers for the AI-citation engine adapters.

import type { AiEngine, EngineCitation, EngineResult } from "../types";

// A failed / unconfigured engine returns ok:false (never throws) so one dead
// engine cannot fail a whole audit. run.ts records the error and moves on.
export function engineError(engine: AiEngine, error: string): EngineResult {
  return { engine, ok: false, answerText: "", citations: [], error };
}

// chatgpt + claude chat APIs do not return structured sources, so pull any URLs
// the model named in its prose into citations. This is best-effort: a model that
// happens to name the project's own URL still counts as a citation; one that just
// names the brand by word is caught by mention-detection instead.
const URL_RE = /https?:\/\/[^\s)\]}"'<>]+/gi;
export function extractUrlCitations(text: string): EngineCitation[] {
  const seen = new Set<string>();
  const out: EngineCitation[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:!?]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url });
  }
  return out;
}

// Lightly localize the question so an engine answers for the right market. Kept
// minimal so it does not distort the natural answer we are measuring.
export function localize(prompt: string, country?: string): string {
  const c = country?.trim();
  if (!c) return prompt;
  return `${prompt}\n\n(Answer for someone located in ${c}.)`;
}

// Engines should answer like a real assistant a buyer would ask, capped so the
// reply is full enough to catch brand mentions without runaway cost.
export const ANSWER_MAX_TOKENS = 900;
