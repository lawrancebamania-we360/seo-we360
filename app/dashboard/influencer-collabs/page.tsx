import { getUserContext } from "@/lib/auth/get-user";
import { getInfluencerCollabs } from "@/lib/data/influencer-collabs";
import { resolveBacklinkRange } from "@/lib/data/backlinks";
import { getTeamMembers } from "@/lib/data/tasks";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { BacklinkDateFilter } from "@/components/sections/backlinks/backlink-date-filter";
import { InfluencerCollabsTable } from "@/components/sections/influencer-collabs/influencer-collabs-table";
import { AddInfluencerCollabButton } from "@/components/sections/influencer-collabs/add-influencer-collab-button";

export const metadata = { title: "Influencer Collabs" };

export default async function InfluencerCollabsPage({
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

  const [collabs, members] = await Promise.all([
    getInfluencerCollabs(ctx.activeProject.id, resolveBacklinkRange(range, start, end)),
    getTeamMembers(),
  ]);

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-5 max-w-[1800px] w-full mx-auto">
      <PageHeader
        title="Influencer Collabs"
        description="Every influencer collaboration the team has run - add one as you close it, or paste in a batch."
        actions={
          <div className="flex flex-nowrap items-center gap-2">
            <BacklinkDateFilter range={range} start={start} end={end} />
            {ctx.canManageTeam && <AddInfluencerCollabButton projectId={ctx.activeProject.id} members={members} />}
          </div>
        }
      />

      <InfluencerCollabsTable collabs={collabs} projectId={ctx.activeProject.id} members={members} canManage={ctx.canManageTeam} />
    </div>
  );
}
