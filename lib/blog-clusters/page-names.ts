// Blog Clusters - GSC queries: name the pages search terms rank on (our
// cluster posts, published Sprint tasks, the homepage, else from the URL).
// Server only - shared by the page read and the weekly planner.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingColumn } from "@/lib/ai-citation/run-state";
import { lastSegment, titleFromQuery } from "@/lib/blog-clusters/query-match";
import type { RankingPageInfo } from "@/lib/types/cluster-gsc";

/**
 * Name the pages queries already rank on: match each URL (by its last path
 * segment) to one of our Blog Clusters posts, else a published Sprint task,
 * else make a readable title from the URL itself.
 */
export async function resolveRankingPages(db: SupabaseClient, projectId: string, pages: Array<string | null>): Promise<Map<string, RankingPageInfo>> {
  const out = new Map<string, RankingPageInfo>();
  const unique = [...new Set(pages.filter((p): p is string => !!p))];
  if (!unique.length) return out;

  const bySeg = new Map<string, RankingPageInfo>();
  // Cluster posts (published_url is a later column; fall back without it).
  const selItems = (withPublished: boolean) => db.from("topic_cluster_items")
    .select(`title, target_keyword, url_slug, ${withPublished ? "published_url, " : ""}topic_clusters ( cluster_name )`)
    .eq("project_id", projectId);
  let items = await selItems(true);
  if (items.error && isMissingColumn(items.error.message)) items = await selItems(false);
  for (const it of (items.data ?? []) as unknown as Array<{ title: string; target_keyword: string | null; url_slug: string | null; published_url?: string | null; topic_clusters: { cluster_name: string } | null }>) {
    const info: RankingPageInfo = { title: it.title, primaryKeyword: it.target_keyword, clusterName: it.topic_clusters?.cluster_name ?? null, source: "cluster", liveTitle: null, liveH1: null };
    for (const u of [it.published_url, it.url_slug]) { const seg = lastSegment(u); if (seg && !bySeg.has(seg)) bySeg.set(seg, info); }
  }
  // Published Sprint tasks.
  const { data: tasks } = await db.from("tasks").select("title, target_keyword, published_url, url")
    .eq("project_id", projectId).not("published_url", "is", null);
  for (const t of (tasks ?? []) as Array<{ title: string; target_keyword: string | null; published_url: string | null; url: string | null }>) {
    const info: RankingPageInfo = { title: t.title.replace(/^write (article|page|blog)\s*:\s*/i, ""), primaryKeyword: t.target_keyword, clusterName: null, source: "task", liveTitle: null, liveH1: null };
    for (const u of [t.published_url, t.url]) { const seg = lastSegment(u); if (seg && !bySeg.has(seg)) bySeg.set(seg, info); }
  }

  for (const page of unique) {
    const seg = lastSegment(page);
    if (!seg) { out.set(page, { title: "Homepage", primaryKeyword: null, clusterName: null, source: "homepage", liveTitle: null, liveH1: null }); continue; }
    out.set(page, bySeg.get(seg) ?? { title: titleFromQuery(seg.replace(/-/g, " ")), primaryKeyword: null, clusterName: null, source: "url", liveTitle: null, liveH1: null });
  }
  return out;
}
