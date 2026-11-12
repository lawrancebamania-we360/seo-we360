"use client";

// Executive dashboard — the whole render. One concise, interactive view for
// leadership: target vs achieved (traffic & DR), money spent and the effect it
// bought, content shipped, and what each person is working on. All charts are
// Recharts and respond to the global date-range filter (in the URL).

import { useMemo, useState } from "react";
import {
  ComposedChart, LineChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, FileText, Link2, Gauge, Target, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExecutiveDashboard, MetricSeries } from "@/lib/data/executive";

const C = {
  traffic: "#5B45E0",
  dr: "#0ea5e9",
  target: "#94a3b8",
  backlinks: "#8b5cf6",
  collabs: "#f59e0b",
  content: "#10b981",
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

export function ExecutiveView({ data }: { data: ExecutiveDashboard }) {
  return (
    <div className="space-y-6">
      <KpiRow data={data} />

      <div className="grid gap-4 lg:grid-cols-2">
        <TargetChart title="Organic traffic" icon={TrendingUp} color={C.traffic} series={data.traffic} unit="" />
        <TargetChart title="Domain Rating" icon={Gauge} color={C.dr} series={data.dr} unit="" drStyle />
      </div>

      <SpendEffect data={data} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ContentChart data={data} />
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
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Tile
        icon={TrendingUp} label="Organic traffic"
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
        icon={FileText} label="Content shipped"
        value={data.content.ready ? fmtNum(data.content.total) : "—"}
        sub={data.costPerPost !== null ? `${fmtUsd(data.costPerPost)} / post` : "posts published"}
        color={C.content}
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
// Target vs achieved (line + target reference)
// ---------------------------------------------------------------------------

function TargetChart({
  title, icon: Icon, color, series, unit, drStyle,
}: {
  title: string; icon: typeof TrendingUp; color: string; series: MetricSeries; unit: string; drStyle?: boolean;
}) {
  const rows = series.actual.map((p) => ({ date: p.date.slice(5), value: p.value }));
  const hasData = rows.length > 0;
  const target = series.latestTarget;
  return (
    <ChartCard title={title} icon={Icon} right={
      target != null ? <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground"><Target className="size-3" /> target {fmtNum(target)}</span> : undefined
    }>
      {!series.ready ? (
        <Empty>Add the migration, then record {title.toLowerCase()} points.</Empty>
      ) : !hasData ? (
        <Empty>No {title.toLowerCase()} readings in this range yet. Use “DR / Traffic” to add one.</Empty>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={rows} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false}
              domain={drStyle ? [0, 100] : ["auto", "auto"]} width={44} />
            <Tooltip contentStyle={TOOLTIP} formatter={(v) => [fmtNum(Number(v)) + (unit ? ` ${unit}` : ""), title]} />
            {target != null && <ReferenceLine y={target} stroke={C.target} strokeDasharray="5 4" label={{ value: "target", position: "right", fontSize: 10, fill: C.target }} />}
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} dot={{ r: 3, fill: color }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Spend -> effect combo
// ---------------------------------------------------------------------------

function SpendEffect({ data }: { data: ExecutiveDashboard }) {
  const [line, setLine] = useState<"dr" | "traffic">("dr");
  const keys = data.spend.buckets.map((b) => b.key);
  const effect = useMemo(
    () => alignToBuckets((line === "dr" ? data.dr : data.traffic).actual, keys),
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
            { label: line === "dr" ? "Domain Rating" : "Organic traffic", color: lineColor, line: true },
          ]} />
        </>
      )}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Content shipped
// ---------------------------------------------------------------------------

function ContentChart({ data }: { data: ExecutiveDashboard }) {
  const rows = data.content.buckets;
  const has = data.content.total > 0;
  return (
    <ChartCard title="Content shipped" icon={FileText} subtitle={`${data.content.total} published${data.costPerPost !== null ? ` · ${fmtUsd(data.costPerPost)} / post` : ""}`}>
      {!data.content.ready ? (
        <Empty>Publishing data isn’t available yet.</Empty>
      ) : !has ? (
        <Empty>No posts published in this range.</Empty>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={rows} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} width={32} />
            <Tooltip contentStyle={TOOLTIP} formatter={(v) => [fmtNum(Number(v)), "Posts"]} />
            <Bar dataKey="count" name="Posts" fill={C.content} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
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
