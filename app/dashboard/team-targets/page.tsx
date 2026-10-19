import { getUserContext } from "@/lib/auth/get-user";
import { getTeamTargetsDashboard, getLoggableTargets } from "@/lib/data/team-targets";
import { getTeamMembers } from "@/lib/data/tasks";
import { MIGRATION_NOTICE } from "@/lib/team-targets/db";
import { resolvePeriod, isBehindStatus } from "@/lib/team-targets/period";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { Card } from "@/components/ui/card";
import { DashboardFilters } from "@/components/sections/team-targets/dashboard-filters";
import { KpiTiles } from "@/components/sections/team-targets/kpi-tiles";
import { CompletionByPersonChart } from "@/components/sections/team-targets/completion-by-person-chart";
import { BurnupChart } from "@/components/sections/team-targets/burnup-chart";
import { TargetsTable } from "@/components/sections/team-targets/targets-table";
import { AddLogDialog } from "@/components/sections/team-targets/add-log-dialog";
import { ManageTargetsMenu } from "@/components/sections/team-targets/manage-targets-menu";
import { VerificationFloater } from "@/components/sections/team-targets/verification-floater";

export const metadata = { title: "Team Targets" };

export default async function TeamTargetsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string; person?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;
  const project = ctx.activeProject;
  const isAdmin = ctx.canManageTeam;
  const isOwner = ctx.profile.role === "super_admin";

  const sp = await searchParams;
  const period = resolvePeriod(sp.period ?? "this_month", sp.start, sp.end);
  const person = sp.person && sp.person !== "all" ? sp.person : null;

  const [dashboard, loggable, members] = await Promise.all([
    getTeamTargetsDashboard(project.id, period, new Date(), person),
    getLoggableTargets(project.id, ctx.userId, isAdmin),
    getTeamMembers(),
  ]);
  const memberOptions = members.map((m) => ({ id: m.id, name: m.name }));

  const behindNames = dashboard.targets.filter((t) => isBehindStatus(t.status)).map((t) => t.task);
  const openCount = dashboard.targets.filter((t) => t.remaining > 0).length;
  const burnTitle = `Progress · ${period.label}`;

  return (
    <div className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-10 space-y-5 max-w-[1800px] w-full mx-auto">
      <PageHeader
        title="Team Targets"
        description="What each person owns, and how much is done this period. Log your work with a link; the link is checked automatically."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DashboardFilters period={period.key} start={sp.start ?? ""} end={sp.end ?? ""} person={person ?? "all"} people={memberOptions} />
            {dashboard.ready && <AddLogDialog projectId={project.id} targets={loggable} />}
            {dashboard.ready && isAdmin && <ManageTargetsMenu projectId={project.id} members={memberOptions} />}
          </div>
        }
      />

      {!dashboard.ready ? (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">{MIGRATION_NOTICE}</Card>
      ) : dashboard.targets.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
          No targets {person ? "for this person" : "yet"}. {isAdmin ? "Use Manage targets to add or import them." : "An admin will set them up."}
        </Card>
      ) : (
        <>
          <KpiTiles totals={dashboard.totals} ended={dashboard.ended} openCount={openCount} behindNames={behindNames} />
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-5"><CompletionByPersonChart people={dashboard.people} /></div>
            <div className="lg:col-span-7"><BurnupChart points={dashboard.burnup} title={burnTitle} /></div>
          </div>
          <TargetsTable targets={dashboard.targets} projectId={project.id} isAdmin={isAdmin} isOwner={isOwner} currentUserId={ctx.userId} ended={dashboard.ended} />
        </>
      )}

      <VerificationFloater />
    </div>
  );
}
