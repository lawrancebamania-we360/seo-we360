// AI Visibility self-serve categories (Ticket 2): reads over
// ai_visibility_categories. Degrades to the 2 hardcoded legacy categories
// whenever the table/migration isn't in place yet, so nothing breaks before
// Ticket 1's SQL is applied - same degrade pattern as getPersonas().

import { createClient } from "@/lib/supabase/server";
import { AI_VISIBILITY_CATEGORIES, CATEGORY_LABEL } from "@/lib/ai-citation/types";

export interface AiVisibilityCategoryRow {
  id: string;
  key: string;
  label: string;
  description: string | null;
  isBuiltin: boolean;
  position: number;
}

function hardcodedFallback(): AiVisibilityCategoryRow[] {
  return AI_VISIBILITY_CATEGORIES.map((key, i) => ({
    id: key, key, label: CATEGORY_LABEL[key] ?? key, description: null, isBuiltin: true, position: i,
  }));
}

export async function getCategories(projectId: string): Promise<AiVisibilityCategoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_visibility_categories")
    .select("id, key, label, description, is_builtin, position")
    .eq("project_id", projectId)
    .order("position", { ascending: true });
  if (error || !data) return hardcodedFallback();

  type Row = { id: string; key: string; label: string; description: string | null; is_builtin: boolean; position: number };
  const rows = (data as Row[]).map((r) => ({
    id: r.id, key: r.key, label: r.label, description: r.description, isBuiltin: r.is_builtin, position: r.position,
  }));
  return rows.length ? rows : hardcodedFallback();
}

// The per-category description that frames AI-prompt generation (replaces
// the old hardcoded CATEGORY_FOCUS map) - null if this category has none set
// or the table isn't migrated yet, so the caller can fall back further
// (project analysis_focus, then the 2-entry hardcoded map for the legacy keys).
export async function getCategoryDescription(projectId: string, categoryKey: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_visibility_categories")
    .select("description")
    .eq("project_id", projectId)
    .eq("key", categoryKey)
    .maybeSingle();
  return (data as { description: string | null } | null)?.description ?? null;
}
