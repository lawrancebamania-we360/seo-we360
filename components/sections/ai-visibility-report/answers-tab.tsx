"use client";

// Answers tab of the AI-Visibility report, moved here from
// ai-visibility-client.tsx and upgraded with the trust features: every answer
// card opens its FULL stored transcript in the evidence drawer (prompt, engine,
// timestamp, highlighted mentions, cited sources), each brand mention carries
// its sentiment tier chip, and "Browse all answers" pages through the whole
// batch (the tab itself shows the top 30 the report pre-computes).
//
// Two views over the same run: "By answer" (the original per-answer cards) and
// "By question" (the per-question Source Tracker - which sources win each
// question, and how that mix moves across check-ins).

import { useState } from "react";
import { ChevronRight, ListFilter, MessageSquare, Quote, Sparkles, TableProperties } from "lucide-react";
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
import { VisibilityHeatmaps } from "./visibility-heatmaps";

const pct = (x: number) => (x > 0 && x < 0.005 ? "<1%" : `${Math.round(x * 100)}%`);

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

  return (
    <div className="space-y-5">
      {getCited && (
        <GetCitedDialog open onOpenChange={(v) => { if (!v) setGetCited(null); }} projectId={projectId} question={getCited.question} persona={getCited.persona} />
      )}

      {/* Comp graph UI (lines 1408-1420) over the REAL persona/topic/heatmap data. */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <PersonaBreakdown report={report} openList={openList} />
        <TopicBreakdown report={report} openList={openList} />
      </div>
      <VisibilityHeatmaps report={report} />

      {/* The real Answers feature: per-answer transcripts + the per-question source tracker. */}
      <div className="space-y-3 border-t border-border pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">Sample AI answers</h2>
          <div className="inline-flex rounded-md border p-0.5 text-xs">
            <ViewToggle active={view === "answers"} onClick={() => setView("answers")} icon={MessageSquare}>
              By answer
            </ViewToggle>
            <ViewToggle active={view === "questions"} onClick={() => setView("questions")} icon={TableProperties}>
              By question ({report.questions.length})
            </ViewToggle>
          </div>
        </div>

        {view === "questions" && (
          <QuestionTrackerView
            questions={report.questions}
            projectId={projectId}
            canManage={canManage}
            competitors={competitors}
            projectLabel={report.projectLabel}
          />
        )}

        {view === "answers" && (
          <AnswerCards report={report} canManage={canManage}
            setGetCited={setGetCited} openList={openList} openTranscript={openTranscript} classifying={classifying} />
        )}
      </div>
    </div>
  );
}

// "By persona" (comp 1409) — how often each buyer persona hears your name, over
// REAL report.personas rates. Status is a UI label over the measured rate.
function personaStatus(rate: number): { label: string; className: string } {
  if (rate >= 0.8) return { label: "Strong", className: "bg-success/10 text-success-strong" };
  if (rate >= 0.5) return { label: "Good", className: "bg-warning/10 text-warning-strong" };
  return { label: "Needs work", className: "bg-error/10 text-error-strong" };
}

function PersonaBreakdown({ report, openList }: { report: AiVisibilityReport; openList: ReturnType<typeof useEvidence>["openList"] }) {
  return (
    <Card className="p-5 lg:p-6">
      <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">By persona</h2>
      <p className="mt-0.5 mb-3 text-[12.5px] text-muted-foreground">How often each buyer persona hears your name.</p>
      {!report.personas.length && <p className="text-xs text-muted-foreground">No persona data yet.</p>}
      <div className="-mx-2">
        {report.personas.map((p) => {
          const st = personaStatus(p.mentionRate);
          return (
            <button key={p.persona} type="button" onClick={() => openList({ persona: p.persona }, `Answers for "${p.persona}"`)}
              className="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left cursor-pointer transition-colors hover:bg-muted/40"
              title="See the actual AI answers behind this bar.">
              <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-muted text-[13px] font-bold text-muted-foreground">
                {p.persona.trim().charAt(0).toUpperCase() || "?"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[13.5px] font-bold text-foreground group-hover:underline underline-offset-2">{p.persona}</span>
                  <span className={cn("flex-none rounded-full px-2 py-0.5 text-[11px] font-bold", st.className)}>{st.label}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-success-500 transition-all" style={{ width: `${Math.max(2, Math.round(p.mentionRate * 100))}%` }} />
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-[13px] font-medium tabular-nums text-foreground">{pct(p.mentionRate)}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// "By topic" (comp 1410) — a 6-dot rating scaled from the REAL topic mention
// rate, with the measured count behind it.
function topicStatus(rate: number): { label: string; className: string } {
  if (rate >= 0.8) return { label: "Always", className: "bg-success/10 text-success-strong" };
  if (rate >= 0.5) return { label: "Usually", className: "bg-warning/10 text-warning-strong" };
  return { label: "Often missed", className: "bg-error/10 text-error-strong" };
}

function TopicBreakdown({ report, openList }: { report: AiVisibilityReport; openList: ReturnType<typeof useEvidence>["openList"] }) {
  return (
    <Card className="p-5 lg:p-6">
      <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">By topic</h2>
      <p className="mt-0.5 mb-3 text-[12.5px] text-muted-foreground">How often you&apos;re named, topic by topic.</p>
      {!report.topics.length && <p className="text-xs text-muted-foreground">No topic data yet.</p>}
      <div className="-mx-2">
        {report.topics.map((t) => {
          const st = topicStatus(t.mentionRate);
          const filled = Math.round(t.mentionRate * 6);
          const named = Math.round(t.mentionRate * t.n);
          return (
            <button key={t.topic} type="button" onClick={() => openList({ topic: t.topic }, `Answers about "${t.topic}"`)}
              className="group block w-full rounded-xl px-2 py-2.5 text-left cursor-pointer transition-colors hover:bg-muted/40"
              title="See the actual AI answers behind this rating.">
              <div className="mb-2 flex items-center justify-between gap-2.5">
                <span className="truncate text-sm font-bold text-foreground group-hover:underline underline-offset-2">{t.topic}</span>
                <span className={cn("flex-none rounded-full px-2 py-0.5 text-[11px] font-bold", st.className)}>{st.label}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex gap-1.5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <span key={i} className={cn("size-2.5 rounded-full", i < filled ? "bg-success-500" : "bg-muted")} />
                  ))}
                </div>
                <span className="whitespace-nowrap text-[12.5px] font-semibold text-muted-foreground">{named} of {t.n} answer{t.n === 1 ? "" : "s"}</span>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
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

// The original per-answer card list, unchanged - only lifted into its own
// component so the tab can switch between it and the question tracker.
function AnswerCards({ report, canManage, setGetCited, openList, openTranscript, classifying }: {
  report: AiVisibilityReport; canManage: boolean;
  setGetCited: (v: { question: string; persona: string | null }) => void;
  openList: ReturnType<typeof useEvidence>["openList"];
  openTranscript: ReturnType<typeof useEvidence>["openTranscript"];
  classifying: boolean;
}) {
  return (
    <div className="space-y-3">
      {!report.answers.length && <Card className="p-6 text-sm text-muted-foreground">No answers captured yet.</Card>}

      {report.answers.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {report.totalRuns > report.answers.length
              ? `Showing the top ${report.answers.length} of ${report.totalRuns} answers (mentions first). Click any card for the full transcript.`
              : "Click any card to read the full transcript."}
          </p>
          {report.totalRuns > report.answers.length && (
            <Button size="sm" variant="outline" className="gap-1.5"
              onClick={() => openList({}, "All answers in this run")}>
              <ListFilter className="size-3.5" /> Browse all {report.totalRuns} answers
            </Button>
          )}
        </div>
      )}

      {report.answers.map((a) => (
        <Card key={a.runId} role="button" tabIndex={0}
          onClick={() => openTranscript(a.runId)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openTranscript(a.runId); } }}
          className="p-4 space-y-2 cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/20">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">{engineLabel(a.engine)}</Badge>
            {a.persona && <Badge variant="outline">{a.persona}</Badge>}
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

      {/* See more at the bottom too (the top control scrolls away on long lists). */}
      {report.totalRuns > report.answers.length && (
        <div className="flex justify-center pt-1">
          <Button variant="outline" className="gap-1.5" onClick={() => openList({}, "All answers in this run")}>
            <ListFilter className="size-3.5" /> See all {report.totalRuns} answers
          </Button>
        </div>
      )}
    </div>
  );
}
