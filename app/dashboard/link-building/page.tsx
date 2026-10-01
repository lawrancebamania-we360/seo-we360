import { getUserContext } from "@/lib/auth/get-user";
import { getEarnedBacklinks } from "@/lib/data/earned-backlinks";
import { resolveBacklinkRange } from "@/lib/data/backlinks";
import { getTeamMembers } from "@/lib/data/tasks";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { BacklinkDateFilter } from "@/components/sections/backlinks/backlink-date-filter";
import { EarnedBacklinksTable } from "@/components/sections/earned-backlinks/earned-backlinks-table";
import { AddEarnedBacklinkButton } from "@/components/sections/earned-backlinks/add-earned-backlink-button";

export const metadata = { title: "Backlinks" };

export default async function LinkBuildingPage({
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

  const [backlinks, members] = await Promise.all([
    getEarnedBacklinks(ctx.activeProject.id, resolveBacklinkRange(range, start, end)),
    getTeamMembers(),
  ]);

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-5 max-w-[1800px] w-full mx-auto">
      <PageHeader
        title="Backlinks"
        description="Backlinks the team has actually landed via outreach and link-building - add one as you get it, or paste in a batch."
        actions={
          <div className="flex flex-nowrap items-center gap-2">
            <BacklinkDateFilter range={range} start={start} end={end} />
            {ctx.canManageTeam && <AddEarnedBacklinkButton projectId={ctx.activeProject.id} members={members} />}
          </div>
        }
      />

      <EarnedBacklinksTable websites={backlinks} projectId={ctx.activeProject.id} members={members} canManage={ctx.canManageTeam} />
    </div>
  );
}
