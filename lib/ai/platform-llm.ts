import { env } from "@/lib/env";
import { callByokLLM, byokModelId } from "./byok";
import type { AiModel } from "@/lib/ai/models";

// Platform LLM caller with SILENT cross-provider failover. Uses the app's OWN
// server keys (OPENAI_API_KEY / ANTHROPIC_API_KEY). We prefer the requested
// model's provider, but if that provider can't serve right now (out of credits,
// rate-limited, overloaded, bad key), we transparently retry the equivalent
// model on the OTHER provider.

function providerForModel(model: AiModel): "claude" | "openai" {
  return model === "opus" || model === "sonnet" ? "claude" : "openai";
}

// The nearest-tier model on the OTHER provider (premium↔premium, value↔value).
const FAILOVER_MODEL: Record<AiModel, AiModel> = {
  opus: "gpt-4o",
  "gpt-4o": "opus",
  sonnet: "gpt-4o-mini",
  "gpt-4o-mini": "sonnet",
};

function serverKey(provider: "claude" | "openai"): string | undefined {
  if (provider === "openai") return env().OPENAI_API_KEY;
  // Prefer the platform Claude key; fall back to the AI-Citation Claude key the
  // user may have set for the Claude engine, so the failover isn't dead weight
  // when only AI_CITATION_ANTHROPIC_API_KEY is configured.
  return env().ANTHROPIC_API_KEY || process.env.AI_CITATION_ANTHROPIC_API_KEY || undefined;
}

// True when the error means "this provider can't serve right now" (so failing
// over is the right move) rather than a genuine bug. Includes AUTH/key failures:
// a present-but-invalid provider key must fail over rather than hard-fail.
function isFailoverError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return /credit|quota|insufficient|billing|balance|rate.?limit|too many|429|529|overloaded|capacity|temporarily|unavailable|timed?\s?out|abort|401|403|invalid[\s_-]?api|incorrect[\s_-]?api|invalid[\s_-]?x-?api-?key|authentication|unauthor/.test(msg);
}

export interface PlatformLlmResult {
  text: string;
  modelUsed: AiModel;
  provider: "claude" | "openai";
  failedOver: boolean;
}

export async function callPlatformLLM(input: {
  model: AiModel;
  prompt: string;
  maxTokens?: number;
  timeoutMs?: number;
  jsonMode?: boolean;
}): Promise<PlatformLlmResult> {
  // Try the requested model first; if its provider can't serve, fall back to the
  // equivalent model on the OTHER provider. Two attempts, in this order.
  const candidates: AiModel[] = [input.model, FAILOVER_MODEL[input.model]];

  let lastErr: unknown;
  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i];
    const provider = providerForModel(model);
    const key = serverKey(provider);
    // A missing key on the FAILOVER provider must not overwrite a real error
    // from the primary provider — otherwise a genuine OpenAI failure gets masked
    // behind a misleading "No claude key configured". Keep the first real error.
    if (!key) { lastErr = lastErr ?? new Error(`No ${provider} key configured`); continue; }
    try {
      const text = await callByokLLM({
        provider,
        apiKey: key,
        prompt: input.prompt,
        model: byokModelId(model),
        maxTokens: input.maxTokens,
        timeoutMs: input.timeoutMs,
        jsonMode: input.jsonMode,
      });
      return { text, modelUsed: model, provider, failedOver: i > 0 };
    } catch (e) {
      if (isFailoverError(e)) { lastErr = e; continue; } // try the other provider
      throw e; // genuine error - don't mask it behind a failover
    }
  }
  throw lastErr ?? new Error("No platform AI provider available");
}
