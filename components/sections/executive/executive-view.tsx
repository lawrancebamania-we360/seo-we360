"use client";

// Executive dashboard — the whole render. One concise, interactive view for
// leadership: target vs achieved (traffic & DR), traffic sources, money spent
// vs budget, backlinks earned, and weekly team completion. Goals, money and
// backlinks compare fixed periods (deadline / last vs this month / last vs
// this week); the KPI tiles and Traffic sources follow the range filter.

import { useMemo, useState } from "react";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, Link2, Gauge, Target, Users, Check, ChevronDown, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/ui-helpers";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { targetStatus } from "@/lib/team-targets/period";
import { fmtPctFloor, ProgressBar, StatusChip } from "@/components/sections/team-targets/ui";
import type {
  ExecutiveDashboard, MetricSeries, BacklinkComparison, BacklinkPersonMonths, BacklinkMonthStat,
  SpendMonth, WeekRow,
} from "@/lib/data/executive";

const C = {
  traffic: "#5B45E0",
  dr: "#0ea5e9",
  target: "#94a3b8",
  backlinks: "#8b5cf6",
  collabs: "#f59e0b",
  blFree: "#a78bfa",
  blPaid: "#6d28d9",
  spend: "#10b981",
  over: "#f43f5e",
  bar: "#5B45E0",
};

const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmtNum = (n: number) => Math.round(n).toLocaleString();
const pct = (n: number) => `${Math.round(n * 100)}%`;

export function ExecutiveView({ data, trafficSources }: { data: ExecutiveDashboard; trafficSources?: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <KpiRow data={data} />

      <div className="grid gap-4 lg:grid-cols-2">
        <GoalCard title="Traffic goal" icon={TrendingUp} color={C.traffic} series={data.traffic} today={data.today} />
        <GoalCard title="Domain Rating goal" icon={Gauge} color={C.dr} series={data.dr} today={data.today} />
      </div>

      {trafficSources}

      <div className="grid gap-4 lg:grid-cols-2">
        <SpendChart data={data} />
        <BacklinksChart data={data} />
      </div>

      <TeamWeekCard data={data} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI tiles
// ---------------------------------------------------------------------------

function KpiRow({ data }: { data: ExecutiveDashboard }) {
  const t = data.traffic, d = data.dr;
  const trafficToGoal = t.latestActual !== null && t.latestTarget ? t.latestActual / t.latestTarget : null;
  const drToGoal = d.latestActual !== null && d.latestTarget ? d.latestActual / d.latestTarget : null;
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Tile
        icon={TrendingUp} label="Traffic (30 days)"
        value={t.latestActual !== null ? fmtNum(t.latestActual) : "—"}
        sub={t.latestTarget ? `Target ${fmtNum(t.latestTarget)}${trafficToGoal !== null ? ` · ${pct(trafficToGoal)}` : ""}` : "No target set"}
        delta={t.delta} color={C.traffic}
      />
      <Tile
        icon={Gauge} label="Domain Rating"
        value={d.latestActual !== null ? String(d.latestActual) : "—"}
        sub={d.latestTarget ? `Target ${d.latestTarget}${drToGoal !== null ? ` · ${pct(drToGoal)}` : ""}` : "No target set"}
        delta={d.delta} color={C.dr}
      />
      <Tile
        icon={DollarSign} label="Money spent"
        value={data.spend.ready ? fmtUsd(data.spend.totalUsd) : "—"}
        sub={`${data.spend.backlinksCount} links · ${data.spend.collabsCount} collabs`}
        color={C.collabs}
      />
      <Tile
        icon={Link2} label="Backlinks earned"
        value={data.backlinks.ready ? fmtNum(data.backlinks.count) : "—"}
        sub={data.costPerBacklink !== null ? `${fmtUsd(data.costPerBacklink)} / link` : data.backlinks.avgDr !== null ? `avg DR ${data.backlinks.avgDr}` : "in range"}
        color={C.backlinks}
      />
    </div>
  );
}

function Tile({
  icon: Icon, label, value, sub, delta, color,
}: {
  icon: typeof TrendingUp; label: string; value: string; sub: string; delta?: number | null; color: string;
}) {
  const up = typeof delta === "number" && delta > 0;
  const down = typeof delta === "number" && delta < 0;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-lift">
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
        <Icon className="size-3.5" style={{ color }} /> {label}
      </div>
      <div className="flex items-end gap-2">
        <div className="font-heading text-[26px] font-bold leading-none tracking-[-0.01em] text-foreground">{value}</div>
        {typeof delta === "number" && delta !== 0 && (
          <span className={cn("mb-0.5 inline-flex items-center gap-0.5 text-[12px] font-semibold", up ? "text-emerald-600 dark:text-emerald-400" : down ? "text-error-strong" : "text-muted-foreground")}>
            {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}{up ? "+" : ""}{delta}
          </span>
        )}
      </div>
      <div className="mt-1 text-[11.5px] text-slate-500">{sub}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Goal tracker: achieved vs pending, and the path to the deadline. Not tied to
// the range filter - a goal has its own deadline, so it always shows the whole
// journey from the first reading to that date.
// ---------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabelOf = (k: string) => { const [y, m] = k.split("-").map(Number); return `${MONTHS[m - 1]} ${String(y).slice(2)}`; };
const fmtDay = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return `${MONTHS[m - 1]} ${dd}, ${y}`; };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

function monthsFrom(startKey: string, endKey: string): string[] {
  const out: string[] = [];
  let [y, m] = startKey.split("-").map(Number);
  const [ey, em] = endKey.split("-").map(Number);
  for (let i = 0; i < 60 && (y < ey || (y === ey && m <= em)); i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

interface GoalRow { key: string; label: string; actual: number | null; glide: number | null }

/** One bucket per month from the first reading to the goal month: the actual
 *  line, plus a dashed straight "needed path" from the latest reading to the goal. */
function goalRows(series: MetricSeries): GoalRow[] {
  const { history, goal } = series;
  if (!history.length && !goal) return [];
  const firstKey = (history[0]?.date ?? goal!.date).slice(0, 7);
  const lastKey = history.length ? history[history.length - 1].date.slice(0, 7) : null;
  let endKey = goal ? goal.date.slice(0, 7) : lastKey!;
  if (lastKey && lastKey > endKey) endKey = lastKey;
  const keys = monthsFrom(firstKey, endKey);
  const actualBy = new Map<string, number>();
  for (const p of history) actualBy.set(p.date.slice(0, 7), p.value); // ascending, so a month's last reading wins
  const rows: GoalRow[] = keys.map((k) => ({ key: k, label: monthLabelOf(k), actual: actualBy.get(k) ?? null, glide: null }));
  if (goal && lastKey) {
    const i0 = keys.indexOf(lastKey), iG = keys.indexOf(goal.date.slice(0, 7));
    const v0 = actualBy.get(lastKey) ?? 0;
    if (i0 >= 0 && iG > i0) {
      for (let i = i0; i <= iG; i++) rows[i].glide = Math.round((v0 + ((goal.value - v0) * (i - i0)) / (iG - i0)) * 100) / 100;
    }
  }
  return rows;
}

function GoalCard({
  title, icon: Icon, color, series, today,
}: {
  title: string; icon: typeof TrendingUp; color: string; series: MetricSeries; today: string;
}) {
  const rows = useMemo(() => goalRows(series), [series]);
  const isTraffic = series.metric === "traffic";
  const fmt = (n: number) => (isTraffic ? fmtNum(n) : String(Math.round(n * 10) / 10));
  const goal = series.goal;
  const achieved = series.latestActual;
  const pending = goal && achieved !== null ? Math.max(0, goal.value - achieved) : null;
  const share = goal && achieved !== null && goal.value > 0 ? Math.min(1, achieved / goal.value) : null;
  const daysLeft = goal ? daysBetween(today, goal.date) : null;
  const perMonth = pending && daysLeft && daysLeft > 0 ? pending / (daysLeft / 30.44) : null;

  const vals = rows.flatMap((r) => [r.actual, r.glide]).filter((v): v is number => v != null).concat(goal ? [goal.value] : []);
  const lo = vals.length ? Math.min(...vals) : 0;
  const hi = vals.length ? Math.max(...vals) : 1;
  const domain: number[] = isTraffic
    ? [0, Math.ceil(hi * 1.08)]
    : [Math.max(0, Math.floor(lo - 4)), Math.min(100, Math.ceil(hi + 3))];

  const subtitle = isTraffic
    ? "Monthly sessions · GA4, same total as Analytics → Traffic sources"
    : "Ahrefs Domain Rating, recorded by hand";

  return (
    <ChartCard
      title={title} icon={Icon} subtitle={subtitle}
      right={daysLeft !== null ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
          <Target className="size-3" />
          {daysLeft > 0 ? `${daysLeft} days left` : daysLeft === 0 ? "Due today" : "Deadline passed"}
        </span>
      ) : undefined}
    >
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat label="Achieved" color={color}
          value={achieved !== null ? fmt(achieved) : "—"}
          sub={share !== null ? `${pct(share)} of goal` : series.reason ?? "No reading yet"} />
        <Stat label="Pending"
          value={pending !== null ? fmt(pending) : "—"}
          sub={pending === 0 ? "Goal reached" : perMonth !== null ? `≈ +${fmt(perMonth)} / month needed` : ""} />
        <Stat label="Goal"
          value={goal ? fmt(goal.value) : "—"}
          sub={goal ? `by ${fmtDay(goal.date)}` : "No target set"} />
      </div>

      {goal && achieved !== null && share !== null && (
        <div className="mb-4">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="img"
            aria-label={`${pct(share)} achieved, ${fmt(pending ?? 0)} pending`}>
            <div style={{ width: `${share * 100}%`, background: color }} />
            <div className="flex-1" style={{ backgroundImage: `repeating-linear-gradient(45deg, ${color}45 0 6px, transparent 6px 12px)` }} />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm" style={{ background: color }} /> Achieved {fmt(achieved)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              Pending {fmt(pending ?? 0)}
              <span className="inline-block size-2.5 rounded-sm border" style={{ borderColor: `${color}80`, backgroundImage: `repeating-linear-gradient(45deg, ${color}55 0 2px, transparent 2px 4px)` }} />
            </span>
          </div>
        </div>
      )}

      {!series.ready && series.source === "manual" ? (
        <Empty>{series.reason ?? "Add the migration, then record readings."}</Empty>
      ) : !series.ready ? (
        <Empty>Traffic comes from Google Analytics, which isn’t reachable here{series.reason ? `: ${series.reason}` : "."}</Empty>
      ) : rows.length === 0 ? (
        <Empty>No readings yet. Use “DR / Traffic” to add one.</Empty>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={rows} margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
              <YAxis domain={domain} width={48} tickLine={false} axisLine={false}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                tickFormatter={(v: number) => (isTraffic && v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
              <Tooltip contentStyle={TOOLTIP} formatter={(v, name) => [fmt(Number(v)), name]} />
              {goal && (
                <ReferenceLine y={goal.value} stroke={C.target} strokeDasharray="5 4"
                  label={{ value: `goal ${fmt(goal.value)}`, position: "insideTopLeft", fontSize: 10, fill: C.target }} />
              )}
              <Line type="monotone" dataKey="glide" name="Needed path" stroke={color} strokeOpacity={0.5} strokeWidth={2}
                strokeDasharray="5 5" dot={false} activeDot={false} connectNulls />
              <Line type="monotone" dataKey="actual" name="Achieved" stroke={color} strokeWidth={2.5}
                dot={{ r: 3, fill: color }} activeDot={{ r: 5 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
          <Legend2 items={[
            { label: "Achieved", color, line: true },
            { label: "Needed path to goal", color: `${color}80`, line: true },
            { label: "Goal", color: C.target, line: true },
          ]} />
        </>
      )}
    </ChartCard>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-muted/20 px-3 py-2">
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-heading text-[20px] font-bold leading-tight tracking-[-0.01em] text-foreground" style={color ? { color } : undefined}>{value}</div>
      {sub && <div className="truncate text-[11px] text-slate-500" title={sub}>{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Money spent: per activity, last month vs this month, against each month's
// budget (not tied to the range filter, same as Backlinks earned beside it)
// ---------------------------------------------------------------------------

function SpendChart({ data }: { data: ExecutiveDashboard }) {
  const s = data.spendMonths;
  return (
    <ChartCard title="Money spent" icon={DollarSign}
      subtitle={`${s.lastLabel} vs ${s.currentLabel} · per activity, against each month’s budget`}>
      {!s.ready ? (
        <Empty>No spend tables yet.</Empty>
      ) : s.activities.length === 0 ? (
        <Empty>No budgets or spend recorded yet.</Empty>
      ) : (
        <div className="space-y-4">
          {s.activities.map((a) => {
            const max = Math.max(1, a.last.budget ?? 0, a.current.budget ?? 0, a.last.spent, a.current.spent);
            const items = (m: SpendMonth) => `${m.items}${m.itemsTarget !== null ? `/${m.itemsTarget}` : ""}`;
            return (
              <div key={a.key}>
                <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-[12.5px] font-semibold text-foreground">{a.label}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {s.lastLabel} {items(a.last)} · {s.currentLabel} {items(a.current)} {a.unit}
                  </span>
                </div>
                <div className="space-y-1">
                  <SpendBar label={s.lastLabel} activity={a.label} unit={a.unit} m={a.last} max={max} faded />
                  <SpendBar label={s.currentLabel} activity={a.label} unit={a.unit} m={a.current} max={max} />
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-3 text-[12px]">
            <span className="font-semibold text-foreground">Total</span>
            <span className="text-muted-foreground">
              {s.lastLabel} <span className="font-mono">{fmtUsd(s.total.last.spent)} / {fmtUsd(s.total.last.budget)}</span>
              {" · "}{s.currentLabel}{" "}
              <span className="font-mono font-semibold text-foreground">{fmtUsd(s.total.current.spent)} / {fmtUsd(s.total.current.budget)}</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-3.5 rounded-sm opacity-50" style={{ background: C.spend }} /> {s.lastLabel}</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-3.5 rounded-sm" style={{ background: C.spend }} /> {s.currentLabel}</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-3.5 rounded-sm border border-slate-400" style={stripes(C.spend)} /> Budget left</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-0.5 rounded bg-foreground/70" /> Budget</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-3.5 rounded-sm" style={{ background: C.over }} /> Over budget</span>
          </div>
        </div>
      )}
    </ChartCard>
  );
}

function SpendBar({
  label, activity, unit, m, max, faded,
}: {
  label: string; activity: string; unit: string; m: SpendMonth; max: number; faded?: boolean;
}) {
  const pctOf = (n: number) => Math.min(100, (n / max) * 100);
  const has = m.budget !== null || m.spent > 0 || m.items > 0;
  const over = m.budget !== null && m.spent > m.budget;
  const tip = [
    `${activity} · ${label}`,
    m.budget !== null ? `${fmtUsd(m.spent)} spent of ${fmtUsd(m.budget)} budget` : `${fmtUsd(m.spent)} spent · no budget set`,
    `${m.items}${m.itemsTarget !== null ? ` of ${m.itemsTarget}` : ""} ${unit}${m.items > 0 && m.spent > 0 ? ` · ${fmtUsd(m.spent / m.items)} each` : ""}`,
    m.budget !== null ? (over ? `Over budget by ${fmtUsd(m.spent - m.budget)}` : `${fmtUsd(m.budget - m.spent)} left`) : null,
  ].filter((t): t is string => !!t);

  return (
    <div className="group relative flex items-center gap-2">
      <div className="w-12 shrink-0 text-[10.5px] text-muted-foreground">{label}</div>
      <div className="relative h-3.5 min-w-0 flex-1 rounded bg-muted/60">
        {m.budget !== null && m.budget > m.spent && (
          <div className="absolute inset-y-0" style={{ left: `${pctOf(m.spent)}%`, width: `${pctOf(m.budget) - pctOf(m.spent)}%`, ...stripes(C.spend) }} />
        )}
        <div className="absolute inset-y-0 left-0 rounded"
          style={{ width: `${pctOf(over ? (m.budget as number) : m.spent)}%`, background: C.spend, opacity: faded ? 0.5 : 1 }} />
        {over && (
          <div className="absolute inset-y-0 rounded-r"
            style={{ left: `${pctOf(m.budget as number)}%`, width: `${pctOf(m.spent) - pctOf(m.budget as number)}%`, background: C.over, opacity: faded ? 0.6 : 1 }} />
        )}
        {m.budget !== null && m.budget > 0 && (
          <div className="absolute -inset-y-0.5 w-0.5 rounded bg-foreground/70" style={{ left: `calc(${pctOf(m.budget)}% - 1px)` }} />
        )}
      </div>
      <div className={cn(
        "w-[112px] shrink-0 text-right font-mono text-[11px] tabular-nums",
        over ? "font-semibold text-rose-600 dark:text-rose-400" : "text-muted-foreground",
      )}>
        {has ? `${fmtUsd(m.spent)}${m.budget !== null ? ` / ${fmtUsd(m.budget)}` : ""}` : "—"}
      </div>
      {has && (
        <div className="pointer-events-none absolute bottom-full left-14 z-20 mb-1.5 hidden whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[11.5px] text-popover-foreground shadow-lg group-hover:block">
          {tip.map((t, i) => <div key={i} className={i === 0 ? "font-semibold" : undefined}>{t}</div>)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Backlinks earned: last month vs this month, per person, against each
// month's target (straight from the Backlinks page; not tied to the range filter)
// ---------------------------------------------------------------------------

const stripes = (color: string) => ({
  backgroundImage: `repeating-linear-gradient(45deg, ${color}66 0 4px, transparent 4px 8px)`,
});

function axisTicks(max: number): number[] {
  const step = max <= 5 ? 1 : max <= 12 ? 2 : Math.ceil(max / 5);
  const out: number[] = [];
  for (let v = 0; v <= max; v += step) out.push(v);
  return out;
}

function BacklinksChart({ data }: { data: ExecutiveDashboard }) {
  const c = data.backlinkMonths;
  const freeMax = Math.max(1, ...c.people.flatMap((p) => [
    p.last.free, p.current.free, p.last.freeTarget ?? 0, p.current.freeTarget ?? 0,
  ]));
  const paidMax = Math.max(1, ...c.people.flatMap((p) => [
    p.last.paid + p.last.paidBelow, p.current.paid + p.current.paidBelow, p.last.paidTarget ?? 0, p.current.paidTarget ?? 0,
  ]));
  return (
    <ChartCard title="Backlinks earned" icon={Link2}
      subtitle={`${c.lastLabel} vs ${c.currentLabel} · per person, against each month’s target · from the Backlinks page`}>
      {!c.ready ? (
        <Empty>The Backlinks table isn’t set up yet.</Empty>
      ) : c.people.length === 0 ? (
        <Empty>No backlink targets or backlinks yet.</Empty>
      ) : (
        <div className="space-y-5">
          <MonthPanel kind="free" title="Free links" hint="exchange, guest post, free" data={c} max={freeMax} color={C.blFree} />
          <MonthPanel kind="paid" title={`Paid · DR ${c.paidMinDr}+`} hint={`paid under DR ${c.paidMinDr} shows grey, not counted`}
            data={c} max={paidMax} color={C.blPaid} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-3.5 rounded-sm bg-slate-500 opacity-50" /> {c.lastLabel}</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-3.5 rounded-sm bg-slate-500" /> {c.currentLabel}</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-3.5 rounded-sm border border-slate-400" style={stripes("#64748b")} /> Pending to target</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-0.5 rounded bg-foreground/70" /> Target</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-3.5 rounded-sm bg-slate-400/70" /> Paid under DR {c.paidMinDr}</span>
          </div>
        </div>
      )}
    </ChartCard>
  );
}

type BlKind = "free" | "paid";

function MonthPanel({
  kind, title, hint, data, max, color,
}: {
  kind: BlKind; title: string; hint: string; data: BacklinkComparison; max: number; color: string;
}) {
  const done = (s: BacklinkMonthStat) => (kind === "free" ? s.free : s.paid);
  const tgt = (s: BacklinkMonthStat) => (kind === "free" ? s.freeTarget : s.paidTarget) ?? 0;
  const team = (pick: (p: BacklinkPersonMonths) => BacklinkMonthStat, f: (s: BacklinkMonthStat) => number) =>
    data.people.reduce((a, p) => a + f(pick(p)), 0);
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <div className="text-[12.5px] font-semibold text-foreground">
          {title} <span className="font-normal text-muted-foreground">· {hint}</span>
        </div>
        <div className="text-[11.5px] text-muted-foreground">
          Team {data.lastLabel} {team((p) => p.last, done)}/{team((p) => p.last, tgt)} · {data.currentLabel}{" "}
          <span className="font-semibold text-foreground">{team((p) => p.current, done)}/{team((p) => p.current, tgt)}</span>
        </div>
      </div>
      <div className="space-y-2.5">
        {data.people.map((p) => (
          <div key={p.id} className="flex items-center gap-2">
            <div className="w-16 shrink-0 truncate text-[12px] font-medium text-foreground" title={p.name}>{p.name.split(" ")[0]}</div>
            <div className="min-w-0 flex-1 space-y-1">
              <MonthBar kind={kind} person={p.name} label={data.lastLabel} s={p.last} max={max} color={color} faded paidMinDr={data.paidMinDr} />
              <MonthBar kind={kind} person={p.name} label={data.currentLabel} s={p.current} max={max} color={color} paidMinDr={data.paidMinDr} />
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <div className="w-16 shrink-0" />
          <div className="w-12 shrink-0" />
          <div className="relative h-3 min-w-0 flex-1">
            {axisTicks(max).map((t) => (
              <span key={t} className="absolute -translate-x-1/2 text-[10px] tabular-nums text-muted-foreground" style={{ left: `${(t / max) * 100}%` }}>{t}</span>
            ))}
          </div>
          <div className="w-14 shrink-0" />
        </div>
      </div>
    </div>
  );
}

function MonthBar({
  kind, person, label, s, max, color, faded, paidMinDr,
}: {
  kind: BlKind; person: string; label: string; s: BacklinkMonthStat; max: number; color: string; faded?: boolean; paidMinDr: number;
}) {
  const done = kind === "free" ? s.free : s.paid;
  const below = kind === "paid" ? s.paidBelow : 0;
  const target = kind === "free" ? s.freeTarget : s.paidTarget;
  const met = target !== null && target > 0 && done >= target;
  const pctOf = (n: number) => Math.min(100, (n / max) * 100);
  const tip = (kind === "free"
    ? [
        `${person} · ${label}`,
        `${done} free link${done === 1 ? "" : "s"}${target !== null ? ` of ${target} target` : ""}`,
        s.avgDr !== null ? `avg DR ${s.avgDr} (all links this month)` : null,
      ]
    : [
        `${person} · ${label}`,
        `${done} paid at DR ${paidMinDr}+${target !== null ? ` of ${target} target` : ""} · ${fmtUsd(s.paidUsd)} spent`,
        below > 0 ? `+${below} paid under DR ${paidMinDr} · ${fmtUsd(s.paidBelowUsd)} spent (not counted)` : null,
        `Total paid spend ${fmtUsd(s.paidUsd + s.paidBelowUsd)}`,
      ]
  ).filter((t): t is string => !!t);

  return (
    <div className="group relative flex items-center gap-2">
      <div className="w-12 shrink-0 text-[10.5px] text-muted-foreground">{label}</div>
      <div className="relative h-3.5 min-w-0 flex-1 rounded bg-muted/60">
        {target !== null && target > done && (
          <div className="absolute inset-y-0" style={{ left: `${pctOf(done)}%`, width: `${pctOf(target) - pctOf(done)}%`, ...stripes(color) }} />
        )}
        <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${pctOf(done)}%`, background: color, opacity: faded ? 0.5 : 1 }} />
        {below > 0 && (
          <div className="absolute inset-y-0 bg-slate-400/70" style={{ left: `${pctOf(done)}%`, width: `${pctOf(below)}%` }} />
        )}
        {target !== null && target > 0 && (
          <div className="absolute -inset-y-0.5 w-0.5 rounded bg-foreground/70" style={{ left: `calc(${pctOf(target)}% - 1px)` }} />
        )}
      </div>
      <div className={cn(
        "w-14 shrink-0 text-right font-mono text-[11.5px] tabular-nums",
        met ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
      )}>
        {done}{target !== null ? `/${target}` : ""}{met ? " ✓" : ""}
      </div>
      <div className="pointer-events-none absolute bottom-full left-14 z-20 mb-1.5 hidden whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[11.5px] text-popover-foreground shadow-lg group-hover:block">
        {tip.map((t, i) => <div key={i} className={i === 0 ? "font-semibold" : undefined}>{t}</div>)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team completion: this week vs last week - the Targets table, concise. Same
// numbers as Team Targets for a Mon-Sun week; a person row expands to targets.
// ---------------------------------------------------------------------------

const WEEK_GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(200px,1fr) 68px 60px 56px 170px 84px 112px",
  columnGap: 14,
  alignItems: "center",
};

function TeamWeekCard({ data }: { data: ExecutiveDashboard }) {
  const w = data.teamWeek;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const allOpen = w.people.length > 0 && w.people.every((p) => open[p.id]);
  return (
    <ChartCard title="Team completion" icon={Users}
      subtitle={`${w.thisLabel} vs ${w.lastLabel} · same numbers as the Targets table`}
      right={w.people.length > 0 ? (
        <button type="button" onClick={() => setOpen(Object.fromEntries(w.people.map((p) => [p.id, !allOpen])))}
          className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      ) : undefined}>
      {!w.ready ? (
        <Empty>Team targets aren’t set up yet.</Empty>
      ) : w.people.length === 0 ? (
        <Empty>Nothing is due this week.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <div className="min-w-[820px]">
            <div style={WEEK_GRID} className="border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <div>Person / target</div>
              <div className="text-right">Expected</div>
              <div className="text-right">Done</div>
              <div className="text-right">Left</div>
              <div>This week</div>
              <div className="text-right">Last week</div>
              <div>Status</div>
            </div>
            {w.people.map((p) => {
              const sum = (f: (r: WeekRow) => number) => p.rows.reduce((a, r) => a + f(r), 0);
              const expected = sum((r) => r.expected);
              const done = sum((r) => r.done);
              const awaiting = sum((r) => r.awaiting);
              const left = sum((r) => r.left);
              const expToDate = sum((r) => r.expToDate);
              const lastExp = sum((r) => r.lastExpected);
              const lastDone = sum((r) => r.lastDone);
              const isOpen = !!open[p.id];
              return (
                <div key={p.id}>
                  <button type="button" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))}
                    style={WEEK_GRID} className="w-full border-t border-border bg-muted/50 px-4 py-2.5 text-left transition-colors hover:bg-muted/70">
                    <div className="flex min-w-0 items-center gap-2">
                      {isOpen ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
                      <Avatar className="size-6 shrink-0"><AvatarFallback className="text-[9px]">{initials(p.name)}</AvatarFallback></Avatar>
                      <span className="truncate text-sm font-semibold text-foreground">{p.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{p.rows.length} target{p.rows.length === 1 ? "" : "s"}</span>
                    </div>
                    <WNum v={expected} />
                    <WNum v={done} strong />
                    <WNum v={left} strong />
                    <WeekProgress ratio={expected > 0 ? done / expected : null} awaitingFraction={expected > 0 ? awaiting / expected : 0} strong />
                    <LastWeek ratio={lastExp > 0 ? lastDone / lastExp : null} />
                    <div><StatusChip status={targetStatus(done, expected, expToDate, w.ended)} /></div>
                  </button>
                  {isOpen && p.rows.map((r) => (
                    <div key={r.id} style={WEEK_GRID} className="border-t border-border/60 px-4 py-2">
                      <div className="min-w-0 truncate pl-[46px] text-[13px] text-foreground" title={r.task}>{r.task}</div>
                      <WNum v={r.expected} />
                      <WNum v={r.done} strong />
                      <WNum v={r.left} />
                      <WeekProgress ratio={r.expected > 0 ? r.done / r.expected : null} awaitingFraction={r.expected > 0 ? r.awaiting / r.expected : 0} />
                      <LastWeek ratio={r.lastExpected > 0 ? r.lastDone / r.lastExpected : null} />
                      <div><StatusChip status={r.status} /></div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

function WNum({ v, strong }: { v: number; strong?: boolean }) {
  return (
    <div className={cn("text-right font-mono text-[13px] tabular-nums", strong ? "font-medium text-foreground" : "text-muted-foreground")}>
      {fmtNum(v)}
    </div>
  );
}

function WeekProgress({ ratio, awaitingFraction, strong }: { ratio: number | null; awaitingFraction: number; strong?: boolean }) {
  const complete = ratio != null && ratio >= 1;
  return (
    <div className="flex items-center gap-2">
      <ProgressBar value={ratio} awaitingFraction={awaitingFraction} strong={strong} className="flex-1" />
      <span className="flex w-11 shrink-0 items-center justify-end gap-0.5 font-mono text-xs tabular-nums text-foreground">
        {complete && <Check className="size-3 text-success-600" />}{fmtPctFloor(ratio)}
      </span>
    </div>
  );
}

function LastWeek({ ratio }: { ratio: number | null }) {
  return (
    <div className="flex items-center justify-end gap-0.5 font-mono text-xs tabular-nums text-muted-foreground">
      {ratio != null && ratio >= 1 && <Check className="size-3 text-success-600" />}
      {ratio == null ? "—" : fmtPctFloor(ratio)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits (module scope — not defined in render)
// ---------------------------------------------------------------------------

const TOOLTIP = {
  background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10,
  fontSize: 12, color: "var(--popover-foreground)", boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
} as const;

function ChartCard({
  title, icon: Icon, subtitle, right, children,
}: {
  title: string; icon: typeof TrendingUp; subtitle?: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-lift">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 font-heading text-[15px] font-semibold text-foreground">
            <Icon className="size-4 text-[#5B45E0] dark:text-[#7B62FF]" /> {title}
          </div>
          {subtitle && <div className="mt-0.5 text-[12px] text-slate-500">{subtitle}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex h-[180px] items-center justify-center rounded-xl border border-dashed border-border px-6 text-center text-[12.5px] text-muted-foreground">{children}</div>;
}


function Legend2({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <span className="inline-block rounded-sm" style={{ width: it.line ? 14 : 10, height: it.line ? 3 : 10, background: it.color }} /> {it.label}
        </span>
      ))}
    </div>
  );
}
