"use client";

import { Sparkles } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getModelLabel, type AiModel } from "@/lib/ai/models";

export { providerForModel } from "@/lib/ai/models";
export type { AiModel } from "@/lib/ai/models";

const ALL_MODELS: { value: AiModel; provider: "claude" | "openai"; tier: "premium" | "balanced" | "fast" }[] = [
  { value: "opus",        provider: "claude", tier: "premium"  },
  { value: "sonnet",      provider: "claude", tier: "balanced" },
  { value: "gpt-4o",      provider: "openai", tier: "balanced" },
  { value: "gpt-4o-mini", provider: "openai", tier: "fast"     },
];

const TIER_META = {
  premium:  { label: "Best quality", cls: "bg-[#5B45E0]/10 text-[#5B45E0] border-[#5B45E0]/20" },
  balanced: { label: "Balanced",     cls: "bg-[#7B62FF]/10 text-[#5B45E0] border-[#7B62FF]/20" },
  fast:     { label: "Fast + cheap", cls: "bg-[#FEB800]/15 text-[#8a6500] border-[#FEB800]/30" },
};

interface Props {
  value: AiModel;
  onChange: (model: AiModel) => void;
  allowedModels?: AiModel[];
  label?: string;
  compact?: boolean;
}

export function AiModelPicker({ value, onChange, allowedModels, label = "AI model", compact }: Props) {
  const models = allowedModels && allowedModels.length > 0
    ? ALL_MODELS.filter((m) => allowedModels.includes(m.value))
    : ALL_MODELS;

  return (
    <div className={cn("space-y-1.5", compact && "space-y-1")}>
      <Label className={compact ? "text-xs" : undefined}>
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-[#5B45E0]" />
          {label}
        </span>
      </Label>
      <Select value={value} onValueChange={(v) => v && onChange(v as AiModel)}>
        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>
          {models.map((m) => {
            const tier = TIER_META[m.tier];
            return (
              <SelectItem key={m.value} value={m.value}>
                <div className="flex items-center gap-2">
                  <span>{getModelLabel(m.value)}</span>
                  <Badge className={cn("text-[9px] border", tier.cls)}>{tier.label}</Badge>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
