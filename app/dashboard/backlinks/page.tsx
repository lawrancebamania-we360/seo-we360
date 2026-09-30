import { getUserContext } from "@/lib/auth/get-user";
import { getBacklinkWebsites, resolveBacklinkRange } from "@/lib/data/backlinks";
import { getTeamMembers } from "@/lib/data/tasks";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { BacklinkDateFilter } from "@/components/sections/backlinks/backlink-date-filter";
import { BacklinkWebsiteTable } from "@/components/sections/backlinks/backlink-website-table";
import { AddSubmissionButton } from "@/components/sections/backlinks/add-submission-button";

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

  const [websites, members] = await Promise.all([
    getBacklinkWebsites(ctx.activeProject.id, resolveBacklinkRange(range, start, end)),
    getTeamMembers(),
  ]);

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-5 max-w-[1800px] w-full mx-auto">
      <PageHeader
        title="Backlinks"
        description="Every website you've submitted content to, and how often - paste in submissions from your tracking sheet, then filter by date to see distribution activity for any period."
        actions={
          <div className="flex flex-nowrap items-center gap-2">
            <BacklinkDateFilter range={range} start={start} end={end} />
            {ctx.canManageTeam && (
              <AddSubmissionButton projectId={ctx.activeProject.id} websites={websites.map((w) => ({ id: w.id, domain: w.domain }))} members={members} />
            )}
          </div>
        }
      />

      <BacklinkWebsiteTable websites={websites} />
    </div>
  );
}
