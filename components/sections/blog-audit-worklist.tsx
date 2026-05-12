"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  RefreshCw, GitMerge, Trash2, Plus, Loader2,
  ExternalLink, X, AlertCircle, ChevronRight, TrendingUp, TrendingDown, Minus,
  CheckCircle2, ArrowUp, ArrowDown, ArrowUpDown,
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
type SortKey = "impressions" | "clicks" | "sessions" | "position" | "ctr";
type SortDir = "asc" | "desc";

export function BlogAuditWorklist({ findings, members, canEdit, projectId }: Props) {
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>("all");
  // Default sort: impressions desc — biggest visible-traffic loss at the top.
  // Click a header to toggle; clicking the same column again flips direction.
  const [sortKey, setSortKey] = useState<SortKey>("impressions");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      // First click on a new column: clicks/impressions/sessions/ctr default
      // to desc (most traffic first); position defaults to asc (best rank first).
      setSortDir(k === "position" ? "asc" : "desc");
    }
  };
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
    const filtered = decisionFilter === "all"
      ? actionable
      : actionable.filter((f) => f.decision === decisionFilter);
    // Sort a copy so we don't mutate the parent findings array.
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = av - bv;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [actionable, decisionFilter, sortKey, sortDir]);

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
          <div className="grid grid-cols-[1fr_90px_110px_90px_110px_180px] gap-2 px-4 py-3 border-b bg-muted/30 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            <div>URL · Specific issue</div>
            <SortHeader label="Clicks"      active={sortKey === "clicks"}      dir={sortDir} onClick={() => toggleSort("clicks")} />
            <SortHeader label="Impressions" active={sortKey === "impressions"} dir={sortDir} onClick={() => toggleSort("impressions")} />
            <SortHeader label="Position"    active={sortKey === "position"}    dir={sortDir} onClick={() => toggleSort("position")} />
            <SortHeader label="Sessions"    active={sortKey === "sessions"}    dir={sortDir} onClick={() => toggleSort("sessions")} />
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

// ============ Sortable column header ============

function SortHeader({
  label, active, dir, onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  // Subtle hover: column header is clickable, but it's still a header — we
  // don't want it to look like a button. Active state shows the up/down
  // arrow; inactive shows the neutral two-headed arrow so users know it
  // can be sorted.
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-end gap-1 text-right transition-colors hover:text-foreground",
        active && "text-foreground",
      )}
    >
      <span>{label}</span>
      <Icon className={cn("size-3 shrink-0", active ? "text-foreground" : "text-muted-foreground/50")} />
    </button>
  );
}

// Lookup the numeric value for a finding by sort key. Centralised so the
// SortHeader and the sort comparator stay in sync.
function sortValue(f: BlogAuditFinding, key: SortKey): number {
  const m = f.metrics;
  switch (key) {
    case "clicks":      return m.gsc_clicks;
    case "impressions": return m.gsc_impressions;
    case "sessions":    return m.ga_sessions;
    case "ctr":         return m.gsc_ctr;
    // Position: 0 impressions = no real position. Push those to the end
    // regardless of direction so the sort doesn't lead with "ranked #0"
    // rows, which are meaningless. Use a sentinel large number that
    // sorts last on asc (best-first) and first on desc (worst-first).
    case "position":    return m.gsc_impressions === 0 ? 9999 : m.gsc_position;
  }
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
      className="grid grid-cols-[1fr_90px_110px_90px_110px_180px] gap-2 items-center px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
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
      <div className="text-right tabular-nums text-sm text-muted-foreground">
        {finding.metrics.gsc_impressions > 0
          ? `#${finding.metrics.gsc_position.toFixed(1)}`
          : "—"}
      </div>
      <div className="text-right tabular-nums text-sm">{finding.metrics.ga_sessions.toLocaleString()}</div>
      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
        {/* Primary button — always visible. Opens the audit finding modal
            with full performance breakdown. For stale rows, the modal
            also surfaces the existing linked task. */}
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 h-8"
          onClick={onOpenDetail}
        >
          Open task
        </Button>

        {/* Action menu — Add to Blog Sprint + Dismiss + (Stale only)
            View existing task. Replaces the inline buttons row so the
            actions are deliberate and out of the way until needed. */}
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="icon-sm" variant="ghost" className="text-muted-foreground hover:text-foreground" title="Actions">
                  <ChevronRight className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onCreate}>
                <Plus className="size-3.5 mr-2" />
                Add to Blog Sprint
              </DropdownMenuItem>
              {finding.status === "stale" && finding.task && (
                <DropdownMenuItem onClick={() => onOpenTask(finding.task!.id)} disabled={isOpeningThis}>
                  {isOpeningThis ? <Loader2 className="size-3.5 animate-spin mr-2" /> : <ExternalLink className="size-3.5 mr-2" />}
                  View existing task ({finding.daysSinceTaskPublished}d old)
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={toggleDismiss} disabled={pendingDismiss} className="text-rose-600 dark:text-rose-400 focus:text-rose-700 dark:focus:text-rose-300">
                {pendingDismiss ? <Loader2 className="size-3.5 animate-spin mr-2" /> : <X className="size-3.5 mr-2" />}
                Delete this issue
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
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
      {/* Wider dialog so long-tail keywords aren't truncated to "can organ…".
          5xl = 1024px on desktop, full-bleed on mobile thanks to DialogContent's
          built-in inset; max-h-[90vh] keeps vertical scroll inside the dialog. */}
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto we360-scroll">
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

        <div className="space-y-4 min-w-0">
          {/* Specific issue diagnostic — prominent */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
              Why this is flagged
            </div>
            <div className="text-sm">{finding.diagnostic}</div>
          </div>

          {/* Suggested merge target — only for merge candidates that we
              were able to match to a stronger sibling in the same project.
              Without this block the user gets "redirect into a stronger
              sibling" but no idea WHICH sibling. */}
          {finding.decision === "merge" && finding.mergeTarget && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <GitMerge className="size-3.5 text-amber-600 dark:text-amber-400" />
                <div className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-400">
                  Suggested redirect target
                </div>
              </div>
              <a
                href={finding.mergeTarget.url}
                target="_blank"
                rel="noreferrer"
                className="block text-sm font-medium hover:underline break-all"
              >
                {finding.mergeTarget.url}
                <ExternalLink className="size-3 inline ml-1 text-muted-foreground" />
              </a>
              <div className="text-xs text-muted-foreground">
                Out-ranks this page on{" "}
                <span className="font-medium text-foreground">&ldquo;{finding.mergeTarget.query}&rdquo;</span>:{" "}
                position{" "}
                <span className="font-medium text-foreground tabular-nums">
                  #{finding.mergeTarget.targetPosition.toFixed(1)}
                </span>{" "}
                vs your{" "}
                <span className="tabular-nums">#{finding.mergeTarget.myPosition.toFixed(1)}</span>
                {finding.mergeTarget.targetClicks > 0 && (
                  <> · {finding.mergeTarget.targetClicks.toLocaleString()} clicks last 90d</>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground/80 leading-relaxed">
                Action: 301-redirect this URL into the target, then de-index this page from
                sitemap.xml. Move any unique sections from this post into the target.
              </div>
            </div>
          )}
          {finding.decision === "merge" && !finding.mergeTarget && (
            <div className="rounded-lg border border-dashed bg-muted/20 p-3 space-y-1">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                No obvious merge target
              </div>
              <div className="text-xs text-muted-foreground">
                No stronger sibling found in url_metrics for this page&rsquo;s top queries.
                Pick a target manually (use the Top queries below to spot what it&rsquo;s
                competing for), or consider prune instead of merge.
              </div>
            </div>
          )}

          {/* Trend table — all three windows. overflow-x-auto so on a
              narrow viewport (or huge numbers) the table scrolls inside
              the dialog instead of bursting out and clipping the footer. */}
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
              Performance trend
            </div>
            <div className="rounded-lg border overflow-x-auto">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-[90px_repeat(5,1fr)] gap-2 px-3 py-2 bg-muted/40 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground border-b">
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
  // Column template MUST match the header grid above
  // (grid-cols-[90px_repeat(5,1fr)]) or the columns drift.
  if (!current) {
    return (
      <div className="grid grid-cols-[90px_repeat(5,1fr)] gap-2 px-3 py-2 text-xs">
        <div className="font-medium">{label}</div>
        <div className="col-span-5 text-muted-foreground italic">no data</div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[90px_repeat(5,1fr)] gap-2 px-3 py-2 text-xs">
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
  // Query column is generous (min 360px) so most long-tail keywords fit on one
  // line; very long ones wrap (break-words) instead of getting truncated to
  // "can organ…". The outer overflow-x-auto + min-w-[720px] keeps the table
  // readable on narrow viewports — it scrolls horizontally inside the dialog
  // instead of squishing the metric columns.
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
        Top search queries (90 days)
      </div>
      <div className="rounded-lg border overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[minmax(360px,1fr)_80px_100px_70px] gap-2 px-3 py-2 bg-muted/40 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground border-b">
            <div>Query</div>
            <div className="text-right">Clicks</div>
            <div className="text-right">Impressions</div>
            <div className="text-right">Position</div>
          </div>
          <div className="divide-y">
            {queries.slice(0, 10).map((q) => (
              <div key={q.query} className="grid grid-cols-[minmax(360px,1fr)_80px_100px_70px] gap-2 px-3 py-1.5 text-xs items-center">
                <div className="break-words pr-2" title={q.query}>{q.query}</div>
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
    </div>
  );
}

function TopReferrers({ referrers }: { referrers: UrlTopReferrer[] }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
        Top referrers (90 days)
      </div>
      <div className="rounded-lg border overflow-x-auto">
        <div className="min-w-[420px] divide-y">
          {referrers.slice(0, 5).map((r) => (
            <div key={r.source} className="grid grid-cols-[minmax(260px,1fr)_120px] gap-2 px-3 py-1.5 text-xs">
              <div className="break-words pr-2" title={r.source}>{r.source}</div>
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
  // Pre-fill with the auto-detected merge target so the admin sees what
  // we're suggesting; they can override if our index found the wrong sibling.
  const [mergeTargetUrl, setMergeTargetUrl] = useState<string>(finding.mergeTarget?.url ?? "");
  // Default due date = 14 days out (sensible refresh / merge / prune window).
  // Admin can clear it via the date input or pick anything else. Stored as
  // YYYY-MM-DD so it goes straight into tasks.scheduled_date (a date column).
  const [scheduledDate, setScheduledDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [pending, start] = useTransition();

  const submit = () => {
    start(async () => {
      try {
        const trimmedTarget = mergeTargetUrl.trim();
        await createTaskFromAuditFinding({
          projectId,
          url: finding.url,
          decision: finding.decision,
          ownerId: ownerId === "__none" ? null : ownerId,
          notes: notes.trim() || undefined,
          scheduledDate: scheduledDate.trim() || undefined,
          mergeTargetUrl: finding.decision === "merge" && trimmedTarget ? trimmedTarget : undefined,
          mergeTargetQuery: finding.decision === "merge" && trimmedTarget ? finding.mergeTarget?.query : undefined,
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

            {/* Due date — defaults to today + 14d so the task shows up on the
                kanban with a sensible deadline; clear or change to override. */}
            <div className="space-y-1.5">
              <Label htmlFor="audit-due-date" className="text-xs font-semibold">
                Due date
              </Label>
              <Input
                id="audit-due-date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          {finding.decision === "merge" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <GitMerge className="size-3" />
                Redirect destination
                {finding.mergeTarget && (
                  <span className="text-muted-foreground font-normal">
                    (auto-detected — outranks on &ldquo;{finding.mergeTarget.query}&rdquo;)
                  </span>
                )}
              </Label>
              <Input
                value={mergeTargetUrl}
                onChange={(e) => setMergeTargetUrl(e.target.value)}
                placeholder="https://we360.ai/blog/stronger-sibling"
                className="font-mono text-xs"
              />
              <div className="text-[10px] text-muted-foreground">
                This URL is what the cannibalized page will 301-redirect into. Override if our
                guess is wrong.
              </div>
            </div>
          )}

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
