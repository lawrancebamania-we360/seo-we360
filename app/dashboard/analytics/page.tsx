import { getUserContext } from "@/lib/auth/get-user";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { AnalyticsScreen } from "@/components/sections/analytics-screen";
import { getContentFreshness } from "@/lib/data/content-freshness";
import { getTopPagesByEngagement, type MetricWindow } from "@/lib/data/url-metrics";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ window?: string; range?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;
  const project = ctx.activeProject;

  const sp = await searchParams;
  const window: MetricWindow = sp.window === "60d" ? "60d" : sp.window === "90d" ? "90d" : "30d";
  const range = sp.range ?? "last_30_days";

  // Local Supabase reads — fast, block the shell. The GA4/GSC round-trips stream
  // in their own Suspense boundaries inside the screen.
  const [freshness, engagement] = await Promise.all([
    getContentFreshness(project.id),
    getTopPagesByEngagement(project.id, window, 25),
  ]);

  return (
    <AnalyticsScreen
      window={window}
      range={range}
      projectId={project.id}
      siteUrl={project.gsc_property_url ?? null}
      propertyId={project.ga4_property_id ?? null}
      freshness={freshness}
      engagement={engagement}
    />
  );
}
