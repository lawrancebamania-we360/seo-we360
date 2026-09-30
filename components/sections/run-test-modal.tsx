"use client";

// Ticket 10 (+ follow-up): the "Run AI-citation test" flow, now a 2-step wizard.
// Step 1 - pick engines, calls/question (N), and how many of the active
// questions each engine covers (budget control mid-test, e.g. "just 1 question
// to Gemini"). Step 2 - "Set up Personas": review/edit personas, see the buyer
// prompts that will run, add a question by hand, then confirm the run.

import { useEffect, useRef, useState } from "react";
import { Play, Check, Info, ArrowLeft, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EngineLogo } from "@/components/icons/engines/engine-logo";
import { ENGINE_LABEL, type AiEngine } from "@/lib/ai-citation/types";
import { PersonaReview } from "@/components/sections/persona-review";
import { BuyerPromptsCard } from "@/components/sections/buyer-prompts-card";
import type { PersonaRow } from "@/lib/data/personas";
import type { PromptRow } from "@/components/sections/ai-visibility-client";

// Same defaults + pricing run.ts's DEFAULT_N_BY_ENGINE / COST_CENTS use -
// duplicated here since that file is server-only (pulls in the admin Supabase
// client) and can't be imported client-side. Keep all three in sync if they
// ever change. Tuned for a controlled ~$5 test run by default (Ticket 7):
// chatgpt/gemini browse the web so vary more call-to-call, claude doesn't,
// google_aio is on-demand and always forced to 1 sample server-side regardless
// of what's set here.
const DEFAULT_N: Record<AiEngine, number> = { chatgpt: 2, claude: 1, gemini: 2, google_aio: 1, perplexity: 1 };
const DEFAULT_QUESTIONS = 20;
// Directional per-call cost in cents - mirrors run.ts's COST_CENTS exactly.
const COST_CENTS: Record<AiEngine, number> = { chatgpt: 3, claude: 1, perplexity: 1, google_aio: 12, gemini: 3 };
const BUDGET_WARN_USD = 5;
const RUN_ENGINES: AiEngine[] = ["chatgpt", "claude", "gemini", "google_aio"];

export function RunTestModal({
  open, onClose, configuredEngines, engineBudgets, onConfirm, running,
  promptCount, projectId, personas, googleConnected, canManage, prompts,
  busy, pending, onGenPrompts, onAddPrompt, onEditPrompt, onDeletePrompt, onTogglePrompt,
}: {
  open: boolean;
  onClose: () => void;
  configuredEngines: { key: string; label: string }[];
  engineBudgets: Record<AiEngine, { capUsd: number | null; spentUsd: number | null }>;
  onConfirm: (engines: AiEngine[], nByEngine: Partial<Record<AiEngine, number>>, promptCapByEngine: Partial<Record<AiEngine, number>>, promptIds?: string[]) => void;
  running: boolean;
  /** Live count of ACTIVE prompts for this category - the "questions" field's
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
  onDeletePrompt: (promptId: string) => Promise<{ ok: boolean; error?: string }>;
  onTogglePrompt: (promptId: string, active: boolean) => Promise<{ ok: boolean; error?: string }>;
}) {
  const configuredSet = new Set(configuredEngines.map((e) => e.key));
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<Set<AiEngine>>(() => new Set(RUN_ENGINES.filter((e) => configuredSet.has(e))));
  const [n, setN] = useState<Record<AiEngine, number>>(() => ({ ...DEFAULT_N }));
  const [qCap, setQCap] = useState<Record<AiEngine, number>>(() => Object.fromEntries(RUN_ENGINES.map((e) => [e, Math.min(DEFAULT_QUESTIONS, promptCount)])) as Record<AiEngine, number>);
  const [costAck, setCostAck] = useState(false); // Ticket 7: must be checked to proceed once the estimate passes BUDGET_WARN_USD

  // Reset to step 1 and re-seed the "questions" defaults only on the OPENING
  // edge - not on every promptCount change while already open (which would
  // wipe a cap the user just chose the moment a manual prompt bumps the total).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setStep(1);
      setQCap(Object.fromEntries(RUN_ENGINES.map((e) => [e, Math.min(DEFAULT_QUESTIONS, promptCount)])) as Record<AiEngine, number>);
      setCostAck(false);
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
  const setCount = (e: AiEngine, v: number) => { setN((prev) => ({ ...prev, [e]: Math.min(7, Math.max(1, v)) })); setCostAck(false); };
  const setQuestions = (e: AiEngine, v: number) => { setQCap((prev) => ({ ...prev, [e]: Math.min(Math.max(promptCount, 1), Math.max(1, v)) })); setCostAck(false); };

  // Ticket 7: live estimate mirroring run.ts's estimateRunCostCents (per-engine
  // COST_CENTS x calls/question x questions), but honoring each engine's OWN
  // "questions" cap - the server-side helper only supports one uniform count.
  const engines = RUN_ENGINES.filter((e) => selected.has(e));
  const estCents = engines.reduce((s, e) => s + COST_CENTS[e] * n[e] * qCap[e], 0);
  const estUsd = estCents / 100;
  const overBudget = estUsd > BUDGET_WARN_USD;

  // Ticket 8: once any selected engine's "questions" is reduced below the full
  // active-prompt count, require an EXPLICIT hand-picked set instead of an
  // index-based cap - a controlled, repeatable test instead of whichever
  // prompts happen to sort first. The target size is the most restrictive
  // selected engine's cap; that same explicit list is then sent to every
  // engine (superseding their individual numeric caps - see confirm() below).
  const activePrompts = prompts.filter((p) => p.active);
  const cappedEngines = engines.filter((e) => qCap[e] < promptCount);
  const pickerTarget = cappedEngines.length ? Math.min(...cappedEngines.map((e) => qCap[e])) : null;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Reseed to the default first-N (same stable created_at order run.ts now
  // uses) whenever the target size changes, including turning the picker on -
  // a deliberate simplification: nudging the count resets the picks, rather
  // than trying to preserve a partial manual selection across a resize.
  const lastPickerTarget = useRef<number | null>(null);
  useEffect(() => {
    if (pickerTarget !== lastPickerTarget.current) {
      lastPickerTarget.current = pickerTarget;
      setSelectedIds(pickerTarget != null ? new Set(activePrompts.slice(0, pickerTarget).map((p) => p.id)) : new Set());
    }
    // activePrompts is derived from `prompts` each render - intentionally excluded
    // so a freshly-added manual prompt doesn't reseed an in-progress selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerTarget]);
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (pickerTarget != null && next.size < pickerTarget) next.add(id);
      return next;
    });
  };

  const confirm = () => {
    if (!engines.length || promptCount === 0 || (overBudget && !costAck)) return;
    if (pickerTarget != null) {
      if (selectedIds.size !== pickerTarget) return; // guard - UI shouldn't allow reaching here short
      onConfirm(engines, n, {}, [...selectedIds]);
      return;
    }
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
      {/* max-h/overflow always on, not just step 2 - Ticket 8's prompt picker can
          make step 1 taller than the viewport too, and without this the footer
          buttons (Cancel / Set up Personas) become unreachable. */}
      <DialogContent className={cn("sm:max-w-[620px] max-h-[85vh] overflow-y-auto")}>
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

            {pickerTarget != null && (
              <div className="rounded-lg border border-border p-3">
                <div className="mb-2 flex items-center justify-between text-[12.5px]">
                  <span className="font-semibold text-foreground">Choose exactly which prompts to test</span>
                  <span className={cn("tabular-nums font-medium", selectedIds.size === pickerTarget ? "text-muted-foreground" : "text-warning-600 dark:text-warning-400")}>
                    {selectedIds.size} / {pickerTarget} selected
                  </span>
                </div>
                <p className="mb-2 text-[11.5px] text-muted-foreground">
                  A reduced question count needs an explicit set so the test is the same run every time, not whichever prompts happen to be picked.
                </p>
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/20 p-1.5">
                  {activePrompts.map((p) => {
                    const checked = selectedIds.has(p.id);
                    const disabled = !checked && selectedIds.size >= pickerTarget;
                    return (
                      <label key={p.id} className={cn("flex items-start gap-2 rounded-md px-1.5 py-1 text-[12.5px]", disabled ? "opacity-40" : "cursor-pointer hover:bg-muted")}>
                        <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleSelect(p.id)} className="mt-0.5 size-3.5 shrink-0" />
                        <span className="text-foreground">{p.text}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className={cn(
              "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[12.5px]",
              overBudget ? "border-warning-300/60 bg-warning-500/10 text-warning-700 dark:text-warning-400" : "border-border bg-muted/30 text-muted-foreground",
            )}>
              <span>Estimated cost for this run</span>
              <span className="font-semibold tabular-nums">~${estUsd.toFixed(2)}</span>
            </div>

            {overBudget && (
              <label className="flex items-start gap-2 rounded-lg border border-warning-300/60 bg-warning-500/5 px-3 py-2.5 text-[12.5px] text-warning-700 dark:text-warning-400">
                <input type="checkbox" checked={costAck} onChange={(e) => setCostAck(e.target.checked)} className="mt-0.5 size-3.5 shrink-0" />
                <span className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {`This is above the recommended $${BUDGET_WARN_USD} test budget. I understand it'll cost more and want to run it anyway.`}
                </span>
              </label>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={running}>Cancel</Button>
              <Button
                variant="brand"
                onClick={() => selected.size > 0 && setStep(2)}
                disabled={running || selected.size === 0 || (overBudget && !costAck) || (pickerTarget != null && selectedIds.size !== pickerTarget)}
                className="gap-1.5"
              >
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
                onDelete={onDeletePrompt}
                onToggle={onTogglePrompt}
              />
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="outline" onClick={() => setStep(1)} disabled={running} className="gap-1.5">
                <ArrowLeft className="size-3.5" /> Back
              </Button>
              <Button variant="brand" onClick={confirm} disabled={running || promptCount === 0} className="gap-1.5">
                <Play className="size-3.5" /> {running ? "Starting…" : "Run citation"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
