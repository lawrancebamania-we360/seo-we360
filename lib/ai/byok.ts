// One bring-your-own-key (BYOK) LLM client for every platform AI feature.
// Single source of truth for model ids + the anthropic-version header + token
// limits: bump BYOK_MODELS here and every feature follows.

export type ByokProvider = "claude" | "openai";

/** Single source of truth for the platform's BYOK model ids. Env-overridable. */
export const BYOK_MODELS: Record<ByokProvider, string> = {
  claude: process.env.ANTHROPIC_BYOK_MODEL?.trim() || "claude-opus-4-8",
  openai: process.env.OPENAI_BYOK_MODEL?.trim() || "gpt-4o",
};

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 8000;

/** Call the user's chosen provider with their key. Key is used for this one
 *  request only - never logged, never stored. Throws on a non-OK response. */
export async function callByokLLM(opts: {
  provider: ByokProvider;
  apiKey: string;
  prompt: string;
  maxTokens?: number;
  timeoutMs?: number;
  /** Override the provider's default model id (e.g. to honor a UI model pick). */
  model?: string;
  /** Force JSON-only output. OpenAI: response_format json_object. Claude: a
   *  system instruction + an assistant "{" prefill (Anthropic has no
   *  response_format), so callers that parse strict JSON get it on either provider. */
  jsonMode?: boolean;
}): Promise<string> {
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const signal = opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined;

  if (opts.provider === "claude") {
    // jsonMode for Claude: Anthropic's Messages API has no response_format, so we
    // enforce JSON with a system instruction and let the model emit the WHOLE
    // object. We deliberately do NOT use the old assistant-"{"-prefill trick:
    // newer Claude models reject a conversation that ends on an assistant turn
    // ("does not support assistant message prefill / must end with a user
    // message"). Callers parse the result with extractFirstJson, which tolerates
    // any stray prose/fences.
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": opts.apiKey, "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json" },
      body: JSON.stringify({
        model: opts.model ?? BYOK_MODELS.claude,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: opts.prompt }],
        ...(opts.jsonMode ? { system: "Respond with a single valid JSON object only. No prose, no markdown, no code fences." } : {}),
      }),
      signal,
    });
    if (!res.ok) throw new Error(`Claude API: ${res.status} ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    const blocks: Array<{ type?: string; text?: string }> = Array.isArray(data.content) ? data.content : [];
    return blocks.find((b) => b.type === "text")?.text ?? blocks[0]?.text ?? "";
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: opts.model ?? BYOK_MODELS.openai,
      messages: [{ role: "user", content: opts.prompt }],
      max_tokens: maxTokens,
      ...(opts.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
    }),
    signal,
  });
  if (!res.ok) throw new Error(`OpenAI API: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

/** Map a UI AiModel pick (opus/sonnet/gpt-4o/gpt-4o-mini) to its concrete
 *  provider model id. Returns undefined for an unknown value (caller falls back
 *  to the provider default). */
export function byokModelId(aiModel: string | undefined): string | undefined {
  switch (aiModel) {
    case "opus": return BYOK_MODELS.claude;
    case "sonnet": return process.env.ANTHROPIC_SONNET_MODEL?.trim() || "claude-sonnet-4-6";
    case "gpt-4o": return "gpt-4o";
    case "gpt-4o-mini": return "gpt-4o-mini";
    default: return undefined;
  }
}

/** Extract the first balanced JSON object from a (possibly markdown-fenced) LLM
 *  response. Returns null if none parses - callers decide the fallback. */
export function extractFirstJson<T = unknown>(raw: string): T | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]) as T; } catch { return null; }
}
