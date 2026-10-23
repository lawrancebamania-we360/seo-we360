import { requireSection } from "@/lib/auth/get-user";
import { getBlogClusters } from "@/lib/data/blog-clusters";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { NewClusterButton } from "@/components/sections/blog-clusters/new-cluster-button";
import { ClusterList } from "@/components/sections/blog-clusters/cluster-list";

export const metadata = { title: "Blog Clusters" };

export default async function BlogClustersPage() {
  const ctx = await requireSection("sprint");
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  const clusters = await getBlogClusters(ctx.activeProject.id);

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-5 max-w-[1800px] w-full mx-auto">
      <PageHeader
        title="Blog Clusters"
        description="Planned content grouped by topic — paste in a cluster from your planning sheet, then assign posts to writers to turn them into real Sprint tasks."
        actions={ctx.canManageTeam ? <NewClusterButton projectId={ctx.activeProject.id} /> : null}
      />

      <ClusterList clusters={clusters} projectId={ctx.activeProject.id} canManage={ctx.canManageTeam} />
    </div>
  );
}
