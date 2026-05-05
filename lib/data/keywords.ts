import { createClient } from "@/lib/supabase/server";
import type { Keyword, KeywordUpload } from "@/lib/types/database";

export async function getKeywords(projectId: string): Promise<Keyword[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("keywords")
    .select("*")
    .eq("project_id", projectId)
    .order("priority", { ascending: true })
    .order("search_volume", { ascending: false });
  return (data ?? []) as Keyword[];
}

export async function getKeywordUploads(projectId: string): Promise<KeywordUpload[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("keyword_uploads")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []) as KeywordUpload[];
}
