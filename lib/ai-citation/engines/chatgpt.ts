// ChatGPT engine. Runs on Klimb's platform OpenAI key (OpenAI credits), so it is
// LIVE without any new secret - this is the engine we run by default today.
//
// We call the OpenAI RESPONSES API with the built-in `web_search` tool so the model
// actually browses and returns GROUNDED url_citation annotations - the real "is the
// brand cited" signal that populates ai_citation_sources (a plain chat completion
// can't browse, so it returns no real sources). If the web-search call fails, is
// empty, or there's no time budget left, we degrade to a plain completion (no
// citations) so the run never fails - mention/position detection still works off
// the answer text, and we meter the cheaper cost we actually paid.

import { env } from "@/lib/env";
import { callByokLLM } from "@/lib/ai/byok";
import type { AiEngine, EngineAdapter, EngineCitation, EngineResult } from "../types";
import { ANSWER_MAX_TOKENS, engineError, localize } from "./_shared";

const ENGINE: AiEngine = "chatgpt";
// Default to a model that supports the Responses web_search tool (gpt-5.5 /
// gpt-4.1 / gpt-4.1-mini). gpt-4o does NOT, so we no longer default to it here.
const DEFAULT_MODEL = "gpt-4.1";
// Directional per-call cost (cents) for the path actually taken, so run.ts meters
// honestly: the browsing web_search call is pricier than the plain fallback.
const WEB_SEARCH_COST_CENTS = 3;
const FALLBACK_COST_CENTS = 1;
// Time budgets (ms). Sized down to the run's remaining wall-clock (opts.deadlineMs)
// so a web_search + fallback chain can never overrun the per-run deadline / 60s cap.
const WEB_SEARCH_MAX_MS = 22000;
const FALLBACK_MAX_MS = 9000;
const MIN_CALL_MS = 3000;

// Pull the answer text + url_citation annotations out of a Responses API payload.
// Shape: output[] -> message items -> content[] (output_text) -> { text, annotations[] }.
function parseResponses(data: unknown): { answerText: string; citations: EngineCitation[] } {
  const d = data as { output_text?: unknown; output?: unknown[] };
  const textParts: string[] = [];
  const citations: EngineCitation[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(d.output) ? d.output : []) {
    const it = item as { type?: string; content?: unknown[] };
    if (it?.type !== "message" || !Array.isArray(it.content)) continue;
    for (const c of it.content) {
      const cc = c as { type?: string; text?: string; annotations?: unknown[] };
      if (cc?.type !== "output_text") continue;
      if (typeof cc.text === "string") textParts.push(cc.text);
      for (const a of Array.isArray(cc.annotations) ? cc.annotations : []) {
        const an = a as { type?: string; url?: string; title?: string };
        if (an?.type === "url_citation" && an.url && !seen.has(an.url)) {
          seen.add(an.url);
          citations.push({ url: an.url, title: an.title || undefined });
        }
      }
    }
  }
  // Prefer the SDK-style convenience field when the API includes it.
  const answerText = typeof d.output_text === "string" && d.output_text ? d.output_text : textParts.join("");
  return { answerText, citations };
}

// Plain completion fallback: no browsing -> no real sources (mentions still count).
// Self-contained: NEVER throws (returns engineError on failure) so the adapter's
// EngineResult contract holds even when the fallback request itself fails.
async function plainCompletion(apiKey: string, input: string, timeoutMs: number): Promise<EngineResult> {
  try {
    const answerText = await callByokLLM({
      provider: "openai", apiKey, prompt: input,
      model: "gpt-4o", maxTokens: ANSWER_MAX_TOKENS, timeoutMs,
    });
    return { engine: ENGINE, ok: true, answerText, citations: [], costCents: FALLBACK_COST_CENTS };
  } catch (e) {
    return engineError(ENGINE, e instanceof Error ? e.message : String(e));
  }
}

export const chatgptAdapter: EngineAdapter = {
  engine: ENGINE,
  isConfigured: () => !!env().OPENAI_API_KEY,
  async run(prompt, opts) {
    const apiKey = env().OPENAI_API_KEY;
    if (!apiKey) return engineError(ENGINE, "OPENAI_API_KEY not configured");
    const model = process.env.AI_CITATION_OPENAI_MODEL?.trim() || DEFAULT_MODEL;
    const input = localize(prompt, opts?.country);
    // What's left of the batch's wall-clock budget right now.
    const remaining = () => (opts?.deadlineMs ?? Date.now() + WEB_SEARCH_MAX_MS) - Date.now();

    // Primary: web_search (grounded citations) - only if there's real time for it.
    if (remaining() > MIN_CALL_MS) {
      try {
        const res = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model, tools: [{ type: "web_search" }], input, max_output_tokens: ANSWER_MAX_TOKENS }),
          signal: AbortSignal.timeout(Math.min(WEB_SEARCH_MAX_MS, Math.max(MIN_CALL_MS, remaining()))),
        });
        if (res.ok) {
          const { answerText, citations } = parseResponses(await res.json());
          // A malformed/empty payload (no text AND no sources) is not a real answer -
          // fall through to the plain completion rather than record an empty success.
          if (answerText.trim() || citations.length > 0) {
            return { engine: ENGINE, ok: true, answerText, citations, costCents: WEB_SEARCH_COST_CENTS };
          }
          console.warn("[ai-citation] chatgpt web_search returned no usable content; using a plain completion");
        } else {
          console.warn(`[ai-citation] chatgpt web_search HTTP ${res.status}; using a plain completion`);
        }
      } catch (e) {
        console.warn(`[ai-citation] chatgpt web_search failed (${e instanceof Error ? e.message : String(e)}); using a plain completion`);
      }
    }

    // Single fallback path, bounded by whatever budget remains.
    return plainCompletion(apiKey, input, Math.min(FALLBACK_MAX_MS, Math.max(MIN_CALL_MS, remaining())));
  },
};
