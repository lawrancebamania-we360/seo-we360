// Blog Clusters - GSC queries (GC-1): read the cluster's queries, hub and last
// refresh for the cluster page. Degrades to { ready: false } until migration
// 20261123000001 is applied, so the cluster page always opens.

import { createClient } from "@/lib/supabase/server";
import { isMissingTable } from "@/lib/team-targets/db";
import { isMissingColumn } from "@/lib/ai-citation/run-state";
import type {
  AssignedBy, ClusterGscData, ClusterGscQuery, ClusterGscRefreshInfo, QueryAction, QueryStatus, QueryUsage,
} from "@/lib/types/cluster-gsc";

export async function getClusterGscData(projectId: string, clusterId: string): Promise<ClusterGscData> {
  const supabase = await createClient();

  const { data: c } = await supabase.from("topic_clusters")
    .select("pillar_title, pillar_slug, pillar_primary_keyword, seed_keyword")
    .eq("id", clusterId).eq("project_id", projectId).maybeSingle();
  const cr = c as { pillar_title: string; pillar_slug: string | null; pillar_primary_keyword: string | null; seed_keyword: string | null } | null;
  const hub = {
    title: cr?.pillar_title ?? "",
    slug: cr?.pillar_slug ?? null,
    keyword: cr?.pillar_primary_keyword || cr?.seed_keyword || null,
  };

  const { data, error } = await supabase.from("topic_cluster_gsc_queries")
    .select("id, query, clicks, impressions, ctr, position, ranking_page, ranking_page_position, matched_keyword, action, item_id, usage, anchors, reason, status, assigned_by, fetched_at")
    .eq("cluster_id", clusterId).eq("project_id", projectId)
    .order("impressions", { ascending: false });
  if (error) {
    if (isMissingTable(error)) return { ready: false, hub, refresh: null, queries: [] };
    throw new Error(`Could not load the cluster's GSC queries: ${error.message}`);
  }

  let refresh: ClusterGscRefreshInfo | null = null;
  const rres = await supabase.from("topic_clusters").select("gsc_refresh").eq("id", clusterId).maybeSingle();
  if (!rres.error) refresh = ((rres.data as { gsc_refresh: ClusterGscRefreshInfo | null } | null)?.gsc_refresh) ?? null;
  else if (!isMissingColumn(rres.error.message)) throw new Error(rres.error.message);

  type Row = {
    id: string; query: string; clicks: number; impressions: number; ctr: number | string; position: number | string;
    ranking_page: string | null; ranking_page_position: number | string | null; matched_keyword: string | null;
    action: QueryAction; item_id: string | null; usage: QueryUsage | null; anchors: string[] | null;
    reason: string | null; status: QueryStatus; assigned_by: AssignedBy | null; fetched_at: string;
  };
  const queries: ClusterGscQuery[] = ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    query: r.query,
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: Number(r.ctr),
    position: Number(r.position),
    rankingPage: r.ranking_page,
    rankingPagePosition: r.ranking_page_position == null ? null : Number(r.ranking_page_position),
    matchedKeyword: r.matched_keyword,
    action: r.action,
    itemId: r.item_id,
    usage: r.usage,
    anchors: r.anchors ?? [],
    reason: r.reason,
    status: r.status,
    assignedBy: r.assigned_by,
    fetchedAt: r.fetched_at,
  }));

  return { ready: true, hub, refresh, queries };
}
