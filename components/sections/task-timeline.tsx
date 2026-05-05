"use client";

import { useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { format, parseISO, isWithinInterval, addDays, startOfMonth, endOfMonth } from "date-fns";
import { Filter, ChevronRight, ListChecks, PenLine, User, Calendar, ArrowRight, Search, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { TaskDetailDialog } from "@/components/sections/task-detail-dialog";
import { BlogTaskDetailDialog } from "@/components/sections/blog-task-detail-dialog";
import { initials, stripTaskKey, stripTaskPrefix, formatVolume, taskTypeBadgeClass } from "@/lib/ui-helpers";
import type { Profile } from "@/lib/types/database";
import type { TaskWithAssignee } from "@/lib/data/tasks";

// ============================================================
// Brand tokens (from BRAND_GUIDELINES.md, mirroring globals.css)
//   Primary Purple   #5B45E0   — anchor + active states
//   Light Purple     #7B62FF   — secondary accents
//   Yellow           #FEB800   — highlight / "today"
//   Heading text     #231D4F
//   Muted text       #7E8492
//   Surface light    #F8FAFC
//   Surface tint     #F0ECFF
// ============================================================

const KIND_TONE = {
  web_task: {
    label: "Web",
    line: "#5B45E0",
    chipBg: "bg-[#F0ECFF] text-[#5B45E0] border-[#5B45E0]/20",
    leafBg: "bg-white border-[#5B45E0]/30 hover:border-[#5B45E0]",
    accent: "#5B45E0",
    icon: ListChecks,
  },
  // kind=blog_task in the DB now covers BOTH content writing tasks AND
  // SEO ops/admin tasks (GBP setup, GA4 cleanup, monthly report, internal-
  // linking sweep, etc.) — so the user-facing label is "SEO" rather than "Blog".
  blog_task: {
    label: "SEO",
    line: "#D946EF",
    chipBg: "bg-[#FDF4FF] text-[#A21CAF] border-[#D946EF]/20",
    leafBg: "bg-white border-[#D946EF]/30 hover:border-[#D946EF]",
    accent: "#D946EF",
    icon: PenLine,
  },
} as const;

const PRIORITY_BADGE: Record<string, string> = {
  critical: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
  high: "bg-[#FEB800]/15 text-[#8a6500] border-[#FEB800]/30",
  medium: "bg-[#7B62FF]/10 text-[#5B45E0] border-[#7B62FF]/20",
  low: "bg-muted text-muted-foreground border-transparent",
};

const STATUS_BADGE: Record<string, string> = {
  todo: "bg-slate-100 text-slate-700 border-slate-200",
  in_progress: "bg-amber-100 text-amber-800 border-amber-200",
  review: "bg-sky-100 text-sky-800 border-sky-200",
  done: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

// ============================================================
// Filtering + grouping
// ============================================================

type KindFilter = "all" | "web_task" | "blog_task";
type AssigneeFilter = string; // "all" | "unassigned" | profile.id
type RangeFilter = "30d" | "60d" | "90d" | "all";

interface MonthGroup {
  monthKey: string;          // "2026-04"
  monthLabel: string;        // "Apr 2026"
  totalCount: number;
  byKind: Map<"web_task" | "blog_task", TaskWithAssignee[]>;
}

function buildMonthGroups(tasks: TaskWithAssignee[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const t of tasks) {
    if (!t.scheduled_date) continue;
    const d = parseISO(t.scheduled_date);
    const monthKey = format(d, "yyyy-MM");
    const monthLabel = format(d, "MMM yyyy");
    const grp = map.get(monthKey) ?? {
      monthKey, monthLabel, totalCount: 0,
      byKind: new Map([["web_task", []], ["blog_task", []]]),
    };
    grp.totalCount++;
    const kind = (t.kind ?? "web_task") as "web_task" | "blog_task";
    grp.byKind.get(kind)!.push(t);
    map.set(monthKey, grp);
  }
  // Sort tasks within each kind by scheduled_date, then priority
  const prioRank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  for (const grp of map.values()) {
    for (const list of grp.byKind.values()) {
      list.sort((a, b) => {
        const dateCmp = (a.scheduled_date ?? "").localeCompare(b.scheduled_date ?? "");
        if (dateCmp !== 0) return dateCmp;
        return (prioRank[a.priority as keyof typeof prioRank] ?? 9) - (prioRank[b.priority as keyof typeof prioRank] ?? 9);
      });
    }
  }
  return [...map.values()].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

// ============================================================
// Component
// ============================================================

interface Props {
  tasks: TaskWithAssignee[];
  members: Pick<Profile, "id" | "name" | "avatar_url">[];
  canEdit: boolean;
  projectId: string;
}

export function TaskTimeline({ tasks, members, canEdit, projectId }: Props) {
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>("90d");
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedKinds, setExpandedKinds] = useState<Set<string>>(new Set());
  const [activeTask, setActiveTask] = useState<TaskWithAssignee | null>(null);

  // ---- filter ----
  const filtered = useMemo(() => {
    let out = tasks;
    if (kindFilter !== "all") out = out.filter((t) => t.kind === kindFilter);
    if (assigneeFilter === "unassigned") out = out.filter((t) => !t.team_member_id);
    else if (assigneeFilter !== "all") out = out.filter((t) => t.team_member_id === assigneeFilter);
    if (rangeFilter !== "all") {
      const days = rangeFilter === "30d" ? 30 : rangeFilter === "60d" ? 60 : 90;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const horizon = addDays(today, days);
      out = out.filter((t) => {
        if (!t.scheduled_date) return false;
        const d = parseISO(t.scheduled_date);
        return isWithinInterval(d, { start: addDays(today, -7), end: horizon });
      });
    }
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.trim().toLowerCase();
      out = out.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        (t.target_keyword?.toLowerCase().includes(q) ?? false) ||
        (t.url?.toLowerCase().includes(q) ?? false)
      );
    }
    return out;
  }, [tasks, kindFilter, assigneeFilter, rangeFilter, searchQuery]);

  // Track which filters are non-default so we can show an "active" count chip
  const activeFilterCount =
    (rangeFilter !== "90d" ? 1 : 0) +
    (kindFilter !== "all" ? 1 : 0) +
    (assigneeFilter !== "all" ? 1 : 0) +
    (searchQuery.trim().length > 0 ? 1 : 0);

  const resetFilters = () => {
    setRangeFilter("90d");
    setKindFilter("all");
    setAssigneeFilter("all");
    setSearchQuery("");
  };

  const groups = useMemo(() => buildMonthGroups(filtered), [filtered]);

  // Auto-expand the first month so the page isn't blank on first paint
  const initiallyOpen = useMemo(() => {
    if (groups.length === 0) return new Set<string>();
    return new Set([groups[0].monthKey]);
  }, [groups]);

  const expandedSet = expandedMonths.size === 0 ? initiallyOpen : expandedMonths;

  const toggleMonth = useCallback((key: string) => {
    setExpandedMonths((prev) => {
      const base = prev.size === 0 ? new Set(initiallyOpen) : new Set(prev);
      if (base.has(key)) base.delete(key); else base.add(key);
      return base;
    });
  }, [initiallyOpen]);

  const toggleKind = useCallback((monthKey: string, kind: "web_task" | "blog_task") => {
    const id = `${monthKey}::${kind}`;
    setExpandedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const expandAll = () => {
    setExpandedMonths(new Set(groups.map((g) => g.monthKey)));
    setExpandedKinds(new Set(groups.flatMap((g) => ["web_task", "blog_task"].map((k) => `${g.monthKey}::${k}`))));
  };
  const collapseAll = () => {
    setExpandedMonths(new Set());
    setExpandedKinds(new Set());
  };

  return (
    <div className="space-y-5">
      {/* ============== Filter bar (inline pills, Spider/SEO-style) ============== */}
      {filtersVisible && (
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search input — leading position, sets the visual rhythm */}
          <div className="relative flex-1 min-w-[220px] max-w-[320px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#7E8492] pointer-events-none" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, keyword, or URL"
              className="h-9 pl-9 pr-3 text-xs bg-white dark:bg-card border-[#E5E7EB] rounded-md placeholder:text-[#7E8492]"
            />
          </div>

          <FilterPill
            value={rangeFilter}
            onValueChange={(v) => setRangeFilter(v as RangeFilter)}
            placeholder="Date range"
            options={[
              { value: "30d", label: "Next 30 days" },
              { value: "60d", label: "Next 60 days" },
              { value: "90d", label: "Next 90 days" },
              { value: "all", label: "All time" },
            ]}
          />

          <FilterPill
            value={kindFilter}
            onValueChange={(v) => setKindFilter(v as KindFilter)}
            placeholder="Kind"
            options={[
              { value: "all", label: "All tasks" },
              { value: "web_task", label: "Web tasks" },
              { value: "blog_task", label: "SEO tasks" },
            ]}
          />

          <FilterPill
            value={assigneeFilter}
            onValueChange={(v) => setAssigneeFilter(v as AssigneeFilter)}
            placeholder="Assignee"
            options={[
              { value: "all", label: "All assignees" },
              { value: "unassigned", label: "Unassigned" },
              ...members.map((m) => ({ value: m.id, label: m.name })),
            ]}
          />

          {/* Reset chip — only shows when at least one filter is non-default */}
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-md text-xs font-medium text-[#5B45E0] hover:bg-[#F0ECFF] transition-colors"
            >
              Reset
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#5B45E0] text-white text-[10px] font-semibold tabular-nums">
                {activeFilterCount}
              </span>
            </button>
          )}

          <div className="ml-auto flex items-center gap-1">
            <Button size="xs" variant="ghost" onClick={expandAll} className="text-xs">Expand all</Button>
            <Button size="xs" variant="ghost" onClick={collapseAll} className="text-xs">Collapse all</Button>
            <button
              type="button"
              onClick={() => setFiltersVisible(false)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-xs font-medium text-[#7E8492] border border-[#E5E7EB] bg-white hover:bg-[#F8FAFC] hover:text-[#231D4F] transition-colors"
            >
              <EyeOff className="size-3.5" />
              Hide filters
            </button>
          </div>
        </div>
      )}

      {/* Show a small "Show filters" chip when hidden so the toggle is reachable */}
      {!filtersVisible && (
        <button
          type="button"
          onClick={() => setFiltersVisible(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-xs font-medium text-[#231D4F] dark:text-white border border-[#E5E7EB] bg-white hover:bg-[#F0ECFF] hover:border-[#5B45E0]/40 transition-colors"
        >
          <Filter className="size-3.5 text-[#5B45E0]" />
          Show filters
          {activeFilterCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#5B45E0] text-white text-[10px] font-semibold tabular-nums">
              {activeFilterCount}
            </span>
          )}
        </button>
      )}

      {/* ============== Empty state ============== */}
      {groups.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground border-dashed">
          No tasks match these filters. Try widening the date range or clearing the assignee filter.
        </Card>
      ) : (
        <Card className="p-6 lg:p-8 overflow-hidden border-[#E5E7EB]">
          <div className="relative flex flex-col md:flex-row gap-5 md:gap-6">
            {/* ============== Top-left anchor ============== */}
            {/* Smaller, cleaner — just the count. Aligned to top so the connector
                lines fan DOWN-RIGHT into the month rows like a tree from a root. */}
            <div className="shrink-0 self-start md:pt-1">
              <div className="relative inline-flex">
                <div className="absolute inset-0 bg-[#5B45E0] blur-xl opacity-20 rounded-full" />
                <div className="relative size-24 md:size-28 rounded-full bg-gradient-to-br from-[#5B45E0] via-[#7B62FF] to-[#5B45E0] flex flex-col items-center justify-center text-white shadow-lg shadow-[#5B45E0]/25">
                  <div className="text-3xl font-bold tabular-nums leading-none">{filtered.length}</div>
                  <div className="mt-1 text-[10px] opacity-90 uppercase tracking-widest">tasks</div>
                </div>
              </div>
            </div>

            {/* ============== Months column ============== */}
            <div className="flex-1 min-w-0 space-y-4">
              {groups.map((g, mi) => (
                <MonthRow
                  key={g.monthKey}
                  group={g}
                  expanded={expandedSet.has(g.monthKey)}
                  onToggle={() => toggleMonth(g.monthKey)}
                  kindExpanded={expandedKinds}
                  onToggleKind={toggleKind}
                  onTaskClick={setActiveTask}
                  index={mi}
                />
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* ============== Legend ============== */}
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap px-1">
        <div className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[#5B45E0]" />
          Web tasks
        </div>
        <div className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[#D946EF]" />
          Blog tasks
        </div>
        <div className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[#FEB800]" />
          High / critical priority
        </div>
        <div className="ml-auto text-muted-foreground">
          ▸ Collapsed · ▾ Expanded · click any task for details
        </div>
      </div>

      {/* ============== Task detail dialogs ============== */}
      {/* Web tasks reuse the standard kanban dialog. Blog tasks use the richer
          Blog Sprint dialog (briefs, copy AI prompt, Generate-with-AI). The
          two dialogs are separate components so we render whichever matches
          the active task's kind. */}
      <TaskDetailDialog
        task={activeTask?.kind === "web_task" ? activeTask : null}
        open={activeTask?.kind === "web_task"}
        onOpenChange={(v) => !v && setActiveTask(null)}
        members={members.map((m) => ({ id: m.id, name: m.name, avatar_url: m.avatar_url, email: "", role: "member", platform_admin: false } as Profile))}
        canEdit={canEdit}
      />
      <BlogTaskDetailDialog
        task={activeTask?.kind === "blog_task" ? activeTask : null}
        open={activeTask?.kind === "blog_task"}
        onOpenChange={(v) => !v && setActiveTask(null)}
        members={members.map((m) => ({ id: m.id, name: m.name, avatar_url: m.avatar_url } as Profile))}
        canEdit={canEdit}
        projectId={projectId}
      />
    </div>
  );
}

// ============================================================
// Month row
// ============================================================

function MonthRow({
  group, expanded, onToggle, kindExpanded, onToggleKind, onTaskClick, index,
}: {
  group: MonthGroup;
  expanded: boolean;
  onToggle: () => void;
  kindExpanded: Set<string>;
  onToggleKind: (monthKey: string, kind: "web_task" | "blog_task") => void;
  onTaskClick: (t: TaskWithAssignee) => void;
  index: number;
}) {
  const monthDate = parseISO(`${group.monthKey}-01`);
  const isCurrentMonth = format(new Date(), "yyyy-MM") === group.monthKey;
  const webCount = group.byKind.get("web_task")?.length ?? 0;
  const blogCount = group.byKind.get("blog_task")?.length ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.2 }}
      className="relative"
    >
      {/* Connector to centre — only render the visual hint on md+ */}
      <div className="hidden md:block absolute -left-6 top-9 w-6 h-px bg-gradient-to-r from-[#5B45E0]/50 to-[#5B45E0]" aria-hidden />

      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors border",
          expanded
            ? "bg-[#F0ECFF] border-[#5B45E0]/30"
            : "bg-white dark:bg-card border-[#E5E7EB] hover:border-[#5B45E0]/40 hover:bg-[#F0ECFF]/40",
        )}
      >
        <ChevronRight
          className={cn(
            "size-4 text-[#5B45E0] transition-transform shrink-0",
            expanded && "rotate-90",
          )}
        />
        <div className="flex flex-col leading-tight">
          <div className="text-sm font-semibold text-[#231D4F] dark:text-white">
            {format(monthDate, "MMMM yyyy")}
            {isCurrentMonth && (
              <span className="ml-2 inline-block text-[9px] uppercase tracking-widest bg-[#FEB800] text-[#231D4F] px-1.5 py-px rounded font-bold align-middle">
                Current
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {group.totalCount} task{group.totalCount === 1 ? "" : "s"} scheduled
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {webCount > 0 && (
            <Badge className={cn("text-[10px] gap-1 border", KIND_TONE.web_task.chipBg)}>
              <ListChecks className="size-3" />
              {webCount} web
            </Badge>
          )}
          {blogCount > 0 && (
            <Badge className={cn("text-[10px] gap-1 border", KIND_TONE.blog_task.chipBg)}>
              <PenLine className="size-3" />
              {blogCount} SEO
            </Badge>
          )}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pl-6 pt-3 space-y-3">
              {(["web_task", "blog_task"] as const).map((kind) => {
                const tasks = group.byKind.get(kind) ?? [];
                if (tasks.length === 0) return null;
                const id = `${group.monthKey}::${kind}`;
                const isOpen = kindExpanded.has(id);
                const tone = KIND_TONE[kind];
                return (
                  <KindBranch
                    key={kind}
                    kind={kind}
                    tasks={tasks}
                    expanded={isOpen}
                    onToggle={() => onToggleKind(group.monthKey, kind)}
                    onTaskClick={onTaskClick}
                  />
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ============================================================
// Kind branch (Web / Blog inside a month)
// ============================================================

function KindBranch({
  kind, tasks, expanded, onToggle, onTaskClick,
}: {
  kind: "web_task" | "blog_task";
  tasks: TaskWithAssignee[];
  expanded: boolean;
  onToggle: () => void;
  onTaskClick: (t: TaskWithAssignee) => void;
}) {
  const tone = KIND_TONE[kind];
  const Icon = tone.icon;

  return (
    <div>
      <button
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-2 rounded-md px-3 py-2 text-left transition-colors border-l-4 hover:bg-muted/40",
          "border-l-transparent",
        )}
        style={{ borderLeftColor: expanded ? tone.accent : "transparent" }}
      >
        <ChevronRight
          className={cn("size-3.5 transition-transform shrink-0", expanded && "rotate-90")}
          style={{ color: tone.accent }}
        />
        <Icon className="size-3.5 shrink-0" style={{ color: tone.accent }} />
        <span className="text-xs font-semibold" style={{ color: tone.accent }}>
          {tone.label} tasks
        </span>
        <span className="text-[11px] text-muted-foreground">
          ({tasks.length})
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pl-7 pt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {tasks.map((t) => (
                <TaskLeaf key={t.id} task={t} tone={tone} onClick={() => onTaskClick(t)} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// Task leaf card
// ============================================================

// ============================================================
// Filter pill — Spider/SEO-style compact dropdown
// ============================================================
function FilterPill({
  value, onValueChange, placeholder, options,
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
}) {
  const matched = options.find((o) => o.value === value);
  return (
    <Select value={value} onValueChange={(v) => v && onValueChange(v)}>
      <SelectTrigger className="h-9 px-3 text-xs font-medium bg-white dark:bg-card border-[#E5E7EB] hover:border-[#5B45E0]/40 hover:text-[#231D4F] data-[state=open]:border-[#5B45E0] data-[state=open]:bg-[#F0ECFF] rounded-md transition-colors min-w-[140px] [&>svg]:text-[#7E8492]">
        <SelectValue placeholder={placeholder}>
          <span className="text-[#231D4F] dark:text-white">{matched?.label ?? placeholder}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type KindToneEntry = (typeof KIND_TONE)[keyof typeof KIND_TONE];

function TaskLeaf({
  task, tone, onClick,
}: {
  task: TaskWithAssignee;
  tone: KindToneEntry;
  onClick: () => void;
}) {
  const sched = task.scheduled_date ? format(parseISO(task.scheduled_date), "MMM d") : null;
  return (
    <button
      onClick={onClick}
      className={cn(
        "group text-left rounded-lg border-2 px-3 py-2.5 transition-all",
        tone.leafBg,
        "hover:shadow-md hover:-translate-y-0.5",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="text-[12px] font-semibold leading-snug text-[#231D4F] dark:text-white line-clamp-2 flex-1">
          {stripTaskPrefix(stripTaskKey(task.title))}
        </div>
        <Badge className={cn("text-[9px] border shrink-0", PRIORITY_BADGE[task.priority ?? "medium"])}>
          {task.priority}
        </Badge>
      </div>

      {/* Type + volume badges — only render when present (no clutter on dev/ops tasks) */}
      {(task.task_type || task.est_volume) && (
        <div className="flex items-center gap-1 mb-1.5 flex-wrap">
          {task.task_type && (
            <Badge className={cn("text-[9px] border px-1.5", taskTypeBadgeClass(task.task_type))}>
              {task.task_type}
            </Badge>
          )}
          {task.est_volume != null && task.est_volume > 0 && (
            <Badge variant="outline" className="text-[9px] border tabular-nums">
              {formatVolume(task.est_volume)}
            </Badge>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <div className="inline-flex items-center gap-1.5 min-w-0">
          {sched && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-2.5" />
              {sched}
            </span>
          )}
          <Badge className={cn("text-[9px] border", STATUS_BADGE[task.status ?? "todo"])}>
            {(task.status ?? "todo").replace("_", " ")}
          </Badge>
        </div>
        <div className="inline-flex items-center gap-1 shrink-0">
          {task.assignee ? (
            <Avatar className="size-4">
              <AvatarFallback className="text-[7px] bg-[#F0ECFF] text-[#5B45E0]">
                {initials(task.assignee.name)}
              </AvatarFallback>
            </Avatar>
          ) : (
            <User className="size-2.5" />
          )}
          <span className="truncate max-w-[60px]">
            {task.assignee?.name ?? "Unassigned"}
          </span>
        </div>
      </div>
    </button>
  );
}
