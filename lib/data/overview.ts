import { createClient } from "@/lib/supabase/server";
import type { PillarScore, Pillar } from "@/lib/types/database";

export interface PillarSummary {
  pillar: Pillar;
  score: number;
  previous: number | null;
  topIssues: string[];
  breakdown: Record<string, number>;
}

export async function getLatestPillarScores(projectId: string): Promise<PillarSummary[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("pillar_scores")
    .select("*")
    .eq("project_id", projectId)
    .order("captured_at", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as PillarScore[];
  const pillars: Pillar[] = ["SEO", "AEO", "GEO", "SXO", "AIO"];

  return pillars.map((pillar) => {
    const recent = rows.filter((r) => r.pillar === pillar);
    const latest = recent[0];
    const previous = recent[1];
    return {
      pillar,
      score: latest?.score ?? 0,
      previous: previous?.score ?? null,
      topIssues: (latest?.top_issues as string[]) ?? [],
      breakdown: (latest?.breakdown as Record<string, number>) ?? {},
    };
  });
}

export async function getDashboardCounts(projectId: string) {
  const supabase = await createClient();
  const [
    { count: openTasks },
    { count: critical },
    { count: keywords },
    { count: wins30d },
  ] = await Promise.all([
    supabase.from("tasks").select("*", { count: "exact", head: true }).eq("project_id", projectId).eq("done", false),
    supabase.from("tasks").select("*", { count: "exact", head: true }).eq("project_id", projectId).eq("priority", "critical").eq("done", false),
    supabase.from("keywords").select("*", { count: "exact", head: true }).eq("project_id", projectId),
    supabase
      .from("wins")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId)
      .gte("date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)),
  ]);

  return {
    openTasks: openTasks ?? 0,
    critical: critical ?? 0,
    keywords: keywords ?? 0,
    wins30d: wins30d ?? 0,
  };
}
