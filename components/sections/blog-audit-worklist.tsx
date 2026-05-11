"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  RefreshCw, GitMerge, Trash2, CheckCircle2, Plus, Loader2,
  ExternalLink, X, AlertCircle, Hourglass,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { initials } from "@/lib/ui-helpers";
import { createTaskFromAuditFinding, dismissAuditFinding, undismissAuditFinding } from "@/lib/actions/blog-audit";
import type { BlogAuditFinding, BlogAuditDecision, AuditFindingStatus } from "@/lib/data/blog-audit";
import type { Profile } from "@/lib/types/database";

interface Props {
  findings: BlogAuditFinding[];
  members: Pick<Profile, "id" | "name" | "email" | "avatar_url">[];
  canEdit: boolean;
  projectId: string;
}

type FilterKey = "open" | "all" | "prune" | "merge" | "refresh" | "keep" | "task_open" | "task_done" | "dismissed";

export function BlogAuditWorklist({ findings, members, canEdit, projectId }: Props) {
  const [filter, setFilter] = useState<FilterKey>("open");
  const [createFor, setCreateFor] = useState<BlogAuditFinding | null>(null);

  // Filter findings based on the active tab
  const visible = useMemo(() => {
    switch (filter) {
      case "open":
        return findings.filter((f) => f.status === "open" || f.status === "stale");
      case "all":
        return findings;
      case "prune":
      case "merge":
      case "refresh":
      case "keep":
        return findings.filter((f) => f.decision === filter);
      case "task_open":
        return findings.filter((f) => f.status === "task_open");
      case "task_done":
        return findings.filter((f) => f.status === "task_done");
      case "dismissed":
        return findings.filter((f) => f.status === "dismissed");
    }
  }, [findings, filter]);

  return (
    <div className="space-y-4">
      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
        <TabsList>
          <TabsTrigger value="open">
            Open · {findings.filter((f) => f.status === "open" || f.status === "stale").length}
          </TabsTrigger>
          <TabsTrigger value="refresh">Refresh · {findings.filter((f) => f.decision === "refresh").length}</TabsTrigger>
          <TabsTrigger value="merge">Merge · {findings.filter((f) => f.decision === "merge").length}</TabsTrigger>
          <TabsTrigger value="prune">Prune · {findings.filter((f) => f.decision === "prune").length}</TabsTrigger>
          <TabsTrigger value="keep">Keep · {findings.filter((f) => f.decision === "keep").length}</TabsTrigger>
          <TabsTrigger value="task_open">In progress · {findings.filter((f) => f.status === "task_open").length}</TabsTrigger>
          <TabsTrigger value="dismissed">Dismissed · {findings.filter((f) => f.status === "dismissed").length}</TabsTrigger>
          <TabsTrigger value="all">All · {findings.length}</TabsTrigger>
        </TabsList>
      </Tabs>

      {visible.length === 0 ? (
        <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">
          Nothing in this view.
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
    </div>
  );
}

// ============ Single row ============

function FindingRow({
  finding, canEdit, projectId, onCreate,
}: {
  finding: BlogAuditFinding;
  canEdit: boolean;
  projectId: string;
  onCreate: () => void;
}) {
  const [pendingDismiss, startDismiss] = useTransition();
  const isPrune = finding.decision === "prune";
  const isMerge = finding.decision === "merge";
  const isRefresh = finding.decision === "refresh";
  const isKeep = finding.decision === "keep";

  const decisionClass = isPrune
    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-300/30"
    : isMerge
    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-300/30"
    : isRefresh
    ? "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-300/30"
    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-300/30";
  const DecisionIcon = isPrune ? Trash2 : isMerge ? GitMerge : isRefresh ? RefreshCw : CheckCircle2;

  const toggleDismiss = () => {
    startDismiss(async () => {
      try {
        if (finding.status === "dismissed") {
          await undismissAuditFinding(projectId, finding.url, finding.decision);
          toast.success("Dismissal removed");
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
          <StatusChip status={finding.status} daysSinceTaskPublished={finding.daysSinceTaskPublished} />
          <a
            href={finding.url}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium hover:underline truncate min-w-0"
          >
            {pathOnly(finding.url)}
          </a>
          <ExternalLink className="size-3 text-muted-foreground" />
        </div>
        <div className="text-xs text-muted-foreground leading-snug">{finding.reason}</div>
        {finding.status === "stale" && finding.daysSinceTaskPublished !== null && (
          <div className="text-[11px] text-amber-700 dark:text-amber-400">
            Last refreshed {finding.daysSinceTaskPublished} days ago. Cooldown passed — new task allowed.
          </div>
        )}
      </div>
      <div className="text-right tabular-nums text-sm">{finding.metrics.gsc_clicks.toLocaleString()}</div>
      <div className="text-right tabular-nums text-sm">{finding.metrics.gsc_impressions.toLocaleString()}</div>
      <div className="text-right tabular-nums text-sm">{finding.metrics.ga_sessions.toLocaleString()}</div>
      <div className="flex items-center justify-end gap-1.5">
        {finding.task && (finding.status === "task_open" || finding.status === "task_done") && (
          <Link href={`/dashboard/sprint?task=${finding.task.id}`}>
            <Button size="sm" variant="outline" className="gap-1.5 h-8">
              Open task
            </Button>
          </Link>
        )}
        {canEdit && (finding.status === "open" || finding.status === "stale") && !isKeep && (
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

function StatusChip({ status, daysSinceTaskPublished }: { status: AuditFindingStatus; daysSinceTaskPublished: number | null }) {
  if (status === "open") return null;
  const map: Record<Exclude<AuditFindingStatus, "open">, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    keep: { label: "no action", cls: "bg-muted text-muted-foreground", Icon: CheckCircle2 },
    task_open: { label: "task in progress", cls: "bg-violet-500/10 text-violet-700 dark:text-violet-300", Icon: Hourglass },
    task_done: { label: daysSinceTaskPublished !== null ? `published ${daysSinceTaskPublished}d ago` : "published", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", Icon: CheckCircle2 },
    stale: { label: "stale — refresh allowed", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400", Icon: AlertCircle },
    dismissed: { label: "dismissed", cls: "bg-muted text-muted-foreground line-through", Icon: X },
  };
  const cfg = map[status];
  return (
    <Badge className={cn("border-0 text-[10px] font-medium gap-1", cfg.cls)}>
      <cfg.Icon className="size-3" />
      {cfg.label}
    </Badge>
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
        const { taskId } = await createTaskFromAuditFinding({
          projectId,
          url: finding.url,
          decision: finding.decision,
          ownerId: ownerId === "__none" ? null : ownerId,
          notes: notes.trim() || undefined,
        });
        toast.success("Task created in Blog Sprint", {
          action: { label: "Open", onClick: () => { window.location.href = `/dashboard/sprint?task=${taskId}`; } },
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
              placeholder="e.g. Lokesh, please rewrite the intro to lead with the answer."
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
