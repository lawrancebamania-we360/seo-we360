import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getUserContext } from "@/lib/auth/get-user";
import { getBacklinkWebsiteDetail, getBacklinkWebsites, resolveBacklinkRange } from "@/lib/data/backlinks";
import { getTeamMembers } from "@/lib/data/tasks";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { BacklinkDateFilter } from "@/components/sections/backlinks/backlink-date-filter";
import { BacklinkSubmissionList } from "@/components/sections/backlinks/backlink-submission-list";
import { AddSubmissionButton } from "@/components/sections/backlinks/add-submission-button";

export default async function BacklinkWebsiteDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string; start?: string; end?: string }>;
}) {
  const { id } = await params;
  const ctx = await getUserContext();
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  const sp = await searchParams;
  const range = sp.range ?? "all";
  const start = sp.start ?? "";
  const end = sp.end ?? "";

  const [website, members, allWebsites] = await Promise.all([
    getBacklinkWebsiteDetail(ctx.activeProject.id, id, resolveBacklinkRange(range, start, end)),
    getTeamMembers(),
    getBacklinkWebsites(ctx.activeProject.id, {}),
  ]);
  if (!website) notFound();

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-5 max-w-[1800px] w-full mx-auto">
      <Link href="/dashboard/backlinks" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Backlinks
      </Link>
      <PageHeader
        title={website.domain}
        description={`${website.submissions.length} submission${website.submissions.length === 1 ? "" : "s"} in the selected range.`}
        actions={
          <div className="flex flex-nowrap items-center gap-2">
            {/* Ticket 26: all-time total, independent of the date filter below. */}
            <span className="rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
              Total submissions: <span className="font-semibold text-foreground">{website.totalSubmissions}</span>
            </span>
            <BacklinkDateFilter range={range} start={start} end={end} />
            {ctx.canManageTeam && (
              <AddSubmissionButton
                projectId={ctx.activeProject.id}
                websites={allWebsites.map((w) => ({ id: w.id, domain: w.domain }))}
                members={members}
                defaultWebsiteId={website.id}
              />
            )}
          </div>
        }
      />

      <BacklinkSubmissionList submissions={website.submissions} projectId={ctx.activeProject.id} members={members} canManage={ctx.canManageTeam} />
    </div>
  );
}
