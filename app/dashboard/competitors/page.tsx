import { requireSection } from "@/lib/auth/get-user";
import { createClient } from "@/lib/supabase/server";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { CompetitorsScreen } from "@/components/sections/competitors-screen";
import { getCompetitorCitationStats } from "@/lib/data/competitor-citations";
import type { Competitor } from "@/lib/types/database";

export const metadata = { title: "Competitors" };

// Canonical day-based lookback presets (shared with Overview). Competitor
// benchmark metrics are approved demo data today, so the control re-labels the
// view but does not re-window the numbers — see competitors-screen.tsx header.
const RANGE_LABEL: Record<string, string> = {
  "7": "Last 7 days",
  "30": "Last 30 days",
  "90": "Last 90 days",
  "365": "Last 12 months",
  all: "All time",
};
const isValidDay = (s: string | undefined): s is string => !!s && !Number.isNaN(new Date(s).getTime());
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default async function CompetitorsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const ctx = await requireSection("competitors");
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;

  const sp = await searchParams;
  const rangeKey = sp.range && Object.prototype.hasOwnProperty.call(RANGE_LABEL, sp.range) ? sp.range : "90";
  const customFrom = isValidDay(sp.from) ? sp.from : null;
  const customTo = isValidDay(sp.to) ? sp.to : null;
  const isCustom = customFrom != null && customTo != null && new Date(customFrom) <= new Date(customTo);

  const supabase = await createClient();
  const [{ data }, citationStats] = await Promise.all([
    supabase
      .from("competitors")
      .select("*")
      .eq("project_id", ctx.activeProject.id)
      .order("da", { ascending: false }),
    getCompetitorCitationStats(ctx.activeProject.id),
  ]);
  // Site-health (live PageSpeed, up to 60s) was blocking the whole page but the
  // comp screen no longer renders it — pass an empty map instead of fetching.
  const competitors = (data ?? []) as Competitor[];

  return (
    <CompetitorsScreen
      competitors={competitors}
      projectId={ctx.activeProject.id}
      projectName={ctx.activeProject.name}
      projectDomain={ctx.activeProject.domain}
      canManage={ctx.canManageTeam}
      citationStats={citationStats}
      siteHealth={{}}
      rangeValue={isCustom ? "" : rangeKey}
      rangeLabel={isCustom ? `${fmtDay(customFrom!)} – ${fmtDay(customTo!)}` : RANGE_LABEL[rangeKey]}
      rangeFrom={isCustom ? customFrom : null}
      rangeTo={isCustom ? customTo : null}
    />
  );
}
