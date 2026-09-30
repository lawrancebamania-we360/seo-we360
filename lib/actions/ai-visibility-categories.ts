"use server";

// AI Visibility self-serve categories (Ticket 2): create a new category.
// Slugifies the label to a key matching the existing free-text category
// columns exactly, de-duplicating case-insensitively with a numeric suffix
// on collision. No delete/edit yet - matches this repo's precedent of
// shipping create-only in v1 (Blog Clusters has no delete either).

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const CreateCategoryInput = z.object({
  project_id: z.string().uuid(),
  label: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).optional(),
});

export interface CreateCategoryResult {
  ok: boolean;
  error?: string;
  key?: string;
}

function slugify(label: string): string {
  const s = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
  return s || "category";
}

export async function createAiVisibilityCategory(input: z.infer<typeof CreateCategoryInput>): Promise<CreateCategoryResult> {
  const { project_id, label, description } = CreateCategoryInput.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const admin = createAdminClient();

  const baseKey = slugify(label);
  let key = baseKey;
  for (let i = 2; i < 50; i++) {
    const { data: existing } = await admin
      .from("ai_visibility_categories").select("id").eq("project_id", project_id).eq("key", key).maybeSingle();
    if (!existing) break;
    key = `${baseKey}_${i}`;
  }

  const { data: maxPosRow } = await admin
    .from("ai_visibility_categories")
    .select("position").eq("project_id", project_id)
    .order("position", { ascending: false }).limit(1).maybeSingle();
  const position = ((maxPosRow as { position: number } | null)?.position ?? -1) + 1;

  const { error } = await admin.from("ai_visibility_categories").insert({
    project_id, key, label: label.trim(), description: description?.trim() || null,
    is_builtin: false, position, created_by: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/ai-visibility/[categoryKey]", "page");
  return { ok: true, key };
}
