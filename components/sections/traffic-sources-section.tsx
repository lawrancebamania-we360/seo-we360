// Analytics · Traffic sources — the channel mix + AI-share story. Answers a
// non-expert's first question: "where do my visitors actually come from?"
//
// Server component (a GA4 round-trip). The donut + legend are the ORGANIC/EARNED
// channels getGa4OrganicMonthly counts; excluded channels (e.g. Direct) show as
// a context footnote, never in the total. The AI callout uses
// getGa4AiReferralTraffic. Real data only: a disconnected / empty property shows
// an honest state, never a fabricated donut.

import Link from "next/link";
import { ArrowUpRight, Plug, Sparkles, TrendingDown, TrendingUp } from "lucide-react";

import {
  getGa4OrganicMonthly,
  getGa4AiReferralTraffic,
  type Ga4OrganicTraffic,
  type Ga4AiReferral,
} from "@/lib/google/ga4";
import { resolveTrafficCompareRange, TRAFFIC_RANGE_PRESETS } from "@/lib/data/analytics-range";
import { ChannelDonut } from "@/components/ui/channel-donut";
import { TimeWindow } from "@/components/ui/time-window";
import { EmptyState } from "@/components/dashboard/empty-state";
import { cn } from "@/lib/utils";

// Ticket 1: the team's own 7-category list. "Organic Search + free tools" and
// "Direct / Brand" are DISPLAY labels only - GA4's real channel-group values
// are "Organic Search" and "Direct" (see ORGANIC_EARNED_CHANNELS in
// lib/google/ga4.ts for why "free tools" can't be split out as real data).
const CHANNEL_COLOR: Record<string, string> = {
  "Organic Search": "var(--color-chart-1)",
  Direct: "var(--color-chart-6)",
  "Organic Social": "var(--color-chart-3)",
  "Organic Video": "var(--color-chart-7)",
  Referral: "var(--color-chart-2)",
  Email: "var(--color-chart-5)",
  "AI Assistant": "var(--color-chart-4)",
};
const CHANNEL_LABEL: Record<string, string> = {
  "Organic Search": "Organic Search + free tools",
  Direct: "Direct / Brand",
};
const colorFor = (channel: string) => CHANNEL_COLOR[channel] ?? "var(--color-slate-300)";
const labelFor = (channel: string) => CHANNEL_LABEL[channel] ?? channel;

export async function TrafficSourcesStreamed({ propertyId, projectId, range }: { propertyId: string | null; projectId: string; range: string }) {
  const compareRange = resolveTrafficCompareRange(range);
  const [organic, ai] = await Promise.all([
    getGa4OrganicMonthly(propertyId, compareRange),
    getGa4AiReferralTraffic(propertyId, projectId).catch(() => null),
  ]);
  return <TrafficSourcesCard organic={organic} ai={ai} range={range} />;
}

function TrendChip({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const up = pct >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11.5px] font-bold tabular-nums",
        up ? "bg-success/15 text-success-strong" : "bg-error/15 text-error-strong",
      )}
    >
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}

function TrafficSourcesCard({ organic, ai, range }: { organic: Ga4OrganicTraffic; ai: Ga4AiReferral | null; range: string }) {
  const included = organic.byChannel.filter((c) => c.included && c.sessions > 0);
  const excluded = organic.byChannel.filter((c) => !c.included && c.sessions > 0);
  const total = organic.monthlySessions;
  const max = included.reduce((m, c) => Math.max(m, c.sessions), 0) || 1;
  const rangeLabel = (TRAFFIC_RANGE_PRESETS.find((p) => p.key === range) ?? TRAFFIC_RANGE_PRESETS[1]).label;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-[19px] font-semibold tracking-[-0.01em] text-foreground">Traffic sources</h2>
          <p className="mt-1 text-[13px] text-slate-500">Where your visitors came from · {rangeLabel.toLowerCase()}, vs the equivalent prior period</p>
        </div>
        <TimeWindow param="range" value={range} options={TRAFFIC_RANGE_PRESETS.map((p) => ({ value: p.key, label: p.label }))} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-lift">
        {!organic.connected ? (
          <EmptyState
            icon={Plug}
            title="Connect GA4 to see your traffic sources"
            why={organic.reason ?? "Google Analytics isn’t connected for this project yet."}
            action={
              <Link
                href="/dashboard/integrations"
                className="inline-flex items-center gap-1.5 rounded-[10px] bg-gradient-brand px-3.5 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-y-0.5"
              >
                Connect Google
                <ArrowUpRight className="size-3.5" />
              </Link>
            }
          />
        ) : total === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title={`No organic sessions ${rangeLabel.toLowerCase()} yet`}
            why="Once your site starts earning search, social, referral or AI-assistant visits, the mix appears here."
            hint="Refreshes with the weekly Google sync."
          />
        ) : (
          <div className="flex flex-col gap-7 lg:flex-row lg:items-center">
            <div className="flex flex-col items-center gap-3 lg:w-[180px]">
              <ChannelDonut
                segments={included.map((c) => ({ label: c.channel, value: c.sessions, color: colorFor(c.channel) }))}
                centerValue={total.toLocaleString()}
                centerSub="sessions"
              />
              <TrendChip pct={organic.trendPct} />
            </div>

            <div className="min-w-0 flex-1 space-y-2.5">
              {included.map((c) => {
                const pct = total > 0 ? Math.round((c.sessions / total) * 100) : 0;
                return (
                  <div key={c.channel} className="flex items-center gap-3">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: colorFor(c.channel) }} />
                    <span className="w-[150px] shrink-0 truncate text-[13.5px] font-medium text-slate-700 dark:text-foreground">
                      {labelFor(c.channel)}
                    </span>
                    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(3, (c.sessions / max) * 100)}%`, background: colorFor(c.channel) }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right font-mono text-[12.5px] tabular-nums text-slate-500">
                      {c.sessions.toLocaleString()}
                    </span>
                    <span className="w-9 shrink-0 text-right font-mono text-[12.5px] font-semibold tabular-nums text-slate-700 dark:text-foreground/90">
                      {pct}%
                    </span>
                    <span className="w-[52px] shrink-0 text-right">
                      <TrendChip pct={c.deltaPct} />
                    </span>
                  </div>
                );
              })}

              {excluded.length > 0 && (
                <p className="pt-1 text-[12px] text-slate-400">
                  Shown for context, not counted as organic:{" "}
                  {excluded.map((c, i) => (
                    <span key={c.channel}>
                      {i > 0 && " · "}
                      {c.channel} {c.sessions.toLocaleString()}
                    </span>
                  ))}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {ai && ai.connected && ai.sessions >= 10 && (
        <Link
          href="/dashboard/ai-visibility"
          className="flex items-center justify-between gap-3 rounded-2xl border border-ember-100 bg-ember-50 px-5 py-4 transition-transform hover:-translate-y-0.5 dark:border-ember-900 dark:bg-ember-950/30"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-ember-100 dark:bg-ember-900/50">
              <Sparkles className="size-4 text-ember-600 dark:text-ember-300" />
            </span>
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold text-slate-800 dark:text-foreground">
                AI assistants sent you {ai.sessions.toLocaleString()} visits in the last 28 days
              </div>
              <div className="truncate text-[12.5px] text-slate-500">
                {ai.trendPct != null && ai.trendPct !== 0 && (
                  <span className={ai.trendPct > 0 ? "font-semibold text-success-strong" : "font-semibold text-error-strong"}>
                    {ai.trendPct > 0 ? "up" : "down"} {Math.abs(ai.trendPct)}% vs the prior month
                  </span>
                )}
                {ai.bySource.length > 0 && (
                  <span>
                    {ai.trendPct != null && ai.trendPct !== 0 ? " · " : ""}
                    {ai.bySource.slice(0, 3).map((s) => s.source).join(", ")}
                  </span>
                )}
              </div>
            </div>
          </div>
          <ArrowUpRight className="size-4 shrink-0 text-ember-600 dark:text-ember-300" />
        </Link>
      )}
    </section>
  );
}
