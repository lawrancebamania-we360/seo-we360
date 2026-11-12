import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/get-user";
import { TrafficSourcesStreamed } from "@/components/sections/traffic-sources-section";
import { getExecutiveDashboard } from "@/lib/data/executive";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { ExecutiveRangeFilter } from "@/components/sections/executive/range-filter";
import { MetricEditor } from "@/components/sections/executive/metric-editor";
import { ExecutiveView } from "@/components/sections/executive/executive-view";

export const metadata = { title: "Executive" };

// Admin-only, concise leadership view. requireAdmin redirects members to "/"
// so the page can't be reached by typing the URL even though it's hidden in
// the sidebar for non-admins.
export default async function ExecutivePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const ctx = await requireAdmin();
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  const sp = await searchParams;
  const data = await getExecutiveDashboard(ctx.activeProject.id, sp.range ?? "this_month", ctx.activeProject.ga4_property_id ?? null);

  // Every hand-entered DR / traffic point (goals included, whatever their date),
  // newest first, for the admin editor's delete list.
  const editorPoints = [...data.manualPoints].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="mx-auto w-full max-w-[1400px] flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <PageHeader
        title="Executive"
        description={`Target vs achieved, money spent and its effect, and what the team is working on · ${data.rangeLabel}`}
        actions={
          <>
            <MetricEditor projectId={ctx.activeProject.id} points={editorPoints} />
            <ExecutiveRangeFilter rangeKey={data.rangeKey} />
          </>
        }
      />
      <ExecutiveView
        data={data}
        trafficSources={
          // The exact Analytics > Traffic sources card (same component, same GA4
          // numbers), streamed so a slow Google round-trip doesn't block the page.
          <Suspense fallback={<div className="h-[300px] animate-pulse rounded-2xl border border-border bg-card" />}>
            <TrafficSourcesStreamed
              propertyId={ctx.activeProject.ga4_property_id ?? null}
              projectId={ctx.activeProject.id}
              range={data.rangeKey}
            />
          </Suspense>
        }
      />
    </div>
  );
}
