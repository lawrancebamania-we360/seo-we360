"use client";

import { useState, useMemo, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "motion/react";
import { toast } from "sonner";
import { CheckCircle2, Sparkles, ExternalLink, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { priorityColor, initials, stripTaskKey } from "@/lib/ui-helpers";
import { updateTaskStatus } from "@/lib/actions/tasks";
import { TaskDetailDialog } from "@/components/sections/task-detail-dialog";
import { CheckWithAIButton } from "@/components/sections/check-with-ai-button";
import { AssigneePicker } from "@/components/sections/assignee-picker";
import type { TaskWithAssignee } from "@/lib/data/tasks";
import type { TaskStatus, Profile } from "@/lib/types/database";
import { format } from "date-fns";

type Column = { id: TaskStatus; label: string; description: string };

const COLUMNS: Column[] = [
  { id: "todo", label: "Open", description: "Not started" },
  { id: "in_progress", label: "In progress", description: "Someone's on it" },
  { id: "done", label: "Done", description: "Shipped" },
];

function bucketFor(task: TaskWithAssignee): TaskStatus {
  if (task.done || task.status === "done") return "done";
  if (task.status === "in_progress" || task.status === "review") return "in_progress";
  return "todo";
}

export function TaskKanban({
  tasks,
  members,
  canEdit,
}: {
  tasks: TaskWithAssignee[];
  members: Pick<Profile, "id" | "name" | "avatar_url">[];
  canEdit: boolean;
}) {
  const [localTasks, setLocalTasks] = useState(tasks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<TaskWithAssignee | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Sync local state when server-side tasks change (e.g. after filter update)
  useEffect(() => { setLocalTasks(tasks); }, [tasks]);

  const byColumn = useMemo(() => {
    const map: Record<TaskStatus, TaskWithAssignee[]> = {
      todo: [], in_progress: [], review: [], done: [],
    };
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
    // Target status is either the column id or derived from the task we dropped onto
    const toColumn =
      COLUMNS.find((c) => c.id === overId)?.id ??
      (localTasks.find((t) => t.id === overId) ? bucketFor(localTasks.find((t) => t.id === overId)!) : null);
    if (!toColumn) return;

    const task = localTasks.find((t) => t.id === taskId);
    if (!task) return;
    const fromColumn = bucketFor(task);
    if (fromColumn === toColumn) return;

    // Optimistic update
    setLocalTasks((cur) =>
      cur.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status: toColumn,
              done: toColumn === "done",
              completed_at: toColumn === "done" ? new Date().toISOString() : null,
            }
          : t
      )
    );
    try {
      await updateTaskStatus(taskId, toColumn);
    } catch (err) {
      toast.error("Couldn't save — reverted");
      setLocalTasks(tasks);
    }
  };

  const onCardClick = (task: TaskWithAssignee) => {
    setDetailTask(task);
    setDetailOpen(true);
  };

  // Optimistic patcher — keeps both localTasks and the currently-open dialog in sync.
  const onLocalUpdate = (taskId: string, patch: Partial<TaskWithAssignee>) => {
    setLocalTasks((cur) => cur.map((t) => (t.id === taskId ? { ...t, ...patch } : t)));
    setDetailTask((cur) => (cur && cur.id === taskId ? { ...cur, ...patch } : cur));
  };

  // Always render the dialog with the freshest version of the task.
  const liveDetailTask = detailTask
    ? localTasks.find((t) => t.id === detailTask.id) ?? detailTask
    : null;

  return (
    <>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
          {COLUMNS.map((col) => (
            <KanbanColumn
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
        <DragOverlay>{activeTask && <TaskCard task={activeTask} dragging />}</DragOverlay>
      </DndContext>

      <TaskDetailDialog
        task={liveDetailTask}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        members={members}
        canEdit={canEdit}
        onLocalUpdate={onLocalUpdate}
      />
    </>
  );
}

function KanbanColumn({
  column,
  tasks,
  onCardClick,
  canEdit,
  members,
  onLocalUpdate,
}: {
  column: Column;
  tasks: TaskWithAssignee[];
  onCardClick: (t: TaskWithAssignee) => void;
  canEdit: boolean;
  members: Pick<Profile, "id" | "name" | "avatar_url">[];
  onLocalUpdate: (taskId: string, patch: Partial<TaskWithAssignee>) => void;
}) {
  const { setNodeRef, isOver } = useSortable({ id: column.id, disabled: !canEdit });
  const toneClass =
    column.id === "todo" ? "border-sky-200 dark:border-sky-900"
    : column.id === "in_progress" ? "border-amber-200 dark:border-amber-900"
    : "border-emerald-200 dark:border-emerald-900";

  return (
    <div className="flex flex-col min-h-[400px]">
      <div className={cn("flex items-center justify-between px-2 pb-2 border-b-2", toneClass)}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{column.label}</span>
          <Badge variant="secondary" className="text-[10px] tabular-nums">{tasks.length}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">{column.description}</span>
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
            <SortableCard key={task.id} task={task} index={i} onClick={() => onCardClick(task)} canEdit={canEdit} members={members} onLocalUpdate={onLocalUpdate} />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
            {column.id === "done" ? "Nothing shipped yet." : "Drop tasks here"}
          </div>
        )}
      </div>
    </div>
  );
}

function SortableCard({
  task,
  index,
  onClick,
  canEdit,
  members,
  onLocalUpdate,
}: {
  task: TaskWithAssignee;
  index: number;
  onClick: () => void;
  canEdit: boolean;
  members: Pick<Profile, "id" | "name" | "avatar_url">[];
  onLocalUpdate: (taskId: string, patch: Partial<TaskWithAssignee>) => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !canEdit,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} index={index} onClick={onClick} members={members} canEdit={canEdit} onLocalUpdate={onLocalUpdate} />
    </div>
  );
}

function TaskCard({
  task,
  index = 0,
  onClick,
  dragging = false,
  members = [],
  canEdit = false,
  onLocalUpdate,
}: {
  task: TaskWithAssignee;
  index?: number;
  onClick?: () => void;
  dragging?: boolean;
  members?: Pick<Profile, "id" | "name" | "avatar_url">[];
  canEdit?: boolean;
  onLocalUpdate?: (taskId: string, patch: Partial<TaskWithAssignee>) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index * 0.035, 0.4), ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      onClick={() => {
        if (dragging) return;
        onClick?.();
      }}
    >
      <Card
        className={cn(
          "p-3 space-y-2 cursor-pointer transition-shadow hover:shadow-md",
          task.done && "opacity-75",
          dragging && "ring-2 ring-primary shadow-lg"
        )}
      >
        <div className="flex items-start gap-1.5 flex-wrap">
          {task.pillar && (
            <Badge variant="secondary" className="text-[10px] font-semibold">{task.pillar}</Badge>
          )}
          <Badge variant="outline" className={cn("text-[10px] font-medium", priorityColor(task.priority))}>
            {task.priority}
          </Badge>
          {!task.verified_by_ai && task.source === "cron_audit" && (
            <Badge variant="outline" className="text-[10px]">
              <Sparkles className="size-2.5" /> auto
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {task.verified_by_ai ? (
              <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                <CheckCircle2 className="size-3" /> AI
              </Badge>
            ) : task.url && !task.done ? (
              <CheckWithAIButton taskId={task.id} variant="icon" />
            ) : null}
          </div>
        </div>
        <div className={cn("text-sm font-medium leading-snug line-clamp-3", task.done && "line-through text-muted-foreground")}>
          {stripTaskKey(task.title)}
        </div>
        {task.url && (
          <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
            <ExternalLink className="size-3 shrink-0" />
            <span className="truncate">{(() => { try { return new URL(task.url).pathname; } catch { return task.url; } })()}</span>
          </div>
        )}
        <div className="flex items-center justify-between pt-2 border-t border-border/60">
          <div className="flex items-center gap-1.5 min-w-0" onClick={(e) => e.stopPropagation()}>
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
            ) : null}
            {task.assignee ? (
              <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">{task.assignee.name}</span>
            ) : (
              <span className="text-[10px] text-muted-foreground">Unassigned</span>
            )}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Calendar className="size-3" />
            {/* Prefer scheduled_date (when the dev will actually work on this).
                Fall back to created_at only if no schedule was set. */}
            <span title={task.scheduled_date ? "Scheduled" : "Created"}>
              {format(new Date(task.scheduled_date ?? task.created_at), "MMM d")}
            </span>
            {task.completed_at && (
              <>
                <span className="opacity-50">→</span>
                <span className="text-emerald-600 dark:text-emerald-400">{format(new Date(task.completed_at), "MMM d")}</span>
              </>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
