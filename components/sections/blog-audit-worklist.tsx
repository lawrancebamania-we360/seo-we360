"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  RefreshCw, GitMerge, Trash2, Plus, Loader2,
  ExternalLink, X, AlertCircle,
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
import type { BlogAuditFinding, BlogAuditDecision } from "@/lib/data/blog-audit";
import type { Profile } from "@/lib/types/database";
import type { TaskWithAssignee } from "@/lib/data/tasks";

// The audit worklist only renders things the team should act on TODAY.
// Specifically:
//   • status = "open"  — never had a task
//   • status = "stale" — old task is >90 days published, refresh allowed
//
// Hidden from this view (they're "done" from the audit's perspective):
//   • keep        — page is performing fine
//   • task_open   — someone's already working on it
//   • task_done   — task finished recently, within 90-day cooldown
//   • dismissed   — admin explicitly said "won't fix"
//
// A "Show resolved (N)" link at the bottom expands the hidden rows if the
// admin wants to audit them.

interface Props {
  findings: BlogAuditFinding[];
  members: Pick<Profile, "id" | "name" | "email" | "avatar_url">[];
  canEdit: boolean;
  projectId: string;
}

type DecisionFilter = "all" | "refresh" | "merge" | "prune";

export function BlogAuditWorklist({ findings, members, canEdit, projectId }: Props) {
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>("all");
  const [showResolved, setShowResolved] = useState(false);
  const [createFor, setCreateFor] = useState<BlogAuditFinding | null>(null);
  const [openedTask, setOpenedTask] = useState<TaskWithAssignee | null>(null);
  const [openedTaskLoading, setOpenedTaskLoading] = useState(false);

  // Actionable list — what the worklist shows by default.
  const actionable = useMemo(
    () => findings.filter((f) => f.status === "open" || f.status === "stale"),
    [findings],
  );
  const resolved = useMemo(
    () => findings.filter((f) => f.status === "task_open" || f.status === "task_done" || f.status === "dismissed"),
    [findings],
  );

  const counts = useMemo(() => ({
    refresh: actionable.filter((f) => f.decision === "refresh").length,
    merge: actionable.filter((f) => f.decision === "merge").length,
    prune: actionable.filter((f) => f.decision === "prune").length,
  }), [actionable]);

  const visible = useMemo(() => {
    if (decisionFilter === "all") return actionable;
    return actionable.filter((f) => f.decision === decisionFilter);
  }, [actionable, decisionFilter]);

  const openTask = (taskId: string) => {
    setOpenedTaskLoading(true);
    getTaskById(taskId)
      .then((task) => { if (task) setOpenedTask(task as TaskWithAssignee); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load task"))
      .finally(() => setOpenedTaskLoading(false));
  };

  return (
    <div className="space-y-4">
      {/* Decision filter chips — only count actionable items in each bucket */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterChip label={`All · ${actionable.length}`} active={decisionFilter === "all"} onClick={() => setDecisionFilter("all")} />
        <FilterChip
          label={`Refresh · ${counts.refresh}`}
          active={decisionFilter === "refresh"}
          onClick={() => setDecisionFilter("refresh")}
          tone="violet"
        />
        <FilterChip
          label={`Merge · ${counts.merge}`}
          active={decisionFilter === "merge"}
          onClick={() => setDecisionFilter("merge")}
          tone="amber"
        />
        <FilterChip
          label={`Prune · ${counts.prune}`}
          active={decisionFilter === "prune"}
          onClick={() => setDecisionFilter("prune")}
          tone="rose"
        />
        <div className="ml-auto text-xs text-muted-foreground">
          {actionable.length === 0 ? "Nothing to action right now" : `${visible.length} of ${actionable.length} actionable`}
        </div>
      </div>

      {visible.length === 0 ? (
        <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">
          {actionable.length === 0
            ? "All clear — every flagged URL has either a task in flight or is performing fine."
            : "No findings match the current filter."}
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="grid grid-cols-[1fr_110px_120px_120px_220px] gap-2 px-4 py-3 border-b bg-muted/30 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            <div>URL · Reason</div>
            <div className="text-right">90d clicks</div>
            <div className="text-right">90d impr</div>
            <div className="text-right">90d sessions</div>
            <div className="text-right">Action</div>
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
                openingTask={openedTaskLoading}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Resolved items — collapsed by default. Click to expand */}
      {resolved.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowResolved((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
          >
            <span>{showResolved ? "▾" : "▸"}</span>
            {showResolved ? "Hide" : "Show"} {resolved.length} resolved finding{resolved.length === 1 ? "" : "s"}
            <span className="text-muted-foreground/60">
              (in-progress tasks, recently published, or dismissed)
            </span>
          </button>
          {showResolved && (
            <Card className="p-0 overflow-hidden opacity-70">
              <div className="grid grid-cols-[1fr_110px_120px_120px_220px] gap-2 px-4 py-3 border-b bg-muted/30 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                <div>URL · Reason</div>
                <div className="text-right">90d clicks</div>
                <div className="text-right">90d impr</div>
                <div className="text-right">90d sessions</div>
                <div className="text-right">Status</div>
              </div>
              <div className="divide-y">
                {resolved.map((f) => (
                  <FindingRow
                    key={`${f.url}::${f.decision}`}
                    finding={f}
                    canEdit={canEdit}
                    projectId={projectId}
                    onCreate={() => setCreateFor(f)}
                    onOpenTask={openTask}
                    openingTask={openedTaskLoading}
                  />
                ))}
              </div>
            </Card>
          )}
        </div>
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

      {/* Task detail dialog opens inline when admin clicks "Open task" */}
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

function FilterChip({
  label, active, onClick, tone,
}: {
  label: string; active: boolean; onClick: () => void; tone?: "violet" | "amber" | "rose";
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
        "inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-medium transition-colors",
        active ? activeTone : "bg-muted/30 text-muted-foreground border-border hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

// ============ Single row ============

function FindingRow({
  finding, canEdit, projectId, onCreate, onOpenTask, openingTask,
}: {
  finding: BlogAuditFinding;
  canEdit: boolean;
  projectId: string;
  onCreate: () => void;
  onOpenTask: (taskId: string) => void;
  openingTask: boolean;
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
  const DecisionIcon = isPrune ? Trash2 : isMerge ? GitMerge : isRefresh ? RefreshCw : AlertCircle;

  const toggleDismiss = () => {
    startDismiss(async () => {
      try {
        if (finding.status === "dismissed") {
          await undismissAuditFinding(projectId, finding.url, finding.decision);
          toast.success("Restored to worklist");
        } else {
          await dismissAuditFinding(projectId, finding.url, finding.decision);
          toast.success("Finding dismissed");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  return (
    <div className="grid grid-cols-[1fr_110px_120px_120px_220px] gap-2 items-center px-4 py-3 hover:bg-muted/30 transition-colors">
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={cn("border text-[10px] font-semibold uppercase tracking-wider gap-1", decisionClass)}>
            <DecisionIcon className="size-3" />
            {finding.decision}
          </Badge>
          {finding.status === "stale" && finding.daysSinceTaskPublished !== null && (
            <Badge variant="outline" className="text-[10px] gap-1 text-amber-700 dark:text-amber-400 border-amber-300/40">
              Stale · last refresh {finding.daysSinceTaskPublished}d ago
            </Badge>
          )}
          {finding.status === "task_open" && (
            <Badge variant="outline" className="text-[10px] gap-1 text-violet-700 dark:text-violet-300 border-violet-300/40">
              Task in progress
            </Badge>
          )}
          {finding.status === "task_done" && finding.daysSinceTaskPublished !== null && (
            <Badge variant="outline" className="text-[10px] gap-1 text-emerald-700 dark:text-emerald-300 border-emerald-300/40">
              Published {finding.daysSinceTaskPublished}d ago
            </Badge>
          )}
          {finding.status === "dismissed" && (
            <Badge variant="outline" className="text-[10px] line-through opacity-60">
              Dismissed
            </Badge>
          )}
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
        <div className="text-xs text-muted-foreground leading-snug">{finding.reason}</div>
      </div>
      <div className="text-right tabular-nums text-sm">{finding.metrics.gsc_clicks.toLocaleString()}</div>
      <div className="text-right tabular-nums text-sm">{finding.metrics.gsc_impressions.toLocaleString()}</div>
      <div className="text-right tabular-nums text-sm">{finding.metrics.ga_sessions.toLocaleString()}</div>
      <div className="flex items-center justify-end gap-1.5">
        {/* Open existing task — for stale / task_open / task_done rows */}
        {finding.task && ["stale", "task_open", "task_done"].includes(finding.status) && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-8"
            onClick={() => onOpenTask(finding.task!.id)}
            disabled={openingTask}
          >
            {openingTask ? <Loader2 className="size-3.5 animate-spin" /> : null}
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
    </div>
  );
}

function pathOnly(url: string): string {
  try { return new URL(url).pathname || url; } catch { return url; }
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
        const { taskId: _taskId } = await createTaskFromAuditFinding({
          projectId,
          url: finding.url,
          decision: finding.decision,
          ownerId: ownerId === "__none" ? null : ownerId,
          notes: notes.trim() || undefined,
        });
        toast.success("Task created in Blog Sprint", {
          description: "It's now in the audit's Resolved section. Open Blog Sprint to see it in the kanban.",
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
          <DialogTitle>Create task from audit finding</DialogTitle>
          <DialogDescription>
            This drops a <strong className="text-foreground">{finding.decision}</strong> task into the Blog Sprint with the URL&apos;s live GSC + GA4 metrics pre-filled in <code className="text-[10px] px-1 py-0.5 rounded bg-muted">data_backing</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
            <div className="font-medium text-foreground break-all">{finding.url}</div>
            <div className="text-muted-foreground">{finding.reason}</div>
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="brand" onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-3.5 animate-spin" />}
            Create task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
