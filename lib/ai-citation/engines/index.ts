// Engine registry. run.ts queries configuredEngines() so an engine without its
// key/creds (Claude / Perplexity / Google AIO until you add them) is silently
// skipped rather than recording failures every run.

import type { AiEngine, EngineAdapter } from "../types";
import { chatgptAdapter } from "./chatgpt";
import { claudeAdapter } from "./claude";
import { perplexityAdapter } from "./perplexity";
import { googleAioAdapter } from "./google_aio";

export const ENGINE_ADAPTERS: Record<AiEngine, EngineAdapter> = {
  chatgpt: chatgptAdapter,
  claude: claudeAdapter,
  perplexity: perplexityAdapter,
  google_aio: googleAioAdapter,
};

// Engines wired up right now (have a key/creds). Order is stable for display.
export function configuredEngines(): AiEngine[] {
  return (Object.keys(ENGINE_ADAPTERS) as AiEngine[]).filter((e) => ENGINE_ADAPTERS[e].isConfigured());
}
