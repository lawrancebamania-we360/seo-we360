import { getUserContext } from "@/lib/auth/get-user";
import { getTasks, getTeamMembers, getReviewers, type TaskFilterParams } from "@/lib/data/tasks";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { BlogFiltersHeader, BlogFiltersSidebar } from "@/components/sections/blog-filters";
import { BlogKanban } from "@/components/sections/blog-kanban";
import { BlogTaskViews } from "@/components/sections/blog-task-views";
import { BlogViewToggle, type BlogView } from "@/components/sections/blog-view-toggle";
import { TaskTimeline } from "@/components/sections/task-timeline";
import { TaskSearch } from "@/components/sections/task-search";
import { TopicClusterButton } from "@/components/sections/topic-cluster-button";
import { BulkUploadTasksButton } from "@/components/sections/bulk-upload-tasks-button";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

export const metadata = { title: "Blog Sprint" };

interface SearchParams {
  reviewedBy?: string;
  assignee?: string;
  range?: string;
  start?: string;
  end?: string;
  q?: string;
  view?: string;
}

export default async function BlogSprintPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await getUserContext();
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  const params = await searchParams;
  const view: BlogView =
    params.view === "list" ? "list"
    : params.view === "calendar" ? "calendar"
    : params.view === "timeline" ? "timeline"
    : "board";
  const filters: TaskFilterParams = {
    kind: "blog_task",
    assignee: params.assignee ?? "all",
    range: (params.range as TaskFilterParams["range"]) ?? "all",
    start: params.start,
    end: params.end,
    reviewedBy: params.reviewedBy
      ? params.reviewedBy.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined,
    q: params.q,
  };

  const [blogTasks, members, reviewers] = await Promise.all([
    getTasks(ctx.activeProject.id, filters),
    getTeamMembers(),
    getReviewers(),
  ]);

  const canManage = ctx.canManageTeam;

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-5 max-w-[1600px] w-full mx-auto">
      <PageHeader
        title="Blog Sprint"
        description="Weekly topics — drag between Idea / In progress / Done / Published."
        actions={
          <div className="flex items-center gap-2">
            {/* Upload tasks is open to everyone. Members can only assign
                to themselves (enforced both in the dialog and server-side
                in bulkCreateBlogTasks). Topic cluster stays admin-only. */}
            <BulkUploadTasksButton
              projectId={ctx.activeProject.id}
              members={members}
              canAssignToOthers={canManage}
              currentUserEmail={ctx.email}
            />
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
          {view === "timeline" ? (
            <>
              <div className="flex justify-end">
                <BlogViewToggle value={view} />
              </div>
              <TaskTimeline tasks={blogTasks} members={members} canEdit={canManage} projectId={ctx.activeProject.id} />
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <TaskSearch placeholder="Search by keyword or topic..." />
                <BlogViewToggle value={view} />
              </div>
              <BlogFiltersHeader
                members={members}
                reviewers={reviewers}
                countsLabel={
                  <>
                    Showing <span className="font-semibold text-foreground tabular-nums">{blogTasks.length}</span>{" "}
                    blog task{blogTasks.length === 1 ? "" : "s"}
                    {filters.q ? <> matching <span className="font-semibold text-foreground">&ldquo;{filters.q}&rdquo;</span></> : null}
                  </>
                }
              />
              {view === "list" ? (
                <BlogTaskViews tasks={blogTasks} members={members} canEdit={canManage} projectId={ctx.activeProject.id} variant="list" />
              ) : view === "calendar" ? (
                <BlogTaskViews tasks={blogTasks} members={members} canEdit={canManage} projectId={ctx.activeProject.id} variant="calendar" />
              ) : (
                <BlogKanban tasks={blogTasks} members={members} canEdit={canManage} projectId={ctx.activeProject.id} />
              )}
            </>
          )}
        </div>
        {view !== "timeline" && <BlogFiltersSidebar members={members} reviewers={reviewers} />}
      </div>
    </div>
  );
}
