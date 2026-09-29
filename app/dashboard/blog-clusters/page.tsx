import Link from "next/link";
import { requireSection } from "@/lib/auth/get-user";
import { getBlogClusters } from "@/lib/data/blog-clusters";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NewClusterButton } from "@/components/sections/blog-clusters/new-cluster-button";
import { Network } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

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

      {clusters.length === 0 ? (
        <Card className="border-dashed p-12 text-center space-y-2">
          <Network className="size-8 text-muted-foreground mx-auto" />
          <div className="text-sm font-medium">No clusters yet</div>
          <div className="text-xs text-muted-foreground max-w-md mx-auto">
            {ctx.canManageTeam
              ? "Paste in a cluster from your content-planning sheet to get started."
              : "Ask an owner or admin to add the first cluster."}
          </div>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clusters.map((c) => (
            <Link key={c.id} href={`/dashboard/blog-clusters/${c.id}`}>
              <Card className="p-5 h-full transition-colors hover:border-primary/50 hover:bg-muted/30 cursor-pointer">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                    <Network className="size-4" />
                  </div>
                  {c.source === "import" && <Badge variant="outline" className="text-[10px]">Imported</Badge>}
                </div>
                <h3 className="mt-3 font-heading text-[15px] font-bold text-foreground truncate">{c.clusterName}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.itemCount} post{c.itemCount === 1 ? "" : "s"} · {c.assignedCount} assigned
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground/70">
                  Added {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
