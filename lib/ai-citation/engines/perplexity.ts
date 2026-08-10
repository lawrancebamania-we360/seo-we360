// Perplexity engine (sonar). Perplexity searches the live web and returns its
// cited sources natively, so it is the most accurate "is the brand actually
// cited" signal of the four engines. Reads PERPLEXITY_API_KEY (add in Vercel
// later); skipped until then. OpenAI-compatible chat completions shape.

import type { AiEngine, EngineAdapter, EngineCitation } from "../types";
import { ANSWER_MAX_TOKENS, engineError, localize } from "./_shared";

const ENGINE: AiEngine = "perplexity";

function key(): string {
  return process.env.PERPLEXITY_API_KEY?.trim() || "";
}

export const perplexityAdapter: EngineAdapter = {
  engine: ENGINE,
  isConfigured: () => !!key(),
  async run(prompt, opts) {
    const apiKey = key();
    if (!apiKey) return engineError(ENGINE, "PERPLEXITY_API_KEY not configured");
    try {
      const res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: process.env.PERPLEXITY_MODEL?.trim() || "sonar",
          messages: [{ role: "user", content: localize(prompt, opts?.country) }],
          max_tokens: ANSWER_MAX_TOKENS,
        }),
        signal: AbortSignal.timeout(25000),
      });
      if (!res.ok) {
        return engineError(ENGINE, `Perplexity API: ${res.status} ${(await res.text()).slice(0, 200)}`);
      }
      const data = await res.json();
      const answerText: string = data.choices?.[0]?.message?.content ?? "";
      // Prefer the richer search_results (title + url); fall back to the flat
      // citations[] array of URLs that older responses return.
      const citations: EngineCitation[] = [];
      const sr = Array.isArray(data.search_results) ? data.search_results : [];
      for (const s of sr) if (s?.url) citations.push({ url: s.url, title: s.title ?? undefined });
      if (citations.length === 0 && Array.isArray(data.citations)) {
        for (const u of data.citations) if (typeof u === "string") citations.push({ url: u });
      }
      return { engine: ENGINE, ok: true, answerText, citations };
    } catch (e) {
      return engineError(ENGINE, e instanceof Error ? e.message : String(e));
    }
  },
};
