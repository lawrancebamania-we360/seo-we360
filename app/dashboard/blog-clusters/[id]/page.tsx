import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSection } from "@/lib/auth/get-user";
import { getBlogClusterDetail } from "@/lib/data/blog-clusters";
import { getTeamMembers } from "@/lib/data/tasks";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { BlogClusterTable } from "@/components/sections/blog-clusters/blog-cluster-table";
import { DeleteClusterButton } from "@/components/sections/blog-clusters/delete-cluster-button";
import { AddClusterPostButton } from "@/components/sections/blog-clusters/add-cluster-post-button";
import { ClusterOwner } from "@/components/sections/blog-clusters/cluster-owner";
import { ExportButton } from "@/components/sections/blog-clusters/export-button";
import { ClusterGscPanel } from "@/components/sections/blog-clusters/cluster-gsc-panel";
import { ClusterKindBadge, ClusterKindSelect } from "@/components/sections/content-pipeline/item-controls";
import { getClusterGscData } from "@/lib/data/cluster-gsc-queries";

// "Refresh GSC queries" (a server action on this page) pulls Search Console and
// asks Claude to assign the new queries - give it room beyond the default.
export const maxDuration = 300;

export default async function BlogClusterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireSection("sprint");
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  const [cluster, members, gsc] = await Promise.all([
    getBlogClusterDetail(ctx.activeProject.id, id),
    getTeamMembers(),
    getClusterGscData(ctx.activeProject.id, id),
  ]);
  if (!cluster) notFound();

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-5 max-w-[1800px] w-full mx-auto">
      <Link href="/dashboard/blog-clusters" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Blog Clusters
      </Link>
      <PageHeader
        title={cluster.clusterName}
        description={`${cluster.items.length} planned post${cluster.items.length === 1 ? "" : "s"}. Click a row for the full brief - keywords, SERP verdict, interlinks. Assign a writer to turn a row into a real Sprint task.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {ctx.canManageTeam
              ? <ClusterKindSelect projectId={ctx.activeProject.id} clusterId={cluster.id} kind={cluster.kind} />
              : <ClusterKindBadge kind={cluster.kind} />}
            <ExportButton href={`/api/blog-clusters/${cluster.id}/export`} />
            {ctx.canManageTeam && <AddClusterPostButton projectId={ctx.activeProject.id} clusterId={cluster.id} />}
            {ctx.canManageTeam && <DeleteClusterButton projectId={ctx.activeProject.id} clusterId={cluster.id} clusterName={cluster.clusterName} />}
          </div>
        }
      />

      <ClusterOwner
        projectId={ctx.activeProject.id}
        clusterId={cluster.id}
        ownerId={cluster.ownerId}
        ownerReady={cluster.ownerReady}
        members={members}
        canManage={ctx.canManageTeam}
      />

      <BlogClusterTable
        clusterName={cluster.clusterName}
        clusterId={cluster.id}
        hub={{ slug: gsc.hub.slug, keyword: gsc.hub.keyword, title: gsc.hub.title }}
        items={cluster.items}
        projectId={ctx.activeProject.id}
        members={members}
        canManage={ctx.canManageTeam}
        siteDomain={ctx.activeProject.domain}
      />

      <ClusterGscPanel
        projectId={ctx.activeProject.id}
        clusterId={cluster.id}
        data={gsc}
        posts={cluster.items.map((i) => ({ id: i.id, title: i.title }))}
        canManage={ctx.canManageTeam}
      />
    </div>
  );
}
