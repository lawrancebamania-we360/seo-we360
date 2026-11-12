import { getUserContext } from "@/lib/auth/get-user";
import { getRedditClusters } from "@/lib/data/reddit-citations";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { Card } from "@/components/ui/card";
import { ClusterCards } from "@/components/sections/reddit-citations/cluster-cards";
import { NewMonthButton } from "@/components/sections/reddit-citations/new-month-button";

export const metadata = { title: "Reddit Citations" };

// Open to every team member - contributors add citations, Leena publishes.
export default async function RedditCitationsPage() {
  const ctx = await getUserContext();
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  const { ready, clusters } = await getRedditClusters(ctx.activeProject.id);

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-5 max-w-[1800px] w-full mx-auto">
      <PageHeader
        title="Reddit Citations"
        description="Monthly plans of AI-answer prompts where we want a We360 citation inside the Reddit thread. Contributors add the prompts and threads; Leena posts the comment and marks each one published — all of it feeds Team Targets."
        actions={ctx.canManageTeam ? <NewMonthButton projectId={ctx.activeProject.id} /> : null}
      />

      {ready ? (
        <ClusterCards clusters={clusters} canManage={ctx.canManageTeam} />
      ) : (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
          This needs a one-time database update first. Apply the 20261112000001 migration in Supabase, then this tab goes live.
        </Card>
      )}
    </div>
  );
}
