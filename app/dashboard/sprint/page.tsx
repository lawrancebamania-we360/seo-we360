import { getUserContext } from "@/lib/auth/get-user";
import { getTasks, getTeamMembers, type TaskFilterParams } from "@/lib/data/tasks";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { BlogFiltersHeader, BlogFiltersSidebar } from "@/components/sections/blog-filters";
import { BlogKanban } from "@/components/sections/blog-kanban";
import { TaskSearch } from "@/components/sections/task-search";
import { TopicClusterButton } from "@/components/sections/topic-cluster-button";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import type { Competition, Intent, Priority } from "@/lib/types/database";

export const metadata = { title: "Blog Sprint" };

interface SearchParams {
  priority?: string;
  competition?: string;
  intent?: string;
  assignee?: string;
  range?: string;
  start?: string;
  end?: string;
  q?: string;
}

export default async function BlogSprintPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await getUserContext();
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  const params = await searchParams;
  const filters: TaskFilterParams = {
    kind: "blog_task",
    priority: (params.priority as Priority | "all") ?? "all",
    competition: (params.competition as Competition | "all") ?? "all",
    intent: (params.intent as Intent | "all") ?? "all",
    assignee: params.assignee ?? "all",
    range: (params.range as TaskFilterParams["range"]) ?? "all",
    start: params.start,
    end: params.end,
    q: params.q,
  };

  const [blogTasks, members] = await Promise.all([
    getTasks(ctx.activeProject.id, filters),
    getTeamMembers(),
  ]);

  const canManage = ctx.canManageTeam;

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-5 max-w-[1600px] w-full mx-auto">
      <PageHeader
        title="Blog Sprint"
        description="Weekly topics from Apify — drag between Idea / In progress / Published."
        actions={
          <div className="flex items-center gap-2">
            {canManage && (
              <TopicClusterButton
                projectId={ctx.activeProject.id}
                projectName={ctx.activeProject.name}
              />
            )}
            <Badge variant="secondary" className="gap-1.5">
              <Sparkles className="size-3" />
              Apify auto-queued
            </Badge>
          </div>
        }
      />
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <div className="flex-1 min-w-0 w-full space-y-4">
          <TaskSearch placeholder="Search by keyword or topic..." />
          <BlogFiltersHeader
            members={members}
            countsLabel={
              <>
                Showing <span className="font-semibold text-foreground tabular-nums">{blogTasks.length}</span>{" "}
                blog task{blogTasks.length === 1 ? "" : "s"}
                {filters.q ? <> matching <span className="font-semibold text-foreground">&ldquo;{filters.q}&rdquo;</span></> : null}
              </>
            }
          />
          <BlogKanban tasks={blogTasks} members={members} canEdit={canManage} projectId={ctx.activeProject.id} />
        </div>
        <BlogFiltersSidebar members={members} />
      </div>
    </div>
  );
}
