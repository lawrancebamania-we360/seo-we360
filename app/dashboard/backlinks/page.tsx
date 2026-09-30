import { getUserContext } from "@/lib/auth/get-user";
import { getBacklinkWebsites, resolveBacklinkRange } from "@/lib/data/backlinks";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { BacklinkDateFilter } from "@/components/sections/backlinks/backlink-date-filter";
import { BacklinkWebsiteTable } from "@/components/sections/backlinks/backlink-website-table";
import { NewSubmissionsButton } from "@/components/sections/backlinks/new-submissions-button";

export const metadata = { title: "Backlinks" };

export default async function BacklinksPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  const params = await searchParams;
  const range = params.range ?? "all";
  const start = params.start ?? "";
  const end = params.end ?? "";

  const websites = await getBacklinkWebsites(ctx.activeProject.id, resolveBacklinkRange(range, start, end));

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-5 max-w-[1800px] w-full mx-auto">
      <PageHeader
        title="Backlinks"
        description="Every website you've submitted content to, and how often - paste in submissions from your tracking sheet, then filter by date to see distribution activity for any period."
        actions={ctx.canManageTeam ? <NewSubmissionsButton projectId={ctx.activeProject.id} /> : null}
      />

      <BacklinkDateFilter range={range} start={start} end={end} />

      <BacklinkWebsiteTable websites={websites} />
    </div>
  );
}
