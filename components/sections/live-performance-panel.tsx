"use client";

import { useEffect, useState } from "react";
import { BarChart3, ExternalLink, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getLiveMetricsForUrl } from "@/lib/actions/url-metrics";
import type { UrlMetric, UrlTopQuery } from "@/lib/types/url-metrics";

// Live performance panel — shown inside the task detail dialog whenever
// the task has a URL (or published_url). Pulls the latest snapshots from
// url_metrics across all three windows so the admin can see how the URL
// is trending without leaving the task.

interface Props {
  taskId: string;
  url: string;
}

export function LivePerformancePanel({ taskId: _taskId, url }: Props) {
  const [metrics, setMetrics] = useState<Record<string, UrlMetric | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getLiveMetricsForUrl(url)
      .then((res) => { if (!cancelled) setMetrics(res); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [url]);

  const m30 = metrics["30d"];
  const m60 = metrics["60d"];
  const m90 = metrics["90d"];

  if (loading) {
    return (
      <div className="space-y-3">
        <PanelHeader />
        <div className="rounded-md border p-4 text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="size-3.5 animate-spin" /> Loading live performance…
        </div>
      </div>
    );
  }

  if (!m30 && !m60 && !m90) {
    return (
      <div className="space-y-3">
        <PanelHeader />
        <Card className="border-dashed p-4 text-xs text-muted-foreground text-center space-y-1">
          <div>No url_metrics data for this URL yet.</div>
          <div className="text-[11px]">
            Either the URL isn&apos;t indexed by Google yet, or the daily sync hasn&apos;t pulled this one. Check back tomorrow after the 10am IST sync.
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PanelHeader url={url} />

      {/* Three-window metric grid */}
      <div className="grid grid-cols-3 gap-2">
        <PeriodCol title="Last 30d" current={m30} prev={null} />
        <PeriodCol title="Last 60d" current={m60} prev={m30} />
        <PeriodCol title="Last 90d" current={m90} prev={m60} />
      </div>

      {/* Top queries (from the 90d window — most stable signal) */}
      {m90 && m90.gsc_top_queries && m90.gsc_top_queries.length > 0 && (
        <TopQueriesPanel queries={m90.gsc_top_queries} />
      )}
    </div>
  );
}

function PanelHeader({ url }: { url?: string } = {}) {
  return (
    <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-semibold text-muted-foreground">
      <BarChart3 className="size-3.5" />
      <span>Live performance</span>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-[10px] hover:underline normal-case tracking-normal font-medium"
        >
          {pathOnly(url)}
          <ExternalLink className="size-2.5" />
        </a>
      )}
    </div>
  );
}

function PeriodCol({ title, current, prev }: { title: string; current: UrlMetric | null; prev: UrlMetric | null }) {
  if (!current) {
    return (
      <div className="rounded-md border p-3 text-xs space-y-2 bg-muted/20">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{title}</div>
        <div className="text-muted-foreground text-[11px]">no data</div>
      </div>
    );
  }
  return (
    <div className="rounded-md border p-3 text-xs space-y-2">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{title}</div>
      <Stat label="Clicks" value={current.gsc_clicks} prev={prev?.gsc_clicks} />
      <Stat label="Impr" value={current.gsc_impressions} prev={prev?.gsc_impressions} />
      <Stat label="Position" value={current.gsc_position} prev={prev?.gsc_position} format={(n) => n.toFixed(1)} inverseDelta />
      <Stat label="Sessions" value={current.ga_sessions} prev={prev?.ga_sessions} />
      <Stat label="Engaged" value={current.ga_engagement_rate} prev={prev?.ga_engagement_rate} format={(n) => `${(n * 100).toFixed(0)}%`} />
    </div>
  );
}

function Stat({
  label, value, prev, format, inverseDelta,
}: {
  label: string;
  value: number;
  prev?: number;
  format?: (n: number) => string;
  inverseDelta?: boolean;       // for position — lower is better
}) {
  const formatted = format ? format(value) : value.toLocaleString();
  const hasPrev = typeof prev === "number" && prev > 0;
  const delta = hasPrev ? value - prev! : 0;
  const isUp = delta > 0;
  const isDown = delta < 0;
  // Position works backwards: a decrease (e.g. from 12 to 8) is good.
  const isGood = inverseDelta ? isDown : isUp;
  const isBad = inverseDelta ? isUp : isDown;
  const DeltaIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const deltaColor = isGood
    ? "text-emerald-600 dark:text-emerald-400"
    : isBad
      ? "text-rose-600 dark:text-rose-400"
      : "text-muted-foreground";

  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="inline-flex items-center gap-1 tabular-nums font-medium">
        {formatted}
        {hasPrev && delta !== 0 && (
          <span className={cn("inline-flex items-center gap-0.5 text-[10px]", deltaColor)}>
            <DeltaIcon className="size-2.5" />
            {format ? format(Math.abs(delta)) : Math.abs(delta).toLocaleString()}
          </span>
        )}
      </span>
    </div>
  );
}

function TopQueriesPanel({ queries }: { queries: UrlTopQuery[] }) {
  return (
    <div className="rounded-md border overflow-hidden">
      <div className="px-3 py-2 bg-muted/30 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        Top queries (90d)
      </div>
      <div className="divide-y">
        {queries.slice(0, 8).map((q) => (
          <div key={q.query} className="grid grid-cols-[1fr_60px_60px_50px] gap-2 px-3 py-1.5 text-xs items-center">
            <div className="truncate" title={q.query}>{q.query}</div>
            <div className="text-right tabular-nums">{q.clicks}c</div>
            <div className="text-right tabular-nums text-muted-foreground">{q.impressions}i</div>
            <div className="text-right">
              <Badge variant="outline" className="text-[9px] tabular-nums">
                #{q.position.toFixed(1)}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function pathOnly(url: string): string {
  try { return new URL(url).pathname; } catch { return url; }
}
