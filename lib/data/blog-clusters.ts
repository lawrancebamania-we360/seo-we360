// Blog Clusters (Tickets 3-4): reads over topic_clusters / topic_cluster_items
// for the cluster list page and the per-cluster detail table.

import { createClient } from "@/lib/supabase/server";
import { cleanHost } from "@/lib/url";
import type { MetricWindow, UrlTopQuery } from "@/lib/data/url-metrics";

export interface BlogClusterSummary {
  id: string;
  clusterName: string;
  source: "ai_generated" | "import";
  itemCount: number;
  assignedCount: number;
  createdAt: string;
}

export async function getBlogClusters(projectId: string): Promise<BlogClusterSummary[]> {
  const supabase = await createClient();
  const { data: clusters } = await supabase
    .from("topic_clusters")
    .select("id, cluster_name, source, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  const rows = (clusters ?? []) as Array<{ id: string; cluster_name: string; source: string; created_at: string }>;
  if (!rows.length) return [];

  const { data: items } = await supabase
    .from("topic_cluster_items")
    .select("cluster_id, task_id")
    .in("cluster_id", rows.map((r) => r.id));
  const itemRows = (items ?? []) as Array<{ cluster_id: string; task_id: string | null }>;
  const countByCluster = new Map<string, { total: number; assigned: number }>();
  for (const it of itemRows) {
    const c = countByCluster.get(it.cluster_id) ?? { total: 0, assigned: 0 };
    c.total++;
    if (it.task_id) c.assigned++;
    countByCluster.set(it.cluster_id, c);
  }

  return rows.map((r) => ({
    id: r.id,
    clusterName: r.cluster_name,
    source: (r.source as "ai_generated" | "import") ?? "ai_generated",
    itemCount: countByCluster.get(r.id)?.total ?? 0,
    assignedCount: countByCluster.get(r.id)?.assigned ?? 0,
    createdAt: r.created_at,
  }));
}

export interface BlogClusterItemRow {
  id: string;
  position: number;
  title: string;
  category: string | null;
  funnelStage: string | null;
  contentType: string | null;
  targetKeyword: string | null;
  volMo: number | null;
  serpVerdict: string | null;
  supportingKeywords: Array<{ keyword: string; volume: number | null }>;
  outline: string[]; // H2 candidates
  faqCandidates: string[];
  interlinksTo: string[];
  interlinksFrom: string[];
  metaDescription: string | null;
  urlSlug: string | null;
  primaryCta: string | null;
  taskId: string | null;
  taskStatus: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
}

export interface BlogClusterDetail {
  id: string;
  clusterName: string;
  pillarTitle: string;
  source: "ai_generated" | "import";
  items: BlogClusterItemRow[];
}

export async function getBlogClusterDetail(projectId: string, clusterId: string): Promise<BlogClusterDetail | null> {
  const supabase = await createClient();
  const { data: cluster } = await supabase
    .from("topic_clusters")
    .select("id, cluster_name, pillar_title, source")
    .eq("id", clusterId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!cluster) return null;
  const c = cluster as { id: string; cluster_name: string; pillar_title: string; source: string };

  // tasks has three FKs into profiles (created_by, reviewed_by_id, team_member_id) -
  // the embed is ambiguous without naming the exact constraint to join through.
  const { data: itemsData } = await supabase
    .from("topic_cluster_items")
    .select(`
      id, position, title, category, funnel_stage, content_type, target_keyword, vol_mo,
      serp_verdict, supporting_keywords, outline, faq_candidates, interlinks_to, interlinks_from,
      meta_description, url_slug, primary_cta, task_id,
      tasks ( status, team_member_id, profiles!tasks_team_member_id_fkey ( name ) )
    `)
    .eq("cluster_id", clusterId)
    .order("position", { ascending: true });

  type Row = {
    id: string; position: number; title: string; category: string | null; funnel_stage: string | null;
    content_type: string | null; target_keyword: string | null; vol_mo: number | null; serp_verdict: string | null;
    supporting_keywords: Array<{ keyword: string; volume: number | null }> | null;
    outline: string[] | null; faq_candidates: string[] | null;
    interlinks_to: string[] | null; interlinks_from: string[] | null;
    meta_description: string | null; url_slug: string | null; primary_cta: string | null;
    task_id: string | null;
    tasks: { status: string | null; team_member_id: string | null; profiles: { name: string | null } | null } | null;
  };
  const items = ((itemsData ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    position: r.position,
    title: r.title,
    category: r.category,
    funnelStage: r.funnel_stage,
    contentType: r.content_type,
    targetKeyword: r.target_keyword,
    volMo: r.vol_mo,
    serpVerdict: r.serp_verdict,
    supportingKeywords: r.supporting_keywords ?? [],
    outline: r.outline ?? [],
    faqCandidates: r.faq_candidates ?? [],
    interlinksTo: r.interlinks_to ?? [],
    interlinksFrom: r.interlinks_from ?? [],
    metaDescription: r.meta_description,
    urlSlug: r.url_slug,
    primaryCta: r.primary_cta,
    taskId: r.task_id,
    taskStatus: r.tasks?.status ?? null,
    assigneeId: r.tasks?.team_member_id ?? null,
    assigneeName: r.tasks?.profiles?.name ?? null,
  }));

  return {
    id: c.id,
    clusterName: c.cluster_name,
    pillarTitle: c.pillar_title,
    source: (c.source as "ai_generated" | "import") ?? "ai_generated",
    items,
  };
}

// ============================================================================
// Analytics Ticket 8-9: Blog Clusters' ranking view - only posts confirmed
// LIVE, each joined against its own GSC/GA4 numbers.
//
// "Published" is resolved two ways, in order: (1) the item's linked Sprint
// task has a published_url - definitive; (2) else its pasted/AI-generated
// url_slug is matched against the project's latest sitemap snapshot
// (url_metrics_runs.url_list) - the exact cleanHost-keyed lookup pattern
// lib/actions/backlinks.ts already uses to verify a Backlinks submission's
// Blog Post reference. An item that resolves neither way was planned/
// uploaded but never actually published, and is excluded from the ranked
// list (surfaced separately as "not yet published" so nothing silently
// vanishes - see BlogClusterAnalytics.unpublishedCount).
// ============================================================================

export interface BlogClusterAnalyticsItem {
  id: string;
  title: string;
  liveUrl: string;
  gscPosition: number;
  gscClicks: number;
  gscImpressions: number;
  gscCtr: number;
  topQueries: UrlTopQuery[];
}

export interface BlogClusterAnalytics {
  id: string;
  clusterName: string;
  totalCount: number;
  unpublishedCount: number;
  items: BlogClusterAnalyticsItem[];
}

export async function getBlogClusterAnalytics(
  projectId: string, clusterId: string, window: MetricWindow = "30d",
): Promise<BlogClusterAnalytics | null> {
  const supabase = await createClient();
  const { data: cluster } = await supabase
    .from("topic_clusters")
    .select("id, cluster_name")
    .eq("id", clusterId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!cluster) return null;
  const c = cluster as { id: string; cluster_name: string };

  const { data: itemsData } = await supabase
    .from("topic_cluster_items")
    .select("id, title, url_slug, task_id, tasks ( published_url )")
    .eq("cluster_id", clusterId)
    .order("position", { ascending: true });
  type ItemRow = { id: string; title: string; url_slug: string | null; task_id: string | null; tasks: { published_url: string | null } | null };
  const items = (itemsData ?? []) as unknown as ItemRow[];
  if (!items.length) return { id: c.id, clusterName: c.cluster_name, totalCount: 0, unpublishedCount: 0, items: [] };

  const { data: latestRun } = await supabase
    .from("url_metrics_runs")
    .select("url_list")
    .eq("project_id", projectId)
    .order("run_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sitemapUrls = (latestRun as { url_list: string[] | null } | null)?.url_list ?? [];
  const sitemapByNormalized = new Map<string, string>();
  for (const u of sitemapUrls) sitemapByNormalized.set(cleanHost(u, { lowercase: true }), u);

  const resolved = new Map<string, string>(); // item.id -> live URL
  for (const it of items) {
    const publishedUrl = it.tasks?.published_url?.trim();
    if (publishedUrl) { resolved.set(it.id, publishedUrl); continue; }
    if (it.url_slug) {
      const match = sitemapByNormalized.get(cleanHost(it.url_slug, { lowercase: true }));
      if (match) resolved.set(it.id, match);
    }
  }
  if (!resolved.size) {
    return { id: c.id, clusterName: c.cluster_name, totalCount: items.length, unpublishedCount: items.length, items: [] };
  }

  const liveUrls = [...new Set(resolved.values())];
  const { data: metricsData } = await supabase
    .from("url_metrics")
    .select("url, gsc_position, gsc_clicks, gsc_impressions, gsc_ctr, gsc_top_queries, snapshot_date")
    .eq("project_id", projectId)
    .eq("period", window)
    .in("url", liveUrls)
    .order("snapshot_date", { ascending: false });
  type MetricRow = { url: string; gsc_position: number | null; gsc_clicks: number | null; gsc_impressions: number | null; gsc_ctr: number | null; gsc_top_queries: UrlTopQuery[] | null };
  const metricsByUrl = new Map<string, MetricRow>();
  for (const m of (metricsData ?? []) as MetricRow[]) {
    if (!metricsByUrl.has(m.url)) metricsByUrl.set(m.url, m); // first = latest snapshot_date, rows already ordered
  }

  const out: BlogClusterAnalyticsItem[] = [];
  for (const it of items) {
    const liveUrl = resolved.get(it.id);
    if (!liveUrl) continue;
    const m = metricsByUrl.get(liveUrl);
    out.push({
      id: it.id,
      title: it.title,
      liveUrl,
      gscPosition: Number(m?.gsc_position) || 0,
      gscClicks: Number(m?.gsc_clicks) || 0,
      gscImpressions: Number(m?.gsc_impressions) || 0,
      gscCtr: Number(m?.gsc_ctr) || 0,
      topQueries: (m?.gsc_top_queries ?? []).slice(0, 10),
    });
  }

  return {
    id: c.id,
    clusterName: c.cluster_name,
    totalCount: items.length,
    unpublishedCount: items.length - resolved.size,
    items: out.sort((a, b) => (a.gscPosition || 999) - (b.gscPosition || 999)),
  };
}
