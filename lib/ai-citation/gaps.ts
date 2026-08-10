import { createAdminClient } from "@/lib/supabase/admin";

// Shared "not cited" buyer-question finder, used by BOTH the Start-here next
// actions (the live "get cited for X" cards) and the goal-plan generator (which
// turns the top gaps into trackable get_cited_onsite plan tasks). Keeping one
// implementation means the ephemeral card and the persisted task rank identically.

/** A buyer question the AI engines DON'T cite the project for. */
export interface CitationGap { promptId: string; question: string; demand: string; mentioned: boolean }

// The top questions the AI engines DON'T cite the project for, ranked by demand
// (high first) then worst-first (not even mentioned). Cheap: two capped indexed
// reads over the citation run, no AI/Apify. Empty before any run, or when fully cited.
export async function getTopCitationGaps(projectId: string, limit: number): Promise<CitationGap[]> {
  const admin = createAdminClient();
  const { data: runs } = await admin
    .from("ai_citation_runs")
    .select("prompt_id, project_cited, project_mentioned, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (!runs?.length) return [];
  // A prompt is a gap if NONE of its recent runs cited the project.
  const byPrompt = new Map<string, { cited: boolean; mentioned: boolean }>();
  for (const r of runs as Array<{ prompt_id: string; project_cited: boolean; project_mentioned: boolean }>) {
    const cur = byPrompt.get(r.prompt_id) ?? { cited: false, mentioned: false };
    if (r.project_cited) cur.cited = true;
    if (r.project_mentioned) cur.mentioned = true;
    byPrompt.set(r.prompt_id, cur);
  }
  const gapIds = [...byPrompt.entries()].filter(([, v]) => !v.cited).map(([id]) => id);
  if (!gapIds.length) return [];
  const { data: prompts } = await admin
    .from("ai_citation_prompts")
    .select("id, text, demand")
    .in("id", gapIds)
    .eq("active", true);
  const demandRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return (prompts ?? [])
    .map((p) => {
      const row = p as { id: string; text: string; demand: string | null };
      return { promptId: row.id, question: row.text, demand: row.demand ?? "medium", mentioned: byPrompt.get(row.id)?.mentioned ?? false };
    })
    .sort((a, b) => (demandRank[a.demand] ?? 3) - (demandRank[b.demand] ?? 3) || Number(a.mentioned) - Number(b.mentioned))
    .slice(0, limit);
}
