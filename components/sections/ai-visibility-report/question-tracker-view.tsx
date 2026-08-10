"use client";

// "By question" view of the Answers tab - the per-question Source Tracker.
//
// The default answer view is one card per ANSWER (question x engine x sample) for
// the latest run. This view pivots that to one row per QUESTION and adds the
// dimension the report was missing: which sources are winning THIS question, and
// whether that is shifting over time.
//
// The list itself costs nothing - it is computed inside getAiVisibilityReport
// from rows already loaded for the latest batch. Only the per-question history
// (table + trend) is fetched, and only when a question is expanded.

import { useMemo, useState, useTransition } from "react";
import {
  AlertTriangle, ChevronDown, ChevronRight, Clock, Loader2, Search, Target,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { QuestionHistory, QuestionRow } from "@/lib/ai-citation/question-tracker";
import { fetchQuestionHistory, setQuestionBrandOfInterest } from "@/lib/actions/ai-visibility-questions";
import { QuestionHistoryPanel } from "./question-history-panel";

/** Sentinel for "watch the project's own brand" - Base UI's Select needs a
 *  non-empty string value, so null cannot be used directly. */
const OWN_BRAND = "__own__";

export function QuestionTrackerView({ questions, projectId, canManage, competitors, projectLabel }: {
  questions: QuestionRow[];
  projectId: string;
  canManage: boolean;
  competitors: Array<{ id: string; name: string }>;
  projectLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [needsAttention, setNeedsAttention] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // promptId -> loaded history. Cached so collapsing and re-opening is free.
  const [histories, setHistories] = useState<Record<string, QuestionHistory>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  // Local mirror of each question's watched brand, for optimistic switching.
  const [brands, setBrands] = useState<Record<string, string | null>>(
    () => Object.fromEntries(questions.map((q) => [q.promptId, q.brandCompetitorId])),
  );
  const [, startTransition] = useTransition();

  const attentionCount = useMemo(
    () => questions.filter((q) => needsFixing(q)).length,
    [questions],
  );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return questions
      .filter((q) => !needle
        || q.text.toLowerCase().includes(needle)
        || (q.topSource?.domain ?? "").includes(needle)
        || (q.persona ?? "").toLowerCase().includes(needle)
        || (q.topic ?? "").toLowerCase().includes(needle))
      .filter((q) => !needsAttention || needsFixing(q))
      // Not-cited first (the work), then never-run, then by strongest source.
      .sort((a, b) =>
        Number(a.cited) - Number(b.cited)
        || Number(b.runs === 0) - Number(a.runs === 0)
        || (b.topSource?.pct ?? 0) - (a.topSource?.pct ?? 0));
  }, [questions, query, needsAttention]);

  async function toggle(promptId: string) {
    if (openId === promptId) { setOpenId(null); return; }
    setOpenId(promptId);
    if (histories[promptId]) return; // cached
    setLoadingId(promptId);
    try {
      const r = await fetchQuestionHistory({ project_id: projectId, prompt_id: promptId });
      if (r.ok && r.history) setHistories((h) => ({ ...h, [promptId]: r.history! }));
      else toast.error(r.error ?? "Could not load that question's history.");
    } catch {
      toast.error("Could not load that question's history.");
    } finally {
      setLoadingId(null);
    }
  }

  function changeBrand(promptId: string, raw: string) {
    const competitorId = raw === OWN_BRAND ? null : raw;
    const prev = brands[promptId] ?? null;
    setBrands((b) => ({ ...b, [promptId]: competitorId }));
    startTransition(async () => {
      const r = await setQuestionBrandOfInterest({ project_id: projectId, prompt_id: promptId, competitor_id: competitorId });
      if (!r.ok) {
        setBrands((b) => ({ ...b, [promptId]: prev }));
        toast.error(r.error ?? "Could not change the brand of interest.");
        return;
      }
      // The whole history re-reads against the new brand (detection already
      // happened for both), so drop the cache and reload if it is open.
      setHistories((h) => { const c = { ...h }; delete c[promptId]; return c; });
      if (openId === promptId) {
        const fresh = await fetchQuestionHistory({ project_id: projectId, prompt_id: promptId });
        if (fresh.ok && fresh.history) setHistories((h) => ({ ...h, [promptId]: fresh.history! }));
      }
    });
  }

  if (!questions.length) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        No tracked questions yet. Add them in the Setup tab, then run a check to start building history.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search questions, sources, personas…" className="h-8 pl-8 text-sm" />
        </div>
        <button type="button" onClick={() => setNeedsAttention((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer",
            needsAttention ? "border-warning-400 bg-warning-500/10 text-warning-700 dark:text-warning-400" : "hover:bg-muted",
          )}
          title="Questions where the watched brand was not cited, or that the latest run did not reach.">
          <AlertTriangle className="size-3.5" /> Needs attention ({attentionCount})
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        One row per tracked question, showing which source won the most citations in the latest check-in and whether the brand
        you are watching got cited. Open a question for its full check-in history and source trend.
      </p>

      {!shown.length && (
        <Card className="p-6 text-sm text-muted-foreground">No questions match that filter.</Card>
      )}

      {shown.map((q) => {
        const open = openId === q.promptId;
        const watched = brands[q.promptId] ?? null;
        const brandLabel = watched
          ? (competitors.find((c) => c.id === watched)?.name ?? "Competitor")
          : projectLabel;
        return (
          <Card key={q.promptId} className="overflow-hidden">
            <button type="button" onClick={() => toggle(q.promptId)}
              className="flex w-full items-start gap-3 p-4 text-left transition-colors cursor-pointer hover:bg-muted/20">
              {open ? <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                : <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-medium">{q.text}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline" className="gap-1">
                    <Target className="size-3" />{brandLabel}
                  </Badge>
                  {q.persona && <Badge variant="outline">{q.persona}</Badge>}
                  {q.topic && <Badge variant="outline">{q.topic}</Badge>}

                  {q.runs === 0 ? (
                    <Badge variant="outline" className="gap-1 text-muted-foreground"
                      title="The latest run did not reach this question - a run that hits its time budget drains across later ticks.">
                      <Clock className="size-3" /> Not in the latest check-in
                    </Badge>
                  ) : q.cited ? (
                    <Badge className="bg-success-500/15 text-success-700 hover:bg-success-500/15 dark:text-success-400">Cited</Badge>
                  ) : q.mentioned ? (
                    <Badge className="bg-warning-500/15 text-warning-700 hover:bg-warning-500/15 dark:text-warning-400">Named only</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">Not cited</Badge>
                  )}

                  {q.overdue && (
                    <Badge variant="outline" className="gap-1 border-warning-400 text-warning-700 dark:text-warning-400"
                      title={`Last checked ${q.daysSinceCheck} days ago.`}>
                      <Clock className="size-3" /> Overdue
                    </Badge>
                  )}

                  {q.topSource ? (
                    <span className="text-muted-foreground">
                      Top source <span className="font-medium text-foreground">{q.topSource.domain}</span> · {q.topSource.pct}%
                    </span>
                  ) : q.runs > 0 ? (
                    <span className="text-muted-foreground">No sources cited</span>
                  ) : null}
                </div>
              </div>
            </button>

            {open && (
              <div className="border-t bg-muted/10 p-4 space-y-4">
                {canManage && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Brand of interest</span>
                    <Select value={watched ?? OWN_BRAND} onValueChange={(v) => v && changeBrand(q.promptId, v as string)}>
                      <SelectTrigger size="sm" className="min-w-[12rem]">
                        <SelectValue>
                          {(v) => (v === OWN_BRAND || !v ? projectLabel : competitors.find((c) => c.id === v)?.name ?? "Competitor")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={OWN_BRAND}>{projectLabel} (your brand)</SelectItem>
                        {competitors.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">
                      Only tracked competitors — those are the brands already detected in the stored answers, so history switches instantly.
                    </span>
                  </div>
                )}

                {loadingId === q.promptId ? (
                  <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                    {/* Plain lucide spinner, not components/ui/spinner - that
                        component ships with the Ember revamp and is not on main. */}
                    <Loader2 className="size-4 animate-spin" /> Loading check-in history…
                  </div>
                ) : histories[q.promptId] ? (
                  <QuestionHistoryPanel history={histories[q.promptId]} projectId={projectId} canManage={canManage} />
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">Could not load this question&apos;s history.</p>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/** Worth acting on: the watched brand was not cited, the question is overdue for
 *  a re-check, or the latest run never reached it. */
function needsFixing(q: QuestionRow): boolean {
  return q.runs === 0 || !q.cited || q.overdue;
}
