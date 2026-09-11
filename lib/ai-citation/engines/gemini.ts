// Gemini engine (Google AI Studio Developer API). Uses "Grounding with Google
// Search" so it returns real cited source URLs - like ChatGPT (web_search) and
// Perplexity, and unlike Claude (no browsing). Reads a DEDICATED key
// (GEMINI_API_KEY) so it stays OFF until you deliberately add it, same pattern
// as Claude's AI_CITATION_ANTHROPIC_API_KEY.
//
// Model: gemini-2.5-flash (Google's price-performance tier for high-volume,
// low-latency calls - verified against ai.google.dev/gemini-api/docs/models,
// same role gpt-4.1 plays for the ChatGPT engine). Override via
// AI_CITATION_GEMINI_MODEL if Google ships a newer default worth moving to.
//
// Cost: grounding is billed per-prompt (not per model token) once past
// Google's free monthly grounding allowance (5,000 prompts/mo as of writing -
// our actual volume is expected to stay inside it). COST_CENTS.gemini in
// run.ts is a conservative directional estimate for the budget tracker, not a
// literal invoice figure - verify against ai.google.dev/gemini-api/docs/pricing
// if it ever needs tightening.

import type { AiEngine, EngineAdapter, EngineCitation } from "../types";
import { ANSWER_MAX_TOKENS, engineError, localize } from "./_shared";

const ENGINE: AiEngine = "gemini";
const DEFAULT_MODEL = "gemini-2.5-flash";

function key(): string {
  return process.env.GEMINI_API_KEY?.trim() || "";
}

interface GroundingChunk { web?: { uri?: string; title?: string } }
interface GenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: { groundingChunks?: GroundingChunk[] };
  }>;
}

export const geminiAdapter: EngineAdapter = {
  engine: ENGINE,
  isConfigured: () => !!key(),
  async run(prompt, opts) {
    const apiKey = key();
    if (!apiKey) return engineError(ENGINE, "GEMINI_API_KEY not configured");
    const model = process.env.AI_CITATION_GEMINI_MODEL?.trim() || DEFAULT_MODEL;
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: localize(prompt, opts?.country) }] }],
            tools: [{ google_search: {} }],
            generationConfig: { maxOutputTokens: ANSWER_MAX_TOKENS },
          }),
          signal: AbortSignal.timeout(25000),
        },
      );
      if (!res.ok) {
        return engineError(ENGINE, `Gemini API: ${res.status} ${(await res.text()).slice(0, 200)}`);
      }
      const data = (await res.json()) as GenerateContentResponse;
      const candidate = data.candidates?.[0];
      const answerText = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("");
      const citations: EngineCitation[] = [];
      const seen = new Set<string>();
      for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
        const uri = chunk.web?.uri;
        if (uri && !seen.has(uri)) { seen.add(uri); citations.push({ url: uri, title: chunk.web?.title }); }
      }
      return { engine: ENGINE, ok: true, answerText, citations };
    } catch (e) {
      return engineError(ENGINE, e instanceof Error ? e.message : String(e));
    }
  },
};
