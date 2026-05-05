import Link from "next/link";
import dynamic from "next/dynamic";
import { getUserContext } from "@/lib/auth/get-user";
import { getDashboardCounts, getLatestPillarScores } from "@/lib/data/overview";
import { getGa4WeeklyDelta } from "@/lib/google/ga4";
import { getGscWeeklyDelta } from "@/lib/google/gsc";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { PageHeader } from "@/components/dashboard/page-header";
import { PillarCard } from "@/components/sections/pillar-card";
import { Ga4InsightsCard, GscInsightsCard } from "@/components/sections/insights-card";

// PillarRadar pulls in recharts (~34KB gzipped). Code-split it so initial paint
// doesn't pay for the chart bundle.
const PillarRadar = dynamic(
  () => import("@/components/sections/pillar-radar").then((m) => m.PillarRadar),
  { loading: () => <div className="h-80 rounded-xl border bg-muted/30 animate-pulse" /> }
);
import { EeatCard, type EeatReport } from "@/components/sections/eeat-card";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { ListChecks, ShieldAlert, Search, Trophy } from "lucide-react";
import { explainBreakdownKey } from "@/lib/ui-helpers";

export const metadata = { title: "Overview" };

const PILLAR_HREF: Record<string, string> = {
  SEO: "/tasks?pillar=SEO",
  AEO: "/tasks?pillar=AEO",
  GEO: "/tasks?pillar=GEO",
  SXO: "/tasks?pillar=SXO",
  AIO: "/tasks?pillar=AIO",
};

export default async function OverviewPage() {
  const ctx = await getUserContext();
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  const projectId = ctx.activeProject.id;
  const supabase = await createClient();
  const [pillars, counts, ga4, gsc] = await Promise.all([
    getLatestPillarScores(projectId),
    getDashboardCounts(projectId),
    getGa4WeeklyDelta(ctx.activeProject.ga4_property_id ?? null),
    getGscWeeklyDelta(ctx.activeProject.gsc_property_url ?? null),
  ]);
  // Fetch E-E-A-T report separately so a missing table (pre-migration) can't
  // take down the whole Overview page.
  let latestEeat: EeatReport | null = null;
  try {
    const { data } = await supabase
      .from("eeat_reports")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    latestEeat = (data as EeatReport | null) ?? null;
  } catch { /* table may not exist yet — render "Analyze" prompt instead */ }

  const scoresMap = Object.fromEntries(pillars.map((p) => [p.pillar, p.score]));
  const avg = Math.round(pillars.reduce((sum, p) => sum + p.score, 0) / pillars.length);

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-8 max-w-[1600px] w-full mx-auto">
      <PageHeader
        title={`${ctx.activeProject.name}`}
        description={`Five-pillar optimization health for ${ctx.activeProject.domain}. Average health score ${avg}/100.`}
        actions={
          <Badge variant="secondary" className="gap-1.5">
            <span className="inline-block size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Next audit: 11:00 AM IST
          </Badge>
        }
      />

      <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard href="/dashboard/tasks" icon={ListChecks} label="Open tasks" value={counts.openTasks} sub={`${counts.critical} critical`} />
        <StatCard href="/dashboard/tasks?priority=critical" icon={ShieldAlert} label="Critical" value={counts.critical} sub="Block ranking progress" tone="rose" />
        <StatCard href="/dashboard/keywords" icon={Search} label="Tracked keywords" value={counts.keywords} sub="Across all clusters" />
        <StatCard href="/dashboard/wins" icon={Trophy} label="Wins · 30d" value={counts.wins30d} sub="Team momentum" tone="emerald" />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Pillar scores
          </h2>
          <span className="text-xs text-muted-foreground">Tap a card for details</span>
        </div>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
          {pillars.map((p, i) => (
            <PillarCard
              key={p.pillar}
              pillar={p.pillar}
              score={p.score}
              previousScore={p.previous}
              topIssues={p.topIssues}
              href={PILLAR_HREF[p.pillar] ?? "/"}
              index={i}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <PillarRadar scores={scoresMap} />
        <PillarBreakdownList pillars={pillars} />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Traffic + search insights
          </h2>
          <span className="text-xs text-muted-foreground">Last 7 days</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Ga4InsightsCard ga4={ga4} />
          <GscInsightsCard gsc={gsc} />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Trust + authority (E-E-A-T)
          </h2>
          <span className="text-xs text-muted-foreground">Google quality rater signals</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <EeatCard projectId={projectId} projectName={ctx.activeProject.name} latestReport={latestEeat} />
        </div>
      </section>
    </div>
  );
}

function StatCard({
  href,
  icon: Icon,
  label,
  value,
  sub,
  tone = "zinc",
}: {
  href: string;
  icon: typeof ListChecks;
  label: string;
  value: number;
  sub?: string;
  tone?: "zinc" | "rose" | "emerald";
}) {
  const toneClass =
    tone === "rose"
      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
      : tone === "emerald"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : "bg-muted text-muted-foreground";
  return (
    <Link href={href} className="group block">
      <Card className="p-4 flex items-center gap-3 transition-all hover:shadow-md hover:-translate-y-0.5 group-hover:border-primary/30">
        <div className={`flex size-9 items-center justify-center rounded-lg transition-transform group-hover:scale-110 ${toneClass}`}>
          <Icon className="size-4" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
          <div className="text-lg font-semibold tabular-nums">
            <AnimatedNumber value={value} />
          </div>
          {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
        </div>
      </Card>
    </Link>
  );
}

function PillarBreakdownList({ pillars }: { pillars: { pillar: string; score: number; breakdown: Record<string, number> }[] }) {
  return (
    <Card className="p-5">
      <div className="mb-4">
        <div className="font-semibold">Breakdown</div>
        <div className="text-sm text-muted-foreground">
          What drives each pillar&apos;s score — hover any tag for an explanation.
        </div>
      </div>
      <div className="space-y-3">
        {pillars.map((p) => (
          <div key={p.pillar} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{p.pillar}</span>
              <span className="tabular-nums text-muted-foreground">{p.score}/100</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-[width] duration-500"
                style={{ width: `${p.score}%` }}
              />
            </div>
            {Object.keys(p.breakdown).length > 0 && (
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                {Object.entries(p.breakdown).slice(0, 4).map(([k, v]) => (
                  <span
                    key={k}
                    title={explainBreakdownKey(k)}
                    className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground cursor-help hover:bg-primary/10 hover:text-foreground transition-colors"
                  >
                    {k.replace(/_/g, " ")}: <span className="tabular-nums font-medium text-foreground">{v}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
