"use client";

// AI Visibility report UI. Tabs: Overview (composite + rates + model/persona/
// topic visibility), Competitors (leaderboard + the 4 heatmaps), Answers (real
// AI answers), Sources (who AI cites + a "get cited" nudge), Setup (the persona
// x topic prompts + generate/run). Reads the aggregated report from the server;
// run/generate go through metered server actions. Dash-free copy per project rule.

import { useState, useTransition, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Radar, Sparkles, Play, Loader2, ExternalLink, Wand2, Copy, AlertTriangle, RotateCw, CheckCircle2, SlidersHorizontal, Quote, Key, Lock, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ENGINE_LABEL, type AiEngine } from "@/lib/ai-citation/types";
import type { AiVisibilityReport } from "@/lib/ai-citation/report";
import type { Ga4AiReferral } from "@/lib/google/ga4";
import { generateAiVisibilityPrompts, runAiVisibilityNow, resumeAiVisibilityRun, upsertOutreach, scoreOutreachDomains, draftOutreach } from "@/lib/actions/ai-visibility";
import type { SourceGapReport, SourceGapRow } from "@/lib/ai-citation/source-gap";

type OutreachAction = "pitch" | "guest_post" | "get_listed" | "comment" | "other";
type OutreachStatus = "todo" | "drafted" | "posted";
type OutreachRow = { source_domain: string; action_type: string; status: string; notes: string | null; draft?: string | null; draft_subject?: string | null; draft_kind?: string | null };
const OUTREACH_STATUS_LABEL: Record<OutreachStatus, string> = { todo: "To-do", drafted: "Drafted", posted: "Posted" };
const OUTREACH_ACTION_LABEL: Record<OutreachAction, string> = { pitch: "Pitch", guest_post: "Guest post", get_listed: "Get listed", comment: "Comment", other: "Other" };
import { AiVisibilityScopeDrawer } from "@/components/sections/ai-visibility-scope-drawer";
import { EngineLogo } from "@/components/icons/engines/engine-logo";
import { PersonaReview } from "@/components/sections/persona-review";
import type { PersonaRow } from "@/lib/data/personas";
// Trust features (evidence drawer + sentiment + funnel matrix) live in their own
// folder; this file only mounts them. OverviewTab / AnswersTab moved there too.
import { AivEvidenceProvider } from "@/components/sections/ai-visibility-report/evidence-context";
import { OverviewTab } from "@/components/sections/ai-visibility-report/overview-tab";
import { BreakdownsTab } from "@/components/sections/ai-visibility-report/breakdowns-tab";
import { AnswersTab } from "@/components/sections/ai-visibility-report/answers-tab";

type Tab = "overview" | "breakdowns" | "answers" | "sources" | "setup";
type PromptRow = { id: string; text: string; persona: string | null; topic: string | null; tags: string[] | null; demand: string | null };

// Durable run-lifecycle state (P0-5), read from ai_citation_run_batches. Shape
// matches lib/ai-citation/run-state.ts LatestRunBatch (server-serialized). null
// before the migration is applied or before the project's first run.
type RunBatchState = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "timed_out";
  totalTasks: number;
  completedTasks: number;
  progress?: Record<string, { done: number; total: number }>;
  cited: number;
  mentioned: number;
  totalRuns: number;
  truncated: boolean;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
} | null;

const DEMAND_TONE: Record<string, string> = {
  high: "border-success-300 text-success-700",
  medium: "border-warning-300 text-warning-700",
  low: "border-muted-foreground/30 text-muted-foreground",
};


export function AiVisibilityClient({
  projectId, personas, googleConnected, report, prompts, configuredEngines, canManage, aiReferral, sourceGap, outreach, competitors, suggestedTopics, defaultKeyword, scope, initialRun,
}: {
  projectId: string;
  personas: PersonaRow[];
  googleConnected: boolean;
  report: AiVisibilityReport;
  prompts: PromptRow[];
  configuredEngines: { key: string; label: string }[];
  canManage: boolean;
  aiReferral: Ga4AiReferral;
  sourceGap: SourceGapReport;
  outreach: OutreachRow[];
  competitors: { id: string; name: string }[];
  suggestedTopics: string[];
  defaultKeyword: string;
  scope: { competitor_ids: string[]; topics: string[]; depth_n: number; runs_confirmed: number; target_keyword: string | null } | null;
  initialRun: RunBatchState;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"run" | "gen" | null>(null);
  const [setupOpen, setSetupOpen] = useState(false); // first-run setup drawer
  const [scopeOpen, setScopeOpen] = useState(false); // pre-run scope confirm (fades after a few runs)

  // Durable run state (P0-5). Seeded from the server on first paint, then kept
  // live by polling /run-status while a run is active. This - not the server
  // action's return value - is the source of truth for the run banner + button,
  // so the UI shows a truthful progress/failed/timed_out state even if the
  // trigger request itself 503'd or outlived the function limit.
  const [run, setRun] = useState<RunBatchState>(initialRun);
  const runActive = run?.status === "queued" || run?.status === "running";
  // Remember which terminal run we've already toasted so the poll loop toasts a
  // completion exactly once (not on every subsequent poll/render).
  const notifiedRunId = useRef<string | null>(null);
  // Guards the browser-driven continuation so only one resume slice is in flight
  // at a time (a slice runs up to ~38s; the 3s poll must not stack resumes).
  const resumingRef = useRef(false);

  // Fetch the latest durable run state. Returns the batch (or null).
  const fetchRunStatus = useCallback(async (): Promise<RunBatchState> => {
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-visibility/run-status`, { cache: "no-store" });
      if (!res.ok) return null;
      const j = (await res.json()) as { batch: RunBatchState };
      return j.batch ?? null;
    } catch {
      return null; // network blip - the poll interval retries
    }
  }, [projectId]);

  // Poll while a run is active. Stops as soon as the run reaches a terminal
  // state, then toasts the outcome once and refreshes the server data so the
  // report/pillars repaint. A stale 'running' row is reaped server-side on read,
  // so this loop can never spin forever - it converges to timed_out.
  useEffect(() => {
    if (!runActive) return;
    let cancelled = false;
    const tick = async () => {
      const latest = await fetchRunStatus();
      if (cancelled || !latest) return;
      setRun(latest);
      // Browser-driven continuation (replaces Klimb's drain cron): a run that
      // overflowed its ~38s slice PARKS as 'queued'. Run the next slice here; the
      // following poll reflects the new progress. Deduped server-side on
      // prompt×engine×run_index, so a resume can never double-run or double-bill.
      if (latest.status === "queued" && !resumingRef.current) {
        resumingRef.current = true;
        try { await resumeAiVisibilityRun({ project_id: projectId, batch_id: latest.id }); }
        catch { /* transient — the next tick retries */ }
        finally { resumingRef.current = false; }
        return; // let the next poll pick up the resumed slice's progress
      }
      const done = latest.status === "succeeded" || latest.status === "failed" || latest.status === "timed_out";
      if (done && notifiedRunId.current !== latest.id) {
        notifiedRunId.current = latest.id;
        if (latest.status === "succeeded") {
          toast.success(`Your AI report is ready — checked ${latest.totalRuns} AI answers, cited ${latest.cited}, mentioned ${latest.mentioned}.${latest.truncated ? " (partial - the weekly pass finishes the rest)" : ""}`);
        } else if (latest.status === "timed_out") {
          toast.error("The AI-citation run timed out. You can retry it.");
        } else {
          toast.error(latest.errorMessage ? `Run failed: ${latest.errorMessage.slice(0, 140)}` : "Run failed.");
        }
        router.refresh();
      }
    };
    const interval = setInterval(tick, 3000);
    void tick(); // fire immediately, don't wait 3s for the first poll
    return () => { cancelled = true; clearInterval(interval); };
  }, [runActive, fetchRunStatus, router, projectId]);

  const runNow = () => {
    setBusy("run");
    // Remember the run that existed BEFORE this click, so we can tell whether a
    // real batch row was created for THIS attempt (a newer id) vs. the action
    // bouncing off a pre-run guard (cooldown / lock / no-engines) that writes no
    // row and leaves the previous run as the latest.
    const priorRunId = run?.id ?? null;
    // Optimistically flip to a running banner so progress shows instantly. The
    // poll effect (started by runActive) takes over liveness immediately, so the
    // banner stays truthful whether or not this request's response comes back.
    notifiedRunId.current = null;
    setRun((prev) => ({
      id: `pending-${Date.now()}`, status: "running",
      totalTasks: prev?.totalTasks ?? 0, completedTasks: 0,
      cited: 0, mentioned: 0, totalRuns: 0, truncated: false,
      errorMessage: null, startedAt: new Date().toISOString(), completedAt: null,
      createdAt: new Date().toISOString(),
    }));
    start(async () => {
      const r = await runAiVisibilityNow({ project_id: projectId });
      setBusy(null);
      const latest = await fetchRunStatus();
      // Did this attempt actually create a durable run row? Only if the latest
      // row is different from the one that existed before the click.
      const hasNewRow = !!latest && latest.id !== priorRunId;

      if (r.ok) {
        setSetupOpen(false);
        setTab("overview");
        // Adopt the durable row; the poll effect reports the terminal outcome
        // (single source of truth, so no double toast). If it's already terminal,
        // refresh so the report repaints.
        setRun(latest);
        if (!latest || latest.status !== "running") router.refresh();
      } else if (hasNewRow) {
        // The run started then failed/timed out - a durable row exists; adopt it
        // and let the poll effect surface the failed/timed_out banner + Retry.
        setRun(latest);
      } else {
        // Pre-run guard rejection: no new row. Restore the prior run state (don't
        // adopt a stale older run as if it were this attempt) and surface the
        // reason directly.
        setRun((prev) => (prev && prev.id === priorRunId ? prev : latest && latest.id === priorRunId ? latest : null));
        toast.error(r.error ?? "Run failed");
      }
    });
  };
  const genPrompts = () => {
    setBusy("gen");
    start(async () => {
      const r = await generateAiVisibilityPrompts({ project_id: projectId });
      setBusy(null);
      if (r.ok) { toast.success(`Generated ${r.count ?? 0} buyer prompts across personas and topics.`); router.refresh(); }
      else toast.error(r.error ?? "Generation failed");
    });
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "breakdowns", label: "Breakdowns" },
    { key: "answers", label: "Sample answers" },
    { key: "sources", label: "Citation sources" },
  ];

  return (
    <AivEvidenceProvider projectId={projectId} canManage={canManage} unclassifiedCount={report.sentimentRollup.unclassified}>
    <div className="space-y-6">
      {/* Engines + actions row (comp lines 1282-1291): configured engine chips on
          the left, the primary actions on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ConfiguredBanner engines={configuredEngines} />
        {canManage && (
          <div data-tour-feature="aiv-actions" className="flex items-center gap-2">
            {/* Opens the setup drawer (persona review + prompt gen + run scope).
                Without this the drawer - and the persona-review UI it hosts - had
                no trigger once data existed, so buyers could never edit the
                AI-inferred personas the report is built on. */}
            <Button size="sm" variant="outline" onClick={() => setSetupOpen(true)} className="gap-1.5">
              <SlidersHorizontal className="size-3.5" />
              Personas &amp; setup
            </Button>
            <Button size="sm" variant="brand" disabled={pending || runActive} onClick={() => { if ((scope?.runs_confirmed ?? 0) >= 3 && prompts.length) runNow(); else setScopeOpen(true); }} className="gap-1.5">
              {busy === "run" || runActive ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
              {runActive ? "Running..." : "Run AI-citation test"}
            </Button>
          </div>
        )}
      </div>

      {/* Segmented sub-tabs (comp line 1294). */}
      <div data-tour-feature="aiv-tabs" className="inline-flex items-center gap-0.5 rounded-xl bg-muted p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-[10px] px-[18px] py-[9px] text-sm font-semibold transition-all",
              tab === t.key ? "bg-card text-foreground shadow-[0_1px_3px_rgba(20,20,40,0.12)]" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Durable run state (P0-5): real progress while running, a truthful
          failed / timed-out state with Retry, so a run never hides behind a
          spinner or looks "stuck running" after the request died. */}
      <RunStatusBanner run={run} canManage={canManage} onRetry={runNow} retryDisabled={pending || runActive} />

      <AiVisibilityScopeDrawer
        open={scopeOpen}
        onOpenChange={setScopeOpen}
        projectId={projectId}
        competitors={competitors}
        suggestedTopics={suggestedTopics}
        defaultKeyword={defaultKeyword}
        initial={scope ? { competitor_ids: scope.competitor_ids, target_keyword: scope.target_keyword } : null}
        onDone={() => { setTab("overview"); router.refresh(); }}
      />

      {!report.hasData ? (
        <FirstRunHero hasPrompts={prompts.length > 0} canManage={canManage} onGoSetup={() => setScopeOpen(true)} />
      ) : (
        <>
          {tab === "overview" && <OverviewTab report={report} aiReferral={aiReferral} configuredEngines={configuredEngines} sourceGap={sourceGap} projectId={projectId} canManage={canManage} onGoSources={() => setTab("sources")} onOpenSetup={() => setSetupOpen(true)} />}
          {tab === "breakdowns" && <BreakdownsTab report={report} configuredEngines={configuredEngines} />}
          {tab === "answers" && <AnswersTab report={report} projectId={projectId} canManage={canManage} competitors={competitors} />}
          {tab === "sources" && <SourcesTab report={report} projectId={projectId} canManage={canManage} sourceGap={sourceGap} outreach={outreach} />}
        </>
      )}

      {/* First-run setup as a right-side drawer (low-friction, not a wizard).
          The Setup tab is the same config once data exists. */}
      <Sheet open={setupOpen} onOpenChange={setSetupOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl lg:max-w-3xl">
          <SheetHeader>
            <SheetTitle>Set up AI Visibility</SheetTitle>
            <SheetDescription>Generate your buyer prompts, then run your first check. Takes about a minute.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <SetupTab projectId={projectId} personas={personas} googleConnected={googleConnected} prompts={prompts} engines={configuredEngines} canManage={canManage} busy={busy} pending={pending} onGen={genPrompts} onRun={runNow} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
    </AivEvidenceProvider>
  );
}

// Durable run-lifecycle banner (P0-5). Renders the persisted run state:
//   running  -> a progress bar (x of y) so a multi-minute run never hides behind
//               a bare spinner
//   timed_out-> honest "stopped responding" copy + a Retry (the fix for the
//               20-minute "running forever" symptom - a dead run is reaped to
//               this state, never left spinning)
//   failed   -> the real error reason + Retry (e.g. a provider/Apify failure)
//   succeeded but truncated -> a "partial, weekly pass finishes the rest" note
// A clean succeeded run renders nothing (the report itself is the result).
function RunStatusBanner({
  run, canManage, onRetry, retryDisabled,
}: { run: RunBatchState; canManage: boolean; onRetry: () => void; retryDisabled: boolean }) {
  if (!run) return null;

  if (run.status === "queued" || run.status === "running") {
    const pctDone = run.totalTasks > 0 ? Math.min(100, Math.round((run.completedTasks / run.totalTasks) * 100)) : null;
    return (
      <div className="rounded-xl border border-ember-200 dark:border-ember-900 bg-ember-50 dark:bg-ember-950/30 px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin text-ember-500 shrink-0" />
          <span className="font-medium">Your AI report is being written</span>
          <span className="text-muted-foreground">
            {run.totalTasks > 0 ? `${Math.min(run.completedTasks, run.totalTasks)} of ${run.totalTasks} checks` : "starting..."}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-ember-200/70 dark:bg-ember-900/50">
          {/* Indeterminate shimmer until we have a count; determinate once we do. */}
          <div
            className={cn("h-full rounded-full bg-ember-500 transition-all duration-500", pctDone == null && "w-1/3 animate-pulse")}
            style={pctDone == null ? undefined : { width: `${Math.max(4, pctDone)}%` }}
          />
        </div>
        {run.progress && Object.keys(run.progress).length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-0.5">
            {Object.entries(run.progress).map(([engine, pr]) => (
              <span key={engine} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <EngineLogo engine={engine as AiEngine} size={14} className={cn(pr.done < pr.total && "opacity-70")} />
                {ENGINE_LABEL[engine as AiEngine] ?? engine}
                <span className="tabular-nums font-medium text-foreground/80">{Math.min(pr.done, pr.total)}/{pr.total}</span>
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          This keeps running even if you leave the page. Results update here automatically.
        </p>
      </div>
    );
  }

  if (run.status === "timed_out") {
    return (
      <div className="rounded-xl border border-warning-300 dark:border-warning-900 bg-warning-50 dark:bg-warning-950/30 px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="size-4 text-warning-600 dark:text-warning-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 text-sm">
          <span className="font-medium">Your last run timed out.</span>{" "}
          <span className="text-muted-foreground">
            It stopped responding before finishing - usually the platform time limit or a provider (e.g. Google AI Overviews) failing. Nothing was charged for the incomplete work.
          </span>
        </div>
        {canManage && (
          <Button size="sm" variant="outline" disabled={retryDisabled} onClick={onRetry} className="gap-1.5 shrink-0">
            <RotateCw className="size-3.5" /> Retry
          </Button>
        )}
      </div>
    );
  }

  if (run.status === "failed") {
    return (
      <div className="rounded-xl border border-error-300 dark:border-error-900 bg-error-50 dark:bg-error-950/30 px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="size-4 text-error-600 dark:text-error-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 text-sm">
          <span className="font-medium">Your last run failed.</span>{" "}
          <span className="text-muted-foreground break-words">
            {run.errorMessage ? run.errorMessage.slice(0, 220) : "Something went wrong before results could be computed."}
          </span>
        </div>
        {canManage && (
          <Button size="sm" variant="outline" disabled={retryDisabled} onClick={onRetry} className="gap-1.5 shrink-0">
            <RotateCw className="size-3.5" /> Retry
          </Button>
        )}
      </div>
    );
  }

  // succeeded + truncated: partial result, be honest that the weekly pass finishes it.
  if (run.status === "succeeded" && run.truncated) {
    return (
      <div className="rounded-xl border border-info-200 dark:border-info-900 bg-info-50 dark:bg-info-950/30 px-4 py-3 flex items-start gap-3">
        <CheckCircle2 className="size-4 text-info-600 dark:text-info-400 shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Partial run complete.</span>{" "}
          The time budget cut this run short after {run.totalRuns} checks - the weekly pass finishes the rest automatically.
        </div>
      </div>
    );
  }

  return null; // clean success: the report below is the result
}

// Per-engine metadata for the connect-key modal (comp lines 1532-1550): the
// provider label + a mono-input placeholder shaped like that provider's key.
const ENGINE_KEY_META: Record<AiEngine, { provider: string; placeholder: string }> = {
  chatgpt: { provider: "OpenAI", placeholder: "sk-…" },
  claude: { provider: "Anthropic", placeholder: "sk-ant-api03-…" },
  perplexity: { provider: "Perplexity", placeholder: "pplx-…" },
  google_aio: { provider: "Google (via Apify)", placeholder: "" },
};

// Engine chips (comp lines 1284-1285): a pill per AI engine, tinted green when
// configured and muted with an "(add key)" hint when not. Real on/off comes from
// the configured-engines prop. An unconfigured, non-managed engine now opens the
// connect-key modal (comp #14). Google AI Overviews is a managed weekly pass, so
// it never asks for a key.
function ConfiguredBanner({ engines }: { engines: { key: string; label: string }[] }) {
  const all: AiEngine[] = ["chatgpt", "claude", "perplexity", "google_aio"];
  const onKeys = new Set(engines.map((e) => e.key));
  const [keyOpen, setKeyOpen] = useState<AiEngine | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] font-semibold text-muted-foreground">Engines:</span>
      {all.map((e) => {
        const on = onKeys.has(e);
        const managed = e === "google_aio";
        const clickable = !on && !managed; // unconfigured, real-key engines open the modal
        const chip = (
          <>
            <EngineLogo engine={e} size={14} className={cn(!on && "grayscale opacity-70")} />
            {ENGINE_LABEL[e]}
            {managed ? (
              <span className="text-xs font-medium text-muted-foreground">(weekly)</span>
            ) : on ? null : (
              <span className="text-xs font-medium text-primary">(add key)</span>
            )}
          </>
        );
        const cls = cn(
          "inline-flex items-center gap-2 rounded-full border px-[13px] py-1.5 text-[13px] font-semibold transition-colors",
          on ? "border-success/25 bg-success/10 text-success-strong" : "border-border bg-card text-muted-foreground",
          clickable && "cursor-pointer hover:bg-muted",
        );
        return clickable ? (
          <button key={e} type="button" onClick={() => setKeyOpen(e)} className={cls}>{chip}</button>
        ) : (
          <span key={e} className={cls}>{chip}</span>
        );
      })}
      <EngineKeyModal engine={keyOpen} onClose={() => setKeyOpen(null)} />
    </div>
  );
}

// Connect-key modal (comp lines 1532-1550): key-icon swatch, "Connect {engine}"
// + "{provider} API key" subtitle, a mono key input with a per-engine
// placeholder, the encryption reassurance, then Cancel / ember "Save & connect".
//
// BACKEND TODO: there is no per-project BYOK key store yet — engine keys are
// provisioned server-side via env (see lib/ai-citation/engines.ts). This modal
// is the intended UI; "Save & connect" surfaces that honestly rather than
// silently dropping the key. Wire it to a secrets table + re-read of
// configuredEngines() when the store lands.
function EngineKeyModal({ engine, onClose }: { engine: AiEngine | null; onClose: () => void }) {
  const meta = engine ? ENGINE_KEY_META[engine] : null;
  const label = engine ? ENGINE_LABEL[engine] : "";
  return (
    <Dialog open={!!engine} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Key className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-[17px] leading-tight">Connect {label}</DialogTitle>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">{meta?.provider} API key</p>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Paste your {meta?.provider} key so we can run citation tests on {label}. Used only for your checks.
          </p>
          <div className="space-y-1.5">
            <label className="block text-[12.5px] font-semibold text-slate-600 dark:text-foreground/80">API key</label>
            <Input className="bg-slate-50 font-mono text-[13.5px] dark:bg-muted/40" placeholder={meta?.placeholder} spellCheck={false} autoFocus />
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5 shrink-0" /> Encrypted at rest · never shared
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="brand"
            onClick={() => {
              toast("Bring-your-own-key isn't wired up yet — engine keys are set server-side for now.");
              onClose();
            }}
          >
            <Check className="size-4" /> Save &amp; connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FirstRunHero({ hasPrompts, canManage, onGoSetup }: { hasPrompts: boolean; canManage: boolean; onGoSetup: () => void }) {
  return (
    <Card className="p-8 text-center space-y-4">
      <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-warning-500/10">
        <Radar className="size-6 text-warning-600" />
      </div>
      <div className="space-y-1.5 max-w-xl mx-auto">
        <h2 className="text-xl font-bold">Find out if AI recommends you</h2>
        <p className="text-sm text-muted-foreground">
          We ask ChatGPT, Claude, Perplexity and Google AI the real questions your buyers type, as different personas, then show whether you get named, who beats you, and how to get cited.
        </p>
      </div>
      {canManage ? (
        <Button onClick={onGoSetup} className="gap-1.5">
          <Sparkles className="size-4" /> {hasPrompts ? "Run your first check" : "Set up and run your first check"}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Ask an owner or admin to run the first check.</p>
      )}
    </Card>
  );
}

function SourcesTab({ report, projectId, canManage, sourceGap, outreach }: {
  report: AiVisibilityReport; projectId: string; canManage: boolean; sourceGap: SourceGapReport; outreach: OutreachRow[];
}) {
  // Nothing was cited in the latest run → an informative empty state (which
  // engines return source links + what to do) instead of bare "no sources" lines.
  if (report.sources.length === 0) return <CitationSourcesEmpty />;

  return (
    <div className="space-y-6">
      {/* Section A: where AI pulls answers from today (existing). */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-info/10 text-info">
            <Quote className="size-3.5" />
          </span>
          <h3 className="font-heading text-[15px] font-bold text-foreground">Where AI pulls its answers from</h3>
        </div>
        <div className="space-y-0.5">
          {report.sources.map((s) => (
            <div key={s.domain} className={cn("flex items-center gap-3 rounded-lg px-2 py-2 -mx-2", s.isProject && "bg-warning-500/[0.07]")}>
              <span className={cn(
                "flex size-[26px] flex-none items-center justify-center rounded-lg text-[11px] font-bold",
                s.isProject ? "bg-warning-500/15 text-warning-strong" : "bg-muted text-muted-foreground",
              )}>{s.domain.trim().charAt(0).toUpperCase() || "?"}</span>
              <span className={cn("min-w-[100px] flex-1 truncate text-sm", s.isProject ? "font-semibold text-warning-strong" : "text-foreground")}>{s.domain}{s.isProject && " (you)"}</span>
              <div className="hidden h-[9px] w-[200px] max-w-[34vw] flex-none overflow-hidden rounded-full bg-muted sm:block">
                <div className={cn("h-full rounded-full", s.isProject ? "bg-warning-500" : "bg-ember-500")} style={{ width: `${Math.max(3, Math.round((s.count / (report.sources[0]?.count || 1)) * 100))}%` }} />
              </div>
              <span className="w-8 text-right font-mono text-[13.5px] font-medium tabular-nums text-foreground">{s.count}</span>
            </div>
          ))}
          {!report.sources.length && <p className="text-xs text-muted-foreground">No cited sources yet.</p>}
        </div>
      </Card>

      {/* Section B: the source GAP - third-party domains citing competitors but not
          you = ranked outreach targets, each trackable through todo/drafted/posted. */}
      <SourceGapSection projectId={projectId} canManage={canManage} sourceGap={sourceGap} outreach={outreach} competitorCount={report.competitors.length} />

      <Card className="p-5 space-y-3 border-success-300/40 bg-success-500/5">
        <h3 className="font-heading text-[15px] font-bold text-foreground">Not getting cited enough? Here is how to fix it</h3>
        <p className="text-sm text-muted-foreground">
          AI cites pages that clearly answer the question. Publish content that targets the prompts you lose, and tighten the pages AI already reads.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/sprint" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            Write content that gets cited <ExternalLink className="size-3.5" />
          </Link>
          <Link href="/dashboard/web-tasks" className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted">
            Fix page readiness <ExternalLink className="size-3.5" />
          </Link>
        </div>
      </Card>
    </div>
  );
}

// Shown when the latest run captured ZERO cited sources. Explains that only some
// engines return source links (so the user knows this isn't a bug) and what to do.
function CitationSourcesEmpty() {
  const rows: { engine: string; returns: boolean; note: string }[] = [
    { engine: "ChatGPT", returns: true, note: "web-search — returns the pages it cites" },
    { engine: "Perplexity", returns: true, note: "returns citations for every answer" },
    { engine: "Google AI Overviews", returns: true, note: "returns citations when an overview shows" },
    { engine: "Claude", returns: false, note: "answers without browsing — no source links" },
  ];
  return (
    <Card className="p-6 sm:p-8">
      <div className="mx-auto max-w-xl text-center">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-info/10 text-info">
          <Quote className="size-5" />
        </span>
        <h3 className="font-heading text-lg font-bold text-foreground">No citation sources captured yet</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          This tab lists the websites AI pulls its answers from — but it only fills in once an engine
          actually returns the links it cited. Your last check captured none.
        </p>
      </div>

      <div className="mx-auto mt-6 max-w-lg overflow-hidden rounded-xl border border-border">
        {rows.map((r, i) => (
          <div key={r.engine} className={cn("flex items-center gap-3 px-4 py-2.5", i < rows.length - 1 && "border-b border-border")}>
            <span className={cn(
              "flex size-5 flex-none items-center justify-center rounded-full text-[11px] font-bold",
              r.returns ? "bg-success-500/15 text-success-strong" : "bg-muted text-muted-foreground",
            )}>{r.returns ? "✓" : "—"}</span>
            <span className="w-40 flex-none text-sm font-semibold text-foreground">{r.engine}</span>
            <span className="text-[13px] text-muted-foreground">{r.note}</span>
          </div>
        ))}
      </div>

      <p className="mx-auto mt-6 max-w-lg text-center text-[13px] text-muted-foreground">
        Add a valid <span className="font-medium text-foreground">OpenAI key</span> (ChatGPT) — and optionally a{" "}
        <span className="font-medium text-foreground">Perplexity key</span> — then run a new AI-visibility check, and the
        domains AI cites will appear here.
      </p>
    </Card>
  );
}

// Ranked off-site outreach targets + the lightweight tracker. Each target domain
// cites a competitor but never us; "Track" upserts an ai_citation_outreach row the
// user then advances through To-do -> Drafted -> Posted (with an action type).
function SourceGapSection({ projectId, canManage, sourceGap, outreach, competitorCount }: {
  projectId: string; canManage: boolean; sourceGap: SourceGapReport; outreach: OutreachRow[]; competitorCount: number;
}) {
  const router = useRouter();
  // Local mirror of the persisted tracker, keyed by domain, for optimistic updates.
  // DB values are CHECK-constrained to the unions, so the cast from OutreachRow is safe.
  const [tracked, setTracked] = useState<Record<string, { action_type: OutreachAction; status: OutreachStatus }>>(
    () => Object.fromEntries(outreach.map((o) => [o.source_domain, { action_type: o.action_type as OutreachAction, status: o.status as OutreachStatus }])),
  );
  // Persisted/just-generated outreach drafts, keyed by domain (Bucket 2).
  const [drafts, setDrafts] = useState<Record<string, { kind: string; subject: string | null; body: string }>>(
    () => Object.fromEntries(
      outreach.filter((o) => o.draft).map((o) => [o.source_domain, { kind: o.draft_kind ?? "email", subject: o.draft_subject ?? null, body: o.draft as string }]),
    ),
  );
  const [saving, startSave] = useTransition();
  const [savingDomain, setSavingDomain] = useState<string | null>(null);
  // On-demand DA overrides (domain -> score) layered over the free read in sourceGap.
  // Only REAL scores land here - a null result must not shadow a cached value, and
  // domains we already tried (got nothing for) go in `attempted` so we don't re-bill
  // them on the next click.
  const [daMap, setDaMap] = useState<Record<string, number>>({});
  const [attempted, setAttempted] = useState<Set<string>>(() => new Set());
  const [scoring, startScore] = useTransition();
  // Effective DA for a target: an on-demand result wins, else the cached free read.
  const daFor = (t: SourceGapRow): number | null => (t.domain in daMap ? daMap[t.domain] : t.da);

  const save = (domain: string, url: string | null, patch: { action_type?: OutreachAction; status?: OutreachStatus }) => {
    const prev = tracked[domain];
    const next = { action_type: patch.action_type ?? prev?.action_type ?? "pitch", status: patch.status ?? prev?.status ?? "todo" } as const;
    setTracked((t) => ({ ...t, [domain]: next })); // optimistic
    setSavingDomain(domain);
    startSave(async () => {
      const r = await upsertOutreach({
        project_id: projectId, source_domain: domain, source_url: url,
        action_type: next.action_type, status: next.status,
      });
      setSavingDomain(null);
      if (!r.ok) {
        setTracked((t) => { const n = { ...t }; if (prev) n[domain] = prev; else delete n[domain]; return n; });
        toast.error(r.error ?? "Could not save that target.");
        return;
      }
      // Keep sibling surfaces + the server prop in sync (mirrors runNow/genPrompts).
      router.refresh();
    });
  };

  const targets = sourceGap.targets;
  // Targets still missing a DA AND not already tried this session - the batch "Get
  // authority scores" fetches these (metered). Capped to the action's batch limit.
  const unscored = targets.filter((t) => daFor(t) == null && !attempted.has(t.domain)).map((t) => t.domain);
  const BATCH = 12;
  const estCents = Math.max(1, Math.ceil((Math.min(unscored.length, BATCH) + 1) * 0.5));
  const scoreNow = () => {
    if (unscored.length === 0) return;
    const batch = unscored.slice(0, BATCH);
    startScore(async () => {
      const r = await scoreOutreachDomains({ project_id: projectId, domains: batch });
      if (!r.ok) { toast.error(r.error ?? "Could not fetch authority scores."); return; }
      // Merge only REAL scores (never let a null shadow a cached value); mark the
      // whole batch attempted so domains with no DA aren't re-billed next click.
      const real = Object.entries(r.scores ?? {}).filter(([, v]) => v != null) as [string, number][];
      setDaMap((m) => ({ ...m, ...Object.fromEntries(real) }));
      setAttempted((s) => { const n = new Set(s); for (const d of batch) n.add(d); return n; });
      toast.success(real.length > 0
        ? `Scored ${real.length} of ${batch.length} domain${batch.length === 1 ? "" : "s"}.`
        : `Checked ${batch.length} domain${batch.length === 1 ? "" : "s"} - no authority data available for them (often too new or restricted).`);
    });
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-heading text-[15px] font-bold text-foreground">Outreach targets: sites that cite rivals, not you</h3>
          <p className="text-xs text-muted-foreground mt-1">
            These third-party pages already feed AI answers and cite a competitor, but never cite you. Earn a mention on them and you land in the answer too.
          </p>
        </div>
        {canManage && targets.length > 0 && unscored.length > 0 && (
          <Button size="xs" variant="outline" onClick={scoreNow} disabled={scoring}
            title={`Fetches Domain Authority for up to ${BATCH} targets (about ${estCents} credit${estCents === 1 ? "" : "s"} this batch).`}>
            {scoring ? <Loader2 className="size-3 animate-spin" /> : <Radar className="size-3" />}
            Get authority scores
          </Button>
        )}
      </div>

      {competitorCount === 0 ? (
        <p className="text-xs text-muted-foreground">
          Add competitors to surface outreach gaps - these are sites that cite a rival but never cite you.{" "}
          <Link href="/dashboard/competitors" className="font-medium text-foreground underline underline-offset-2">Add competitors</Link>
        </p>
      ) : !sourceGap.hasData ? (
        <p className="text-xs text-muted-foreground">No third-party sources cited yet. Run an AI check first.</p>
      ) : targets.length === 0 ? (
        <p className="text-xs text-muted-foreground">No clear gaps: the sites AI cites for competitors already cite you too. Nice.</p>
      ) : (
        <div className="space-y-2">
          {targets.map((t) => (
            <OutreachTargetRow
              key={t.domain}
              target={t}
              da={daFor(t)}
              canManage={canManage}
              projectId={projectId}
              draft={drafts[t.domain] ?? null}
              tracked={tracked[t.domain] ?? null}
              busy={saving && savingDomain === t.domain}
              onAction={(action_type) => save(t.domain, t.url, { action_type, status: tracked[t.domain]?.status ?? "todo" })}
              onStatus={(status) => save(t.domain, t.url, { status })}
              onDrafted={(d, action_type) => {
                setDrafts((m) => ({ ...m, [t.domain]: d }));
                setTracked((tt) => ({ ...tt, [t.domain]: { action_type, status: "drafted" } }));
              }}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function OutreachTargetRow({ target, da, canManage, projectId, draft, tracked, busy, onAction, onStatus, onDrafted }: {
  target: SourceGapRow; da: number | null; canManage: boolean; projectId: string;
  draft: { kind: string; subject: string | null; body: string } | null;
  tracked: { action_type: OutreachAction; status: OutreachStatus } | null;
  busy: boolean; onAction: (a: OutreachAction) => void; onStatus: (s: OutreachStatus) => void;
  onDrafted: (d: { kind: string; subject: string | null; body: string }, action_type: OutreachAction) => void;
}) {
  const router = useRouter();
  const STATUS_FLOW: OutreachStatus[] = ["todo", "drafted", "posted"];
  const href = target.url || `https://${target.domain}`;
  const [open, setOpen] = useState(false);
  const [drafting, startDraft] = useTransition();

  const generate = () => {
    // Use the tracked action type if set; else infer (forum/Q&A -> comment, else pitch).
    const isForum = /\b(reddit|quora|stackexchange|stackoverflow|news\.ycombinator|medium|substack)\b/.test(target.domain);
    const action_type: OutreachAction = tracked?.action_type ?? (isForum ? "comment" : "pitch");
    startDraft(async () => {
      const r = await draftOutreach({ project_id: projectId, source_domain: target.domain, source_url: target.url, action_type });
      if (!r.ok || !r.draft) { toast.error(r.error ?? "Could not draft this outreach."); return; }
      onDrafted({ kind: r.draft.kind, subject: r.draft.subject, body: r.draft.body }, action_type);
      setOpen(true);
      router.refresh();
    });
  };

  const copy = async () => {
    if (!draft) return;
    const text = draft.subject ? `Subject: ${draft.subject}\n\n${draft.body}` : draft.body;
    try { await navigator.clipboard.writeText(text); toast.success("Draft copied."); }
    catch { toast.error("Couldn't copy - select the text and copy manually."); }
  };

  return (
    <div className="rounded-lg border p-2.5">
      <div className="flex items-center gap-3">
        <a href={href} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-sm font-medium hover:underline">
          {target.domain}
        </a>
        {da != null && (
          <span className="shrink-0 rounded-md bg-ember-500/10 px-1.5 py-0.5 text-xs font-medium text-ember-700 dark:text-ember-400" title="Domain Authority (0-100) - higher means a stronger, more trusted site.">
            DA {da}
          </span>
        )}
        <span className="shrink-0 text-xs text-muted-foreground">{target.citations} citation{target.citations === 1 ? "" : "s"}</span>
        {tracked && (
          <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-xs font-medium",
            tracked.status === "posted" ? "bg-success-500/15 text-success-700 dark:text-success-400"
              : tracked.status === "drafted" ? "bg-info-500/15 text-info-700 dark:text-info-400"
                : "bg-warning-500/15 text-warning-700 dark:text-warning-400")}>
            {OUTREACH_STATUS_LABEL[tracked.status] ?? tracked.status}
          </span>
        )}
      </div>
      {canManage && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {!tracked ? (
            // First touch: pick an action type, which also creates the tracker row.
            (Object.keys(OUTREACH_ACTION_LABEL) as OutreachAction[]).map((key) => (
              <button key={key} type="button" disabled={busy} onClick={() => onAction(key)}
                className="rounded-md border px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50">
                {OUTREACH_ACTION_LABEL[key]}
              </button>
            ))
          ) : (
            <>
              <span className="text-xs text-muted-foreground">{OUTREACH_ACTION_LABEL[tracked.action_type] ?? tracked.action_type}:</span>
              {STATUS_FLOW.map((s) => (
                <button key={s} type="button" disabled={busy} onClick={() => onStatus(s)}
                  className={cn("rounded-md border px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-50",
                    tracked.status === s ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
                  {OUTREACH_STATUS_LABEL[s]}
                </button>
              ))}
              {busy && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
            </>
          )}
          {/* Bucket 2: draft the actual post/email for this target. */}
          <span className="mx-0.5 h-3 w-px bg-border" aria-hidden />
          <button type="button" disabled={drafting} onClick={draft ? () => setOpen((o) => !o) : generate}
            className="inline-flex items-center gap-1 rounded-md border border-ember-300/50 bg-ember-500/5 px-2 py-0.5 text-xs font-medium text-ember-700 transition-colors hover:bg-ember-500/10 disabled:opacity-50 dark:text-ember-300">
            {drafting ? <Loader2 className="size-3 animate-spin" /> : <Wand2 className="size-3" />}
            {draft ? (open ? "Hide draft" : "View draft") : "Draft with AI"}
          </button>
          {draft && open && (
            <button type="button" disabled={drafting} onClick={generate}
              className="rounded-md border px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50">
              Regenerate
            </button>
          )}
        </div>
      )}

      {draft && open && (
        <div className="mt-2 rounded-lg border bg-muted/30 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              {draft.kind === "answer" ? "Suggested answer to post" : "Outreach email"}
            </span>
            <button type="button" onClick={copy} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              <Copy className="size-3" /> Copy
            </button>
          </div>
          {draft.subject && (
            <div className="text-xs"><span className="text-muted-foreground">Subject: </span><span className="font-medium">{draft.subject}</span></div>
          )}
          <div className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">{draft.body}</div>
          <p className="text-xs text-muted-foreground/70">Review and personalize before posting - genuine, helpful contributions get cited; spam gets removed.</p>
        </div>
      )}
    </div>
  );
}

function SetupTab({ projectId, personas, googleConnected, prompts, engines, canManage, busy, pending, onGen, onRun }: {
  projectId: string; personas: PersonaRow[]; googleConnected: boolean; prompts: PromptRow[]; engines: { key: string; label: string }[];
  canManage: boolean; busy: "run" | "gen" | null; pending: boolean; onGen: () => void; onRun: () => void;
}) {
  const byPersona = new Map<string, PromptRow[]>();
  for (const p of prompts) {
    const k = p.persona || "Other";
    byPersona.set(k, [...(byPersona.get(k) ?? []), p]);
  }
  return (
    <div className="space-y-5">
      <PersonaReview projectId={projectId} personas={personas} googleConnected={googleConnected} canManage={canManage} />

      {/* Buyer prompts (comp lines 1516-1525): white card, count pill, comp
          Regenerate / Run buttons, then one slate box per persona with the
          topic + demand pills beside each question. */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(20,20,40,0.04)]">
        <div className="mb-1.5 flex items-center gap-2.5">
          <span className="text-[15.5px] font-bold text-foreground">Your buyer prompts</span>
          <span className="rounded-full bg-ember-50 px-2.5 py-0.5 text-xs font-bold text-ember-600 dark:bg-ember-950/40 dark:text-ember-400">{prompts.length}</span>
        </div>
        <p className="mb-4 max-w-prose text-[13px] leading-relaxed text-muted-foreground">
          Real, human-sounding questions across personas and topics. We run these across every configured AI engine, sampled for a confidence band.
        </p>
        {canManage && (
          <div className="mb-4 flex flex-wrap gap-2.5">
            <Button variant="outline" size="sm" disabled={pending} onClick={onGen} className="gap-1.5">
              {busy === "gen" ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
              {prompts.length ? "Regenerate" : "Generate prompts"}
            </Button>
            <Button variant="brand" size="sm" disabled={pending || !prompts.length} onClick={onRun} className="gap-1.5">
              {busy === "run" ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
              Run check now
            </Button>
          </div>
        )}
        {!prompts.length && <p className="text-sm text-muted-foreground">No prompts yet. Generate a set to get started.</p>}
        <div className="space-y-3">
          {[...byPersona.entries()].map(([persona, list]) => (
            <div key={persona} className="rounded-xl border border-slate-150 bg-slate-50 p-4 dark:border-border dark:bg-muted/30">
              <div className="mb-3 text-[13px] font-bold text-foreground">{persona}</div>
              <ul className="space-y-3">
                {list.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2.5 text-sm">
                    {p.topic && (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground">{p.topic}</span>
                    )}
                    {p.demand && (
                      <span className={cn("inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11.5px] font-semibold capitalize", DEMAND_TONE[p.demand] ?? "border-border text-muted-foreground")} title="Estimated demand (directional)">
                        {p.demand}
                      </span>
                    )}
                    <span className="text-[13px] leading-relaxed text-foreground">{p.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(20,20,40,0.04)]">
        <h3 className="text-[15.5px] font-bold text-foreground">Engines</h3>
        <p className="mb-3.5 mt-1 text-[13px] leading-relaxed text-muted-foreground">ChatGPT runs today. Claude, Perplexity and Google AI light up automatically once their keys are added in settings.</p>
        <ConfiguredBanner engines={engines} />
      </div>
    </div>
  );
}
