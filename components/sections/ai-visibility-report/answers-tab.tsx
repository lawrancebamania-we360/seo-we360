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

      {/* Per-answer transcripts + the per-question source tracker. (The persona /
          topic breakdowns + visibility heatmaps now live on the Breakdowns tab.) */}
      <div className="space-y-3">
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
