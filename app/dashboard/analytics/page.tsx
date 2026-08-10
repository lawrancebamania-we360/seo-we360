import { getUserContext } from "@/lib/auth/get-user";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { AnalyticsScreen } from "@/components/sections/analytics-screen";
import { getContentFreshness } from "@/lib/data/content-freshness";
import { getTopPagesByEngagement, type MetricWindow } from "@/lib/data/url-metrics";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ window?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;
  const project = ctx.activeProject;

  const winParam = (await searchParams).window;
  const window: MetricWindow = winParam === "60d" ? "60d" : winParam === "90d" ? "90d" : "30d";

  // Local Supabase reads — fast, block the shell. The GA4/GSC round-trips stream
  // in their own Suspense boundaries inside the screen.
  const [freshness, engagement] = await Promise.all([
    getContentFreshness(project.id),
    getTopPagesByEngagement(project.id, window, 25),
  ]);

  return (
    <AnalyticsScreen
      window={window}
      projectId={project.id}
      siteUrl={project.gsc_property_url ?? null}
      propertyId={project.ga4_property_id ?? null}
      freshness={freshness}
      engagement={engagement}
    />
  );
}
