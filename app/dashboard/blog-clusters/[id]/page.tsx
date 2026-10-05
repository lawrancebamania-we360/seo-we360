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

export default async function BlogClusterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireSection("sprint");
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  const [cluster, members] = await Promise.all([
    getBlogClusterDetail(ctx.activeProject.id, id),
    getTeamMembers(),
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
        actions={ctx.canManageTeam ? <DeleteClusterButton projectId={ctx.activeProject.id} clusterId={cluster.id} clusterName={cluster.clusterName} /> : null}
      />

      <BlogClusterTable clusterName={cluster.clusterName} items={cluster.items} members={members} canManage={ctx.canManageTeam} siteDomain={ctx.activeProject.domain} />
    </div>
  );
}
