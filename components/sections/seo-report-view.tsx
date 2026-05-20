"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ExternalLink, TrendingUp, AlertTriangle, Search, FileText,
  Trophy, CircleSlash, MousePointerClick, Loader2, ArrowUp, ArrowDown,
  CheckCircle2, XCircle, MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import type { SeoReportRow, SeoReportRollup, ReportHealth } from "@/lib/data/seo-report";

const RANGE_PRESETS: { key: string; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "ytd", label: "This year" },
];

type HealthFilter = "all" | ReportHealth;

interface Props {
  rows: SeoReportRow[];
  rollup: SeoReportRollup;
  activeRange: string;
}

export function SeoReportView({ rows, rollup, activeRange }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [navPending, startNav] = useTransition();

  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");
  const [kindFilter, setKindFilter] = useState<"all" | "blog_task" | "web_task">("all");
  const [query, setQuery] = useState("");
  // Row whose issues modal is open.
  const [issuesFor, setIssuesFor] = useState<SeoReportRow | null>(null);

  const setRange = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (key === "all") params.delete("range");
    else params.set("range", key);
    startNav(() => router.push(`/dashboard/reports?${params.toString()}`));
  };

  const visible = useMemo(() => {
    let r = rows;
    if (healthFilter !== "all") r = r.filter((x) => x.health === healthFilter);
    if (kindFilter !== "all") r = r.filter((x) => x.kind === kindFilter);
    const ql = query.trim().toLowerCase();
    if (ql) {
      r = r.filter(
        (x) =>
          x.title.toLowerCase().includes(ql) ||
          (x.targetKeyword ?? "").toLowerCase().includes(ql) ||
          (x.liveUrl ?? "").toLowerCase().includes(ql),
      );
    }
    return r;
  }, [rows, healthFilter, kindFilter, query]);

  const healthCounts = useMemo(() => ({
    all: rows.length,
    problem: rows.filter((r) => r.health === "problem").length,
    watch: rows.filter((r) => r.health === "watch").length,
    winning: rows.filter((r) => r.health === "winning").length,
  }), [rows]);

  return (
    <div className="space-y-5">
      {/* ===== Rollup cards ===== */}
      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <RollupCard icon={FileText} tone="violet" label="Pages shipped" value={rollup.shipped}
          hint="Completed blog + web pages on we360.ai" />
        <RollupCard icon={Trophy} tone="emerald" label="Ranking top 10" value={rollup.rankingTop10}
          hint={`${rollup.rankingTop3} of them in the top 3`} />
        <RollupCard icon={CircleSlash} tone="rose" label="Zero traffic" value={rollup.zeroTraffic}
          hint="30d+ live, 0 clicks & 0 sessions" alarm={rollup.zeroTraffic > 0} />
        <RollupCard icon={MousePointerClick} tone="sky" label="Total organic clicks" value={rollup.totalClicks}
          hint={`${rollup.totalImpressions.toLocaleString()} impressions across shipped pages`} />
      </section>

      {/* Plain-English health line */}
      {rollup.shipped > 0 && (
        <div className={cn(
          "rounded-lg border px-4 py-2.5 text-sm flex items-center gap-2",
          rollup.zeroTraffic > 0 || rollup.notLiveCount > 0
            ? "border-rose-300/50 bg-rose-500/5 text-rose-700 dark:text-rose-300"
            : "border-emerald-300/50 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
        )}>
          {rollup.zeroTraffic > 0 || rollup.notLiveCount > 0
            ? <AlertTriangle className="size-4 shrink-0" />
            : <TrendingUp className="size-4 shrink-0" />}
          <span>
            {rollup.notLiveCount > 0 && `${rollup.notLiveCount} shipped page${rollup.notLiveCount > 1 ? "s are" : " is"} not reachable. `}
            {rollup.zeroTraffic > 0
              ? `${rollup.zeroTraffic} of ${rollup.shipped} shipped pages are earning zero traffic — review or re-promote them.`
              : rollup.notLiveCount === 0 && `All ${rollup.shipped} shipped pages are live and earning impressions or traffic.`}
          </span>
        </div>
      )}

      {/* ===== Filters ===== */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-md border bg-muted/30 p-0.5">
          {RANGE_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setRange(p.key)}
              className={cn(
                "px-2.5 py-1 text-xs rounded transition-colors",
                activeRange === p.key
                  ? "bg-foreground text-background font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
          {navPending && <Loader2 className="size-3 animate-spin text-muted-foreground mx-1.5" />}
        </div>

        <div className="inline-flex items-center gap-1">
          <HealthChip label="All" count={healthCounts.all} active={healthFilter === "all"} onClick={() => setHealthFilter("all")} />
          <HealthChip label="Problem" count={healthCounts.problem} active={healthFilter === "problem"} onClick={() => setHealthFilter("problem")} tone="rose" />
          <HealthChip label="Watch" count={healthCounts.watch} active={healthFilter === "watch"} onClick={() => setHealthFilter("watch")} tone="amber" />
          <HealthChip label="Winning" count={healthCounts.winning} active={healthFilter === "winning"} onClick={() => setHealthFilter("winning")} tone="emerald" />
        </div>

        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
          className="h-7 rounded-md border bg-background px-2 text-xs"
        >
          <option value="all">All types</option>
          <option value="blog_task">Blog posts</option>
          <option value="web_task">Web pages</option>
        </select>

        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, keyword, URL…"
            className="h-7 w-56 pl-7 text-xs"
          />
        </div>
      </div>

      {/* ===== Table ===== */}
      {visible.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? "No completed we360.ai pages in this date range yet."
            : "No rows match the current filters."}
        </Card>
      ) : (
        <Card className="p-0 overflow-x-auto we360-scroll">
          <div className="min-w-[1140px]">
            <div className="grid grid-cols-[1fr_96px_60px_64px_84px_122px_56px_70px_104px_88px] gap-2 px-4 py-2.5 border-b bg-muted/40 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              <div>Page</div>
              <div>Health</div>
              <div className="text-right">Days live</div>
              <div className="text-right">Clicks</div>
              <div className="text-right">Impressions</div>
              <div className="text-right">Position</div>
              <div className="text-right">CTR</div>
              <div className="text-right">Sessions</div>
              <div>Status</div>
              <div>Issues</div>
            </div>
            <div className="divide-y">
              {visible.map((r) => (
                <ReportRow key={r.taskId} row={r} onShowIssues={() => setIssuesFor(r)} />
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* ===== Issues modal ===== */}
      <Dialog open={issuesFor !== null} onOpenChange={(o) => !o && setIssuesFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-500" />
              Issues — {issuesFor?.title}
            </DialogTitle>
            <DialogDescription>
              {issuesFor?.liveUrl && (
                <a href={issuesFor.liveUrl} target="_blank" rel="noreferrer"
                  className="text-xs hover:underline break-all inline-flex items-center gap-1">
                  {issuesFor.liveUrl}
                  <ExternalLink className="size-3 shrink-0" />
                </a>
              )}
            </DialogDescription>
          </DialogHeader>
          {issuesFor && issuesFor.issues.length > 0 ? (
            <ul className="space-y-2">
              {issuesFor.issues.map((issue) => (
                <li key={issue} className="flex items-start gap-2 rounded-md border bg-muted/30 p-2.5 text-sm">
                  <XCircle className="size-4 text-rose-500 shrink-0 mt-0.5" />
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4" />
              No issues — this page is clean.
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ===== Row =====

function ReportRow({ row, onShowIssues }: { row: SeoReportRow; onShowIssues: () => void }) {
  const m = row.metrics;
  return (
    <div className="grid grid-cols-[1fr_96px_60px_64px_84px_122px_56px_70px_104px_88px] gap-2 px-4 py-2.5 text-xs items-center hover:bg-muted/30 transition-colors">
      {/* Page */}
      <div className="min-w-0 space-y-0.5">
        <div className="font-medium truncate" title={row.title}>{row.title}</div>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[9px] py-0 shrink-0">
            {row.taskType ?? (row.kind === "blog_task" ? "Blog" : "Page")}
          </Badge>
          {row.liveUrl && (
            <a href={row.liveUrl} target="_blank" rel="noreferrer"
              className="text-[10px] text-muted-foreground hover:text-foreground hover:underline truncate inline-flex items-center gap-0.5">
              {prettyUrl(row.liveUrl)}
              <ExternalLink className="size-2.5 shrink-0" />
            </a>
          )}
          {row.assigneeName && (
            <span className="text-[10px] text-muted-foreground/70 shrink-0">· {row.assigneeName}</span>
          )}
        </div>
      </div>

      {/* Health */}
      <div><HealthBadge health={row.health} /></div>

      {/* Days live */}
      <div className="text-right tabular-nums text-muted-foreground">
        {row.daysLive != null ? `${row.daysLive}d` : "—"}
      </div>

      {/* Metrics */}
      <div className="text-right tabular-nums">{m ? m.clicks.toLocaleString() : "—"}</div>
      <div className="text-right tabular-nums text-muted-foreground">{m ? m.impressions.toLocaleString() : "—"}</div>

      {/* Position + ranking trend arrow */}
      <div className="text-right tabular-nums">
        {m && m.impressions > 0 && m.position > 0 ? (
          <span className="inline-flex items-center justify-end gap-1">
            <span className={cn(
              m.position <= 10 ? "text-emerald-600 dark:text-emerald-400"
                : m.position <= 20 ? "text-amber-600 dark:text-amber-400"
                : "text-rose-600 dark:text-rose-400",
            )}>
              #{m.position.toFixed(1)}
            </span>
            {row.positionTrend && row.positionTrend.direction !== "flat" && (
              <span
                className={cn(
                  "inline-flex items-center text-[10px] font-semibold",
                  row.positionTrend.direction === "up"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400",
                )}
                title={row.positionTrend.direction === "up"
                  ? `Ranking improved ${row.positionTrend.delta.toFixed(1)} positions vs the prior window`
                  : `Ranking dropped ${row.positionTrend.delta.toFixed(1)} positions vs the prior window`}
              >
                {row.positionTrend.direction === "up"
                  ? <ArrowUp className="size-3" />
                  : <ArrowDown className="size-3" />}
                {row.positionTrend.delta.toFixed(1)}
              </span>
            )}
          </span>
        ) : "—"}
      </div>

      {/* CTR */}
      <div className="text-right tabular-nums text-muted-foreground">
        {m && m.impressions > 0 ? `${(m.ctr * 100).toFixed(1)}%` : "—"}
      </div>

      {/* Sessions */}
      <div className="text-right tabular-nums">{m ? m.sessions.toLocaleString() : "—"}</div>

      {/* Status — live (HTTP) + sitemap */}
      <div className="space-y-0.5">
        <StatusPill
          ok={row.pageExists}
          okLabel="Live"
          badLabel="Not reachable"
          okIcon={CheckCircle2}
          badIcon={XCircle}
        />
        <StatusPill
          ok={row.inSitemap}
          okLabel="In sitemap"
          badLabel="Not in sitemap"
          okIcon={MapPin}
          badIcon={MapPin}
        />
      </div>

      {/* Issues — click opens modal */}
      <div>
        {row.issues.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <button
            type="button"
            onClick={onShowIssues}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-medium transition-colors hover:bg-muted",
              row.health === "problem"
                ? "text-rose-600 border-rose-300/50 dark:text-rose-400"
                : "text-amber-600 border-amber-300/50 dark:text-amber-400",
            )}
          >
            <AlertTriangle className="size-2.5" />
            {row.issues.length} issue{row.issues.length > 1 ? "s" : ""}
          </button>
        )}
      </div>
    </div>
  );
}

// ===== Small components =====

function StatusPill({
  ok, okLabel, badLabel, okIcon: OkIcon, badIcon: BadIcon,
}: {
  ok: boolean | null;
  okLabel: string;
  badLabel: string;
  okIcon: typeof CheckCircle2;
  badIcon: typeof XCircle;
}) {
  if (ok === null) {
    return <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">—</span>;
  }
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-[10px] font-medium",
      ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
    )}>
      {ok ? <OkIcon className="size-2.5" /> : <BadIcon className="size-2.5" />}
      {ok ? okLabel : badLabel}
    </span>
  );
}

function HealthBadge({ health }: { health: ReportHealth }) {
  const cfg = {
    winning: { label: "Winning", cls: "bg-emerald-500/10 text-emerald-700 border-emerald-300/50 dark:text-emerald-400" },
    watch:   { label: "Watch",   cls: "bg-amber-500/10 text-amber-700 border-amber-300/50 dark:text-amber-400" },
    problem: { label: "Problem", cls: "bg-rose-500/10 text-rose-700 border-rose-300/50 dark:text-rose-400" },
  }[health];
  return (
    <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold", cfg.cls)}>
      {cfg.label}
    </span>
  );
}

function HealthChip({
  label, count, active, onClick, tone,
}: {
  label: string; count: number; active: boolean; onClick: () => void;
  tone?: "rose" | "amber" | "emerald";
}) {
  const activeCls = {
    rose: "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300",
    amber: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300",
    emerald: "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300",
    undefined: "bg-foreground text-background border-foreground",
  }[tone ?? "undefined"];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
        active ? activeCls : "bg-muted/30 text-muted-foreground border-border hover:text-foreground",
      )}
    >
      {label}<span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function RollupCard({
  icon: Icon, tone, label, value, hint, alarm,
}: {
  icon: typeof FileText; tone: "violet" | "emerald" | "rose" | "sky";
  label: string; value: number; hint: string; alarm?: boolean;
}) {
  const toneCls = {
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  }[tone];
  return (
    <Card className="p-4 flex items-start gap-3">
      <div className={cn("flex size-9 items-center justify-center rounded-lg shrink-0", toneCls)}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
        <div className={cn(
          "text-xl font-semibold tabular-nums leading-tight",
          alarm && "text-rose-600 dark:text-rose-400",
        )}>
          {value.toLocaleString()}
        </div>
        <div className="text-[10px] text-muted-foreground truncate">{hint}</div>
      </div>
    </Card>
  );
}

function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") + u.pathname;
  } catch {
    return url;
  }
}
