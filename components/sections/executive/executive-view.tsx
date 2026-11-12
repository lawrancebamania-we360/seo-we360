"use client";

// Executive dashboard — the whole render. One concise, interactive view for
// leadership: target vs achieved (traffic & DR), money spent and the effect it
// bought, and what each person is working on. All charts are
// Recharts and respond to the global date-range filter (in the URL).

import { useMemo, useState } from "react";
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell, LabelList,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, Link2, Gauge, Target, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExecutiveDashboard, MetricSeries } from "@/lib/data/executive";

const C = {
  traffic: "#5B45E0",
  dr: "#0ea5e9",
  target: "#94a3b8",
  backlinks: "#8b5cf6",
  collabs: "#f59e0b",
  blFree: "#a78bfa",
  blPaid: "#6d28d9",
  bar: "#5B45E0",
};

const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmtNum = (n: number) => Math.round(n).toLocaleString();
const pct = (n: number) => `${Math.round(n * 100)}%`;

// Last actual value on/before each month bucket, carried forward — so a sparse
// DR/traffic reading history lines up against the monthly spend bars.
function alignToBuckets(points: { date: string; value: number }[], keys: string[]): (number | null)[] {
  const pts = [...points].sort((a, b) => a.date.localeCompare(b.date));
  let i = 0; let last: number | null = null;
  return keys.map((k) => {
    const monthEnd = `${k}-99`; // string upper-bound for any day in month k (YYYY-MM)
    while (i < pts.length && pts[i].date <= monthEnd) { last = pts[i].value; i++; }
    return last;
  });
}

export function ExecutiveView({ data, trafficSources }: { data: ExecutiveDashboard; trafficSources?: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <KpiRow data={data} />

      <div className="grid gap-4 lg:grid-cols-2">
        <GoalCard title="Traffic goal" icon={TrendingUp} color={C.traffic} series={data.traffic} today={data.today} />
        <GoalCard title="Domain Rating goal" icon={Gauge} color={C.dr} series={data.dr} today={data.today} />
      </div>

      {trafficSources}

      <SpendEffect data={data} />

      <div className="grid gap-4 lg:grid-cols-2">
        <BacklinksChart data={data} />
        <TeamChart data={data} />
      </div>

      <TeamWorkload data={data} />
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
// Spend -> effect combo
// ---------------------------------------------------------------------------

function SpendEffect({ data }: { data: ExecutiveDashboard }) {
  const [line, setLine] = useState<"dr" | "traffic">("dr");
  const keys = data.spend.buckets.map((b) => b.key);
  const effect = useMemo(
    () => alignToBuckets((line === "dr" ? data.dr : data.traffic).history, keys),
    [line, data.dr, data.traffic, keys],
  );
  const rows = data.spend.buckets.map((b, i) => ({
    label: b.label, backlinks: b.backlinks, collabs: b.collabs, effect: effect[i],
  }));
  const hasSpend = data.spend.totalUsd > 0;
  const hasEffect = rows.some((r) => r.effect != null);
  const lineColor = line === "dr" ? C.dr : C.traffic;

  return (
    <ChartCard
      title="Money spent → effect"
      icon={DollarSign}
      subtitle={`${fmtUsd(data.spend.totalUsd)} this range · backlinks ${fmtUsd(data.spend.backlinksUsd)} + collabs ${fmtUsd(data.spend.collabsUsd)}${data.costPerDrPoint !== null ? ` · ${fmtUsd(data.costPerDrPoint)} per DR point` : ""}`}
      right={
        <div className="inline-flex rounded-md border border-border p-0.5 text-[11px]">
          <Toggle active={line === "dr"} onClick={() => setLine("dr")}>DR</Toggle>
          <Toggle active={line === "traffic"} onClick={() => setLine("traffic")}>Traffic</Toggle>
        </div>
      }
    >
      {!data.spend.ready ? (
        <Empty>No spend tables yet.</Empty>
      ) : !hasSpend && !hasEffect ? (
        <Empty>No spend or {line === "dr" ? "DR" : "traffic"} readings in this range.</Empty>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={52}
                tickFormatter={(v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`)} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: lineColor }} tickLine={false} axisLine={false} width={44}
                domain={line === "dr" ? [0, 100] : ["auto", "auto"]} />
              <Tooltip contentStyle={TOOLTIP} formatter={(v, name) =>
                name === (line === "dr" ? "DR" : "Traffic") ? [fmtNum(Number(v)), name] : [fmtUsd(Number(v)), name]} />
              <Bar yAxisId="left" dataKey="backlinks" name="Backlinks" stackId="s" fill={C.backlinks} radius={[0, 0, 0, 0]} />
              <Bar yAxisId="left" dataKey="collabs" name="Collabs" stackId="s" fill={C.collabs} radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="effect" name={line === "dr" ? "DR" : "Traffic"} stroke={lineColor} strokeWidth={2.5} dot={{ r: 3, fill: lineColor }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
          <Legend2 items={[
            { label: "Backlinks spend", color: C.backlinks },
            { label: "Collabs spend", color: C.collabs },
            { label: line === "dr" ? "Domain Rating" : "Traffic", color: lineColor, line: true },
          ]} />
        </>
      )}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Backlinks earned, by person (straight from the Backlinks page)
// ---------------------------------------------------------------------------

interface BacklinkBar { name: string; full: string; count: number; free: number; paid: number; paidUsd: number; avgDr: number | null }

function BacklinksChart({ data }: { data: ExecutiveDashboard }) {
  const b = data.backlinks;
  const rows: BacklinkBar[] = b.byPerson.map((p) => ({
    name: p.name.split(" ")[0], full: p.name, count: p.count, free: p.free, paid: p.paid, paidUsd: p.paidUsd, avgDr: p.avgDr,
  }));
  const subtitle = `${b.count} in ${data.rangeLabel.toLowerCase()} · ${b.free} free · ${b.paid} paid${b.paidUsd > 0 ? ` (${fmtUsd(b.paidUsd)})` : ""}${b.avgDr !== null ? ` · avg DR ${b.avgDr}` : ""}`;
  return (
    <ChartCard title="Backlinks earned" icon={Link2} subtitle={subtitle}>
      {!b.ready ? (
        <Empty>The Backlinks table isn’t set up yet.</Empty>
      ) : rows.length === 0 ? (
        <Empty>No backlinks recorded in this range. Try a longer range.</Empty>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 38)}>
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 36, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--foreground)" }} tickLine={false} axisLine={false} width={70} />
              <Tooltip content={<BacklinkTip />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
              <Bar dataKey="free" name="Free" stackId="bl" fill={C.blFree} />
              <Bar dataKey="paid" name="Paid" stackId="bl" fill={C.blPaid} radius={[0, 4, 4, 0]}>
                <LabelList dataKey="count" position="right" style={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <Legend2 items={[
            { label: "Free (exchange, guest post, free)", color: C.blFree },
            { label: "Paid", color: C.blPaid },
          ]} />
        </>
      )}
    </ChartCard>
  );
}

function BacklinkTip({ active, payload }: { active?: boolean; payload?: { payload?: BacklinkBar }[] }) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div style={TOOLTIP} className="space-y-0.5 px-3 py-2">
      <div className="font-semibold">{p.full}</div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block size-2.5 rounded-sm" style={{ background: C.blFree }} /> Free: {p.free}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block size-2.5 rounded-sm" style={{ background: C.blPaid }} />
        Paid: {p.paid}{p.paid > 0 ? ` · ${fmtUsd(p.paidUsd)} spent` : ""}
      </div>
      <div className="text-muted-foreground">{p.count} total{p.avgDr != null ? ` · avg DR ${p.avgDr}` : ""}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Team completion
// ---------------------------------------------------------------------------

function TeamChart({ data }: { data: ExecutiveDashboard }) {
  const people = [...data.team.people].sort((a, b) => b.completion - a.completion);
  const rows = people.map((p) => ({ name: p.name.split(" ")[0], completion: Math.round(p.completion * 100), full: p.name }));
  return (
    <ChartCard title="Team completion" icon={Users} subtitle={`${data.team.people.length} people · ${pct(data.team.totals.completion)} overall`}>
      {!data.team.ready ? (
        <Empty>Team targets aren’t set up yet.</Empty>
      ) : rows.length === 0 ? (
        <Empty>No targets assigned in this range.</Empty>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 34)}>
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 36, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} unit="%" />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--foreground)" }} tickLine={false} axisLine={false} width={70} />
            <Tooltip contentStyle={TOOLTIP} formatter={(v, _n, item) => [`${Math.round(Number(v))}%`, ((item as { payload?: { full?: string } })?.payload)?.full ?? "Completion"]} />
            <Bar dataKey="completion" name="Completion" radius={[0, 4, 4, 0]}>
              {rows.map((r, i) => (
                <Cell key={i} fill={r.completion >= 80 ? "#10b981" : r.completion >= 50 ? "#f59e0b" : "#f43f5e"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Who's working on what
// ---------------------------------------------------------------------------

function TeamWorkload({ data }: { data: ExecutiveDashboard }) {
  const byPerson = useMemo(() => {
    const map = new Map<string, { name: string; tasks: string[]; completion: number }>();
    for (const p of data.team.people) map.set(p.personId, { name: p.name, tasks: [], completion: p.completion });
    for (const t of data.team.targets) {
      for (const id of [t.ownerId, t.coOwnerId, t.coOwner2Id]) {
        if (id && map.has(id)) map.get(id)!.tasks.push(t.task);
      }
    }
    return [...map.values()].filter((p) => p.tasks.length > 0).sort((a, b) => b.completion - a.completion);
  }, [data.team]);

  if (!data.team.ready || byPerson.length === 0) return null;
  return (
    <ChartCard title="Who’s working on what" icon={Users} subtitle="Current targets owned, by person">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {byPerson.map((p, i) => (
          <div key={i} className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-foreground">{p.name}</span>
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold",
                p.completion >= 0.8 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : p.completion >= 0.5 ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "bg-rose-500/10 text-rose-600 dark:text-rose-400")}>{pct(p.completion)}</span>
            </div>
            <ul className="space-y-0.5">
              {p.tasks.slice(0, 5).map((t, j) => (
                <li key={j} className="truncate text-[12px] text-slate-600 dark:text-foreground/75" title={t}>• {t}</li>
              ))}
              {p.tasks.length > 5 && <li className="text-[11px] text-muted-foreground">+{p.tasks.length - 5} more</li>}
            </ul>
          </div>
        ))}
      </div>
    </ChartCard>
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

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("rounded px-2 py-0.5 font-medium transition", active ? "bg-[#5B45E0] text-white" : "text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
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
