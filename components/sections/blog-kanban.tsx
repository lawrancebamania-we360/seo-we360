"use client";

import { useState, useMemo, useEffect } from "react";
import {
  DndContext, DragOverlay, useSensor, useSensors, PointerSensor,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  Pin, Flame, CircleDot, Zap, CalendarDays, Clock, Sparkles, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials, competitionColor, priorityColor, formatNumber, stripTaskKey, taskKindLabel } from "@/lib/ui-helpers";
import { updateTaskStatus } from "@/lib/actions/tasks";
import { BlogTaskDetailDialog } from "@/components/sections/blog-task-detail-dialog";
import { AssigneePicker } from "@/components/sections/assignee-picker";
import { PublishUrlDialog } from "@/components/sections/publish-url-dialog";
import { ExternalLink } from "lucide-react";
import type { TaskWithAssignee } from "@/lib/data/tasks";
import type { TaskStatus, Profile } from "@/lib/types/database";
import { differenceInDays, format, startOfDay } from "date-fns";

type Column = { id: TaskStatus; label: string; accent: string; icon: typeof Pin };

// Four-column workflow: Idea → In progress → Done (writing complete, ready
// for QA / publish prep) → Published (live with URL). The schema already has
// `review` status reserved for that "Done but not yet live" middle step;
// we surface it as its own column instead of folding it into In progress.
const COLUMNS: Column[] = [
  { id: "todo",        label: "Idea",        accent: "border-[#7B62FF]/40 dark:border-[#7B62FF]/40",   icon: CircleDot },
  { id: "in_progress", label: "In progress", accent: "border-[#FEB800]/40 dark:border-[#FEB800]/40",   icon: Zap },
  { id: "review",      label: "Done",        accent: "border-sky-300 dark:border-sky-900",             icon: CheckCircle2 },
  { id: "done",        label: "Published",   accent: "border-emerald-300 dark:border-emerald-900",     icon: Sparkles },
];

function bucketFor(task: TaskWithAssignee): TaskStatus {
  if (task.done || task.status === "done") return "done";
  if (task.status === "review") return "review";
  if (task.status === "in_progress") return "in_progress";
  return "todo";
}

export function BlogKanban({
  tasks, members, canEdit, projectId,
}: {
  tasks: TaskWithAssignee[];
  members: Pick<Profile, "id" | "name" | "avatar_url">[];
  canEdit: boolean;
  projectId: string;
}) {
  const [localTasks, setLocalTasks] = useState(tasks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<TaskWithAssignee | null>(null);
  const [publishingTask, setPublishingTask] = useState<TaskWithAssignee | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => { setLocalTasks(tasks); }, [tasks]);

  const onLocalUpdate = (taskId: string, patch: Partial<TaskWithAssignee>) => {
    setLocalTasks((cur) => cur.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
    setDetailTask((cur) => (cur && cur.id === taskId ? { ...cur, ...patch } : cur));
  };

  const liveDetailTask = detailTask
    ? localTasks.find((t) => t.id === detailTask.id) ?? detailTask
    : null;

  const byColumn = useMemo(() => {
    const map: Record<TaskStatus, TaskWithAssignee[]> = { todo: [], in_progress: [], review: [], done: [] };
    for (const t of localTasks) map[bucketFor(t)].push(t);
    return map;
  }, [localTasks]);

  const activeTask = activeId ? localTasks.find((t) => t.id === activeId) ?? null : null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over || !canEdit) return;
    const taskId = String(e.active.id);
    const overId = String(e.over.id);
    const toColumn =
      COLUMNS.find((c) => c.id === overId)?.id ??
      (localTasks.find((t) => t.id === overId) ? bucketFor(localTasks.find((t) => t.id === overId)!) : null);
    if (!toColumn) return;
    const task = localTasks.find((t) => t.id === taskId);
    if (!task || bucketFor(task) === toColumn) return;

    // Moving to Published requires a live URL — intercept and open the publish dialog.
    if (toColumn === "done" && !task.published_url) {
      setPublishingTask(task);
      return;
    }

    setLocalTasks((cur) =>
      cur.map((t) =>
        t.id === taskId
          ? { ...t, status: toColumn, done: toColumn === "done", completed_at: toColumn === "done" ? new Date().toISOString() : null }
          : t
      )
    );
    try {
      await updateTaskStatus(taskId, toColumn);
    } catch {
      toast.error("Couldn't save");
      setLocalTasks(tasks);
    }
  };

  const onCardClick = (task: TaskWithAssignee) => {
    setDetailTask(task);
    setDetailOpen(true);
  };

  return (
    <>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
          {COLUMNS.map((col) => (
            <BlogColumn
              key={col.id}
              column={col}
              tasks={byColumn[col.id]}
              onCardClick={onCardClick}
              canEdit={canEdit}
              members={members}
              onLocalUpdate={onLocalUpdate}
            />
          ))}
        </div>
        <DragOverlay>{activeTask && <BlogCard task={activeTask} dragging />}</DragOverlay>
      </DndContext>

      <PublishUrlDialog
        open={publishingTask !== null}
        onOpenChange={(v) => { if (!v) setPublishingTask(null); }}
        taskId={publishingTask?.id ?? null}
        taskTitle={publishingTask?.title.replace(/^Write article:\s*/i, "")}
        onSaved={(url) => {
          if (!publishingTask) return;
          onLocalUpdate(publishingTask.id, {
            status: "done", done: true, completed_at: new Date().toISOString(), published_url: url,
          });
          setPublishingTask(null);
        }}
      />

      <BlogTaskDetailDialog
        task={liveDetailTask}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        members={members}
        canEdit={canEdit}
        projectId={projectId}
      />
    </>
  );
}

function BlogColumn({
  column, tasks, onCardClick, canEdit, members, onLocalUpdate,
}: {
  column: Column;
  tasks: TaskWithAssignee[];
  onCardClick: (t: TaskWithAssignee) => void;
  canEdit: boolean;
  members: Pick<Profile, "id" | "name" | "avatar_url">[];
  onLocalUpdate: (taskId: string, patch: Partial<TaskWithAssignee>) => void;
}) {
  const { setNodeRef, isOver } = useSortable({ id: column.id, disabled: !canEdit });
  const Icon = column.icon;

  return (
    <div className="flex flex-col min-h-[400px]">
      <div className={cn("flex items-center justify-between px-2 pb-2 border-b-2", column.accent)}>
        <div className="flex items-center gap-2">
          <Icon className="size-3.5 text-muted-foreground" />
          <span className="text-sm font-semibold">{column.label}</span>
          <Badge variant="secondary" className="text-[10px] tabular-nums">{tasks.length}</Badge>
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 pt-3 px-1 space-y-2 min-h-[200px] rounded-md transition-colors",
          isOver && "bg-muted/40"
        )}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task, i) => (
            <SortableBlogCard key={task.id} task={task} index={i} onClick={() => onCardClick(task)} canEdit={canEdit} members={members} onLocalUpdate={onLocalUpdate} />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
            {column.id === "done" ? "Nothing published yet." : "Drop articles here"}
          </div>
        )}
      </div>
    </div>
  );
}

function SortableBlogCard({
  task, index, onClick, canEdit, members, onLocalUpdate,
}: {
  task: TaskWithAssignee;
  index: number;
  onClick: () => void;
  canEdit: boolean;
  members: Pick<Profile, "id" | "name" | "avatar_url">[];
  onLocalUpdate: (taskId: string, patch: Partial<TaskWithAssignee>) => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: task.id, disabled: !canEdit,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <BlogCard task={task} index={index} onClick={onClick} members={members} canEdit={canEdit} onLocalUpdate={onLocalUpdate} />
    </div>
  );
}

// Tasks are scheduled by sprint week (scheduled_date = Monday of that week).
// Render the due-by label in week buckets — "This week" / "Next week" /
// "In 2 weeks" — instead of day-by-day "Due in Xd" which is misleading
// when the underlying date is just a weekly anchor.
function dueLabel(scheduledDate: string | null, done: boolean): { text: string; tone: string } {
  if (done) return { text: "Published", tone: "text-[#5B45E0] dark:text-[#7B62FF]" };
  if (!scheduledDate) return { text: "No date", tone: "text-muted-foreground" };

  // Both the scheduled date and "now" are reduced to the Monday of their
  // calendar week so we can do a clean integer week diff.
  const mondayOf = (d: Date): Date => {
    const m = startOfDay(new Date(d));
    const dow = m.getDay();              // 0=Sun, 1=Mon, ... 6=Sat
    const offsetToMon = (dow + 6) % 7;
    m.setDate(m.getDate() - offsetToMon);
    return m;
  };
  const taskMon = mondayOf(new Date(scheduledDate));
  const todayMon = mondayOf(new Date());
  const weeks = Math.round((taskMon.getTime() - todayMon.getTime()) / (7 * 24 * 60 * 60 * 1000));

  if (weeks < 0) {
    const w = Math.abs(weeks);
    return { text: w === 1 ? "Overdue · 1 week" : `Overdue · ${w} weeks`, tone: "text-rose-600 dark:text-rose-400" };
  }
  if (weeks === 0) return { text: "Due this week", tone: "text-[#5B45E0] dark:text-[#7B62FF]" };
  if (weeks === 1) return { text: "Due next week", tone: "text-[#7B62FF] dark:text-[#7B62FF]" };
  if (weeks <= 4)  return { text: `In ${weeks} weeks`, tone: "text-muted-foreground" };
  return { text: format(new Date(scheduledDate), "MMM d"), tone: "text-muted-foreground" };
}

function BlogCard({
  task, index = 0, onClick, dragging = false, members = [], canEdit = false, onLocalUpdate,
}: {
  task: TaskWithAssignee;
  index?: number;
  onClick?: () => void;
  dragging?: boolean;
  members?: Pick<Profile, "id" | "name" | "avatar_url">[];
  canEdit?: boolean;
  onLocalUpdate?: (taskId: string, patch: Partial<TaskWithAssignee>) => void;
}) {
  const due = dueLabel(task.scheduled_date, task.done);
  const isHighPriority = task.priority === "critical" || task.priority === "high";
  const kind = taskKindLabel(task);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.035, 0.4), ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      onClick={() => !dragging && onClick?.()}
    >
      <Card
        className={cn(
          "p-4 space-y-2.5 cursor-pointer transition-shadow hover:shadow-md",
          task.done && "opacity-75",
          dragging && "ring-2 ring-primary shadow-lg"
        )}
      >
        {/* Kind label — front-and-center so writers can scan the column
            and see at a glance which cards are "Update Blog" vs "New Page"
            etc. without opening the task. */}
        <Badge className={cn("border text-[10px] font-semibold uppercase tracking-wider", kind.classes)}>
          {kind.label}
        </Badge>

        {/* Title */}
        <div className={cn("text-base font-semibold leading-tight line-clamp-2", task.done && "line-through text-muted-foreground")}>
          {stripTaskKey(task.title).replace(/^Write article:\s*/i, "")}
        </div>

        {/* Pinned keyword */}
        {task.target_keyword && (
          <div className="flex items-center gap-1.5 text-xs text-violet-700 dark:text-violet-300 font-medium">
            <Pin className="size-3 rotate-45 fill-violet-500 text-violet-500" />
            <span className="truncate">{task.target_keyword}</span>
          </div>
        )}

        {/* Priority + Competition badges (intent badge removed — not useful for writers) */}
        <div className="flex flex-wrap items-center gap-1.5">
          {isHighPriority && (
            <Badge className={cn("text-[10px] font-semibold gap-0.5", priorityColor(task.priority))}>
              <Flame className="size-2.5" />
              {task.priority === "critical" ? "Critical" : "High Priority"}
            </Badge>
          )}
          {task.competition && (
            <Badge className={cn("text-[10px] font-semibold", competitionColor(task.competition))}>
              {task.competition.replace(" Competition", "")} Competition
            </Badge>
          )}
          {task.word_count_target && (
            <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
              {formatNumber(task.word_count_target)} words
            </span>
          )}
        </div>

        {/* Published URL badge (clickable) */}
        {task.published_url && (
          <a
            href={task.published_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-900 px-2 py-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 transition-colors"
          >
            <ExternalLink className="size-3" />
            <span className="truncate max-w-[200px]">
              {(() => { try { return new URL(task.published_url).pathname; } catch { return "Live blog"; } })()}
            </span>
          </a>
        )}

        {/* Due + assignee */}
        <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
          <span className={cn("font-medium", due.tone)}>
            {due.text}
          </span>
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            {canEdit && !dragging ? (
              <AssigneePicker
                taskId={task.id}
                currentAssignee={task.team_member_id}
                members={members}
                onChanged={(id, member) => onLocalUpdate?.(task.id, { team_member_id: id, assignee: member })}
              />
            ) : task.assignee ? (
              <Avatar className="size-5">
                <AvatarFallback className="text-[9px]">{initials(task.assignee.name)}</AvatarFallback>
              </Avatar>
            ) : (
              <span className="text-muted-foreground text-[10px]">Unassigned</span>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
