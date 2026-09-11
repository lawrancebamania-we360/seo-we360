"use client";

// Ticket 10: the "Run AI-citation test" confirmation modal. Shows all 4 engines
// with a checkbox + estimated amount left (from the Integrations budget tracker,
// ticket 9), and an editable "calls per question" (N) per engine with a short
// explanation of why it's not 1 call per question (live-search variance -> a
// reliable rate instead of one noisy answer, not translation/re-verification).

import { useState } from "react";
import { Play, Check, Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EngineLogo } from "@/components/icons/engines/engine-logo";
import { ENGINE_LABEL, type AiEngine } from "@/lib/ai-citation/types";

// Same defaults run.ts's DEFAULT_N_BY_ENGINE uses - duplicated here since that
// file is server-only (pulls in the admin Supabase client) and can't be
// imported client-side. Keep these two in sync if the defaults ever change.
const DEFAULT_N: Record<AiEngine, number> = { chatgpt: 3, claude: 2, gemini: 1, google_aio: 1, perplexity: 1 };
const RUN_ENGINES: AiEngine[] = ["chatgpt", "claude", "gemini", "google_aio"];

export function RunTestModal({
  open, onClose, configuredEngines, engineBudgets, onConfirm, running,
}: {
  open: boolean;
  onClose: () => void;
  configuredEngines: { key: string; label: string }[];
  engineBudgets: Record<AiEngine, { capUsd: number | null; spentUsd: number | null }>;
  onConfirm: (engines: AiEngine[], nByEngine: Partial<Record<AiEngine, number>>) => void;
  running: boolean;
}) {
  const configuredSet = new Set(configuredEngines.map((e) => e.key));
  const [selected, setSelected] = useState<Set<AiEngine>>(() => new Set(RUN_ENGINES.filter((e) => configuredSet.has(e))));
  const [n, setN] = useState<Record<AiEngine, number>>(() => ({ ...DEFAULT_N }));

  const toggle = (e: AiEngine) => {
    if (!configuredSet.has(e)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(e)) next.delete(e); else next.add(e);
      return next;
    });
  };
  const setCount = (e: AiEngine, v: number) => setN((prev) => ({ ...prev, [e]: Math.min(7, Math.max(1, v)) }));

  const confirm = () => {
    const engines = RUN_ENGINES.filter((e) => selected.has(e));
    if (!engines.length) return;
    onConfirm(engines, n);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-[17px] leading-tight">Run AI-citation test</DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          {RUN_ENGINES.map((e) => {
            const configured = configuredSet.has(e);
            const budget = engineBudgets[e];
            const isOn = selected.has(e);
            const left = budget?.capUsd != null ? Math.max(0, budget.capUsd - (budget.spentUsd ?? 0)) : null;
            return (
              <div key={e} className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                isOn ? "border-primary/30 bg-primary/5" : "border-border",
                !configured && "opacity-50",
              )}>
                <button
                  type="button"
                  onClick={() => toggle(e)}
                  disabled={!configured}
                  aria-pressed={isOn}
                  className={cn(
                    "flex size-5 flex-none items-center justify-center rounded-md border-2 transition-colors",
                    isOn ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                    configured && "cursor-pointer",
                  )}
                >
                  {isOn && <Check className="size-3.5" />}
                </button>
                <EngineLogo engine={e} size={18} className={cn("shrink-0", !configured && "grayscale")} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold text-foreground">{ENGINE_LABEL[e]}</div>
                  <div className="text-[11.5px] text-muted-foreground">
                    {!configured ? "Not connected — add a key on Integrations" : budget?.capUsd != null ? `$${left!.toFixed(2)} left of $${budget.capUsd.toFixed(2)}` : "No budget set"}
                  </div>
                </div>
                <div className="flex flex-none items-center gap-1.5">
                  <label className="text-[11px] text-muted-foreground" htmlFor={`n-${e}`}>calls/question</label>
                  <input
                    id={`n-${e}`}
                    type="number"
                    min={1}
                    max={7}
                    value={n[e]}
                    onChange={(ev) => setCount(e, Number(ev.target.value) || 1)}
                    disabled={!configured || !isOn}
                    className="h-7 w-12 rounded-md border border-border bg-background px-1.5 text-center text-[12.5px] tabular-nums disabled:opacity-50"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-[12px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <p>
            Why more than 1 call per question: live-search answers vary call to call - one call is a noisy yes/no. Repeating the same
            question and looking at the mention/citation <em>rate</em> (e.g. "mentioned in 2 of 3") gives a reliable signal instead of
            one lucky or unlucky roll. Engines that browse the web (ChatGPT, Gemini) vary more, so they default higher.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={running}>Cancel</Button>
          <Button variant="brand" onClick={confirm} disabled={running || selected.size === 0} className="gap-1.5">
            <Play className="size-3.5" /> {running ? "Starting…" : `Run with ${selected.size} engine${selected.size === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
