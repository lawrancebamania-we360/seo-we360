"use client";

// Blog Sprint — List + Calendar renderings over the SAME (filtered) blog tasks
// the board shows. Clicking a row / calendar chip opens the shared
// BlogTaskDetailDialog. Written against We360's own TaskWithAssignee (title,
// target_keyword, status, priority, assignee, scheduled_date) + We360's dialog —
// no dependency on Klimb's diverged task fields. Board + Timeline stay their own
// components; this covers the two views We360 was missing.

import { useState } from "react";
import { CalendarDays } from "lucide-react";

import type { TaskWithAssignee } from "@/lib/data/tasks";
import { BlogTaskDetailDialog } from "@/components/sections/blog-task-detail-dialog";
import { cn } from "@/lib/utils";

type Member = { id: string; name: string; avatar_url: string | null };

const STATUS_META: Record<string, { label: string; chip: string }> = {
  todo: { label: "Idea", chip: "bg-muted text-muted-foreground" },
  in_progress: { label: "In progress", chip: "bg-info/10 text-info-strong" },
  review: { label: "Review", chip: "bg-warning/10 text-warning-strong" },
  done: { label: "Done", chip: "bg-success/10 text-success-strong" },
};
const PRIORITY_CLASS: Record<string, string> = {
  critical: "text-error-strong",
  high: "text-warning-strong",
  medium: "text-info-strong",
  low: "text-slate-400",
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  } catch {
    return "—";
  }
}
function initials(name: string): string {
  return (
    name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("") || "?"
  );
}

export function BlogTaskViews({
  tasks,
  members,
  canEdit,
  projectId,
  variant,
}: {
  tasks: TaskWithAssignee[];
  members: Member[];
  canEdit: boolean;
  projectId: string;
  variant: "list" | "calendar";
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const active = tasks.find((t) => t.id === openId) ?? null;

  return (
    <>
      {variant === "list" ? (
        <ListView tasks={tasks} onOpen={setOpenId} />
      ) : (
        <CalendarView tasks={tasks} onOpen={setOpenId} />
      )}
      <BlogTaskDetailDialog
        task={active}
        open={openId != null}
        onOpenChange={(v) => {
          if (!v) setOpenId(null);
        }}
        members={members}
        canEdit={canEdit}
        projectId={projectId}
      />
    </>
  );
}

// ---- List ------------------------------------------------------------------

const LIST_GRID = "minmax(220px,3fr) minmax(140px,1.4fr) 120px 96px 140px 110px";

function ListView({ tasks, onOpen }: { tasks: TaskWithAssignee[]; onOpen: (id: string) => void }) {
  if (tasks.length === 0) return <EmptyState />;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <div style={{ minWidth: 900 }}>
          <div
            style={{ gridTemplateColumns: LIST_GRID }}
            className="grid items-center gap-4 border-b border-border bg-muted/40 px-5 py-3"
          >
            {["Topic", "Keyword", "Status", "Priority", "Assignee", "Scheduled"].map((h) => (
              <span key={h} className="font-mono text-[11.5px] font-medium uppercase tracking-[0.09em] text-slate-400">
                {h}
              </span>
            ))}
          </div>
          {tasks.map((t) => {
            const s = STATUS_META[t.status] ?? STATUS_META.todo;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onOpen(t.id)}
                style={{ gridTemplateColumns: LIST_GRID }}
                className="grid w-full items-center gap-4 border-b border-border/60 px-5 py-3.5 text-left transition-colors last:border-0 hover:bg-muted/30"
              >
                <span className="truncate text-sm font-semibold text-foreground">{t.title}</span>
                <span className="truncate font-mono text-[12.5px] text-slate-500">{t.target_keyword || "—"}</span>
                <span>
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", s.chip)}>
                    {s.label}
                  </span>
                </span>
                <span className={cn("text-[12.5px] font-semibold capitalize", PRIORITY_CLASS[t.priority] ?? "text-slate-400")}>
                  {t.priority}
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  {t.assignee ? (
                    <>
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                        {initials(t.assignee.name)}
                      </span>
                      <span className="truncate text-[12.5px] text-slate-600">{t.assignee.name}</span>
                    </>
                  ) : (
                    <span className="text-[12.5px] text-slate-400">Unassigned</span>
                  )}
                </span>
                <span className="font-mono text-[12.5px] tabular-nums text-slate-500">{fmtDate(t.scheduled_date)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---- Calendar --------------------------------------------------------------

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function CalendarView({ tasks, onOpen }: { tasks: TaskWithAssignee[]; onOpen: (id: string) => void }) {
  const [monthStart, setMonthStart] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const byDay = new Map<string, TaskWithAssignee[]>();
  for (const t of tasks) {
    if (!t.scheduled_date) continue;
    const key = t.scheduled_date.slice(0, 10);
    const arr = byDay.get(key) ?? [];
    arr.push(t);
    byDay.set(key, arr);
  }

  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const keyFor = (d: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const todayKey = new Date().toISOString().slice(0, 10);
  const unscheduled = tasks.filter((t) => !t.scheduled_date).length;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between px-1">
        <button
          type="button"
          onClick={() => setMonthStart(new Date(year, month - 1, 1))}
          aria-label="Previous month"
          className="rounded-lg border border-border px-2.5 py-1 text-sm text-slate-500 hover:bg-muted"
        >
          ‹
        </button>
        <div className="font-heading text-sm font-semibold text-foreground">{monthLabel}</div>
        <button
          type="button"
          onClick={() => setMonthStart(new Date(year, month + 1, 1))}
          aria-label="Next month"
          className="rounded-lg border border-border px-2.5 py-1 text-sm text-slate-500 hover:bg-muted"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="pb-1 text-center font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-slate-400">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d == null) return <div key={i} className="min-h-[86px] rounded-lg bg-muted/20" />;
          const k = keyFor(d);
          const dayTasks = byDay.get(k) ?? [];
          const isToday = k === todayKey;
          return (
            <div
              key={i}
              className={cn("min-h-[86px] rounded-lg border border-border/60 p-1.5", isToday && "ring-1 ring-primary")}
            >
              <div className={cn("mb-1 text-[11px] font-semibold tabular-nums", isToday ? "text-primary" : "text-slate-400")}>
                {d}
              </div>
              <div className="space-y-1">
                {dayTasks.slice(0, 3).map((t) => {
                  const s = STATUS_META[t.status] ?? STATUS_META.todo;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onOpen(t.id)}
                      title={t.title}
                      className={cn("block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium", s.chip)}
                    >
                      {t.title}
                    </button>
                  );
                })}
                {dayTasks.length > 3 && (
                  <div className="px-1 text-[10.5px] text-slate-400">+{dayTasks.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {unscheduled > 0 && (
        <p className="mt-3 px-1 text-[12px] text-slate-400">
          {unscheduled} task{unscheduled === 1 ? "" : "s"} with no scheduled date — set one from the board or the task detail to see it here.
        </p>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
      <CalendarDays className="mx-auto size-6 text-slate-300" />
      <div className="mt-2 text-sm font-semibold text-slate-700 dark:text-foreground">No blog tasks match</div>
      <div className="mt-1 text-[13px] text-slate-400">Adjust the filters, or add a task from the board.</div>
    </div>
  );
}
