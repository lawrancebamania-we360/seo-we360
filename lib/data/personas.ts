import { createClient } from "@/lib/supabase/server";

export interface PersonaRow {
  id: string;
  label: string;
  description: string | null;
  source: string; // "ai_inferred" | "user"
  active: boolean;
  position: number;
  locked: boolean; // Gumshoe lock: no-Google projects lock 3 of 6 (migration 20260706000001)
}

// Read the persisted personas (label + description + active + source + locked) for
// the "Review your personas" step. RLS-scoped via the user client
// (has_project_access). Degrades to [] before migration 20260703000001 is applied;
// and if the `locked` column (20260706000001) isn't applied yet, it re-reads
// without it (all personas unlocked) rather than erroring the whole list.
export async function getPersonas(projectId: string): Promise<PersonaRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_citation_personas")
    .select("id, label, description, source, active, position, locked")
    .eq("project_id", projectId)
    .order("position", { ascending: true });
  if (error) {
    const { data: base } = await supabase
      .from("ai_citation_personas")
      .select("id, label, description, source, active, position")
      .eq("project_id", projectId)
      .order("position", { ascending: true });
    return ((base ?? []) as Omit<PersonaRow, "locked">[]).map((p) => ({ ...p, locked: false }));
  }
  return (data ?? []).map((p) => {
    const row = p as PersonaRow & { locked?: boolean | null };
    return { ...row, locked: row.locked ?? false };
  });
}
