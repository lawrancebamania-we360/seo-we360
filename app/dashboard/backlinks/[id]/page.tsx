import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getUserContext } from "@/lib/auth/get-user";
import { getBacklinkWebsiteDetail, resolveBacklinkRange } from "@/lib/data/backlinks";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { BacklinkDateFilter } from "@/components/sections/backlinks/backlink-date-filter";
import { BacklinkSubmissionList } from "@/components/sections/backlinks/backlink-submission-list";
import { NewSubmissionsButton } from "@/components/sections/backlinks/new-submissions-button";

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

  const website = await getBacklinkWebsiteDetail(ctx.activeProject.id, id, resolveBacklinkRange(range, start, end));
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
          <div className="flex flex-wrap items-center gap-2">
            <BacklinkDateFilter range={range} start={start} end={end} />
            {ctx.canManageTeam && <NewSubmissionsButton projectId={ctx.activeProject.id} />}
          </div>
        }
      />

      <BacklinkSubmissionList submissions={website.submissions} />
    </div>
  );
}
