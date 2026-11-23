// Blog Clusters - GSC queries: the refresh (GC-2 + GC-3) and "Apply all" (GC-5)
// jobs. Shared by the cluster page's server actions (signed-in client, RLS) and
// the weekly cron (admin client). Server only.
//
// Refresh:
//   1. Pull every GSC query (last 90 days) matching the cluster's keywords,
//      property-wide - so it works before the cluster's posts are live.
//   2. Keep 50+ impressions; upsert metrics only (assignments are untouched).
//   3. Assign queries no person has touched yet: Claude suggests (keyword
//      matching if Claude is unavailable), then hard rules from the page the
//      query already ranks on override it.
// Apply all:
//   Accept every suggestion, then write each post's queries-to-cover and its
//   anchor plan (agreed split) into topic_cluster_items.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getGscQueryPageRowsMatching } from "@/lib/google/gsc";
import { isMissingTable } from "@/lib/team-targets/db";
import { isMissingColumn } from "@/lib/ai-citation/run-state";
import {
  aggregateQueryRows, allocateAnchors, clusterKeywords, isQuestion, keywordAssignment, matchedKeyword,
  normalizeKeyword, ruleAssignment, samePage, type PostRef,
} from "@/lib/blog-clusters/query-match";
import { assignQueriesWithClaude } from "@/lib/blog-clusters/assign-queries-ai";
import {
  LOOKBACK_DAYS, MIN_IMPRESSIONS,
  type AnchorPlan, type ClusterGscRefreshInfo, type PostGscQuery, type QueryAction, type QueryUsage,
} from "@/lib/types/cluster-gsc";

export const GSC_MIGRATION = "20261123000001_cluster_gsc_queries";
const MAX_QUERIES = 500;

type Db = SupabaseClient;

interface ClusterRow {
  id: string; cluster_name: string; pillar_title: string; pillar_slug: string | null;
  pillar_primary_keyword: string | null; seed_keyword: string | null;
}
interface ItemRow {
  id: string; title: string; target_keyword: string | null;
  supporting_keywords: Array<{ keyword: string; volume: number | null }> | null;
  url_slug: string | null; published_url?: string | null;
  tasks: { published_url: string | null } | null;
  anchor_plan?: AnchorPlan | null;
}

/** How to work a query into a page when nothing more specific was suggested. */
export function suggestedUsage(query: string, impressions: number): QueryUsage {
  if (isQuestion(query)) return "faq";
  return impressions >= 100 ? "h2" : "body";
}

function dayOffset(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

async function loadCluster(db: Db, projectId: string, clusterId: string) {
  const { data: c } = await db.from("topic_clusters")
    .select("id, cluster_name, pillar_title, pillar_slug, pillar_primary_keyword, seed_keyword")
    .eq("id", clusterId).eq("project_id", projectId).maybeSingle();
  if (!c) return null;
  // published_url arrives with a later migration; fall back without it.
  const sel = (withPublished: boolean) => db.from("topic_cluster_items")
    .select(`id, title, target_keyword, supporting_keywords, url_slug, anchor_plan, ${withPublished ? "published_url, " : ""}tasks ( published_url )`)
    .eq("cluster_id", clusterId).order("position", { ascending: true });
  let res = await sel(true);
  if (res.error && isMissingColumn(res.error.message)) res = await sel(false);
  if (res.error) throw new Error(res.error.message);
  return { cluster: c as ClusterRow, items: (res.data ?? []) as unknown as ItemRow[] };
}

function hubOf(c: ClusterRow) {
  return { title: c.pillar_title, slug: c.pillar_slug, keyword: c.pillar_primary_keyword || c.seed_keyword || null };
}

function postRefs(items: ItemRow[]): PostRef[] {
  return items.map((it) => ({
    id: it.id,
    title: it.title,
    primary: it.target_keyword,
    supporting: (it.supporting_keywords ?? []).map((s) => s.keyword),
    pages: [it.published_url ?? null, it.tasks?.published_url ?? null, it.url_slug],
  }));
}

export interface RefreshResult {
  ok: boolean;
  error?: string;
  fetched: number;
  added: number;
  assigned: number;
  ai: ClusterGscRefreshInfo["ai"];
  aiError?: string | null;
  /** Query+page rows Search Console returned before filtering/threshold. */
  rawRows?: number;
}

export async function refreshClusterGscQueries(
  db: Db, args: { projectId: string; clusterId: string; siteUrl: string | null },
): Promise<RefreshResult> {
  const empty = { fetched: 0, added: 0, assigned: 0, ai: "skipped" as const };
  if (!args.siteUrl) return { ok: false, error: "This project has no Search Console property set.", ...empty };

  // Migration guard.
  const probe = await db.from("topic_cluster_gsc_queries").select("id").limit(1);
  if (probe.error && isMissingTable(probe.error)) return { ok: false, error: `Apply migration ${GSC_MIGRATION} in Supabase first.`, ...empty };

  const loaded = await loadCluster(db, args.projectId, args.clusterId);
  if (!loaded) return { ok: false, error: "Cluster not found.", ...empty };
  const { cluster, items } = loaded;
  const hub = hubOf(cluster);

  // 1. Fetch from GSC.
  const keywords = clusterKeywords([
    hub.keyword, cluster.seed_keyword,
    ...items.map((i) => i.target_keyword),
    ...items.flatMap((i) => (i.supporting_keywords ?? []).map((s) => s.keyword)),
  ]);
  if (!keywords.length) return { ok: false, error: "The cluster has no keywords to match on - add primary/supporting keywords first.", ...empty };
  const end = dayOffset(3); // GSC data lags ~2-3 days
  const start = dayOffset(3 + LOOKBACK_DAYS);
  let gsc;
  try {
    gsc = await getGscQueryPageRowsMatching(args.siteUrl, keywords, { start, end });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Search Console request failed.", ...empty };
  }
  const raw = gsc.rows;
  const rawRows = raw.length;
  // Each query's TRUE totals (query-only report). Summing the query+page rows
  // over-counts when two of our pages show for the same search.
  const totalByQuery = new Map(gsc.totals.map((t) => [normalizeKeyword(t.query), t]));

  // 2. Whole-word matches only ("ems" must not match "systems"), aggregate per
  //    query (for the ranking page), take the true totals, threshold, upsert
  //    metrics only.
  const aggregated = aggregateQueryRows(raw.filter((r) => matchedKeyword(r.query, keywords) !== null))
    .map((q) => {
      const t = totalByQuery.get(q.query);
      return t ? { ...q, clicks: t.clicks, impressions: t.impressions, ctr: t.ctr, position: Math.round(t.position * 10) / 10 } : q;
    })
    .filter((q) => q.impressions >= MIN_IMPRESSIONS)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, MAX_QUERIES);

  const { data: existingData } = await db.from("topic_cluster_gsc_queries")
    .select("query").eq("cluster_id", args.clusterId);
  const existing = new Set(((existingData ?? []) as { query: string }[]).map((r) => normalizeKeyword(r.query)));
  const runAt = new Date().toISOString();

  for (let i = 0; i < aggregated.length; i += 200) {
    const chunk = aggregated.slice(i, i + 200).map((q) => ({
      project_id: args.projectId,
      cluster_id: args.clusterId,
      query: q.query,
      clicks: q.clicks,
      impressions: q.impressions,
      ctr: q.ctr,
      position: q.position,
      ranking_page: q.rankingPage,
      ranking_page_position: q.rankingPagePosition,
      matched_keyword: matchedKeyword(q.query, keywords),
      fetched_at: runAt,
    }));
    const { error } = await db.from("topic_cluster_gsc_queries").upsert(chunk, { onConflict: "cluster_id,query" });
    if (error) return { ok: false, error: error.message, ...empty };
  }
  const added = aggregated.filter((q) => !existing.has(q.query)).length;

  // Queries that fell below the threshold and nobody acted on: drop them.
  await db.from("topic_cluster_gsc_queries").delete()
    .eq("cluster_id", args.clusterId).lt("fetched_at", runAt).eq("status", "suggested")
    .or("assigned_by.is.null,assigned_by.neq.manual");

  // 3. Assign what nobody has touched (never assigned, or only by the keyword fallback).
  const { data: openData, error: openErr } = await db.from("topic_cluster_gsc_queries")
    .select("id, query, impressions, position, ranking_page, ranking_page_position")
    .eq("cluster_id", args.clusterId).eq("status", "suggested")
    .or("assigned_by.is.null,assigned_by.eq.keyword");
  if (openErr) return { ok: false, error: openErr.message, fetched: aggregated.length, added, assigned: 0, ai: "skipped" };
  const open = (openData ?? []) as Array<{ id: string; query: string; impressions: number; position: number; ranking_page: string | null; ranking_page_position: number | null }>;

  const posts = postRefs(items);
  const needsNaturals = new Set(items.filter((i) => !i.anchor_plan?.naturalToHub).map((i) => i.id));
  let ai: RefreshResult["ai"] = "skipped";
  let aiError: string | null = null;
  let aiResult: Awaited<ReturnType<typeof assignQueriesWithClaude>> | null = null;
  if (open.length || needsNaturals.size) {
    aiResult = await assignQueriesWithClaude({
      clusterName: cluster.cluster_name,
      hub,
      posts: items.map((it, i) => ({
        id: it.id, title: it.title, primary: it.target_keyword, supporting: posts[i].supporting,
        live: !!(it.published_url || it.tasks?.published_url), needsNaturals: needsNaturals.has(it.id),
      })),
      queries: open.map((q) => ({ query: q.query, impressions: q.impressions, position: Number(q.position), rankingPage: q.ranking_page })),
    });
    ai = aiResult.ok ? "ok" : "fallback";
    if (!aiResult.ok) aiError = aiResult.error;
  }

  const updates = open.map((q) => {
    const fromAi = aiResult?.ok ? aiResult.assignments.get(q.query) : undefined;
    const base = fromAi ?? keywordAssignment({ query: q.query, impressions: q.impressions }, posts, hub);
    const rule = ruleAssignment({ rankingPage: q.ranking_page, rankingPagePosition: q.ranking_page_position == null ? null : Number(q.ranking_page_position) }, posts, hub);
    const action: QueryAction = rule?.action ?? base.action;
    const keepsAnchors = action === "assign" || action === "hub";
    // Every query that gets USED says how - including "update existing page",
    // where it goes into that page as a heading, FAQ or paragraph mention.
    const usage: QueryUsage | null = keepsAnchors || action === "update_existing" ? (base.usage ?? suggestedUsage(q.query, q.impressions)) : null;
    const anchors = keepsAnchors ? (base.anchors.length ? base.anchors : [q.query]) : [];
    const assignedBy = rule ? "rule" : fromAi ? "ai" : action === "unassigned" ? null : "keyword";
    return {
      id: q.id,
      project_id: args.projectId,
      cluster_id: args.clusterId,
      query: q.query,
      action,
      item_id: rule ? rule.itemId : base.itemId,
      usage,
      anchors,
      reason: rule?.reason ?? base.reason,
      assigned_by: assignedBy,
    };
  });
  for (let i = 0; i < updates.length; i += 200) {
    const { error } = await db.from("topic_cluster_gsc_queries").upsert(updates.slice(i, i + 200), { onConflict: "id" });
    if (error) return { ok: false, error: error.message, fetched: aggregated.length, added, assigned: 0, ai, aiError };
  }

  // Natural anchor phrasings from Claude, merged into each post's plan.
  if (aiResult?.ok) {
    for (const it of items) {
      const n = aiResult.naturals.get(it.id);
      if (!n) continue;
      await db.from("topic_cluster_items")
        .update({ anchor_plan: { ...(it.anchor_plan ?? {}), naturalToHub: n.toHub, naturalFromHub: n.fromHub } })
        .eq("id", it.id);
    }
  }

  const info: ClusterGscRefreshInfo = { at: runAt, fetched: aggregated.length, added, ai, aiError, rawRows, keywords: keywords.length };
  await db.from("topic_clusters").update({ gsc_refresh: info }).eq("id", args.clusterId);

  return { ok: true, fetched: aggregated.length, added, assigned: updates.filter((u) => u.action !== "unassigned").length, ai, aiError, rawRows };
}

// ---------------------------------------------------------------------------
// Apply all (GC-5)
// ---------------------------------------------------------------------------

/** Rebuild every post's queries-to-cover and anchor plan from the ACCEPTED queries. */
export async function rebuildClusterPostPlans(db: Db, args: { projectId: string; clusterId: string }): Promise<{ ok: boolean; error?: string; posts: number }> {
  const loaded = await loadCluster(db, args.projectId, args.clusterId);
  if (!loaded) return { ok: false, error: "Cluster not found.", posts: 0 };
  const { cluster, items } = loaded;
  const hub = hubOf(cluster);

  const { data, error } = await db.from("topic_cluster_gsc_queries")
    .select("query, impressions, position, action, item_id, usage, anchors")
    .eq("cluster_id", args.clusterId).eq("status", "accepted").in("action", ["assign", "hub"])
    .order("impressions", { ascending: false });
  if (error) return { ok: false, error: error.message, posts: 0 };
  const rows = (data ?? []) as Array<{ query: string; impressions: number; position: number; action: QueryAction; item_id: string | null; usage: QueryUsage | null; anchors: string[] | null }>;

  const hubQueries = rows.filter((r) => r.action === "hub").map((r) => (r.anchors?.[0] || r.query));
  const perPost = new Map<string, { queries: PostGscQuery[]; variants: string[] }>();
  for (const r of rows) {
    if (r.action !== "assign" || !r.item_id) continue;
    const p = perPost.get(r.item_id) ?? { queries: [], variants: [] };
    p.queries.push({ query: r.query, usage: r.usage ?? "body", impressions: r.impressions, position: Number(r.position) });
    for (const a of r.anchors ?? []) {
      if (!p.variants.some((v) => normalizeKeyword(v) === normalizeKeyword(a))) p.variants.push(a);
    }
    perPost.set(r.item_id, p);
  }

  const plans = allocateAnchors(items.map((it) => ({
    id: it.id,
    title: it.title,
    primary: it.target_keyword,
    isHub: !!hub.slug && samePage(it.url_slug, hub.slug),
    queries: perPost.get(it.id)?.queries ?? [],
    variants: perPost.get(it.id)?.variants ?? [],
    naturalToHub: it.anchor_plan?.naturalToHub ?? null,
    naturalFromHub: it.anchor_plan?.naturalFromHub ?? null,
  })), { keyword: hub.keyword, title: hub.title }, hubQueries);

  for (const it of items) {
    const { error: upErr } = await db.from("topic_cluster_items")
      .update({ gsc_queries: perPost.get(it.id)?.queries ?? [], anchor_plan: plans.get(it.id) ?? {} })
      .eq("id", it.id);
    if (upErr) return { ok: false, error: upErr.message, posts: 0 };
  }
  return { ok: true, posts: items.length };
}
