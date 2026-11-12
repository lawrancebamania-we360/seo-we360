import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getUserContext } from "@/lib/auth/get-user";
import { getRedditClusterDetail } from "@/lib/data/reddit-citations";
import { getTeamMembers } from "@/lib/data/tasks";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { CitationTable } from "@/components/sections/reddit-citations/citation-table";
import { OwnersProgress } from "@/components/sections/reddit-citations/owners-progress";
import { KeywordPlanEditor } from "@/components/sections/reddit-citations/keyword-plan-editor";

export default async function RedditCitationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getUserContext();
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  const [cluster, members] = await Promise.all([
    getRedditClusterDetail(ctx.activeProject.id, id),
    getTeamMembers(),
  ]);
  if (!cluster) notFound();

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-5 max-w-[1800px] w-full mx-auto">
      <Link href="/dashboard/reddit-citations" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Reddit Citations
      </Link>
      <PageHeader
        title={cluster.label}
        description={`${cluster.items.length} citation${cluster.items.length === 1 ? "" : "s"} this month. Add a prompt + Reddit thread; Leena marks each one published.`}
        actions={<KeywordPlanEditor clusterId={cluster.id} url={cluster.keywordPlanUrl} />}
      />

      <OwnersProgress owners={cluster.owners} />

      <CitationTable
        clusterId={cluster.id}
        items={cluster.items}
        members={members}
        currentUserId={ctx.userId}
        canManage={ctx.canManageTeam}
      />
    </div>
  );
}
