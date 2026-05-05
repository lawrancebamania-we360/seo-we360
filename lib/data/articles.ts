import { createClient } from "@/lib/supabase/server";
import type { Article, Keyword } from "@/lib/types/database";

export interface ArticleWithAuthor extends Article {
  author: { id: string; name: string; avatar_url: string | null } | null;
  keyword: { id: string; keyword: string; competition: string | null } | null;
}

export async function getArticles(projectId: string): Promise<ArticleWithAuthor[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("articles")
    .select(
      "*, author:profiles!created_by(id, name, avatar_url), keyword:keywords(id, keyword, competition)"
    )
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });
  return (data ?? []) as unknown as ArticleWithAuthor[];
}

export async function getArticle(articleId: string): Promise<ArticleWithAuthor | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("articles")
    .select(
      "*, author:profiles!created_by(id, name, avatar_url), keyword:keywords(id, keyword, competition)"
    )
    .eq("id", articleId)
    .single();
  return (data ?? null) as unknown as ArticleWithAuthor | null;
}

export async function getProjectKeywords(projectId: string): Promise<Keyword[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("keywords")
    .select("*")
    .eq("project_id", projectId)
    .order("search_volume", { ascending: false })
    .limit(200);
  return (data ?? []) as Keyword[];
}
