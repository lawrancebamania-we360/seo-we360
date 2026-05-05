"use client";

import { useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { motion } from "motion/react";
import { TrendingUp, TrendingDown, Minus, BarChart3, LineChart as LineIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WinsTimeline } from "@/lib/data/wins";
import type { Pillar } from "@/lib/types/database";

type View = "throughput" | "pillars";

const PILLARS: Pillar[] = ["SEO", "AEO", "GEO", "SXO", "AIO"];
const PILLAR_COLOR: Record<Pillar, string> = {
  SEO: "#10b981",   // emerald
  AEO: "#0ea5e9",   // sky
  GEO: "#8b5cf6",   // violet
  SXO: "#f59e0b",   // amber
  AIO: "#f43f5e",   // rose
};

export function WinsTimelineChart({ timeline }: { timeline: WinsTimeline }) {
  const [view, setView] = useState<View>("throughput");

  const hasData = timeline.weeks.some((w) => w.wins > 0 || w.tasks_closed > 0 || PILLARS.some((p) => w[p] !== null));

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="font-semibold inline-flex items-center gap-2">
            <BarChart3 className="size-4 text-primary" />
            12-week comparison timeline
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Weekly throughput + pillar score trajectory since {timeline.first_week || "project start"}.
          </div>
        </div>
        <div className="inline-flex rounded-md border p-0.5 text-xs">
          <ViewTab active={view === "throughput"} onClick={() => setView("throughput")} icon={BarChart3}>
            Throughput
          </ViewTab>
          <ViewTab active={view === "pillars"} onClick={() => setView("pillars")} icon={LineIcon}>
            Pillar trend
          </ViewTab>
        </div>
      </div>

      {!hasData ? (
        <div className="rounded-md border border-dashed p-10 text-center text-xs text-muted-foreground">
          No historical data yet. As the daily cron runs, this chart will fill in.
        </div>
      ) : view === "throughput" ? (
        <ThroughputView timeline={timeline} />
      ) : (
        <PillarTrendView timeline={timeline} />
      )}
    </Card>
  );
}

function ViewTab({
  active, onClick, icon: Icon, children,
}: {
  active: boolean; onClick: () => void; icon: typeof BarChart3; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2.5 py-1 font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="size-3" />
      {children}
    </button>
  );
}

function ThroughputView({ timeline }: { timeline: WinsTimeline }) {
  const data = timeline.weeks.map((w) => ({
    week: w.week_label,
    wins: w.wins,
    tasks: w.tasks_closed,
  }));
  return (
    <motion.div
      key="throughput"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <MetricCell label="Total wins · 12w" value={timeline.total_wins} tone="emerald" />
        <MetricCell label="Tasks closed · 12w" value={timeline.total_tasks_closed} tone="sky" />
      </div>
      <div className="h-64 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.4 }}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 11,
              }}
            />
            <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="tasks" fill="#0ea5e9" radius={[4, 4, 0, 0]} name="Tasks closed" />
            <Bar dataKey="wins" fill="#10b981" radius={[4, 4, 0, 0]} name="Wins" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}

function PillarTrendView({ timeline }: { timeline: WinsTimeline }) {
  const data = timeline.weeks.map((w) => ({
    week: w.week_label,
    SEO: w.SEO,
    AEO: w.AEO,
    GEO: w.GEO,
    SXO: w.SXO,
    AIO: w.AIO,
  }));

  return (
    <motion.div
      key="pillars"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {PILLARS.map((p) => {
          const delta = timeline.pillars_delta[p];
          return (
            <div key={p} className="rounded-md border bg-muted/20 p-2.5 space-y-0.5">
              <div className="text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1.5" style={{ color: PILLAR_COLOR[p] }}>
                <span className="inline-block size-2 rounded-full" style={{ background: PILLAR_COLOR[p] }} />
                {p}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold tabular-nums">
                  {timeline.weeks[timeline.weeks.length - 1]?.[p] ?? "—"}
                </span>
                {delta != null && (
                  <DeltaIndicator delta={delta} />
                )}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {delta != null ? `over ${timeline.weeks.length} wks` : "awaiting data"}
              </div>
            </div>
          );
        })}
      </div>

      <div className="h-72 -ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 11,
              }}
            />
            <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            {PILLARS.map((p) => (
              <Line
                key={p}
                type="monotone"
                dataKey={p}
                stroke={PILLAR_COLOR[p]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}

function MetricCell({ label, value, tone }: { label: string; value: number; tone: "emerald" | "sky" }) {
  const toneClass = tone === "emerald"
    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
    : "bg-sky-500/10 text-sky-700 dark:text-sky-400";
  return (
    <div className="rounded-md border bg-muted/20 p-3 flex items-center gap-3">
      <div className={`size-8 rounded-lg grid place-items-center ${toneClass}`}>
        <BarChart3 className="size-3.5" />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
        <div className="text-xl font-bold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function DeltaIndicator({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <Badge variant="outline" className="text-[9px] gap-0.5 h-4">
        <Minus className="size-2.5" />0
      </Badge>
    );
  }
  const positive = delta > 0;
  return (
    <Badge
      className={cn(
        "text-[9px] gap-0.5 h-4 border",
        positive
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
          : "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20"
      )}
    >
      {positive ? <TrendingUp className="size-2.5" /> : <TrendingDown className="size-2.5" />}
      {positive ? "+" : ""}{delta}
    </Badge>
  );
}
