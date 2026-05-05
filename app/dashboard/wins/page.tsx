import dynamic from "next/dynamic";
import { getUserContext } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { getWeeklyWinSummary, getWinsTimeline } from "@/lib/data/wins";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";

// Wins timeline uses recharts; code-split so the wins page's initial payload
// doesn't ship the chart library to visitors who bounce before scrolling.
const WinsTimelineChart = dynamic(
  () => import("@/components/sections/wins-timeline").then((m) => m.WinsTimelineChart),
  { loading: () => <div className="h-72 rounded-xl border bg-muted/30 animate-pulse" /> }
);
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, TrendingDown, Minus, CheckCircle2, Trophy, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { Win } from "@/lib/types/database";

export const metadata = { title: "Wins" };

export default async function WinsPage() {
  const ctx = await getUserContext();
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  const supabase = await createClient();
  const [{ data: allWins }, weekly, timeline] = await Promise.all([
    supabase.from("wins").select("*").eq("project_id", ctx.activeProject.id).order("date", { ascending: false }).limit(100),
    getWeeklyWinSummary(ctx.activeProject.id),
    getWinsTimeline(ctx.activeProject.id, 12),
  ]);
  const wins = (allWins ?? []) as Win[];

  const winsDelta = weekly.thisWeekCount - weekly.lastWeekWinCount;
  const tasksDelta = weekly.tasksClosedThisWeek - weekly.tasksClosedLastWeek;

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-6 max-w-[1400px] w-full mx-auto">
      <PageHeader
        title="Wins"
        description="This week vs last week — what changed, what shipped, what moved pillar scores."
      />

      {/* This week vs last week */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          This week vs last week
        </h2>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <WeeklyStatCard
            icon={Trophy}
            label="New wins"
            value={weekly.thisWeekCount}
            prior={weekly.lastWeekWinCount}
            delta={winsDelta}
            tone="emerald"
          />
          <WeeklyStatCard
            icon={CheckCircle2}
            label="Tasks closed"
            value={weekly.tasksClosedThisWeek}
            prior={weekly.tasksClosedLastWeek}
            delta={tasksDelta}
            tone="sky"
          />
          <WeeklyStatCard
            icon={Zap}
            label="AI verified"
            value={weekly.aiVerifiedThisWeek}
            prior={null}
            delta={null}
            sub={`of ${weekly.tasksClosedThisWeek} closures`}
            tone="violet"
          />
          <Card className="p-4 flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Trophy className="size-4" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">All-time wins</div>
              <div className="text-lg font-semibold tabular-nums">{wins.length}</div>
            </div>
          </Card>
        </div>
      </section>

      {/* 12-week comparison timeline */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Comparison timeline
        </h2>
        <WinsTimelineChart timeline={timeline} />
      </section>

      {/* Pillar deltas */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Pillar score movement (7-day)
        </h2>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          {weekly.pillarDeltas.map((p) => (
            <Card key={p.pillar} className="p-4 space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{p.pillar}</div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums">{p.currentScore}</span>
                {p.delta != null && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
                      p.delta > 0 && "text-emerald-600 dark:text-emerald-400",
                      p.delta < 0 && "text-rose-600 dark:text-rose-400",
                      p.delta === 0 && "text-muted-foreground"
                    )}
                  >
                    {p.delta > 0 ? <TrendingUp className="size-3" /> : p.delta < 0 ? <TrendingDown className="size-3" /> : <Minus className="size-3" />}
                    {p.delta > 0 ? "+" : ""}{p.delta}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {p.priorScore != null ? `was ${p.priorScore} · 7d ago` : "new baseline"}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Top impact this week */}
      {weekly.topImpactTasks.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Top impact tasks closed this week
          </h2>
          <Card className="divide-y">
            {weekly.topImpactTasks.map((t) => (
              <div key={t.id} className="flex items-start gap-3 p-4">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <CheckCircle2 className="size-3.5" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{t.title}</span>
                    {t.pillar && <Badge variant="secondary" className="text-[10px]">{t.pillar}</Badge>}
                    {t.verified_by_ai && (
                      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 text-[10px]">
                        <Zap className="size-2.5" /> AI verified
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {t.impact && <span className="text-emerald-700 dark:text-emerald-400 font-medium">{t.impact}</span>}
                    {t.completed_at && <span>Closed {format(new Date(t.completed_at), "MMM d")}</span>}
                  </div>
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      {/* All wins feed */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          All wins
        </h2>
        {wins.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
            Every completed task will show up here.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {wins.map((w) => (
              <Card key={w.id} className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <span className="text-2xl">{w.emoji}</span>
                  <Badge variant="secondary" className="text-[10px]">{w.category ?? "general"}</Badge>
                </div>
                <div>
                  <div className="font-semibold leading-snug">{w.title}</div>
                  {w.description && (
                    <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{w.description}</p>
                  )}
                </div>
                <div className="flex items-center justify-between pt-2 border-t text-xs">
                  {w.metric && <span className="font-semibold text-emerald-600 dark:text-emerald-400">{w.metric}</span>}
                  <span className="text-muted-foreground ml-auto">{format(new Date(w.date), "MMM d")}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function WeeklyStatCard({
  icon: Icon, label, value, prior, delta, sub, tone,
}: {
  icon: typeof Trophy;
  label: string;
  value: number;
  prior: number | null;
  delta: number | null;
  sub?: string;
  tone: "emerald" | "sky" | "violet" | "amber";
}) {
  const toneMap = {
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  };

  return (
    <Card className="p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className={`flex size-8 items-center justify-center rounded-lg ${toneMap[tone]}`}>
          <Icon className="size-3.5" />
        </div>
        {delta != null && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
              delta > 0 && "text-emerald-600 dark:text-emerald-400",
              delta < 0 && "text-rose-600 dark:text-rose-400",
              delta === 0 && "text-muted-foreground"
            )}
          >
            {delta > 0 ? <TrendingUp className="size-3" /> : delta < 0 ? <TrendingDown className="size-3" /> : <Minus className="size-3" />}
            {delta > 0 ? "+" : ""}{delta}
          </span>
        )}
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {prior != null && <div className="text-[10px] text-muted-foreground">was {prior} last week</div>}
        {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
      </div>
    </Card>
  );
}
