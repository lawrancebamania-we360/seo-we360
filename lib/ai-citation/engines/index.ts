// Engine registry. run.ts queries configuredEngines() so an engine without its
// key/creds (Claude / Gemini / Google AIO until you add them) is silently
// skipped rather than recording failures every run. Perplexity's adapter stays
// registered (for historical run rows + easy re-enable - see perplexity.ts's
// header) but is retired from AI_ENGINES in ../types.ts, the list every
// user-facing engine roster (headers, breakdowns, the run modal) should read
// from instead of ENGINE_ADAPTERS/configuredEngines() directly.

import { AI_ENGINES, type AiEngine, type EngineAdapter } from "../types";
import { chatgptAdapter } from "./chatgpt";
import { claudeAdapter } from "./claude";
import { perplexityAdapter } from "./perplexity";
import { googleAioAdapter } from "./google_aio";
import { geminiAdapter } from "./gemini";

export const ENGINE_ADAPTERS: Record<AiEngine, EngineAdapter> = {
  chatgpt: chatgptAdapter,
  claude: claudeAdapter,
  perplexity: perplexityAdapter,
  google_aio: googleAioAdapter,
  gemini: geminiAdapter,
};

// Engines wired up right now (have a key/creds) AND still active (AI_ENGINES) -
// retired engines (Perplexity) never surface here even if a stray key exists.
// Order is stable for display.
export function configuredEngines(): AiEngine[] {
  return AI_ENGINES.filter((e) => ENGINE_ADAPTERS[e].isConfigured());
}
