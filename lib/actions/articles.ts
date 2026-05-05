"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ArticleStatus, AIProvider } from "@/lib/types/database";

export async function createArticle(input: {
  project_id: string;
  keyword_id?: string | null;
  title: string;
  target_keyword?: string | null;
  content?: string | null;
  meta_description?: string | null;
  ai_provider?: AIProvider;
  status?: ArticleStatus;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("articles")
    .insert({
      project_id: input.project_id,
      keyword_id: input.keyword_id ?? null,
      title: input.title,
      target_keyword: input.target_keyword ?? null,
      content: input.content ?? null,
      meta_description: input.meta_description ?? null,
      ai_provider: input.ai_provider ?? null,
      status: input.status ?? "draft",
      created_by: user.id,
    })
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/dashboard/articles");
  return data;
}

export async function updateArticle(articleId: string, patch: {
  title?: string;
  content?: string | null;
  meta_description?: string | null;
  status?: ArticleStatus;
  rejection_reason?: string | null;
  published_url?: string | null;
  secondary_keywords?: string[];
  outline?: Record<string, unknown>;
}) {
  const supabase = await createClient();
  const updates: Record<string, unknown> = { ...patch };

  if (patch.status === "approved" || patch.status === "rejected") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      updates.approved_by = user.id;
      updates.approved_at = new Date().toISOString();
    }
  }
  if (patch.status === "published") {
    updates.published_at = new Date().toISOString();
  }

  const { error } = await supabase.from("articles").update(updates).eq("id", articleId);
  if (error) throw error;
  revalidatePath("/dashboard/articles");
  revalidatePath(`/articles/${articleId}`);
}

export async function deleteArticle(articleId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("articles").delete().eq("id", articleId);
  if (error) throw error;
  revalidatePath("/dashboard/articles");
  redirect("/dashboard/articles");
}
