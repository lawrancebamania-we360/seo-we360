import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "@/lib/types/database";

/**
 * Phase 8 — Weekly competitor check (Wednesdays only).
 * Refreshes DA, traffic estimates, top keywords.
 *
 * TODO: integrate with DataForSEO or Moz API when budget allows.
 * For now this is a no-op placeholder.
 */
export async function checkCompetitors(
  supabase: SupabaseClient,
  project: Project
): Promise<{ checked: number; skipped?: string }> {
  const { data } = await supabase
    .from("competitors")
    .select("*")
    .eq("project_id", project.id);

  // Update last_checked timestamp without changing actual values (placeholder)
  for (const c of data ?? []) {
    await supabase
      .from("competitors")
      .update({ last_checked: new Date().toISOString() })
      .eq("id", c.id);
  }

  return { checked: (data ?? []).length, skipped: "DataForSEO/Moz integration pending" };
}
