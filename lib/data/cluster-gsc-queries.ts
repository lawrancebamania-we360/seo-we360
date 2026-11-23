// Blog Clusters - GSC queries (GC-1): read the cluster's queries, hub and last
// refresh for the cluster page. Degrades to { ready: false } until migration
// 20261123000001 is applied, so the cluster page always opens.

import { createClient } from "@/lib/supabase/server";
import { isMissingTable } from "@/lib/team-targets/db";
import { isMissingColumn } from "@/lib/ai-citation/run-state";
import { lastSegment, titleFromQuery } from "@/lib/blog-clusters/query-match";
import { diagnose, estimateGain, suggestedUseOptions, usagesFromLegacy } from "@/lib/blog-clusters/query-insights";
import {
  USE_OPTIONS,
  type AssignedBy, type ClusterGscData, type ClusterGscQuery, type ClusterGscRefreshInfo, type QueryAction, type QueryDrafts,
  type QueryStatus, type QueryUsage, type QueryUseOption, type RankingPageInfo,
} from "@/lib/types/cluster-gsc";

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * Name the pages queries already rank on: match each URL (by its last path
 * segment) to one of our Blog Clusters posts, else a published Sprint task,
 * else make a readable title from the URL itself.
 */
async function resolveRankingPages(db: Db, projectId: string, pages: Array<string | null>): Promise<Map<string, RankingPageInfo>> {
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

  const BASE = "id, query, clicks, impressions, ctr, position, ranking_page, ranking_page_position, matched_keyword, action, item_id, usage, anchors, reason, status, assigned_by, fetched_at";
  const INSIGHTS = "usages, drafts, ranking_page_title, ranking_page_h1"; // migration 20261124000001
  const load = (cols: string) => supabase.from("topic_cluster_gsc_queries").select(cols)
    .eq("cluster_id", clusterId).eq("project_id", projectId)
    .order("impressions", { ascending: false });
  let res = await load(`${BASE}, ${INSIGHTS}`);
  if (res.error && isMissingColumn(res.error.message)) res = await load(BASE);
  const { data, error } = res;
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
    usages?: string[] | null; drafts?: QueryDrafts | null; ranking_page_title?: string | null; ranking_page_h1?: string | null;
  };
  const rows = (data ?? []) as unknown as Row[];
  const pageInfo = await resolveRankingPages(supabase, projectId, rows.map((r) => r.ranking_page));

  const queries: ClusterGscQuery[] = rows.map((r) => ({
    id: r.id,
    query: r.query,
    rankingPageInfo: r.ranking_page
      ? { ...(pageInfo.get(r.ranking_page) ?? { title: r.ranking_page, primaryKeyword: null, clusterName: null, source: "url" as const }),
          liveTitle: r.ranking_page_title ?? null, liveH1: r.ranking_page_h1 ?? null }
      : null,
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
    // Stored options win; else the old single usage; else the rule-based suggestion.
    usages: (() => {
      const stored = (r.usages ?? []).filter((u): u is QueryUseOption => (USE_OPTIONS as string[]).includes(u));
      if (stored.length) return stored;
      const legacy = usagesFromLegacy(r.usage);
      const metrics = { query: r.query, position: Number(r.position), impressions: r.impressions, clicks: r.clicks };
      return legacy.length ? legacy : suggestedUseOptions(metrics, r.action);
    })(),
    drafts: r.drafts ?? null,
    diagnosis: diagnose({ position: Number(r.position), impressions: r.impressions, clicks: r.clicks }),
    gain: estimateGain({ position: Number(r.position), impressions: r.impressions, clicks: r.clicks }),
    anchors: r.anchors ?? [],
    reason: r.reason,
    status: r.status,
    assignedBy: r.assigned_by,
    fetchedAt: r.fetched_at,
  }));

  return { ready: true, hub, refresh, queries };
}
