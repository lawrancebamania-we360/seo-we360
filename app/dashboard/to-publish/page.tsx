import { getUserContext } from "@/lib/auth/get-user";
import { getPublishQueue, getContentToolsOverview } from "@/lib/data/blog-clusters";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { Card } from "@/components/ui/card";
import { ToPublishView } from "@/components/sections/content-pipeline/to-publish-view";

export const metadata = { title: "To Publish" };

// Open to every team member - whoever uploads pages to the site (Dinesh) is a
// member, not an admin, so this isn't gated behind canManageTeam.
export default async function ToPublishPage() {
  const ctx = await getUserContext();
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  const [{ ready, rows }, toolsRes] = await Promise.all([
    getPublishQueue(ctx.activeProject.id),
    getContentToolsOverview(ctx.activeProject.id),
  ]);

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-5 max-w-[1800px] w-full mx-auto">
      <PageHeader
        title="To Publish"
        description="Blogs and guides whose artifact is ready to go live, plus the calculators built for them. Filter to Guides, Blogs or Calculators. Create the page on the site, then mark it published with its URL — it shows Live once it's in the sitemap."
      />

      {ready ? (
        <ToPublishView projectId={ctx.activeProject.id} rows={rows} tools={toolsRes.tools} toolsReady={toolsRes.ready} siteDomain={ctx.activeProject.domain} />
      ) : (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
          This needs a one-time database update first. Apply the 20261019000003 migration in Supabase, then this queue goes live.
        </Card>
      )}
    </div>
  );
}
