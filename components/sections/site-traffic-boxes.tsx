"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { getMonthlyTrafficComparison, type MonthlyTrafficComparison } from "@/lib/actions/report-traffic";

// The two whole-site GA4 traffic boxes at the top of the Reports page.
// Fetches live via a server action on mount so a slow/failed GA4 call only
// affects these boxes, not the report table below.

export function SiteTrafficBoxes() {
  const [data, setData] = useState<MonthlyTrafficComparison | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getMonthlyTrafficComparison()
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        <SkeletonBox />
        <SkeletonBox />
      </div>
    );
  }

  if (!data || !data.ok) {
    return (
      <Card className="p-4 flex items-center gap-2.5 border-dashed">
        <AlertCircle className="size-4 text-amber-500 shrink-0" />
        <div className="text-xs text-muted-foreground">
          Couldn&apos;t load GA4 organic traffic{data?.error ? ` — ${data.error}` : "."} The report table below is unaffected.
        </div>
      </Card>
    );
  }

  const up = data.deltaPct !== null && data.deltaPct > 0;
  const down = data.deltaPct !== null && data.deltaPct < 0;
  const DeltaIcon = up ? TrendingUp : down ? TrendingDown : Minus;

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
      {/* Last month */}
      <Card className="p-4 space-y-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {data.lastMonth.label} · organic traffic
        </div>
        <div className="text-2xl font-semibold tabular-nums leading-tight">
          {data.lastMonth.sessions.toLocaleString()}
        </div>
        <div className="text-[10px] text-muted-foreground">Organic-search sessions (GA4), full month</div>
      </Card>

      {/* This month + delta */}
      <Card className={cn(
        "p-4 space-y-1 border",
        up && "border-emerald-300/50 dark:border-emerald-800/50",
        down && "border-rose-300/50 dark:border-rose-800/50",
      )}>
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            {data.thisMonth.label} · organic traffic
          </div>
          {data.deltaPct !== null && (
            <span className={cn(
              "inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums rounded px-1.5 py-0.5",
              up && "text-emerald-700 bg-emerald-500/10 dark:text-emerald-400",
              down && "text-rose-700 bg-rose-500/10 dark:text-rose-400",
              !up && !down && "text-muted-foreground bg-muted",
            )}>
              <DeltaIcon className="size-3" />
              {data.deltaPct > 0 ? "+" : ""}{data.deltaPct.toFixed(1)}%
            </span>
          )}
        </div>
        <div className="text-2xl font-semibold tabular-nums leading-tight">
          {data.thisMonth.sessions.toLocaleString()}
        </div>
        <div className="text-[10px] text-muted-foreground">
          Organic-search sessions, month-to-date — partial month, pace not yet comparable
        </div>
      </Card>
    </div>
  );
}

function SkeletonBox() {
  return (
    <Card className="p-4 space-y-2">
      <div className="h-2.5 w-32 rounded bg-muted animate-pulse" />
      <div className="h-7 w-24 rounded bg-muted animate-pulse" />
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Loading GA4…
      </div>
    </Card>
  );
}
