import { createClient } from "@/lib/supabase/server";

// Real AI share-of-voice per competitor, computed from the latest AI Visibility
// run (ai_citation_competitor_hits joined to the project's own project_mentioned
// rate). No external provider — this is data we already collect. competitor_id
// links back to the competitors table, so the Competitors page can show each
// rival's real AI-answer share alongside its card.

export type CompetitorCitationStats = {
  hasData: boolean;
  project: { mentions: number; citations: number; sov: number };
  competitors: Array<{ id: string | null; name: string; mentions: number; citations: number; sov: number }>;
};

const EMPTY: CompetitorCitationStats = {
  hasData: false,
  project: { mentions: 0, citations: 0, sov: 0 },
  competitors: [],
};

export async function getCompetitorCitationStats(projectId: string): Promise<CompetitorCitationStats> {
  const supabase = await createClient();

  const { data: lastRun } = await supabase
    .from("ai_citation_runs")
    .select("run_batch_id")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const batchId = (lastRun as { run_batch_id?: string } | null)?.run_batch_id;
  if (!batchId) return EMPTY;

  const { data: runsData } = await supabase
    .from("ai_citation_runs")
    .select("id, project_mentioned, project_cited")
    .eq("run_batch_id", batchId);
  const runs = (runsData ?? []) as Array<{ id: string; project_mentioned: boolean; project_cited: boolean }>;
  if (runs.length === 0) return EMPTY;
  const runIds = runs.map((r) => r.id);

  const { data: hitsData } = await supabase
    .from("ai_citation_competitor_hits")
    .select("competitor_id, competitor_name, mentioned, cited")
    .in("run_id", runIds);
  const hits = (hitsData ?? []) as Array<{ competitor_id: string | null; competitor_name: string; mentioned: boolean; cited: boolean }>;

  const projectMentions = runs.filter((r) => r.project_mentioned).length;
  const projectCitations = runs.filter((r) => r.project_cited).length;

  const byComp = new Map<string, { id: string | null; name: string; mentions: number; citations: number }>();
  for (const h of hits) {
    const key = h.competitor_id ?? h.competitor_name;
    const c = byComp.get(key) ?? { id: h.competitor_id, name: h.competitor_name, mentions: 0, citations: 0 };
    if (h.mentioned) c.mentions += 1;
    if (h.cited) c.citations += 1;
    byComp.set(key, c);
  }
  const comps = [...byComp.values()];

  const totalMentions = projectMentions + comps.reduce((s, c) => s + c.mentions, 0);
  if (totalMentions === 0) return EMPTY;
  const sov = (m: number) => Math.round((m / totalMentions) * 1000) / 10;

  return {
    hasData: true,
    project: { mentions: projectMentions, citations: projectCitations, sov: sov(projectMentions) },
    competitors: comps.map((c) => ({ ...c, sov: sov(c.mentions) })).sort((a, b) => b.sov - a.sov),
  };
}
