import Link from "next/link";
import { TrendingUp, TrendingDown, BarChart3, Search, Plug } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/ui-helpers";
import type { Ga4WeeklySummary } from "@/lib/google/ga4";
import type { GscWeeklySummary } from "@/lib/google/gsc";

export function Ga4InsightsCard({ ga4 }: { ga4: Ga4WeeklySummary }) {
  if (!ga4.connected) {
    return <UnconnectedCard provider="GA4" icon={BarChart3} reason={ga4.reason} />;
  }
  const trendPositive = ga4.totalDeltaPct >= 0;
  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400">
            <BarChart3 className="size-4" />
          </div>
          <div>
            <div className="font-semibold">GA4 traffic · 7d</div>
            <div className="text-xs text-muted-foreground">Page views week over week</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums">{formatNumber(ga4.totalViewsThisWeek)}</div>
          <div className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
            trendPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
            {trendPositive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {ga4.totalDeltaPct > 0 ? "+" : ""}{ga4.totalDeltaPct}%
          </div>
        </div>
      </div>

      {ga4.topGainers.length > 0 && (
        <InsightList
          label="Top gainers"
          tone="emerald"
          items={ga4.topGainers.map((g) => ({
            primary: g.page,
            secondary: `${formatNumber(g.thisWeek)} views`,
            delta: `+${formatNumber(g.delta)}`,
            deltaPositive: true,
          }))}
        />
      )}
      {ga4.topLosers.length > 0 && (
        <InsightList
          label="Top losers"
          tone="rose"
          items={ga4.topLosers.map((g) => ({
            primary: g.page,
            secondary: `${formatNumber(g.thisWeek)} views`,
            delta: formatNumber(g.delta),
            deltaPositive: false,
          }))}
        />
      )}
      {ga4.topGainers.length === 0 && ga4.topLosers.length === 0 && (
        <div className="text-xs text-muted-foreground py-2">No page-level movement detected this week.</div>
      )}
    </Card>
  );
}

export function GscInsightsCard({ gsc }: { gsc: GscWeeklySummary }) {
  if (!gsc.connected) {
    return <UnconnectedCard provider="Search Console" icon={Search} reason={gsc.reason} />;
  }
  const clickDelta = gsc.totalClicksThisWeek - gsc.totalClicksLastWeek;
  const clickPct = gsc.totalClicksLastWeek === 0 ? 0 : Math.round((clickDelta / gsc.totalClicksLastWeek) * 100);
  const trendPositive = clickDelta >= 0;
  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-sky-500/15 text-sky-700 dark:text-sky-400">
            <Search className="size-4" />
          </div>
          <div>
            <div className="font-semibold">Search Console · 7d</div>
            <div className="text-xs text-muted-foreground">Query clicks + ranking moves</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums">{formatNumber(gsc.totalClicksThisWeek)}</div>
          <div className={cn("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
            trendPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
            {trendPositive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {clickPct > 0 ? "+" : ""}{clickPct}%
          </div>
        </div>
      </div>

      {gsc.positionImprovers.length > 0 && (
        <InsightList
          label="Keywords moving up"
          tone="emerald"
          items={gsc.positionImprovers.slice(0, 3).map((q) => ({
            primary: q.query,
            secondary: `${Math.round(q.thisWeekPosition)}${q.lastWeekPosition ? ` · was ${Math.round(q.lastWeekPosition)}` : ""}`,
            delta: `↑${q.positionDelta.toFixed(1)}`,
            deltaPositive: true,
          }))}
        />
      )}
      {gsc.positionDropers.length > 0 && (
        <InsightList
          label="Keywords slipping"
          tone="rose"
          items={gsc.positionDropers.slice(0, 3).map((q) => ({
            primary: q.query,
            secondary: `${Math.round(q.thisWeekPosition)}${q.lastWeekPosition ? ` · was ${Math.round(q.lastWeekPosition)}` : ""}`,
            delta: `↓${Math.abs(q.positionDelta).toFixed(1)}`,
            deltaPositive: false,
          }))}
        />
      )}
      {gsc.positionImprovers.length === 0 && gsc.positionDropers.length === 0 && (
        <div className="text-xs text-muted-foreground py-2">No meaningful ranking movement this week.</div>
      )}
    </Card>
  );
}

function UnconnectedCard({ provider, icon: Icon, reason }: { provider: string; icon: typeof BarChart3; reason?: string }) {
  return (
    <Card className="p-5 flex flex-col items-center justify-center text-center space-y-3 min-h-[180px] border-dashed">
      <div className="flex size-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <div>
        <div className="font-semibold">{provider} not connected</div>
        <p className="text-xs text-muted-foreground max-w-xs mt-1">
          {reason ?? `Connect ${provider} to see traffic insights, top gainers, and ranking movement.`}
        </p>
      </div>
      <Button variant="outline" size="sm" render={<Link href={`/integrations?connect=${provider === "GA4" ? "ga4" : "gsc"}`} />}>
        <Plug className="size-3.5" />
        Connect {provider}
      </Button>
    </Card>
  );
}

function InsightList({
  label,
  tone,
  items,
}: {
  label: string;
  tone: "emerald" | "rose";
  items: Array<{ primary: string; secondary: string; delta: string; deltaPositive: boolean }>;
}) {
  const labelClass =
    tone === "emerald"
      ? "text-emerald-700 dark:text-emerald-400"
      : "text-rose-700 dark:text-rose-400";
  return (
    <div className="space-y-1.5">
      <div className={cn("text-[10px] uppercase tracking-wider font-semibold", labelClass)}>{label}</div>
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between gap-3 text-xs">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{item.primary}</div>
              <div className="text-muted-foreground text-[10px]">{item.secondary}</div>
            </div>
            <span className={cn(
              "tabular-nums font-semibold shrink-0",
              item.deltaPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            )}>
              {item.delta}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
