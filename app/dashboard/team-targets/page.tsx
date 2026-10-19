import { getUserContext } from "@/lib/auth/get-user";
import { getTeamTargetsBoard } from "@/lib/data/team-targets";
import { getTeamMembers } from "@/lib/data/tasks";
import { MIGRATION_NOTICE } from "@/lib/team-targets/db";
import { currentWeekStart, isIsoDate, weekStartOf } from "@/lib/team-targets/week";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { Card } from "@/components/ui/card";
import { WeekSwitcher } from "@/components/sections/team-targets/week-switcher";
import { TargetsBoard } from "@/components/sections/team-targets/targets-board";
import { ImportTargetsButton } from "@/components/sections/team-targets/import-targets-dialog";
import { AddTargetButton } from "@/components/sections/team-targets/target-form-dialog";

export const metadata = { title: "Team Targets" };

export default async function TeamTargetsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  // Any date in ?week= snaps to its Monday; a future week (or junk) falls back
  // to the current one, since nothing can be reported for a week that hasn't begun.
  const { week } = await searchParams;
  const current = currentWeekStart();
  const requested = isIsoDate(week) ? weekStartOf(week) : current;
  const weekStart = requested > current ? current : requested;

  const [board, members] = await Promise.all([
    getTeamTargetsBoard(ctx.activeProject.id, weekStart),
    getTeamMembers(),
  ]);
  const memberOptions = members.map((m) => ({ id: m.id, name: m.name }));

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-5 max-w-[1800px] w-full mx-auto">
      <PageHeader
        title="Team Targets"
        description="What each person owns every day, week or month. Report the number you achieved for the week; another admin verifies it."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <WeekSwitcher weekStart={weekStart} currentWeek={current} />
            {ctx.canManageTeam && board.ready && (
              <>
                <ImportTargetsButton projectId={ctx.activeProject.id} members={memberOptions} />
                <AddTargetButton projectId={ctx.activeProject.id} members={memberOptions} />
              </>
            )}
          </div>
        }
      />

      {board.ready ? (
        <TargetsBoard
          board={board}
          projectId={ctx.activeProject.id}
          members={memberOptions}
          currentUserId={ctx.userId}
          isAdmin={ctx.canManageTeam}
        />
      ) : (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">{MIGRATION_NOTICE}</Card>
      )}
    </div>
  );
}
