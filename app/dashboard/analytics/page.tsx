import { getUserContext } from "@/lib/auth/get-user";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { AnalyticsScreen } from "@/components/sections/analytics-screen";
import { getContentFreshness } from "@/lib/data/content-freshness";
import { getTopPagesByEngagementRate } from "@/lib/data/url-metrics";
import { getBlogClusters } from "@/lib/data/blog-clusters";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;
  const project = ctx.activeProject;

  const sp = await searchParams;
  const range = sp.range ?? "last_30_days";

  // Local Supabase reads — fast, block the shell. The GA4/GSC round-trips stream
  // in their own Suspense boundaries inside the screen.
  const [freshness, engagementExtremes, clusters] = await Promise.all([
    getContentFreshness(project.id),
    getTopPagesByEngagementRate(project.id, "30d"),
    getBlogClusters(project.id),
  ]);

  return (
    <AnalyticsScreen
      range={range}
      projectId={project.id}
      siteUrl={project.gsc_property_url ?? null}
      propertyId={project.ga4_property_id ?? null}
      freshness={freshness}
      engagementExtremes={engagementExtremes}
      clusters={clusters}
    />
  );
}
