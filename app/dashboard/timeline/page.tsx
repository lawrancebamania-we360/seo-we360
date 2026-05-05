import { getUserContext } from "@/lib/auth/get-user";
import { getTasks, getTeamMembers } from "@/lib/data/tasks";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { TaskTimeline } from "@/components/sections/task-timeline";

export const metadata = { title: "Timeline" };

export default async function TimelinePage() {
  const ctx = await getUserContext();
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  // Pull both kinds in one shot — the timeline view groups by month + kind so
  // we need the full picture, not a single kanban slice.
  const [webTasks, blogTasks, members] = await Promise.all([
    getTasks(ctx.activeProject.id, { kind: "web_task" }),
    getTasks(ctx.activeProject.id, { kind: "blog_task" }),
    getTeamMembers(),
  ]);
  const allTasks = [...webTasks, ...blogTasks];

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-5 max-w-[1600px] w-full mx-auto">
      <PageHeader
        title="Timeline"
        description="Monthly planning view. Filter by kind, assignee, and date range. Click a task to open details."
      />
      <TaskTimeline
        tasks={allTasks}
        members={members}
        canEdit={ctx.canManageTeam}
        projectId={ctx.activeProject.id}
      />
    </div>
  );
}
