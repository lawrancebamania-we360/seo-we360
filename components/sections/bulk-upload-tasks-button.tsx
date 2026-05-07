"use client";

import { useState, useTransition } from "react";
import { Upload, Loader2, Plus, Trash2, Calendar } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bulkCreateBlogTasks, type BulkBlogTaskRow } from "@/lib/actions/tasks";
import { initials } from "@/lib/ui-helpers";
import type { Profile } from "@/lib/types/database";

interface Props {
  projectId: string;
  members: Pick<Profile, "id" | "name" | "email" | "avatar_url">[];
}

// Form mirrors the kanban card structure — title + H1 are required, every
// other field is optional. Users add tasks one at a time to a queue, then
// upload them all in one shot.
interface QueuedTask extends BulkBlogTaskRow {
  _localId: number;
}

const FORMAT_OPTIONS = [
  { value: "new-blog",         label: "New Blog" },
  { value: "update-blog",      label: "Update Blog" },
  { value: "medium-blog",      label: "Medium Blog" },
  { value: "vs-page",          label: "VS Page" },
  { value: "alternative-page", label: "Alternative Page" },
  { value: "integration-page", label: "Integration Page" },
  { value: "solution-page",    label: "Solution Page" },
  { value: "industry-page",    label: "Industry Page" },
  { value: "india-page",       label: "India Page" },
  { value: "pillar-blog",      label: "Pillar Blog" },
  { value: "cluster-blog",     label: "Cluster Blog" },
  { value: "listicle",         label: "Listicle" },
  { value: "how-to-blog",      label: "How-to Blog" },
];

const NONE = "__none";   // sentinel for unselected — Base UI Select rejects empty strings

export function BulkUploadTasksButton({ projectId, members }: Props) {
  const [open, setOpen] = useState(false);
  const [queued, setQueued] = useState<QueuedTask[]>([]);
  const [pending, start] = useTransition();
  const [seq, setSeq] = useState(1);

  // Current form draft
  const [title, setTitle] = useState("");
  const [h1, setH1] = useState("");
  const [format, setFormat] = useState<string>(NONE);
  const [priority, setPriority] = useState<string>(NONE);
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState<string>(NONE);

  const resetForm = () => {
    setTitle(""); setH1(""); setFormat(NONE); setPriority(NONE); setDueDate(""); setAssignee(NONE);
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setTimeout(() => { setQueued([]); resetForm(); }, 200);
    }
  };

  const addToQueue = () => {
    if (!title.trim() || !h1.trim()) {
      toast.error("Task title and H1 keyword are required");
      return;
    }
    const assigneeMember = assignee !== NONE ? members.find((m) => m.id === assignee) : null;
    const item: QueuedTask = {
      _localId: seq,
      title: title.trim(),
      target_keyword: h1.trim(),
      format: format !== NONE ? format : null,
      priority: priority !== NONE ? priority as BulkBlogTaskRow["priority"] : null,
      scheduled_date: dueDate || null,
      assignee_email: assigneeMember?.email ?? null,
    };
    setQueued((q) => [...q, item]);
    setSeq((n) => n + 1);
    resetForm();
    toast.success("Task added to queue");
  };

  const removeFromQueue = (id: number) => {
    setQueued((q) => q.filter((t) => t._localId !== id));
  };

  const submit = () => {
    if (!queued.length) {
      toast.error("Add at least one task to the queue first");
      return;
    }
    start(async () => {
      try {
        // Strip _localId before sending — server doesn't need it.
        const rows = queued.map(({ _localId: _id, ...row }) => row);
        // eslint-disable-next-line no-console
        console.log("[bulk-upload] sending rows:", rows);
        const { inserted } = await bulkCreateBlogTasks(projectId, rows);
        toast.success(`${inserted} task${inserted === 1 ? "" : "s"} added to Blog Sprint`);
        setQueued([]);
        resetForm();
        setOpen(false);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[bulk-upload] failed:", e);
        toast.error(
          e instanceof Error
            ? `Upload failed: ${e.message}`
            : "Upload failed — check the browser console for details",
        );
      }
    });
  };

  const canAdd = title.trim().length > 0 && h1.trim().length > 0;

  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <Upload className="size-3.5" />
        Upload tasks
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload tasks to Blog Sprint</DialogTitle>
            <DialogDescription>
              Add tasks one at a time. Only <strong>title</strong> and <strong>H1 keyword</strong> are required —
              format, priority, due date, and assignee are optional and can be set later on each card.
            </DialogDescription>
          </DialogHeader>

          {/* Form — one task at a time */}
          <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              New task
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Task title <span className="text-rose-600">*</span>
              </Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder='e.g. Update existing blog: "remote work guide"'
                onKeyDown={(e) => { if (e.key === "Enter" && canAdd) addToQueue(); }}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                H1 keyword <span className="text-rose-600">*</span>
              </Label>
              <Input
                value={h1}
                onChange={(e) => setH1(e.target.value)}
                placeholder="e.g. remote work guide"
                onKeyDown={(e) => { if (e.key === "Enter" && canAdd) addToQueue(); }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Format</Label>
                <Select value={format} onValueChange={(v) => v && setFormat(v)}>
                  <SelectTrigger className="w-full h-9">
                    <SelectValue>
                      {(value: string | null) =>
                        !value || value === NONE
                          ? <span className="text-muted-foreground">(optional)</span>
                          : FORMAT_OPTIONS.find((o) => o.value === value)?.label ?? value
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>(optional)</SelectItem>
                    {FORMAT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value} label={o.label}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Priority</Label>
                <Select value={priority} onValueChange={(v) => v && setPriority(v)}>
                  <SelectTrigger className="w-full h-9">
                    <SelectValue>
                      {(value: string | null) =>
                        !value || value === NONE
                          ? <span className="text-muted-foreground">(optional)</span>
                          : value.charAt(0).toUpperCase() + value.slice(1)
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>(optional)</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <Calendar className="size-3" />
                  Due date
                </Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Assign to</Label>
                <Select value={assignee} onValueChange={(v) => v && setAssignee(v)}>
                  <SelectTrigger className="w-full h-9">
                    <SelectValue>
                      {(value: string | null) => {
                        if (!value || value === NONE) return <span className="text-muted-foreground">(optional)</span>;
                        return members.find((m) => m.id === value)?.name ?? value;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>(optional)</SelectItem>
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
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={addToQueue}
              disabled={!canAdd}
            >
              <Plus className="size-3.5" />
              Add to queue
            </Button>
          </div>

          {/* Queue — list of tasks staged for upload */}
          {queued.length > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-900 p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-700 dark:text-emerald-400">
                {queued.length} task{queued.length === 1 ? "" : "s"} ready to upload
              </div>
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {queued.map((t, i) => (
                  <div
                    key={t._localId}
                    className="flex items-center gap-2 rounded-md bg-background border border-border p-2 text-xs"
                  >
                    <Badge variant="outline" className="text-[10px]">{i + 1}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{t.title}</div>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground flex-wrap">
                        <span>→ {t.target_keyword}</span>
                        {t.format && <Badge variant="secondary" className="text-[9px]">{t.format}</Badge>}
                        {t.priority && <Badge variant="secondary" className="text-[9px]">{t.priority}</Badge>}
                        {t.scheduled_date && <span>· due {t.scheduled_date}</span>}
                        {t.assignee_email && (
                          <span>· {members.find((m) => m.email === t.assignee_email)?.name ?? t.assignee_email}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => removeFromQueue(t._localId)}
                      className="hover:text-rose-600"
                      aria-label="Remove from queue"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="brand" onClick={submit} disabled={pending || !queued.length}>
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              <Upload className="size-3.5" />
              Upload {queued.length || ""} task{queued.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
