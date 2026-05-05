"use client";

import { useState, useTransition } from "react";
import { Loader2, ShieldCheck, KeyRound, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AiModelPicker, providerForModel } from "@/components/sections/ai-model-picker";
import type { AiModel } from "@/lib/ai/models";

const STORAGE_KEY = "we360.eeat.key";
const STORAGE_MODEL_KEY = "we360.eeat.model";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  projectName: string;
  defaultModel?: AiModel;
  onAnalyzed?: () => void;
}

export function EeatAnalyzeDialog({ open, onOpenChange, projectId, projectName, defaultModel, onAnalyzed }: Props) {
  const [model, setModel] = useState<AiModel>(() => {
    if (typeof window === "undefined") return defaultModel ?? "sonnet";
    return (sessionStorage.getItem(STORAGE_MODEL_KEY) as AiModel) || defaultModel || "sonnet";
  });
  const provider = providerForModel(model);
  const [apiKey, setApiKey] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem(STORAGE_KEY) ?? "";
  });
  const [remember, setRemember] = useState(apiKey.length > 0);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim().length < 10) {
      toast.error("Paste a valid API key");
      return;
    }
    // Persist model choice regardless of remember — cheap.
    try { sessionStorage.setItem(STORAGE_MODEL_KEY, model); } catch { /* ignore */ }
    if (remember) {
      try { sessionStorage.setItem(STORAGE_KEY, apiKey); } catch { /* ignore */ }
    } else {
      try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }

    start(async () => {
      const t = toast.loading(`Fetching pages + asking ${provider === "claude" ? "Claude" : "OpenAI"} for an E-E-A-T assessment...`);
      try {
        const res = await fetch("/api/eeat/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider, apiKey: apiKey.trim(), projectId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "unknown error" }));
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }
        const { report } = await res.json();
        toast.success(
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="size-3 text-emerald-500" />
            E-E-A-T score: {report.overall_score}/100 — report saved.
          </span>,
          { id: t, duration: 5000 }
        );
        onOpenChange(false);
        onAnalyzed?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "E-E-A-T analysis failed", { id: t });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500/20 to-sky-500/20 text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="size-4" />
            </div>
            E-E-A-T analysis for {projectName}
          </DialogTitle>
          <DialogDescription>
            We fetch your homepage, about page, author pages, and privacy/contact pages,
            then asks your own Claude or OpenAI key to score them on Experience, Expertise,
            Authoritativeness, and Trust. The key is used once — never stored server-side.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <AiModelPicker value={model} onChange={setModel} />

          <div className="space-y-1.5">
            <Label htmlFor="eeat-key" className="flex items-center gap-1.5">
              <KeyRound className="size-3.5" />
              API key
            </Label>
            <Input
              id="eeat-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider === "claude" ? "sk-ant-..." : "sk-..."}
              autoComplete="off"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-3.5"
            />
            Remember for this session (wiped on tab close)
          </label>

          <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1.5">
            <div className="font-medium inline-flex items-center gap-1.5">
              <Sparkles className="size-3 text-emerald-500" />
              What you&apos;ll get
            </div>
            <ul className="text-muted-foreground space-y-0.5 pl-4 list-disc">
              <li>Overall E-E-A-T score 0-100</li>
              <li>Per-dimension breakdown (Experience / Expertise / Authority / Trust)</li>
              <li>Specific strengths + weaknesses with evidence</li>
              <li>Prioritized fix list — what to change first</li>
            </ul>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending || apiKey.length < 10} variant="brand">
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}
              Analyze
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
