"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Search, ExternalLink, Trash2, GitMerge, RefreshCw, CheckCircle2,
  ChevronUp, ChevronDown, Loader2, Filter, X, ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateBlogAuditStatus } from "@/lib/actions/blog-audit";
import type { BlogAuditRow, BlogAuditDecision, BlogAuditStatus } from "@/lib/data/blog-audit";

interface Props {
  rows: BlogAuditRow[];
}

type DecisionFilter = "all" | BlogAuditDecision;
type StatusFilter = "all" | BlogAuditStatus;
type SortKey = "impressions" | "clicks" | "position" | "sessions" | "url";

const DECISION_TONE: Record<BlogAuditDecision, { label: string; chip: string; icon: typeof Trash2 }> = {
  prune:   { label: "Prune",   chip: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900",
             icon: Trash2 },
  merge:   { label: "Merge",   chip: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
             icon: GitMerge },
  refresh: { label: "Refresh", chip: "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900",
             icon: RefreshCw },
  keep:    { label: "Keep",    chip: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900",
             icon: CheckCircle2 },
};

const STATUS_TONE: Record<BlogAuditStatus, string> = {
  todo: "bg-slate-100 text-slate-700 border-slate-200",
  in_progress: "bg-sky-100 text-sky-800 border-sky-200",
  done: "bg-emerald-100 text-emerald-800 border-emerald-200",
  skipped: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

export function BlogAuditTable({ rows }: Props) {
  const [search, setSearch] = useState("");
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todo");
  const [sortKey, setSortKey] = useState<SortKey>("impressions");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = rows;
    if (decisionFilter !== "all") list = list.filter((r) => r.decision === decisionFilter);
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    if (term) list = list.filter((r) =>
      r.url.toLowerCase().includes(term) ||
      (r.merge_target_url ?? "").toLowerCase().includes(term) ||
      (r.decision_reason ?? "").toLowerCase().includes(term)
    );
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const ax = sortKey === "url" ? a.url
        : sortKey === "impressions" ? a.gsc_impressions
        : sortKey === "clicks" ? a.gsc_clicks
        : sortKey === "position" ? (a.gsc_position ?? 999)
        : a.ga4_sessions;
      const bx = sortKey === "url" ? b.url
        : sortKey === "impressions" ? b.gsc_impressions
        : sortKey === "clicks" ? b.gsc_clicks
        : sortKey === "position" ? (b.gsc_position ?? 999)
        : b.ga4_sessions;
      if (typeof ax === "string" && typeof bx === "string") return ax.localeCompare(bx) * dir;
      return ((ax as number) - (bx as number)) * dir;
    });
  }, [rows, search, decisionFilter, statusFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const reset = () => {
    setSearch(""); setDecisionFilter("all"); setStatusFilter("todo");
    setSortKey("impressions"); setSortDir("desc");
  };
  const activeFilterCount = (search ? 1 : 0) + (decisionFilter !== "all" ? 1 : 0) + (statusFilter !== "todo" ? 1 : 0);

  return (
    <Card className="overflow-hidden">
      {/* Filter bar */}
      <div className="border-b border-border bg-muted/30 px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search URL, merge target, or reason..."
            className="pl-9 h-8 text-sm"
          />
        </div>
        <FilterPill label="Decision" value={decisionFilter} onChange={(v) => setDecisionFilter(v as DecisionFilter)} options={[
          { value: "all", label: "All decisions" },
          { value: "refresh", label: "Refresh" },
          { value: "merge", label: "Merge" },
          { value: "prune", label: "Prune" },
          { value: "keep", label: "Keep" },
        ]} />
        <FilterPill label="Status" value={statusFilter} onChange={(v) => setStatusFilter(v as StatusFilter)} options={[
          { value: "all", label: "All statuses" },
          { value: "todo", label: "To do" },
          { value: "in_progress", label: "In progress" },
          { value: "done", label: "Done" },
          { value: "skipped", label: "Skipped" },
        ]} />
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={reset} className="text-xs">
            <X className="size-3" />
            Reset filters
          </Button>
        )}
        <div className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {rows.length} URLs
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">
                <SortHeader active={sortKey === "url"} dir={sortDir} onClick={() => toggleSort("url")}>URL</SortHeader>
              </th>
              <th className="text-left px-3 py-2 font-medium">Decision</th>
              <th className="text-right px-3 py-2 font-medium">
                <SortHeader active={sortKey === "impressions"} dir={sortDir} onClick={() => toggleSort("impressions")}>Imp 16mo</SortHeader>
              </th>
              <th className="text-right px-3 py-2 font-medium">
                <SortHeader active={sortKey === "clicks"} dir={sortDir} onClick={() => toggleSort("clicks")}>Clicks</SortHeader>
              </th>
              <th className="text-right px-3 py-2 font-medium">
                <SortHeader active={sortKey === "position"} dir={sortDir} onClick={() => toggleSort("position")}>Avg pos</SortHeader>
              </th>
              <th className="text-right px-3 py-2 font-medium">
                <SortHeader active={sortKey === "sessions"} dir={sortDir} onClick={() => toggleSort("sessions")}>GA4 sess</SortHeader>
              </th>
              <th className="text-left px-3 py-2 font-medium">Reason / target</th>
              <th className="text-left px-3 py-2 font-medium w-[140px]">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center text-muted-foreground py-12 text-sm">
                <Filter className="size-5 mx-auto mb-2 opacity-50" />
                No URLs match the current filters.
              </td></tr>
            )}
            {filtered.map((r) => (
              <Row key={r.id} row={r} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SortHeader({ active, dir, onClick, children }: {
  active: boolean; dir: "asc" | "desc"; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
      {children}
      {active && (dir === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
    </button>
  );
}

function FilterPill({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  const matched = options.find((o) => o.value === value);
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)}>
      <SelectTrigger className="h-8 text-xs gap-1.5 border-dashed">
        <span className="text-muted-foreground">{label}:</span>
        <span className="text-[#231D4F] dark:text-foreground">{matched?.label ?? "—"}</span>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Row({ row }: { row: BlogAuditRow }) {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<BlogAuditStatus>(row.status);
  const tone = DECISION_TONE[row.decision];
  const Icon = tone.icon;

  const setNew = (next: BlogAuditStatus) => {
    setStatus(next);
    start(async () => {
      try {
        await updateBlogAuditStatus(row.id, next);
        toast.success(`Marked ${next.replace("_", " ")}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Update failed");
        setStatus(row.status);
      }
    });
  };

  const slug = (() => {
    try { return new URL(row.url).pathname; } catch { return row.url; }
  })();

  return (
    <tr className={cn(
      "border-t border-border/60 hover:bg-muted/30 transition-colors",
      status === "done" && "opacity-60",
      status === "skipped" && "opacity-40",
    )}>
      <td className="px-3 py-2.5 align-top max-w-[360px]">
        <a href={row.url} target="_blank" rel="noreferrer"
           className="text-xs font-medium text-foreground hover:text-[#5B45E0] hover:underline inline-flex items-center gap-1 break-all">
          {slug}
          <ExternalLink className="size-2.5 shrink-0 opacity-50" />
        </a>
      </td>
      <td className="px-3 py-2.5 align-top">
        <Badge className={cn("gap-1 text-[10px] border", tone.chip)}>
          <Icon className="size-3" />
          {tone.label}
        </Badge>
      </td>
      <td className="px-3 py-2.5 align-top text-right tabular-nums text-xs">
        {row.gsc_impressions.toLocaleString()}
      </td>
      <td className="px-3 py-2.5 align-top text-right tabular-nums text-xs">
        {row.gsc_clicks.toLocaleString()}
      </td>
      <td className="px-3 py-2.5 align-top text-right tabular-nums text-xs">
        {row.gsc_position == null ? "—" : row.gsc_position.toFixed(1)}
      </td>
      <td className="px-3 py-2.5 align-top text-right tabular-nums text-xs">
        {row.ga4_sessions.toLocaleString()}
      </td>
      <td className="px-3 py-2.5 align-top text-[11px] text-muted-foreground max-w-[280px]">
        <div className="line-clamp-2">{row.decision_reason ?? "—"}</div>
        {row.merge_target_url && (
          <a href={row.merge_target_url} target="_blank" rel="noreferrer"
             className="mt-1 inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400 hover:underline">
            <ArrowUpRight className="size-2.5" />
            <span className="font-medium">Merge target:</span>
            <span className="break-all">{(() => { try { return new URL(row.merge_target_url).pathname; } catch { return row.merge_target_url; } })()}</span>
            {row.merge_target_score != null && <span className="opacity-60">({row.merge_target_score.toFixed(2)})</span>}
          </a>
        )}
      </td>
      <td className="px-3 py-2.5 align-top">
        <Select value={status} onValueChange={(v) => v && setNew(v as BlogAuditStatus)} disabled={pending}>
          <SelectTrigger className={cn("h-7 text-[11px] border", STATUS_TONE[status])}>
            {pending ? <Loader2 className="size-3 animate-spin" /> : <SelectValue />}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todo" className="text-xs">📌 To do</SelectItem>
            <SelectItem value="in_progress" className="text-xs">⚡ In progress</SelectItem>
            <SelectItem value="done" className="text-xs">✅ Done</SelectItem>
            <SelectItem value="skipped" className="text-xs">⏭️ Skipped</SelectItem>
          </SelectContent>
        </Select>
      </td>
    </tr>
  );
}
