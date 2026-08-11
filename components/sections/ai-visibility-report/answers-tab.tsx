"use client";

// Sample answers tab of the AI-Visibility report. Two levels:
//   1. A GRID of persona cards — each shows the persona, how many questions it
//      asked, and (per question) how often we360 was mentioned / cited.
//   2. Click a persona → that persona's answers only, with the By answer /
//      By question toggle (per-answer transcripts + the per-question source
//      tracker), both scoped to the chosen persona.
// Counts are per QUESTION (a question counts once regardless of how many engines
// answered it) — computed in report.ts (report.personas[].question*).

import { useState } from "react";
import { ChevronLeft, ChevronRight, ListFilter, MessageSquare, Quote, Sparkles, TableProperties, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ENGINE_LABEL, type AiEngine } from "@/lib/ai-citation/types";
import type { AiVisibilityReport } from "@/lib/ai-citation/report";
import { GetCitedDialog } from "@/components/sections/get-cited-dialog";
import { useEvidence } from "./evidence-context";
import { SentimentChip } from "./sentiment-chip";
import { QuestionTrackerView } from "./question-tracker-view";

const engineLabel = (e: string) => ENGINE_LABEL[e as AiEngine] ?? e;

type AnswersView = "answers" | "questions";

export function AnswersTab({ report, projectId, canManage, competitors }: {
  report: AiVisibilityReport; projectId: string; canManage: boolean;
  /** Tracked competitors, for the per-question brand-of-interest picker. */
  competitors: Array<{ id: string; name: string }>;
}) {
  const { openList, openTranscript, classifying } = useEvidence();
  const [getCited, setGetCited] = useState<{ question: string; persona: string | null } | null>(null);
  const [view, setView] = useState<AnswersView>("answers");
  const [persona, setPersona] = useState<string | null>(null);

  // Level 1 — the persona grid (default view).
  if (persona === null) {
    return <PersonaGrid report={report} onSelect={(p) => { setPersona(p); setView("answers"); }} />;
  }

  // Level 2 — one persona's answers.
  const stat = report.personas.find((p) => p.persona === persona);
  const personaAnswers = report.answers.filter((a) => a.persona === persona);
  const personaQuestions = report.questions.filter((q) => q.persona === persona);

  return (
    <div className="space-y-5">
      {getCited && (
        <GetCitedDialog open onOpenChange={(v) => { if (!v) setGetCited(null); }} projectId={projectId} question={getCited.question} persona={getCited.persona} />
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="outline" size="sm" className="mt-0.5 shrink-0 gap-1" onClick={() => setPersona(null)}>
            <ChevronLeft className="size-3.5" /> All personas
          </Button>
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-semibold leading-snug tracking-tight text-foreground">{persona}</h2>
            {stat && (
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Asked <span className="font-semibold text-foreground tabular-nums">{stat.questionCount}</span> ·
                Mentioned <span className="font-semibold text-success-strong tabular-nums">{stat.questionsMentioned}</span> ·
                Cited <span className="font-semibold text-info-700 tabular-nums">{stat.questionsCited}</span>
              </p>
            )}
          </div>
        </div>
        <div className="inline-flex shrink-0 rounded-md border p-0.5 text-xs">
          <ViewToggle active={view === "answers"} onClick={() => setView("answers")} icon={MessageSquare}>
            By answer
          </ViewToggle>
          <ViewToggle active={view === "questions"} onClick={() => setView("questions")} icon={TableProperties}>
            By question ({personaQuestions.length})
          </ViewToggle>
        </div>
      </div>

      {view === "questions" && (
        <QuestionTrackerView
          questions={personaQuestions}
          projectId={projectId}
          canManage={canManage}
          competitors={competitors}
          projectLabel={report.projectLabel}
        />
      )}

      {view === "answers" && (
        <AnswerCards
          answers={personaAnswers}
          totalForScope={stat?.n ?? personaAnswers.length}
          onBrowseAll={() => openList({ persona }, `All answers for "${persona}"`)}
          canManage={canManage}
          setGetCited={setGetCited}
          openTranscript={openTranscript}
          classifying={classifying}
        />
      )}
    </div>
  );
}

// ---- Level 1: persona grid --------------------------------------------------

function PersonaGrid({ report, onSelect }: { report: AiVisibilityReport; onSelect: (persona: string) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">Sample answers by persona</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Pick a buyer persona to read the questions it asked and the AI answers behind them. Counts are per question.
        </p>
      </div>

      {!report.personas.length ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <Users className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No persona data yet</p>
          <p className="text-[13px] text-muted-foreground">Run an AI Visibility check to populate persona answers.</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {report.personas.map((p) => {
            const coverage = p.questionCount ? p.questionsMentioned / p.questionCount : 0;
            return (
              <button
                key={p.persona}
                type="button"
                onClick={() => onSelect(p.persona)}
                className="group flex flex-col rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:border-primary/50 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-muted text-[13px] font-bold text-muted-foreground">
                    {p.persona.trim().charAt(0).toUpperCase() || "?"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-foreground group-hover:text-primary">
                      {p.persona}
                    </p>
                    {p.brandedCount > 0 && (
                      <span
                        title="These questions name we360 directly, so a mention is expected — not an unprompted recommendation. The real signal is the other personas, where AI names you without being told."
                        className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[10.5px] font-semibold text-warning-strong"
                      >
                        Names we360 · discount
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Stat label="Asked" value={p.questionCount} tone="neutral" />
                  <Stat label="Mentioned" value={p.questionsMentioned} tone="success" />
                  <Stat label="Cited" value={p.questionsCited} tone="info" />
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-success-500" style={{ width: `${Math.round(coverage * 100)}%` }} />
                  </div>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                    {Math.round(coverage * 100)}% named
                  </span>
                </div>

                <span className="mt-3 inline-flex items-center gap-0.5 text-xs font-medium text-primary">
                  Read answers <ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const STAT_TONE = {
  neutral: "text-foreground",
  success: "text-success-strong",
  info: "text-info-700",
} as const;

function Stat({ label, value, tone }: { label: string; value: number; tone: keyof typeof STAT_TONE }) {
  return (
    <div className="rounded-lg bg-muted/50 px-2 py-1.5 text-center">
      <div className={cn("font-mono text-base font-bold leading-none tabular-nums", STAT_TONE[tone])}>{value}</div>
      <div className="mt-1 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function ViewToggle({ active, onClick, icon: Icon, children }: {
  active: boolean; onClick: () => void; icon: typeof MessageSquare; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors cursor-pointer",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
      )}>
      <Icon className="size-3.5" />{children}
    </button>
  );
}

// ---- Level 2: per-answer cards (scoped to the chosen persona) ---------------

function AnswerCards({ answers, totalForScope, onBrowseAll, canManage, setGetCited, openTranscript, classifying }: {
  answers: AiVisibilityReport["answers"];
  totalForScope: number;
  onBrowseAll: () => void;
  canManage: boolean;
  setGetCited: (v: { question: string; persona: string | null }) => void;
  openTranscript: ReturnType<typeof useEvidence>["openTranscript"];
  classifying: boolean;
}) {
  const hasMore = totalForScope > answers.length;
  return (
    <div className="space-y-3">
      {!answers.length && (
        <Card className="p-6 text-sm text-muted-foreground">
          No sample answers in the preview for this persona.
          {totalForScope > 0 && (
            <> <button type="button" onClick={onBrowseAll} className="font-medium text-primary underline underline-offset-2">Browse all {totalForScope}</button> to read them.</>
          )}
        </Card>
      )}

      {answers.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {hasMore
              ? `Showing ${answers.length} of ${totalForScope} answers (mentions first). Click any card for the full transcript.`
              : "Click any card to read the full transcript."}
          </p>
          {hasMore && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={onBrowseAll}>
              <ListFilter className="size-3.5" /> Browse all {totalForScope} answers
            </Button>
          )}
        </div>
      )}

      {answers.map((a) => (
        <Card key={a.runId} role="button" tabIndex={0}
          onClick={() => openTranscript(a.runId)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openTranscript(a.runId); } }}
          className="p-4 space-y-2 cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/20">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">{engineLabel(a.engine)}</Badge>
            {a.topic && <Badge variant="outline">{a.topic}</Badge>}
            {a.mentioned ? <Badge className="bg-success-500/15 text-success-700 hover:bg-success-500/15">Mentioned{a.position ? ` #${a.position}` : ""}</Badge>
              : <Badge variant="outline" className="text-muted-foreground">Not mentioned</Badge>}
            {a.cited && <Badge className="bg-info-500/15 text-info-700 hover:bg-info-500/15">Cited</Badge>}
            <SentimentChip sentiment={a.sentiment} mentioned={a.mentioned} classifying={classifying} />
          </div>
          <p className="text-base font-bold text-foreground">{a.promptText}</p>
          {a.snippet && (
            <p className="flex gap-2.5 text-[13.5px] leading-relaxed text-muted-foreground">
              <Quote className="size-4 shrink-0 mt-0.5 text-slate-300" /><span className="line-clamp-3">{a.snippet}</span>
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {!a.cited && canManage && (
              <button type="button"
                onClick={(e) => { e.stopPropagation(); setGetCited({ question: a.promptText, persona: a.persona }); }}
                className="inline-flex items-center gap-1 rounded-md bg-success-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-success-700 cursor-pointer">
                <Sparkles className="size-3" /> Get cited
              </button>
            )}
            <span className="ml-auto inline-flex items-center gap-0.5 text-xs font-medium text-primary">
              Read the full answer <ChevronRight className="size-3" />
            </span>
          </div>
        </Card>
      ))}

      {hasMore && answers.length > 0 && (
        <div className="flex justify-center pt-1">
          <Button variant="outline" className="gap-1.5" onClick={onBrowseAll}>
            <ListFilter className="size-3.5" /> See all {totalForScope} answers
          </Button>
        </div>
      )}
    </div>
  );
}
