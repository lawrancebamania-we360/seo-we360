"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AiModelPicker, providerForModel } from "@/components/sections/ai-model-picker";
import type { AiModel } from "@/lib/ai/models";

export interface GenerateArticlePayload {
  provider: "claude" | "openai";
  apiKey: string;
  targetKeyword: string;
  secondaryKeywords: string[];
  competition: string | null;
  mode: "outline" | "full";
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targetKeyword: string;
  secondaryKeywords?: string[];
  competition?: string | null;
  mode: "outline" | "full";
  defaultModel?: AiModel;
  onGenerated: (content: { content: string; title?: string; metaDescription?: string }) => void;
}

export function ByokDialog({ open, onOpenChange, targetKeyword, secondaryKeywords = [], competition, mode, defaultModel, onGenerated }: Props) {
  const [model, setModel] = useState<AiModel>(defaultModel ?? "sonnet");
  const provider = providerForModel(model);
  const [apiKey, setApiKey] = useState("");
  const [pending, start] = useTransition();
  const [remember, setRemember] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      try {
        if (remember) {
          sessionStorage.setItem(`we360.${provider}.key`, apiKey);
        }
        const res = await fetch("/api/articles/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            model,                              // per-task override, passed through to the endpoint
            apiKey,
            targetKeyword,
            secondaryKeywords,
            competition,
            mode,
          }),
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(err || "Generation failed");
        }
        const body = await res.json();
        onGenerated(body);
        toast.success(mode === "outline" ? "Outline ready" : "Article drafted");
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Generation failed");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-violet-500" />
            Generate {mode}
          </DialogTitle>
          <DialogDescription>
            Paste your Claude or OpenAI API key. It is used only for this request — not stored on our servers.
            If you check &quot;remember this session,&quot; the key stays in your browser&apos;s session storage and is wiped when you close the tab.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <AiModelPicker value={model} onChange={setModel} />
          <div className="space-y-1.5">
            <Label htmlFor="key" className="flex items-center gap-1.5">
              <KeyRound className="size-3.5" />
              API key
            </Label>
            <Input
              id="key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider === "claude" ? "sk-ant-..." : "sk-..."}
              required
              autoComplete="off"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-3.5"
            />
            Remember for this session (stored in browser only)
          </label>
          <div className="rounded-md border bg-muted/50 p-3 text-xs space-y-1.5">
            <div>
              <span className="text-muted-foreground">Target:</span>{" "}
              <span className="font-medium">{targetKeyword}</span>
            </div>
            {competition && (
              <div>
                <span className="text-muted-foreground">Competition:</span>{" "}
                <span className="font-medium">{competition}</span>
                <span className="text-muted-foreground ml-2">
                  → target length: {competition === "Low Competition" ? "1200–1500" : competition === "Medium Competition" ? "1800–2200" : "2500+"} words
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Generate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
