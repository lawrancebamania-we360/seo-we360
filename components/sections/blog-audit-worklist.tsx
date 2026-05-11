"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  RefreshCw, GitMerge, Trash2, Plus, Loader2,
  ExternalLink, X, AlertCircle, ChevronRight, TrendingUp, TrendingDown, Minus,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { initials } from "@/lib/ui-helpers";
import { createTaskFromAuditFinding, dismissAuditFinding, undismissAuditFinding } from "@/lib/actions/blog-audit";
import { getTaskById } from "@/lib/actions/tasks";
import { BlogTaskDetailDialog } from "@/components/sections/blog-task-detail-dialog";
import type { BlogAuditFinding, BlogAuditDecision, AuditFindingStatus } from "@/lib/data/blog-audit";
import type { Profile } from "@/lib/types/database";
import type { TaskWithAssignee } from "@/lib/data/tasks";
import type { UrlMetric, UrlTopQuery, UrlTopReferrer } from "@/lib/types/url-metrics";

// ===== Display labels =====
// Internal decision names stay "prune" / "refresh" / "merge" / "keep" in the
// DB (no migration), but the UI uses plain English.
export const DECISION_LABEL: Record<BlogAuditDecision, string> = {
  prune: "Delete",
  merge: "Merge",
  refresh: "Update",
  keep: "Keep",
};

interface Props {
  findings: BlogAuditFinding[];
  members: Pick<Profile, "id" | "name" | "email" | "avatar_url">[];
  canEdit: boolean;
  projectId: string;
}

type DecisionFilter = "all" | "refresh" | "merge" | "prune";

export function BlogAuditWorklist({ findings, members, canEdit, projectId }: Props) {
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>("all");
  const [createFor, setCreateFor] = useState<BlogAuditFinding | null>(null);
  const [detailFor, setDetailFor] = useState<BlogAuditFinding | null>(null);
  const [openedTask, setOpenedTask] = useState<TaskWithAssignee | null>(null);
  // Track which specific task is loading so only THAT row's button shows
  // the spinner, not every Open-task button on the page.
  const [openingTaskId, setOpeningTaskId] = useState<string | null>(null);

  // The audit page is a worklist. We show ONLY findings that need a task
  // created today (status = open or stale). Items with an in-flight task,
  // a recently-published task, or that were dismissed simply don't appear
  // here — once a task exists, the finding's life moves to Blog Sprint.
  const actionable = useMemo(
    () => findings.filter((f) => f.status === "open" || f.status === "stale"),
    [findings],
  );

  const counts = useMemo(() => ({
    total: actionable.length,
    refresh: actionable.filter((f) => f.decision === "refresh").length,
    merge: actionable.filter((f) => f.decision === "merge").length,
    prune: actionable.filter((f) => f.decision === "prune").length,
  }), [actionable]);

  const visible = useMemo(() => {
    if (decisionFilter === "all") return actionable;
    return actionable.filter((f) => f.decision === decisionFilter);
  }, [actionable, decisionFilter]);

  const openTask = (taskId: string) => {
    setOpeningTaskId(taskId);
    getTaskById(taskId)
      .then((task) => { if (task) setOpenedTask(task as TaskWithAssignee); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load task"))
      .finally(() => setOpeningTaskId(null));
  };

  return (
    <div className="space-y-4">
      {/* Single filter row — decision type only. No status tabs, no
          in-flight / dismissed views. Tasks that exist live in Blog Sprint;
          the audit page strictly shows what still needs a task created. */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterChip label={`All · ${counts.total}`} active={decisionFilter === "all"} onClick={() => setDecisionFilter("all")} />
        <FilterChip label={`Update · ${counts.refresh}`} active={decisionFilter === "refresh"} onClick={() => setDecisionFilter("refresh")} tone="violet" />
        <FilterChip label={`Merge · ${counts.merge}`} active={decisionFilter === "merge"} onClick={() => setDecisionFilter("merge")} tone="amber" />
        <FilterChip label={`Delete · ${counts.prune}`} active={decisionFilter === "prune"} onClick={() => setDecisionFilter("prune")} tone="rose" />
        <div className="ml-auto text-xs text-muted-foreground">
          {actionable.length === 0
            ? "All clear — every flagged URL already has a task in Sprint or is performing fine."
            : `${visible.length} of ${actionable.length} need a task`}
        </div>
      </div>

      {visible.length === 0 ? (
        <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">
          {actionable.length === 0
            ? "Nothing to do here. New audit findings will show up after the next morning sync."
            : "No findings match the current filter."}
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="grid grid-cols-[1fr_90px_110px_110px_180px_30px] gap-2 px-4 py-3 border-b bg-muted/30 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            <div>URL · Specific issue</div>
            <div className="text-right">Clicks</div>
            <div className="text-right">Impressions</div>
            <div className="text-right">Sessions</div>
            <div className="text-right">Action</div>
            <div></div>
          </div>
          <div className="divide-y">
            {visible.map((f) => (
              <FindingRow
                key={`${f.url}::${f.decision}`}
                finding={f}
                canEdit={canEdit}
                projectId={projectId}
                onCreate={() => setCreateFor(f)}
                onOpenTask={openTask}
                onOpenDetail={() => setDetailFor(f)}
                isOpeningThis={openingTaskId === f.task?.id}
              />
            ))}
          </div>
        </Card>
      )}

      {createFor && (
        <CreateTaskDialog
          finding={createFor}
          members={members}
          projectId={projectId}
          open={!!createFor}
          onOpenChange={(o) => !o && setCreateFor(null)}
        />
      )}

      {detailFor && (
        <FindingDetailDialog
          finding={detailFor}
          canEdit={canEdit}
          projectId={projectId}
          open={!!detailFor}
          onOpenChange={(o) => !o && setDetailFor(null)}
          onCreate={() => { setDetailFor(null); setCreateFor(detailFor); }}
          onOpenTask={(id) => { setDetailFor(null); openTask(id); }}
        />
      )}

      {openedTask && (
        <BlogTaskDetailDialog
          task={openedTask}
          open={!!openedTask}
          onOpenChange={(o) => !o && setOpenedTask(null)}
          members={members}
          canEdit={canEdit}
          projectId={projectId}
        />
      )}
    </div>
  );
}

// ============ Filter chip ============

function FilterChip({
  label, active, onClick, tone, small,
}: {
  label: string; active: boolean; onClick: () => void; tone?: "violet" | "amber" | "rose"; small?: boolean;
}) {
  const activeTone = tone === "violet"
    ? "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800"
    : tone === "amber"
      ? "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
      : tone === "rose"
        ? "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
        : "bg-foreground text-background border-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-md border font-medium transition-colors",
        small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        active ? activeTone : "bg-muted/30 text-muted-foreground border-border hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

// ============ Single row ============

function FindingRow({
  finding, canEdit, projectId, onCreate, onOpenTask, onOpenDetail, isOpeningThis,
}: {
  finding: BlogAuditFinding;
  canEdit: boolean;
  projectId: string;
  onCreate: () => void;
  onOpenTask: (taskId: string) => void;
  onOpenDetail: () => void;
  // True only while THIS row's Open-task button is loading. Spinner shows
  // only on the clicked button, not every Open-task on the page.
  isOpeningThis: boolean;
}) {
  const [pendingDismiss, startDismiss] = useTransition();
  const isPrune = finding.decision === "prune";
  const isMerge = finding.decision === "merge";
  const isRefresh = finding.decision === "refresh";

  const decisionClass = isPrune
    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-300/30"
    : isMerge
    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-300/30"
    : isRefresh
    ? "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-300/30"
    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-300/30";
  const DecisionIcon = isPrune ? Trash2 : isMerge ? GitMerge : isRefresh ? RefreshCw : CheckCircle2;

  const toggleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    startDismiss(async () => {
      try {
        if (finding.status === "dismissed") {
          await undismissAuditFinding(projectId, finding.url, finding.decision);
          toast.success("Restored to worklist");
        } else {
          await dismissAuditFinding(projectId, finding.url, finding.decision);
          toast.success("Finding dismissed");
        }
      } catch (e2) {
        toast.error(e2 instanceof Error ? e2.message : "Failed");
      }
    });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenDetail}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenDetail(); } }}
      className="grid grid-cols-[1fr_90px_110px_110px_180px_30px] gap-2 items-center px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
    >
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={cn("border text-[10px] font-semibold uppercase tracking-wider gap-1", decisionClass)}>
            <DecisionIcon className="size-3" />
            {DECISION_LABEL[finding.decision]}
          </Badge>
          <StatusBadge status={finding.status} daysSinceTaskPublished={finding.daysSinceTaskPublished} />
          <a
            href={finding.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-sm font-medium hover:underline truncate min-w-0"
          >
            {pathOnly(finding.url)}
          </a>
          <ExternalLink className="size-3 text-muted-foreground" />
        </div>
        {/* Specific issue diagnostic — what's actually wrong with this URL */}
        <div className="text-xs text-foreground/80 leading-snug">{finding.diagnostic}</div>
      </div>
      <div className="text-right tabular-nums text-sm">{finding.metrics.gsc_clicks.toLocaleString()}</div>
      <div className="text-right tabular-nums text-sm">{finding.metrics.gsc_impressions.toLocaleString()}</div>
      <div className="text-right tabular-nums text-sm">{finding.metrics.ga_sessions.toLocaleString()}</div>
      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
        {finding.task && ["stale", "task_open", "task_done"].includes(finding.status) && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-8"
            onClick={() => onOpenTask(finding.task!.id)}
            disabled={isOpeningThis}
          >
            {isOpeningThis ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Open task
          </Button>
        )}
        {canEdit && (finding.status === "open" || finding.status === "stale") && (
          <Button size="sm" variant="brand" className="gap-1.5 h-8" onClick={onCreate}>
            <Plus className="size-3.5" />
            Create task
          </Button>
        )}
        {canEdit && (finding.status === "open" || finding.status === "stale") && (
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-muted-foreground hover:text-rose-600"
            onClick={toggleDismiss}
            disabled={pendingDismiss}
            title="Dismiss this finding"
          >
            {pendingDismiss ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
          </Button>
        )}
        {canEdit && finding.status === "dismissed" && (
          <Button size="sm" variant="outline" className="h-8" onClick={toggleDismiss} disabled={pendingDismiss}>
            {pendingDismiss && <Loader2 className="size-3.5 animate-spin" />}
            Restore
          </Button>
        )}
      </div>
      <ChevronRight className="size-4 text-muted-foreground/60" />
    </div>
  );
}

function StatusBadge({ status, daysSinceTaskPublished }: { status: AuditFindingStatus; daysSinceTaskPublished: number | null }) {
  if (status === "open") return null;
  switch (status) {
    case "stale":
      return (
        <Badge variant="outline" className="text-[10px] gap-1 text-amber-700 dark:text-amber-400 border-amber-300/40">
          Stale · {daysSinceTaskPublished}d since refresh
        </Badge>
      );
    case "task_open":
      return (
        <Badge variant="outline" className="text-[10px] gap-1 text-violet-700 dark:text-violet-300 border-violet-300/40">
          Task in progress
        </Badge>
      );
    case "task_done":
      return (
        <Badge variant="outline" className="text-[10px] gap-1 text-emerald-700 dark:text-emerald-300 border-emerald-300/40">
          Published {daysSinceTaskPublished}d ago
        </Badge>
      );
    case "dismissed":
      return (
        <Badge variant="outline" className="text-[10px] line-through opacity-60">
          Dismissed
        </Badge>
      );
    case "keep":
      return (
        <Badge variant="outline" className="text-[10px] gap-1 text-emerald-700 dark:text-emerald-300 border-emerald-300/40">
          No action
        </Badge>
      );
    default:
      return null;
  }
}

function pathOnly(url: string): string {
  try { return new URL(url).pathname || url; } catch { return url; }
}

// ============ Finding detail dialog ============

function FindingDetailDialog({
  finding, canEdit, projectId: _projectId, open, onOpenChange, onCreate, onOpenTask,
}: {
  finding: BlogAuditFinding;
  canEdit: boolean;
  projectId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreate: () => void;
  onOpenTask: (taskId: string) => void;
}) {
  const m30 = finding.windows["30d"];
  const m60 = finding.windows["60d"];
  const m90 = finding.windows["90d"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>{DECISION_LABEL[finding.decision]} candidate</span>
            <StatusBadge status={finding.status} daysSinceTaskPublished={finding.daysSinceTaskPublished} />
          </DialogTitle>
          <DialogDescription>
            <a href={finding.url} target="_blank" rel="noreferrer" className="font-medium text-foreground hover:underline break-all">
              {finding.url}
            </a>
            <ExternalLink className="size-3 inline ml-1 text-muted-foreground" />
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Specific issue diagnostic — prominent */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
              Why this is flagged
            </div>
            <div className="text-sm">{finding.diagnostic}</div>
          </div>

          {/* Trend table — all three windows */}
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
              Performance trend
            </div>
            <div className="rounded-lg border overflow-hidden">
              <div className="grid grid-cols-[80px_repeat(5,1fr)] gap-2 px-3 py-2 bg-muted/40 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                <div>Window</div>
                <div className="text-right">Clicks</div>
                <div className="text-right">Impressions</div>
                <div className="text-right">CTR</div>
                <div className="text-right">Position</div>
                <div className="text-right">Sessions</div>
              </div>
              <div className="divide-y">
                <TrendRow label="30 days" current={m30} prev={null} />
                <TrendRow label="60 days" current={m60} prev={m30} />
                <TrendRow label="90 days" current={m90} prev={m60} />
              </div>
            </div>
          </div>

          {/* Top queries */}
          {m90?.gsc_top_queries && m90.gsc_top_queries.length > 0 && (
            <TopQueries queries={m90.gsc_top_queries} />
          )}

          {/* Top referrers */}
          {m90?.ga_top_referrers && m90.ga_top_referrers.length > 0 && (
            <TopReferrers referrers={m90.ga_top_referrers} />
          )}

          {/* Linked task */}
          {finding.task && (
            <div className="rounded-lg border bg-muted/20 p-3 text-sm space-y-1">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                Linked task
              </div>
              <div className="font-medium">{finding.task.title}</div>
              <div className="text-xs text-muted-foreground">
                Status: {finding.task.status}
                {finding.task.completed_at && ` · Published ${finding.daysSinceTaskPublished}d ago`}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {finding.task && (
            <Button variant="outline" onClick={() => onOpenTask(finding.task!.id)}>
              Open task
            </Button>
          )}
          {canEdit && (finding.status === "open" || finding.status === "stale") && (
            <Button variant="brand" onClick={onCreate} className="gap-1.5">
              <Plus className="size-3.5" />
              Create task
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TrendRow({ label, current, prev }: { label: string; current?: UrlMetric; prev?: UrlMetric | null }) {
  if (!current) {
    return (
      <div className="grid grid-cols-[80px_repeat(5,1fr)] gap-2 px-3 py-2 text-xs">
        <div className="font-medium">{label}</div>
        <div className="col-span-5 text-muted-foreground italic">no data</div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[80px_repeat(5,1fr)] gap-2 px-3 py-2 text-xs">
      <div className="font-medium">{label}</div>
      <NumberCell value={current.gsc_clicks} prev={prev?.gsc_clicks} />
      <NumberCell value={current.gsc_impressions} prev={prev?.gsc_impressions} />
      <NumberCell value={current.gsc_ctr * 100} prev={prev ? prev.gsc_ctr * 100 : undefined} format={(n) => `${n.toFixed(2)}%`} />
      <NumberCell value={current.gsc_position} prev={prev?.gsc_position} format={(n) => n.toFixed(1)} inverseDelta />
      <NumberCell value={current.ga_sessions} prev={prev?.ga_sessions} />
    </div>
  );
}

function NumberCell({
  value, prev, format, inverseDelta,
}: {
  value: number; prev?: number; format?: (n: number) => string; inverseDelta?: boolean;
}) {
  const formatted = format ? format(value) : value.toLocaleString();
  const hasPrev = typeof prev === "number" && prev > 0;
  const delta = hasPrev ? value - prev! : 0;
  const isUp = delta > 0;
  const isDown = delta < 0;
  const isGood = inverseDelta ? isDown : isUp;
  const isBad = inverseDelta ? isUp : isDown;
  const DeltaIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const deltaColor = isGood
    ? "text-emerald-600 dark:text-emerald-400"
    : isBad
      ? "text-rose-600 dark:text-rose-400"
      : "text-muted-foreground";

  return (
    <div className="text-right tabular-nums flex items-center justify-end gap-1">
      <span>{formatted}</span>
      {hasPrev && delta !== 0 && (
        <span className={cn("inline-flex items-center gap-0.5 text-[10px]", deltaColor)}>
          <DeltaIcon className="size-2.5" />
        </span>
      )}
    </div>
  );
}

function TopQueries({ queries }: { queries: UrlTopQuery[] }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
        Top search queries (90 days)
      </div>
      <div className="rounded-lg border overflow-hidden">
        {/* Column headers — so it's obvious what 2c / 89i / #6.7 mean. */}
        <div className="grid grid-cols-[1fr_70px_90px_60px] gap-2 px-3 py-2 bg-muted/40 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground border-b">
          <div>Query</div>
          <div className="text-right">Clicks</div>
          <div className="text-right">Impressions</div>
          <div className="text-right">Position</div>
        </div>
        <div className="divide-y">
          {queries.slice(0, 10).map((q) => (
            <div key={q.query} className="grid grid-cols-[1fr_70px_90px_60px] gap-2 px-3 py-1.5 text-xs items-center">
              <div className="truncate" title={q.query}>{q.query}</div>
              <div className="text-right tabular-nums">{q.clicks.toLocaleString()}</div>
              <div className="text-right tabular-nums text-muted-foreground">{q.impressions.toLocaleString()}</div>
              <div className="text-right">
                <Badge variant="outline" className="text-[9px] tabular-nums">
                  #{q.position.toFixed(1)}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TopReferrers({ referrers }: { referrers: UrlTopReferrer[] }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
        Top referrers (90 days)
      </div>
      <div className="rounded-lg border overflow-hidden">
        <div className="divide-y">
          {referrers.slice(0, 5).map((r) => (
            <div key={r.source} className="grid grid-cols-[1fr_80px] gap-2 px-3 py-1.5 text-xs">
              <div className="truncate">{r.source}</div>
              <div className="text-right tabular-nums">{r.sessions.toLocaleString()} sessions</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ Create task dialog ============

function CreateTaskDialog({
  finding, members, projectId, open, onOpenChange,
}: {
  finding: BlogAuditFinding;
  members: Pick<Profile, "id" | "name" | "email" | "avatar_url">[];
  projectId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [ownerId, setOwnerId] = useState<string>("__none");
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();

  const submit = () => {
    start(async () => {
      try {
        await createTaskFromAuditFinding({
          projectId,
          url: finding.url,
          decision: finding.decision,
          ownerId: ownerId === "__none" ? null : ownerId,
          notes: notes.trim() || undefined,
        });
        toast.success("Task created in Blog Sprint", {
          description: "Finding moved to In flight. Open Blog Sprint to see the kanban card.",
        });
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create task: {DECISION_LABEL[finding.decision]}</DialogTitle>
          <DialogDescription>
            Drops a task into Blog Sprint with the URL&apos;s live GSC + GA4 metrics pre-filled in <code className="text-[10px] px-1 py-0.5 rounded bg-muted">data_backing</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
            <div className="font-medium text-foreground break-all">{finding.url}</div>
            <div className="text-muted-foreground">{finding.diagnostic}</div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Assign to</Label>
            <Select value={ownerId} onValueChange={(v) => v && setOwnerId(v)}>
              <SelectTrigger className="w-full h-9">
                <SelectValue>
                  {(value: string | null) => {
                    if (!value || value === "__none") return <span className="text-muted-foreground">(unassigned)</span>;
                    return members.find((m) => m.id === value)?.name ?? value;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">(unassigned)</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id} label={m.name}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-4 rounded-full bg-muted text-[8px] inline-flex items-center justify-center font-medium">
                        {initials(m.name)}
                      </span>
                      {m.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Rewrite the intro to lead with the answer."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button variant="brand" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            Create task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
