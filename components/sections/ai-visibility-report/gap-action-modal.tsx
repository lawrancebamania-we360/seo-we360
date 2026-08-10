"use client";

// Shared "gap → decision-ready action" modal for the AI-Visibility section.
//
// Given a GapAction (a real page-diff gap or an inferred next-step), it:
//   1. explains the gap + fix, tagged honestly as a "Real gap" (measured) or a
//      "Likely reason" (inferred), with the competitor + example page when known;
//   2. classifies it to a board — technical/schema → Web Tasks, content → Blog
//      Sprint — and looks up whether a matching task already exists (via the
//      stable marker baked into the task on creation);
//   3. either DEEP-LINKS to the existing task (board `?task=<id>`), or offers to
//      ADD it to the board and then open it.
//
// Reuses the comp dialog chrome (rounded-[20px], custom header/body/footer) from
// new-task-dialog / blog-task-detail-dialog. @theme tokens only.

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { X, ExternalLink, Loader2, Wrench, PenLine, ArrowUpRight, CheckCircle2, Sparkles, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GAP_BOARD, gapTaskMarker, gapTaskKind, type GapAction } from "@/lib/ai-citation/gap-tasks";
import { findGapTask, createGapTask, type GapTaskRef } from "@/lib/actions/aiv-gap-tasks";

type Lookup =
  | { phase: "loading" }
  | { phase: "new" }
  | { phase: "tracked"; ref: GapTaskRef; justAdded: boolean };

export function GapActionModal({
  gap, projectId, canManage, onOpenChange,
}: {
  gap: GapAction | null;
  projectId: string;
  canManage: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const open = gap != null;
  const [lookup, setLookup] = useState<Lookup>({ phase: "loading" });
  const [pending, start] = useTransition();

  // Stable identity so the lookup runs once per distinct gap, not on every
  // parent re-render (the parent may hand us a fresh object each render).
  const gapId = gap ? `${gap.key}|${gap.competitor ?? ""}` : null;

  useEffect(() => {
    if (!gap) return;
    let cancelled = false;
    const run = async () => {
      setLookup({ phase: "loading" });
      const marker = gapTaskMarker(gap.key, gap.competitor);
      const ref = await findGapTask({ project_id: projectId, marker, kind: gapTaskKind(gap.route) });
      if (!cancelled) setLookup(ref ? { phase: "tracked", ref, justAdded: false } : { phase: "new" });
    };
    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gapId, projectId]);

  if (!gap) {
    return <Dialog open={open} onOpenChange={onOpenChange} />;
  }

  const board = GAP_BOARD[gap.route];
  const RouteIcon = gap.route === "web" ? Wrench : PenLine;

  const add = () => {
    start(async () => {
      const res = await createGapTask({
        project_id: projectId,
        key: gap.key,
        label: gap.label,
        fix: gap.fix,
        route: gap.route,
        real: gap.real,
        why: gap.why,
        competitor: gap.competitor ?? null,
        example_url: gap.exampleUrl ?? null,
      });
      if (!res.ok || !res.taskId) {
        toast.error(res.error ?? "Could not add this to the board.");
        return;
      }
      setLookup({
        phase: "tracked",
        ref: { id: res.taskId, kind: res.kind ?? gapTaskKind(gap.route), title: gap.label, status: null },
        justAdded: true,
      });
      toast.success(`Added to ${board.label}`);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="w-full max-w-[560px] gap-0 overflow-hidden rounded-[20px] p-0 sm:max-w-[560px]"
      >
        {/* header */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-[26px] py-[22px] dark:border-border">
          <div className="flex items-center gap-3">
            <span className="grid size-[38px] shrink-0 place-items-center rounded-[11px] bg-ember-50 text-primary dark:bg-ember-950/40">
              <RouteIcon className="size-5" strokeWidth={2} />
            </span>
            <div>
              <DialogTitle className="font-heading text-[17px] font-bold text-slate-900 dark:text-foreground">
                {gap.real ? "Close this citation gap" : "Act on this recommendation"}
              </DialogTitle>
              <DialogDescription className="text-[13px] text-slate-400">
                Turn it into {board.blurb} on {board.label}.
              </DialogDescription>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-slate-150 text-slate-500 dark:bg-muted"
          >
            <X className="size-[18px]" />
          </button>
        </div>

        {/* body */}
        <div className="flex max-h-[calc(88vh-150px)] flex-col gap-4 overflow-y-auto px-[26px] py-[22px]">
          {/* real / likely tag */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
                gap.real ? "bg-success-50 text-success-strong dark:bg-success-950/40" : "bg-warning/10 text-warning-strong",
              )}
            >
              <Sparkles className="size-3" />
              {gap.real ? "Real gap · measured from page diff" : "Likely reason · inferred"}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
              <RouteIcon className="size-3" />
              {board.label}
            </span>
          </div>

          {/* label + fix */}
          <div>
            <div className="text-[15px] font-bold text-foreground">{gap.label}</div>
            {gap.fix && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{gap.fix}</p>}
          </div>

          {/* why cited */}
          <div className="rounded-[12px] border border-ember-100 bg-ember-50/70 px-3.5 py-3 dark:border-ember-900 dark:bg-ember-950/30">
            <div className="mb-1 font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-ember-600 dark:text-ember-300">
              {gap.real ? "Why they get cited" : "Why this matters"}
            </div>
            <p className="text-[13px] leading-relaxed text-slate-700 dark:text-foreground/90">{gap.why}</p>
          </div>

          {/* competitor + example */}
          {(gap.competitor || gap.exampleUrl) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground">
              {gap.competitor && (
                <span>
                  From <span className="font-semibold text-foreground">{gap.competitor}</span>
                </span>
              )}
              {gap.exampleUrl && (
                <a
                  href={gap.exampleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-ember-600 hover:underline dark:text-ember-400"
                >
                  <ExternalLink className="size-3" /> See their page
                </a>
              )}
            </div>
          )}

          {/* tracked status */}
          {lookup.phase === "tracked" && (
            <div className="flex items-center gap-2 rounded-[12px] border border-success-200 bg-success-50/70 px-3.5 py-3 text-[13px] text-success-strong dark:border-success-900 dark:bg-success-950/30 dark:text-success-400">
              <CheckCircle2 className="size-4 shrink-0" />
              <span>
                {lookup.justAdded ? "Added to" : "Already tracked in"} {board.label}. Open it to assign, prioritise and work it.
              </span>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 px-[26px] py-[18px] dark:border-border">
          <Button
            type="button"
            variant="outline"
            className="h-auto rounded-[10px] px-[18px] py-[11px] text-sm font-semibold"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>

          {lookup.phase === "loading" && (
            <Button type="button" variant="brand" disabled className="h-auto rounded-[10px] px-[18px] py-[11px] text-sm font-bold">
              <Loader2 className="size-4 animate-spin" /> Checking your board…
            </Button>
          )}

          {lookup.phase === "tracked" && (
            <Button
              variant="brand"
              className="h-auto rounded-[10px] px-[18px] py-[11px] text-sm font-bold"
              render={
                <Link href={`${board.href}?task=${lookup.ref.id}`} onClick={() => onOpenChange(false)}>
                  Open in {board.label} <ArrowUpRight className="size-4" />
                </Link>
              }
            />
          )}

          {lookup.phase === "new" && canManage && (
            <Button
              type="button"
              variant="brand"
              onClick={add}
              disabled={pending}
              className="h-auto rounded-[10px] px-[18px] py-[11px] text-sm font-bold"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <RouteIcon className="size-4" />}
              Add to {board.label}
            </Button>
          )}

          {lookup.phase === "new" && !canManage && (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
              <Lock className="size-3.5" /> Ask an admin to add this
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
