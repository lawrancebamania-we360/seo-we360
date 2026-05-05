"use client";

import { useState, useTransition } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  Pencil, Save, Trash2, ExternalLink, Calendar, User, Sparkles, CheckCircle2,
  Loader2, AlertTriangle, Wrench, X, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { priorityColor, initials, stripTaskKey, stripTaskPrefix, formatVolume, taskTypeBadgeClass } from "@/lib/ui-helpers";
import { updateTask, deleteTask } from "@/lib/actions/tasks";
import { AssigneePicker } from "@/components/sections/assignee-picker";
import { CheckWithAIButton } from "@/components/sections/check-with-ai-button";
import type { Profile } from "@/lib/types/database";
import type { TaskWithAssignee } from "@/lib/data/tasks";
import { formatDistanceToNow, format } from "date-fns";

interface Props {
  task: TaskWithAssignee | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  members: Pick<Profile, "id" | "name" | "avatar_url">[];
  canEdit: boolean;
  onLocalUpdate?: (taskId: string, patch: Partial<TaskWithAssignee>) => void;
}

export function TaskDetailDialog({ task, open, onOpenChange, members, canEdit, onLocalUpdate }: Props) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<{
    title: string;
    priority: "critical" | "high" | "medium" | "low";
    status: "todo" | "in_progress" | "review" | "done";
    issue: string;
    impl: string;
    data_backing: string;
    pillar: "SEO" | "AEO" | "GEO" | "SXO" | "AIO" | "none";
    scheduled_date: string;
  } | null>(null);

  const startEdit = () => {
    if (!task) return;
    setDraft({
      title: task.title,
      priority: task.priority,
      status: task.status,
      issue: task.issue ?? "",
      impl: task.impl ?? "",
      data_backing: task.data_backing ?? "",
      pillar: task.pillar ?? "none",
      scheduled_date: task.scheduled_date ?? "",
    });
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const save = () => {
    if (!task || !draft) return;
    start(async () => {
      try {
        await updateTask(task.id, {
          title: draft.title,
          priority: draft.priority,
          status: draft.status,
          issue: draft.issue || null,
          impl: draft.impl || null,
          data_backing: draft.data_backing || null,
          pillar: draft.pillar === "none" ? null : draft.pillar,
          scheduled_date: draft.scheduled_date || null,
        });
        onLocalUpdate?.(task.id, {
          title: draft.title,
          priority: draft.priority,
          status: draft.status,
          issue: draft.issue || null,
          impl: draft.impl || null,
          data_backing: draft.data_backing || null,
          pillar: draft.pillar === "none" ? null : draft.pillar,
          scheduled_date: draft.scheduled_date || null,
        });
        toast.success("Saved");
        setEditing(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed");
      }
    });
  };

  const moveStage = (status: "todo" | "in_progress" | "done") => {
    if (!task) return;
    start(async () => {
      try {
        await updateTask(task.id, { status });
        onLocalUpdate?.(task.id, {
          status,
          done: status === "done",
          completed_at: status === "done" ? new Date().toISOString() : null,
        });
        toast.success(`Moved to ${status.replace("_", " ")}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Move failed");
      }
    });
  };

  const doDelete = () => {
    if (!task) return;
    start(async () => {
      try {
        await deleteTask(task.id);
        toast.success("Deleted");
        setConfirmDelete(false);
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setEditing(false); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-3xl max-h-[92svh] overflow-y-auto we360-scroll pr-10">
        {!task ? null : (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <DialogHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {editing && draft ? (
                    <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="text-lg font-semibold" />
                  ) : (
                    <DialogTitle className="text-lg leading-snug pr-2">{stripTaskPrefix(stripTaskKey(task.title))}</DialogTitle>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {task.task_type && (
                      <Badge className={cn("border", taskTypeBadgeClass(task.task_type))}>
                        {task.task_type}
                      </Badge>
                    )}
                    {task.est_volume != null && task.est_volume > 0 && (
                      <Badge variant="outline" className="tabular-nums">
                        {formatVolume(task.est_volume)}
                      </Badge>
                    )}
                    {task.pillar && <Badge variant="secondary">{task.pillar}</Badge>}
                    <Badge variant="outline" className={priorityColor(task.priority)}>
                      {task.priority}
                    </Badge>
                    <Badge variant="outline" className="capitalize">
                      {task.status.replace("_", " ")}
                    </Badge>
                    {task.source === "cron_audit" && (
                      <Badge variant="outline" className="text-[10px]">
                        <Sparkles className="size-2.5" /> Auto-created
                      </Badge>
                    )}
                    {task.verified_by_ai && (
                      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                        <CheckCircle2 className="size-3" /> AI verified
                      </Badge>
                    )}
                  </div>
                </div>
                {canEdit && !editing && (
                  <div className="flex items-center gap-1.5 shrink-0 mr-6">
                    <AssigneePicker
                      taskId={task.id}
                      currentAssignee={task.team_member_id}
                      members={members}
                      onChanged={(id, member) => onLocalUpdate?.(task.id, { team_member_id: id, assignee: member })}
                    />
                    <Button size="icon-sm" variant="outline" onClick={startEdit} aria-label="Edit task" title="Edit task">
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="icon-sm"
                      variant="outline"
                      onClick={() => setConfirmDelete(true)}
                      aria-label="Delete task"
                      title="Delete task"
                      className="hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                    {task.url && !task.verified_by_ai && !task.done && (
                      <CheckWithAIButton taskId={task.id} variant="full" />
                    )}
                  </div>
                )}
              </div>
            </DialogHeader>

            {task.url && (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs flex items-center gap-2">
                <ExternalLink className="size-3.5 text-muted-foreground" />
                <a href={task.url} target="_blank" rel="noreferrer" className="truncate hover:underline">
                  {task.url}
                </a>
              </div>
            )}

            {/* Data backing callout — shown FIRST so the GSC/GA4/PSI evidence
                that justifies this task is the lede, not buried below the fix. */}
            {(editing && draft) ? (
              <div className="rounded-md border-2 border-[#FEB800]/60 bg-[#FEB800]/10 p-3 space-y-1.5">
                <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold text-[#8a6500] dark:text-[#FEB800]">
                  <BarChart3 className="size-3.5" />
                  Data backing
                </div>
                <Textarea
                  value={draft.data_backing}
                  onChange={(e) => setDraft({ ...draft, data_backing: e.target.value })}
                  rows={3}
                  placeholder="GSC: 14,400 clicks/16-mo, avg pos 25.9. GA4: 10,787 organic sessions/mo. PSI: 85/85 pages..."
                  className="bg-white/60 dark:bg-black/20"
                />
              </div>
            ) : task.data_backing ? (
              <div className="rounded-md border-2 border-[#FEB800]/60 bg-[#FEB800]/10 p-3 space-y-1.5">
                <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold text-[#8a6500] dark:text-[#FEB800]">
                  <BarChart3 className="size-3.5" />
                  Data backing
                </div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-[#231D4F] dark:text-foreground">
                  {task.data_backing}
                </p>
              </div>
            ) : null}

            <Section icon={AlertTriangle} label="What's wrong" tone="rose">
              {editing && draft ? (
                <Textarea value={draft.issue} onChange={(e) => setDraft({ ...draft, issue: e.target.value })} rows={3} />
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{task.issue || "—"}</p>
              )}
            </Section>

            <Section icon={Wrench} label="How to fix" tone="emerald">
              {editing && draft ? (
                <Textarea value={draft.impl} onChange={(e) => setDraft({ ...draft, impl: e.target.value })} rows={4} />
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{task.impl || "No fix recommendation provided."}</p>
              )}
            </Section>

            {editing && draft && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Pillar</Label>
                  <Select value={draft.pillar} onValueChange={(v) => v && setDraft({ ...draft, pillar: v as typeof draft.pillar })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      <SelectItem value="SEO">SEO</SelectItem>
                      <SelectItem value="AEO">AEO</SelectItem>
                      <SelectItem value="GEO">GEO</SelectItem>
                      <SelectItem value="SXO">SXO</SelectItem>
                      <SelectItem value="AIO">AIO</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  <Select value={draft.priority} onValueChange={(v) => v && setDraft({ ...draft, priority: v as typeof draft.priority })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Scheduled</Label>
                  <Input type="date" value={draft.scheduled_date} onChange={(e) => setDraft({ ...draft, scheduled_date: e.target.value })} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground pt-2 border-t">
              <div className="flex items-center gap-1.5">
                <Calendar className="size-3.5" />
                Added {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
              </div>
              {task.completed_at && (
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5" />
                  Completed {format(new Date(task.completed_at), "MMM d")}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <User className="size-3.5" />
                {task.assignee ? (
                  <span className="flex items-center gap-1.5">
                    <Avatar className="size-4"><AvatarFallback className="text-[8px]">{initials(task.assignee.name)}</AvatarFallback></Avatar>
                    {task.assignee.name}
                  </span>
                ) : "Unassigned"}
              </div>
              {task.scheduled_date && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="size-3.5" />
                  Due {task.scheduled_date}
                </div>
              )}
            </div>

            {canEdit && (
              <div className="pt-3 border-t">
                {editing ? (
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={cancelEdit} disabled={pending}>
                      <X className="size-3.5" />
                      Cancel
                    </Button>
                    <Button size="sm" onClick={save} disabled={pending}>
                      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                      Save changes
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground shrink-0">
                      Move to
                    </Label>
                    <Select
                      value={task.status}
                      onValueChange={(v) => v && moveStage(v as "todo" | "in_progress" | "done")}
                    >
                      <SelectTrigger className="w-44 h-8" disabled={pending}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todo">📌 Open</SelectItem>
                        <SelectItem value="in_progress">⚡ In progress</SelectItem>
                        <SelectItem value="done">✅ Done</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </DialogContent>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                <Trash2 className="size-4" />
              </div>
              Delete this task?
            </DialogTitle>
            <DialogDescription>
              This removes the task permanently. If it was auto-created by the cron, a future audit may re-create it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={doDelete} disabled={pending} className="bg-rose-600 hover:bg-rose-700 text-white">
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Delete task
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function Section({ icon: Icon, label, tone, children }: { icon: typeof AlertTriangle; label: string; tone: "rose" | "emerald"; children: React.ReactNode }) {
  const toneClass =
    tone === "rose"
      ? "bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/30 dark:text-rose-100 dark:border-rose-900"
      : "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-100 dark:border-emerald-900";
  const iconClass = tone === "rose" ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400";

  return (
    <div className={cn("rounded-md border p-3 space-y-1.5", toneClass)}>
      <div className={cn("inline-flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold", iconClass)}>
        <Icon className="size-3.5" />
        {label}
      </div>
      {children}
    </div>
  );
}
