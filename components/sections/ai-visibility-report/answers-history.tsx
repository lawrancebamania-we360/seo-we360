"use client";

// "By answer" view of one persona across EVERY check: an accordion with one group
// per check, newest first. The newest group is open by default; the others load
// their answers the first time they are opened. Each group pages on its own
// ("Show more", 25 at a time) and a check is never split across groups.
//
// The answers themselves come from fetchCheckAnswers (lib/ai-citation/answer-history.ts):
// the question as it was asked then, engine, geography, badges, a snippet and the
// cited links.

import { useEffect, useId, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchCheckAnswers } from "@/lib/actions/ai-visibility-answers";
import type { HistoryAnswer, PersonaHistoryCheck } from "@/lib/ai-citation/answer-history";
import { AnswerCard } from "./answer-card";

const FAILED = "Could not load these answers.";
/** Geography codes shown in a group header before "+N". */
const GEOS_SHOWN = 4;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function AnswersHistory({ projectId, category, persona, checks, canManage, onGetCited }: {
  projectId: string;
  category: string;
  persona: string;
  /** The persona's checks, newest first (PersonaHistoryCard.checks). */
  checks: PersonaHistoryCheck[];
  canManage: boolean;
  /** Open the "Get cited" flow for a question asked in this persona. */
  onGetCited: (question: string) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(checks[0] ? [checks[0].key] : []));
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  if (!checks.length) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        No answers yet for this persona. Run an AI Visibility check to see them here.
      </Card>
    );
  }

  const totalAnswers = checks.reduce((sum, c) => sum + c.answers, 0);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {plural(totalAnswers, "answer", "answers")} from {plural(checks.length, "check", "checks")}, newest first. Click any card for the full transcript.
      </p>
      {checks.map((check) => (
        <CheckGroup
          key={check.key}
          projectId={projectId}
          category={category}
          persona={persona}
          check={check}
          open={open.has(check.key)}
          onToggle={() => toggle(check.key)}
          canManage={canManage}
          onGetCited={onGetCited}
        />
      ))}
    </div>
  );
}

type GroupData = { items: HistoryAnswer[]; total: number; nextOffset: number | null; error: string | null };

function CheckGroup({ projectId, category, persona, check, open, onToggle, canManage, onGetCited }: {
  projectId: string;
  category: string;
  persona: string;
  check: PersonaHistoryCheck;
  open: boolean;
  onToggle: () => void;
  canManage: boolean;
  onGetCited: (question: string) => void;
}) {
  const panelId = useId();
  // null until the first page has landed (loading is derived from it, not set in the effect).
  const [data, setData] = useState<GroupData | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);

  // First page: when the group is open and has nothing yet (default-open group on
  // mount, any other the first time it opens, or after "Try again").
  useEffect(() => {
    if (!open || data !== null) return;
    let cancelled = false;
    fetchCheckAnswers({ project_id: projectId, category, persona, check_key: check.key, offset: 0 })
      .then((r) => {
        if (cancelled) return;
        setData(r.ok && r.data
          ? { items: r.data.items, total: r.data.total, nextOffset: r.data.nextOffset, error: null }
          : { items: [], total: 0, nextOffset: null, error: r.error ?? FAILED });
      })
      .catch(() => {
        if (!cancelled) setData({ items: [], total: 0, nextOffset: null, error: FAILED });
      });
    return () => { cancelled = true; };
  }, [open, data, projectId, category, persona, check.key]);

  function loadMore() {
    if (!data || data.nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    fetchCheckAnswers({ project_id: projectId, category, persona, check_key: check.key, offset: data.nextOffset })
      .then((r) => {
        if (!r.ok || !r.data) { setMoreError(r.error ?? FAILED); return; }
        const page = r.data;
        setData((prev) => {
          if (!prev) return prev;
          const seen = new Set(prev.items.map((i) => i.runId));
          return {
            items: [...prev.items, ...page.items.filter((i) => !seen.has(i.runId))],
            total: page.total,
            nextOffset: page.nextOffset,
            error: null,
          };
        });
      })
      .catch(() => setMoreError(FAILED))
      .finally(() => setLoadingMore(false));
  }

  const geos = check.geographies;
  const loading = open && data === null;

  return (
    <Card className="gap-0 p-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        {open ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
        <span className="text-sm font-semibold text-foreground">
          {formatDate(check.date)}{" "}
          <span className="font-normal text-muted-foreground">
            ({plural(check.answers, "answer", "answers")}, {check.mentioned} mentioned)
          </span>
        </span>
        {geos.length > 0 && (
          <span className="ml-auto flex flex-wrap items-center gap-1" title={`Geographies in this check: ${geos.join(", ")}`}>
            {geos.slice(0, GEOS_SHOWN).map((g) => (
              <span key={g} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-muted-foreground">{g}</span>
            ))}
            {geos.length > GEOS_SHOWN && (
              <span className="text-[11px] text-muted-foreground">+{geos.length - GEOS_SHOWN}</span>
            )}
          </span>
        )}
      </button>

      {open && (
        <div id={panelId} className="space-y-3 border-t border-border bg-muted/20 p-3 sm:p-4">
          {loading && (
            <div className="space-y-3" aria-busy="true" aria-label="Loading answers">
              {Array.from({ length: Math.min(3, Math.max(1, check.answers)) }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-xl" />
              ))}
            </div>
          )}

          {data?.error && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>{data.error}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => setData(null)}>Try again</Button>
            </div>
          )}

          {data && !data.error && data.items.length === 0 && (
            <p className="text-sm text-muted-foreground">No answers to show for this check.</p>
          )}

          {data && !data.error && data.items.map((a) => (
            <AnswerCard key={a.runId} answer={a} canManage={canManage} onGetCited={onGetCited} />
          ))}

          {data && !data.error && data.items.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                Showing <span className="font-mono tabular-nums">{data.items.length}</span> of <span className="font-mono tabular-nums">{data.total}</span>
              </span>
              <div className="flex items-center gap-2">
                {moreError && <span className="text-xs text-error-700 dark:text-error-400">{moreError}</span>}
                {data.nextOffset !== null && (
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={loadingMore} onClick={loadMore}>
                    {loadingMore && <Loader2 className="size-3.5 animate-spin" />}
                    Show more
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
