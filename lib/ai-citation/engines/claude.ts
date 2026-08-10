// Claude engine. Reads a DEDICATED key (AI_CITATION_ANTHROPIC_API_KEY) so it
// stays OFF until you deliberately add it - the platform's general
// ANTHROPIC_API_KEY is reserved for chat / article features and is not auto-spent
// on citation runs (founder: "use OpenAI credits for AI citation"). Until the key
// is set this engine reports not-configured and is skipped; during dev we
// validate the Claude path using the live Claude chat session instead of an API
// key (founder: "use this chat for anthropic answers").

import { callByokLLM } from "@/lib/ai/byok";
import type { AiEngine, EngineAdapter } from "../types";
import { ANSWER_MAX_TOKENS, engineError, localize } from "./_shared";

const ENGINE: AiEngine = "claude";

function key(): string {
  return process.env.AI_CITATION_ANTHROPIC_API_KEY?.trim() || "";
}

export const claudeAdapter: EngineAdapter = {
  engine: ENGINE,
  isConfigured: () => !!key(),
  async run(prompt, opts) {
    const apiKey = key();
    if (!apiKey) return engineError(ENGINE, "AI_CITATION_ANTHROPIC_API_KEY not configured");
    try {
      const answerText = await callByokLLM({
        provider: "claude",
        apiKey,
        prompt: localize(prompt, opts?.country),
        model: process.env.AI_CITATION_ANTHROPIC_MODEL?.trim() || undefined,
        maxTokens: ANSWER_MAX_TOKENS,
        timeoutMs: 25000,
      });
      // Claude (no browsing) does not return real sources, so emit no citations
      // (mention/position still count); "cited" comes only from source-returning
      // engines (Perplexity, Google AIO).
      return { engine: ENGINE, ok: true, answerText, citations: [] };
    } catch (e) {
      return engineError(ENGINE, e instanceof Error ? e.message : String(e));
    }
  },
};
