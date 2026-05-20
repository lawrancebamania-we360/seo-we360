"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ExternalLink, TrendingUp, AlertTriangle, Search, FileText,
  Trophy, CircleSlash, MousePointerClick, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SeoReportRow, SeoReportRollup, ReportHealth } from "@/lib/data/seo-report";

// ===== Date-range presets — drive the server query via ?range= =====
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
    external: rows.filter((r) => r.health === "external").length,
  }), [rows]);

  return (
    <div className="space-y-5">
      {/* ===== Rollup cards ===== */}
      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <RollupCard icon={FileText} tone="violet" label="Pages shipped" value={rollup.shipped}
          hint="Completed blog + web tasks in range" />
        <RollupCard icon={Trophy} tone="emerald" label="Ranking top 10" value={rollup.rankingTop10}
          hint={`${rollup.rankingTop3} of them in the top 3`} />
        <RollupCard icon={CircleSlash} tone="rose" label="Zero traffic" value={rollup.zeroTraffic}
          hint="On-domain pages, 30d+ live, 0 clicks & 0 sessions" alarm={rollup.zeroTraffic > 0} />
        <RollupCard icon={MousePointerClick} tone="sky" label="Total organic clicks" value={rollup.totalClicks}
          hint={`${rollup.totalImpressions.toLocaleString()} impressions across shipped pages`} />
      </section>

      {/* Plain-English health line — the CEO's "uncomfortable truth" */}
      {rollup.shipped > 0 && (
        <div className={cn(
          "rounded-lg border px-4 py-2.5 text-sm flex items-center gap-2",
          rollup.zeroTraffic > 0
            ? "border-rose-300/50 bg-rose-500/5 text-rose-700 dark:text-rose-300"
            : "border-emerald-300/50 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
        )}>
          {rollup.zeroTraffic > 0
            ? <AlertTriangle className="size-4 shrink-0" />
            : <TrendingUp className="size-4 shrink-0" />}
          <span>
            {rollup.zeroTraffic > 0
              ? `${rollup.zeroTraffic} of ${rollup.shipped} shipped pages are earning zero traffic — review or re-promote them.`
              : `All ${rollup.shipped} shipped pages are earning impressions or traffic.`}
            {rollup.externalCount > 0 && ` ${rollup.externalCount} published off-domain (not trackable here).`}
          </span>
        </div>
      )}

      {/* ===== Filters ===== */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Date range */}
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

        {/* Health */}
        <div className="inline-flex items-center gap-1">
          <HealthChip label="All" count={healthCounts.all} active={healthFilter === "all"} onClick={() => setHealthFilter("all")} />
          <HealthChip label="Problem" count={healthCounts.problem} active={healthFilter === "problem"} onClick={() => setHealthFilter("problem")} tone="rose" />
          <HealthChip label="Watch" count={healthCounts.watch} active={healthFilter === "watch"} onClick={() => setHealthFilter("watch")} tone="amber" />
          <HealthChip label="Winning" count={healthCounts.winning} active={healthFilter === "winning"} onClick={() => setHealthFilter("winning")} tone="emerald" />
          {healthCounts.external > 0 && (
            <HealthChip label="Off-domain" count={healthCounts.external} active={healthFilter === "external"} onClick={() => setHealthFilter("external")} tone="slate" />
          )}
        </div>

        {/* Kind */}
        <select
          value={kindFilter}
          onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)}
          className="h-7 rounded-md border bg-background px-2 text-xs"
        >
          <option value="all">All types</option>
          <option value="blog_task">Blog posts</option>
          <option value="web_task">Web pages</option>
        </select>

        {/* Search */}
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
            ? "No completed tasks in this date range yet."
            : "No rows match the current filters."}
        </Card>
      ) : (
        <Card className="p-0 overflow-x-auto we360-scroll">
          <div className="min-w-[1100px]">
            {/* Header */}
            <div className="grid grid-cols-[1fr_104px_70px_70px_84px_80px_64px_70px_84px_1fr] gap-2 px-4 py-2.5 border-b bg-muted/40 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              <div>Page</div>
              <div>Health</div>
              <div className="text-right">Days live</div>
              <div className="text-right">Clicks</div>
              <div className="text-right">Impressions</div>
              <div className="text-right">Position</div>
              <div className="text-right">CTR</div>
              <div className="text-right">Sessions</div>
              <div>Sitemap</div>
              <div>Issues</div>
            </div>
            <div className="divide-y">
              {visible.map((r) => <ReportRow key={r.taskId} row={r} />)}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ===== Row =====

function ReportRow({ row }: { row: SeoReportRow }) {
  const m = row.metrics;
  return (
    <div className="grid grid-cols-[1fr_104px_70px_70px_84px_80px_64px_70px_84px_1fr] gap-2 px-4 py-2.5 text-xs items-center hover:bg-muted/30 transition-colors">
      {/* Page */}
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="font-medium truncate" title={row.title}>{row.title}</span>
        </div>
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

      {/* Metrics — "—" when off-domain / not synced */}
      <div className="text-right tabular-nums">{m ? m.clicks.toLocaleString() : "—"}</div>
      <div className="text-right tabular-nums text-muted-foreground">{m ? m.impressions.toLocaleString() : "—"}</div>
      <div className="text-right tabular-nums">
        {m && m.impressions > 0 && m.position > 0 ? (
          <span className={cn(
            m.position <= 10 ? "text-emerald-600 dark:text-emerald-400"
              : m.position <= 20 ? "text-amber-600 dark:text-amber-400"
              : "text-rose-600 dark:text-rose-400",
          )}>
            #{m.position.toFixed(1)}
          </span>
        ) : "—"}
      </div>
      <div className="text-right tabular-nums text-muted-foreground">
        {m && m.impressions > 0 ? `${(m.ctr * 100).toFixed(1)}%` : "—"}
      </div>
      <div className="text-right tabular-nums">{m ? m.sessions.toLocaleString() : "—"}</div>

      {/* Sitemap */}
      <div>
        {row.inSitemap === null ? (
          <span className="text-[10px] text-muted-foreground">N/A</span>
        ) : row.inSitemap ? (
          <Badge variant="outline" className="text-[9px] py-0 text-emerald-600 border-emerald-300/50 dark:text-emerald-400">
            In sitemap
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[9px] py-0 text-rose-600 border-rose-300/50 dark:text-rose-400">
            Missing
          </Badge>
        )}
      </div>

      {/* Issues */}
      <div className="min-w-0">
        {row.issues.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Badge variant="outline" className={cn(
                    "text-[9px] py-0 gap-1 cursor-default",
                    row.health === "problem"
                      ? "text-rose-600 border-rose-300/50 dark:text-rose-400"
                      : "text-amber-600 border-amber-300/50 dark:text-amber-400",
                  )}>
                    <AlertTriangle className="size-2.5" />
                    {row.issues.length} issue{row.issues.length > 1 ? "s" : ""}
                  </Badge>
                }
              />
              <TooltipContent className="max-w-xs">
                <ul className="space-y-0.5 text-xs">
                  {row.issues.map((i) => <li key={i}>• {i}</li>)}
                </ul>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Small components =====

function HealthBadge({ health }: { health: ReportHealth }) {
  const cfg = {
    winning:  { label: "Winning",   cls: "bg-emerald-500/10 text-emerald-700 border-emerald-300/50 dark:text-emerald-400" },
    watch:    { label: "Watch",     cls: "bg-amber-500/10 text-amber-700 border-amber-300/50 dark:text-amber-400" },
    problem:  { label: "Problem",   cls: "bg-rose-500/10 text-rose-700 border-rose-300/50 dark:text-rose-400" },
    external: { label: "Off-domain", cls: "bg-muted text-muted-foreground border-border" },
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
  tone?: "rose" | "amber" | "emerald" | "slate";
}) {
  const activeCls = {
    rose: "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300",
    amber: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300",
    emerald: "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300",
    slate: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800/60 dark:text-slate-300",
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
