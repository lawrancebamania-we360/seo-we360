"use client";

// Ticket 10 (+ follow-up): the "Run AI-citation test" flow, now a 2-step wizard.
// Step 1 - pick engines, calls/question (N), how many of the active questions
// each engine covers (budget control mid-test, e.g. "just 1 question to
// Gemini"), and the geographies to run from (each one repeats the whole run).
// Step 2 - "Set up Personas": review/edit personas, see the buyer prompts that
// will run, add a question by hand, then confirm the run.

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Check, Info, ArrowLeft, AlertTriangle, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MultiCombobox } from "@/components/ui/multi-combobox";
import { cn } from "@/lib/utils";
import { EngineLogo } from "@/components/icons/engines/engine-logo";
import { ENGINE_LABEL, type AiEngine } from "@/lib/ai-citation/types";
import {
  AIO_N, AIO_ONDEMAND_CAP, COST_CENTS, DEFAULT_N_BY_ENGINE, MAX_GEOGRAPHIES, MAX_RUN_TASKS, estimateRunMinutes,
} from "@/lib/ai-citation/run-config";
import { countryItems } from "@/lib/geo/countries";
import { PersonaReview } from "@/components/sections/persona-review";
import { BuyerPromptsCard } from "@/components/sections/buyer-prompts-card";
import type { PersonaRow } from "@/lib/data/personas";
import type { PromptRow } from "@/components/sections/ai-visibility-client";

const DEFAULT_QUESTIONS = 20;
const BUDGET_WARN_USD = 5;
// One run slice finishes about this many calls (see estimateRunMinutes); a bigger
// run needs several slices, so the dialog flags it amber.
const ONE_SLICE_CALLS = 40;
const RUN_ENGINES: AiEngine[] = ["chatgpt", "claude", "gemini", "google_aio"];

export function RunTestModal({
  open, onClose, configuredEngines, engineBudgets, onConfirm, running,
  promptCount, projectId, personas, googleConnected, canManage, prompts,
  busy, pending, onGenPrompts, onAddPrompt, onEditPrompt, onDeletePrompt, onTogglePrompt,
  projectCountry,
}: {
  open: boolean;
  onClose: () => void;
  configuredEngines: { key: string; label: string }[];
  engineBudgets: Record<AiEngine, { capUsd: number | null; spentUsd: number | null }>;
  /** `countries` is passed ONLY when the pick differs from the project default
   *  (exactly the project's own country), so a default run behaves as it always did. */
  onConfirm: (engines: AiEngine[], nByEngine: Partial<Record<AiEngine, number>>, promptCapByEngine: Partial<Record<AiEngine, number>>, promptIds?: string[], countries?: string[]) => void;
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
  onEditPrompt: (promptId: string, fields: { text: string; persona: string; topic: string }) => Promise<{ ok: boolean; error?: string; notice?: string }>;
  onDeletePrompt: (promptId: string) => Promise<{ ok: boolean; error?: string }>;
  onTogglePrompt: (promptId: string, active: boolean) => Promise<{ ok: boolean; error?: string }>;
  /** The project's own country as a valid ISO-2 code, or null when it has none.
   *  The Geography picker starts on it. */
  projectCountry: string | null;
}) {
  const configuredSet = new Set(configuredEngines.map((e) => e.key));
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<Set<AiEngine>>(() => new Set(RUN_ENGINES.filter((e) => configuredSet.has(e))));
  const [n, setN] = useState<Record<AiEngine, number>>(() => ({ ...DEFAULT_N_BY_ENGINE }));
  const [qCap, setQCap] = useState<Record<AiEngine, number>>(() => Object.fromEntries(RUN_ENGINES.map((e) => [e, Math.min(DEFAULT_QUESTIONS, promptCount)])) as Record<AiEngine, number>);
  const [countries, setCountries] = useState<string[]>(() => (projectCountry ? [projectCountry] : [])); // ISO-2, pick order; every one repeats the whole run
  const [costAck, setCostAck] = useState(false); // Ticket 7: must be checked to proceed once the estimate passes BUDGET_WARN_USD
  const countryOptions = useMemo(() => countryItems(), []);

  // Reset to step 1 and re-seed the "questions" defaults + geography only on the
  // OPENING edge - not on every promptCount change while already open (which would
  // wipe a cap the user just chose the moment a manual prompt bumps the total).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setStep(1);
      setQCap(Object.fromEntries(RUN_ENGINES.map((e) => [e, Math.min(DEFAULT_QUESTIONS, promptCount)])) as Record<AiEngine, number>);
      setCountries(projectCountry ? [projectCountry] : []);
      setCostAck(false);
    }
    wasOpen.current = open;
  }, [open, promptCount, projectCountry]);

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
  const changeCountries = (v: string[]) => { setCountries(v); setCostAck(false); };

  const engines = RUN_ENGINES.filter((e) => selected.has(e));

  // Ticket 8: once any selected engine's "questions" is reduced below the full
  // active-prompt count, require an EXPLICIT hand-picked set instead of an
  // index-based cap - a controlled, repeatable test instead of whichever
  // prompts happen to sort first. The target size is the most restrictive
  // selected engine's cap; that same explicit list is then sent to every
  // engine (superseding their individual numeric caps - see confirm() below).
  const activePrompts = prompts.filter((p) => p.active);
  // (Google AI Overviews is excluded: the server fixes it at AIO_ONDEMAND_CAP
  // questions whatever the field says, so it can't drive the "choose prompts" picker.)
  const cappedEngines = engines.filter((e) => e !== "google_aio" && qCap[e] < promptCount);
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

  // Run size + cost. The whole question set runs once per geography, so
  //   calls    = G x sum_e samples(e) x questions(e)
  //   estCents = G x sum_e COST_CENTS[e] x samples(e) x questions(e)
  // Google AI Overviews is special-cased the way the server runs it: always 1
  // sample (AIO_N) and never more than AIO_ONDEMAND_CAP questions. Each engine
  // honors its OWN "questions" cap, except that an explicit hand-picked set
  // (pickerTarget, Ticket 8) is sent to every engine and supersedes the caps.
  const geoCount = Math.max(1, countries.length);
  let callsPerGeo = 0;
  let centsPerGeo = 0;
  for (const e of engines) {
    // Google AI Overviews ignores the per-engine "questions" field: the server
    // always covers the first AIO_ONDEMAND_CAP of whatever set is being asked.
    const asked = e === "google_aio" ? (pickerTarget ?? promptCount) : (pickerTarget ?? qCap[e]);
    const questions = e === "google_aio" ? Math.min(asked, AIO_ONDEMAND_CAP) : asked;
    const samples = e === "google_aio" ? AIO_N : n[e];
    callsPerGeo += samples * questions;
    centsPerGeo += COST_CENTS[e] * samples * questions;
  }
  const calls = geoCount * callsPerGeo;
  const estCents = geoCount * centsPerGeo;
  const estUsd = estCents / 100;
  const overBudget = estUsd > BUDGET_WARN_USD;
  const noCountry = countries.length === 0;
  const overRunCap = calls > MAX_RUN_TASKS;
  const runBlocked = noCountry || overRunCap;

  const confirm = () => {
    if (!engines.length || promptCount === 0 || runBlocked || (overBudget && !costAck)) return;
    // Only send geographies when they differ from the project default (exactly its
    // own country), so a default run reaches the server unchanged.
    const geo = countries.length === 1 && countries[0] === projectCountry ? undefined : countries;
    if (pickerTarget != null) {
      if (selectedIds.size !== pickerTarget) return; // guard - UI shouldn't allow reaching here short
      onConfirm(engines, n, {}, [...selectedIds], geo);
      return;
    }
    // Only send a cap for an engine the user actually reduced below the live
    // total - otherwise a freshly-added manual question (or one generated after
    // this modal opened) is still included, since "no cap" means "every active
    // prompt" at run time.
    const promptCapByEngine: Partial<Record<AiEngine, number>> = {};
    for (const e of engines) if (e !== "google_aio" && qCap[e] < promptCount) promptCapByEngine[e] = qCap[e];
    onConfirm(engines, n, promptCapByEngine, undefined, geo);
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
                        {!configured ? "Not connected, add a key on Integrations" : budget?.capUsd != null ? `$${left!.toFixed(2)} left of $${budget.capUsd.toFixed(2)}` : "No budget set"}
                      </div>
                    </div>
                    <div className="flex flex-none items-center gap-1.5">
                      <label className="text-[11px] text-muted-foreground" htmlFor={`q-${e}`}>questions</label>
                      <input
                        id={`q-${e}`}
                        type="number"
                        min={1}
                        max={Math.max(1, promptCount)}
                        value={e === "google_aio" ? Math.min(Math.max(promptCount, 1), AIO_ONDEMAND_CAP) : qCap[e]}
                        onChange={(ev) => setQuestions(e, Number(ev.target.value) || 1)}
                        disabled={!configured || !isOn || promptCount === 0 || e === "google_aio"}
                        title={e === "google_aio"
                          ? `Google AI Overviews always asks the first ${AIO_ONDEMAND_CAP} questions, once each.`
                          : `Out of ${promptCount} active question${promptCount === 1 ? "" : "s"}`}
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
                        value={e === "google_aio" ? AIO_N : n[e]}
                        onChange={(ev) => setCount(e, Number(ev.target.value) || 1)}
                        disabled={!configured || !isOn || e === "google_aio"}
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

            <div className="space-y-1.5">
              <div>
                <label htmlFor="run-geography" className="text-[13px] font-semibold text-foreground">Geography</label>
                <p className="text-[11.5px] text-muted-foreground">
                  Questions are asked as if from each country. Every country runs the full question set.
                </p>
              </div>
              <MultiCombobox
                id="run-geography"
                ariaLabel="Geography"
                items={countryOptions}
                value={countries}
                onValueChange={changeCountries}
                min={1}
                max={MAX_GEOGRAPHIES}
                placeholder="Pick countries"
                searchPlaceholder="Search countries"
                emptyText="No matching country."
                disabled={running}
              />
              {noCountry && <p className="text-[11.5px] text-error-600 dark:text-error-400">Pick at least one country.</p>}
              {countries.length > 1 && (
                <p className="text-[11.5px] text-muted-foreground">
                  {`${countries.length} geographies = ${countries.length}x the runs and ${countries.length}x the cost.`}
                </p>
              )}
            </div>

            <div className={cn(
              "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[12.5px]",
              overBudget ? "border-warning-300/60 bg-warning-500/10 text-warning-700 dark:text-warning-400" : "border-border bg-muted/30 text-muted-foreground",
            )}>
              <span>Estimated cost for this run</span>
              <span className="font-semibold tabular-nums">~${estUsd.toFixed(2)}</span>
            </div>

            <div className={cn(
              "flex items-start gap-2 rounded-lg px-3 py-2 text-[12px] leading-relaxed",
              calls > ONE_SLICE_CALLS ? "border border-warning-300/60 bg-warning-500/10 text-warning-700 dark:text-warning-400" : "bg-muted/50 text-muted-foreground",
            )}>
              <Clock className="mt-0.5 size-3.5 shrink-0" />
              <p>{`${calls} calls, about ${estimateRunMinutes(calls)} min. Keep this tab open until it finishes.`}</p>
            </div>

            {overRunCap && (
              <div className="flex items-start gap-2 rounded-lg border border-error-300 bg-error-50 px-3 py-2.5 text-[12.5px] text-error-700 dark:border-error-900 dark:bg-error-950/30 dark:text-error-400">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <p>{`This run is ${calls} calls and one run can hold ${MAX_RUN_TASKS}. Lower the geographies, questions, or calls per question.`}</p>
              </div>
            )}

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
                disabled={running || selected.size === 0 || runBlocked || (overBudget && !costAck) || (pickerTarget != null && selectedIds.size !== pickerTarget)}
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
              <Button variant="brand" onClick={confirm} disabled={running || promptCount === 0 || runBlocked} className="gap-1.5">
                <Play className="size-3.5" /> {running ? "Starting…" : "Run citation"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
