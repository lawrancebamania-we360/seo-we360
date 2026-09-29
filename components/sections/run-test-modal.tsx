"use client";

// Ticket 10 (+ follow-up): the "Run AI-citation test" flow, now a 2-step wizard.
// Step 1 - pick engines, calls/question (N), and how many of the active
// questions each engine covers (budget control mid-test, e.g. "just 1 question
// to Gemini"). Step 2 - "Set up Personas": review/edit personas, see the buyer
// prompts that will run, add a question by hand, then confirm the run.

import { useEffect, useRef, useState } from "react";
import { Play, Check, Info, ArrowLeft } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EngineLogo } from "@/components/icons/engines/engine-logo";
import { ENGINE_LABEL, type AiEngine } from "@/lib/ai-citation/types";
import { PersonaReview } from "@/components/sections/persona-review";
import { BuyerPromptsCard } from "@/components/sections/buyer-prompts-card";
import type { PersonaRow } from "@/lib/data/personas";
import type { PromptRow } from "@/components/sections/ai-visibility-client";

// Same defaults run.ts's DEFAULT_N_BY_ENGINE uses - duplicated here since that
// file is server-only (pulls in the admin Supabase client) and can't be
// imported client-side. Keep these two in sync if the defaults ever change.
const DEFAULT_N: Record<AiEngine, number> = { chatgpt: 3, claude: 2, gemini: 1, google_aio: 1, perplexity: 1 };
const RUN_ENGINES: AiEngine[] = ["chatgpt", "claude", "gemini", "google_aio"];

export function RunTestModal({
  open, onClose, configuredEngines, engineBudgets, onConfirm, running,
  promptCount, projectId, personas, googleConnected, canManage, prompts,
  busy, pending, onGenPrompts, onAddPrompt, onEditPrompt,
}: {
  open: boolean;
  onClose: () => void;
  configuredEngines: { key: string; label: string }[];
  engineBudgets: Record<AiEngine, { capUsd: number | null; spentUsd: number | null }>;
  onConfirm: (engines: AiEngine[], nByEngine: Partial<Record<AiEngine, number>>, promptCapByEngine: Partial<Record<AiEngine, number>>) => void;
  running: boolean;
  /** Live count of active prompts for this category - the "questions" field's
   *  default + max, and what decides whether a chosen count counts as a cap. */
  promptCount: number;
  projectId: string;
  personas: PersonaRow[];
  googleConnected: boolean;
  canManage: boolean;
  prompts: PromptRow[];
  busy: "run" | "gen" | null;
  pending: boolean;
  onGenPrompts: () => void;
  onAddPrompt: (fields: { text: string; persona: string; topic: string }) => Promise<{ ok: boolean; error?: string }>;
  onEditPrompt: (promptId: string, fields: { text: string; persona: string; topic: string }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const configuredSet = new Set(configuredEngines.map((e) => e.key));
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<Set<AiEngine>>(() => new Set(RUN_ENGINES.filter((e) => configuredSet.has(e))));
  const [n, setN] = useState<Record<AiEngine, number>>(() => ({ ...DEFAULT_N }));
  const [qCap, setQCap] = useState<Record<AiEngine, number>>(() => Object.fromEntries(RUN_ENGINES.map((e) => [e, promptCount])) as Record<AiEngine, number>);

  // Reset to step 1 and re-seed the "questions" defaults only on the OPENING
  // edge - not on every promptCount change while already open (which would
  // wipe a cap the user just chose the moment a manual prompt bumps the total).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setStep(1);
      setQCap(Object.fromEntries(RUN_ENGINES.map((e) => [e, promptCount])) as Record<AiEngine, number>);
    }
    wasOpen.current = open;
  }, [open, promptCount]);

  const toggle = (e: AiEngine) => {
    if (!configuredSet.has(e)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(e)) next.delete(e); else next.add(e);
      return next;
    });
  };
  const setCount = (e: AiEngine, v: number) => setN((prev) => ({ ...prev, [e]: Math.min(7, Math.max(1, v)) }));
  const setQuestions = (e: AiEngine, v: number) => setQCap((prev) => ({ ...prev, [e]: Math.min(Math.max(promptCount, 1), Math.max(1, v)) }));

  const confirm = () => {
    const engines = RUN_ENGINES.filter((e) => selected.has(e));
    if (!engines.length || !prompts.length) return;
    // Only send a cap for an engine the user actually reduced below the live
    // total - otherwise a freshly-added manual question (or one generated after
    // this modal opened) is still included, since "no cap" means "every active
    // prompt" at run time.
    const promptCapByEngine: Partial<Record<AiEngine, number>> = {};
    for (const e of engines) if (qCap[e] < promptCount) promptCapByEngine[e] = qCap[e];
    onConfirm(engines, n, promptCapByEngine);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className={cn("sm:max-w-[620px]", step === 2 && "max-h-[85vh] overflow-y-auto")}>
        <DialogHeader>
          <DialogTitle className="text-[17px] leading-tight">{step === 1 ? "Run AI-citation test" : "Set up personas & prompts"}</DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <>
            <div className="space-y-1">
              {RUN_ENGINES.map((e) => {
                const configured = configuredSet.has(e);
                const budget = engineBudgets[e];
                const isOn = selected.has(e);
                const left = budget?.capUsd != null ? Math.max(0, budget.capUsd - (budget.spentUsd ?? 0)) : null;
                return (
                  <div key={e} className={cn(
                    "flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
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
                      <label className="text-[11px] text-muted-foreground" htmlFor={`q-${e}`}>questions</label>
                      <input
                        id={`q-${e}`}
                        type="number"
                        min={1}
                        max={Math.max(1, promptCount)}
                        value={qCap[e]}
                        onChange={(ev) => setQuestions(e, Number(ev.target.value) || 1)}
                        disabled={!configured || !isOn || promptCount === 0}
                        title={`Out of ${promptCount} active question${promptCount === 1 ? "" : "s"}`}
                        className="h-7 w-14 rounded-md border border-border bg-background px-1.5 text-center text-[12.5px] tabular-nums disabled:opacity-50"
                      />
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
                <strong className="text-foreground">Questions</strong> caps how many of the {promptCount} active prompts that engine is asked
                (useful for a small test run). <strong className="text-foreground">Calls/question</strong> repeats each question so the
                mention/citation <em>rate</em> is a reliable signal instead of one lucky or unlucky roll - engines that browse the web
                (ChatGPT, Gemini) vary more, so they default higher.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={running}>Cancel</Button>
              <Button variant="brand" onClick={() => selected.size > 0 && setStep(2)} disabled={running || selected.size === 0} className="gap-1.5">
                Set up Personas
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-4">
              <PersonaReview projectId={projectId} personas={personas} googleConnected={googleConnected} canManage={canManage} />

              <BuyerPromptsCard
                prompts={prompts}
                personas={personas}
                canManage={canManage}
                busy={busy}
                pending={pending}
                onGen={onGenPrompts}
                onAdd={onAddPrompt}
                onEdit={onEditPrompt}
              />
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="outline" onClick={() => setStep(1)} disabled={running} className="gap-1.5">
                <ArrowLeft className="size-3.5" /> Back
              </Button>
              <Button variant="brand" onClick={confirm} disabled={running || !prompts.length} className="gap-1.5">
                <Play className="size-3.5" /> {running ? "Starting…" : "Run citation"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
