import { requireSection } from "@/lib/auth/get-user";
import { getTasks, getTeamMembers, type TaskFilterParams } from "@/lib/data/tasks";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { NewTaskDialog } from "@/components/sections/new-task-dialog";
import { TaskFiltersHeader, TaskFiltersSidebar } from "@/components/sections/task-filters";
import { TaskKanban } from "@/components/sections/task-kanban";
import type { Pillar, Priority } from "@/lib/types/database";

export const metadata = { title: "Web Tasks" };

interface SearchParams {
  pillar?: string;
  priority?: string;
  assignee?: string;
  range?: string;
  start?: string;
  end?: string;
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requireSection("tasks");
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  const params = await searchParams;
  const filters: TaskFilterParams = {
    kind: "web_task",
    pillar: (params.pillar as Pillar | "all") ?? "all",
    priority: (params.priority as Priority | "all") ?? "all",
    assignee: params.assignee ?? "all",
    range: (params.range as TaskFilterParams["range"]) ?? "all",
    start: params.start,
    end: params.end,
  };

  const [tasks, members] = await Promise.all([
    getTasks(ctx.activeProject.id, filters),
    getTeamMembers(),
  ]);

  const canManage = ctx.canManageTeam;
  const pillarLabel = filters.pillar && filters.pillar !== "all" ? ` · ${filters.pillar}` : "";

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-5 max-w-[1600px] w-full mx-auto">
      <PageHeader
        title={`Web Tasks${pillarLabel}`}
        description="Kanban board. Drag cards between Open / In progress / Done. Click any card for details. Filters are URL-shareable."
        actions={canManage && <NewTaskDialog projectId={ctx.activeProject.id} members={members} />}
      />
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <div className="flex-1 min-w-0 w-full">
          <TaskFiltersHeader
            members={members}
            countsLabel={
              <>
                Showing <span className="font-semibold text-foreground tabular-nums">{tasks.length}</span>{" "}
                task{tasks.length === 1 ? "" : "s"}
              </>
            }
          />
          <TaskKanban tasks={tasks} members={members} canEdit={canManage} />
        </div>
        <TaskFiltersSidebar members={members} />
      </div>
    </div>
  );
}
