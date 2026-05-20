import { getUserContext } from "@/lib/auth/get-user";
import { getSeoReport } from "@/lib/data/seo-report";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { SiteTrafficBoxes } from "@/components/sections/site-traffic-boxes";
import { SeoReportView } from "@/components/sections/seo-report-view";

export const metadata = { title: "Reports" };

// Resolve a ?range= preset to a start date (ISO). end is always "today".
function rangeToStart(range: string): string | undefined {
  const now = new Date();
  if (range === "30d") {
    const d = new Date(now); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }
  if (range === "90d") {
    const d = new Date(now); d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  }
  if (range === "ytd") {
    return `${now.getFullYear()}-01-01`;
  }
  return undefined; // "all"
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  const params = await searchParams;
  const range = params.range ?? "all";
  const start = rangeToStart(range);
  const end = start ? new Date().toISOString().slice(0, 10) : undefined;

  const snapshot = await getSeoReport(ctx.activeProject.id, { start, end });

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-5 max-w-[1800px] w-full mx-auto">
      <PageHeader
        title="Reports"
        description="What the SEO team shipped — and whether it's earning traffic. Live GSC + GA4 metrics, sitemap status, and SEO issues for every completed blog post and page."
      />

      {/* Whole-site GA4 traffic — last month vs this month */}
      <SiteTrafficBoxes />

      {/* Per-task report — rollups, filters, table */}
      <SeoReportView rows={snapshot.rows} rollup={snapshot.rollup} activeRange={range} />
    </div>
  );
}
