export type AiModel = "sonnet" | "opus" | "gpt-4o-mini" | "gpt-4o";
export type AiProvider = "claude" | "openai";

const PRICING: Record<AiModel, { input: number; output: number; label: string }> = {
  opus:          { input: 0.0000015,   output: 0.0000075,   label: "Claude Opus 4.7" },
  sonnet:        { input: 0.0000003,   output: 0.0000015,   label: "Claude Sonnet 4.6" },
  "gpt-4o":      { input: 0.00000025,  output: 0.0000010,   label: "OpenAI GPT-4o" },
  "gpt-4o-mini": { input: 0.000000015, output: 0.00000006,  label: "OpenAI GPT-4o-mini" },
};

export function getModelLabel(model: AiModel): string {
  return PRICING[model]?.label ?? model;
}

export function estimateAiCostCents(model: AiModel, inputTokens: number, outputTokens: number): number {
  const p = PRICING[model];
  if (!p) return 0;
  const usd = inputTokens * p.input + outputTokens * p.output;
  return Math.ceil(usd * 100);
}

export function providerForModel(model: AiModel): AiProvider {
  return model === "opus" || model === "sonnet" ? "claude" : "openai";
}
