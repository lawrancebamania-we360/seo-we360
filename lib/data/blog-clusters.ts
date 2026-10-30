// Blog Clusters (Tickets 3-4): reads over topic_clusters / topic_cluster_items
// for the cluster list page and the per-cluster detail table.

import { createClient } from "@/lib/supabase/server";
import { buildSitemapIndex, resolveSitemapUrl, toExternalUrl } from "@/lib/url";
import { isMissingColumn } from "@/lib/ai-citation/run-state";
import type { ContentKind, ClusterKind, PublishState } from "@/lib/content-pipeline/content-type";
import type { ContentTool } from "@/lib/content-pipeline/tool";

// A cluster's kind as a safe ClusterKind (defaults to blog for an unknown/empty value).
const asClusterKind = (v: string | null | undefined): ClusterKind => (v === "guide" ? "guide" : "blog");

// ---- Calculators (content_tools) shared read helpers -----------------------
// The content_tools columns selected everywhere a tool is embedded.
const TOOL_FIELDS = "id, name, content, inputs, output, formula, bundle_path, bundle_name, embed_url";
type RawTool = {
  id: string; name: string; content: string | null; inputs: string | null; output: string | null;
  formula: string | null; bundle_path: string | null; bundle_name: string | null; embed_url: string | null;
};
function toContentTool(r: RawTool): ContentTool {
  return {
    id: r.id, name: r.name, content: r.content, inputs: r.inputs, output: r.output, formula: r.formula,
    bundlePath: r.bundle_path, bundleName: r.bundle_name, embedUrl: r.embed_url,
  };
}
// Up to 3 tools per post via the content_tool_items join (ordered by position).
function mapJunctionTools(rows: Array<{ position: number | null; tool: RawTool | null }> | null | undefined): ContentTool[] {
  return (rows ?? [])
    .filter((j): j is { position: number | null; tool: RawTool } => !!j.tool)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((j) => toContentTool(j.tool));
}
// A post's calculators from whichever embed the tiered read returned: the join
// table ("tools"), else the legacy single tool_id embed ("tool"), else none.
function itemTools(r: { tools?: Array<{ position: number | null; tool: RawTool | null }> | null; tool?: RawTool | null }): ContentTool[] {
  if (r.tools !== undefined) return mapJunctionTools(r.tools);
  if (r.tool !== undefined) return r.tool ? [toContentTool(r.tool)] : [];
  return [];
}
import type { UrlTopQuery } from "@/lib/data/url-metrics";
import type { AnalyticsCompareRange } from "@/lib/data/analytics-range";

// Latest sitemap snapshot for a project (the daily url-metrics cron refreshes
// it). Used to tell whether a recorded live URL / slug is actually published.
async function loadSitemapIndex(
  supabase: Awaited<ReturnType<typeof createClient>>, projectId: string,
): Promise<ReturnType<typeof buildSitemapIndex>> {
  const { data } = await supabase
    .from("url_metrics_runs").select("url_list").eq("project_id", projectId)
    .order("run_date", { ascending: false }).limit(1).maybeSingle();
  return buildSitemapIndex((data as { url_list: string[] | null } | null)?.url_list ?? []);
}

// Where an item sits in the write -> upload -> live flow. A page is "live" when
// its recorded URL, its linked Sprint task's URL, or its planned slug appears in
// the latest sitemap snapshot.
//
// `publishedUrl` is the URL recorded ON THIS ITEM by "Mark published" in the
// content pipeline - the one signal that means "an uploader has pushed this".
// `taskPublishedUrl` (a linked Sprint task's URL) and the slug only tell us the
// page exists on the web; they do NOT mean the pipeline work is done.
//
// Key rule: a draft attached with nothing marked-published on the item yet is
// pending UPLOAD work - it belongs in the To Publish queue EVEN WHEN the page is
// already live (we're updating an existing page). So "ready" wins over slug/task
// liveness; it clears only once someone records the live URL here.
export function resolvePublishState(
  item: { artifactUrl: string | null; publishedUrl: string | null; urlSlug: string | null; taskPublishedUrl?: string | null },
  sitemapIndex: ReturnType<typeof buildSitemapIndex>,
): { state: PublishState; liveUrl: string | null } {
  const ownRecorded = toExternalUrl(item.publishedUrl);
  const recorded = ownRecorded ?? toExternalUrl(item.taskPublishedUrl ?? null);
  const liveFromRecorded = recorded ? resolveSitemapUrl(sitemapIndex, recorded) : null;
  const liveFromSlug = item.urlSlug ? resolveSitemapUrl(sitemapIndex, item.urlSlug) : null;
  const liveUrl = liveFromRecorded ?? liveFromSlug ?? null;

  // 1. Draft attached but not marked published here -> upload work to do, even
  //    for an already-live page we're enhancing.
  if (item.artifactUrl && !ownRecorded) return { state: "ready", liveUrl };
  // 2. Published (here or via its task): Live once crawled, else pending.
  if (liveUrl) return { state: "live", liveUrl };
  if (recorded) return { state: "published_pending", liveUrl: recorded };
  // 3. Nothing attached, nothing recorded, not on the web.
  return { state: "draft", liveUrl: null };
}

export interface BlogClusterSummary {
  id: string;
  clusterName: string;
  source: "ai_generated" | "import";
  kind: ClusterKind;
  itemCount: number;
  assignedCount: number;
  createdAt: string;
  /** Lightweight post list so the list page can search by post title/keyword, not just cluster name. */
  posts: { title: string; keyword: string | null }[];
}

export async function getBlogClusters(projectId: string): Promise<BlogClusterSummary[]> {
  const supabase = await createClient();
  // `kind` only exists after its migration; fall back to the base columns (and
  // default every cluster to blog) before it's applied.
  const loadClusters = (withKind: boolean) =>
    supabase.from("topic_clusters")
      .select(withKind ? "id, cluster_name, source, kind, created_at" : "id, cluster_name, source, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
  let clustersRes = await loadClusters(true);
  if (clustersRes.error && isMissingColumn(clustersRes.error.message)) clustersRes = await loadClusters(false);
  const rows = (clustersRes.data ?? []) as unknown as Array<{ id: string; cluster_name: string; source: string; kind?: string | null; created_at: string }>;
  if (!rows.length) return [];

  const { data: items } = await supabase
    .from("topic_cluster_items")
    .select("cluster_id, task_id, title, target_keyword")
    .in("cluster_id", rows.map((r) => r.id));
  const itemRows = (items ?? []) as Array<{ cluster_id: string; task_id: string | null; title: string; target_keyword: string | null }>;
  const countByCluster = new Map<string, { total: number; assigned: number }>();
  const postsByCluster = new Map<string, { title: string; keyword: string | null }[]>();
  for (const it of itemRows) {
    const c = countByCluster.get(it.cluster_id) ?? { total: 0, assigned: 0 };
    c.total++;
    if (it.task_id) c.assigned++;
    countByCluster.set(it.cluster_id, c);
    const list = postsByCluster.get(it.cluster_id) ?? [];
    list.push({ title: it.title, keyword: it.target_keyword });
    postsByCluster.set(it.cluster_id, list);
  }

  return rows.map((r) => ({
    id: r.id,
    clusterName: r.cluster_name,
    source: (r.source as "ai_generated" | "import") ?? "ai_generated",
    kind: asClusterKind(r.kind),
    itemCount: countByCluster.get(r.id)?.total ?? 0,
    assignedCount: countByCluster.get(r.id)?.assigned ?? 0,
    createdAt: r.created_at,
    posts: postsByCluster.get(r.id) ?? [],
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
  // Content pipeline additions.
  kind: ContentKind;
  artifactUrl: string | null;
  artifactDriveUrl: string | null;
  publishedUrl: string | null;
  publishedAt: string | null;
  publishState: PublishState;
  /** The resolved live URL (sitemap match, else the recorded URL); null until one exists. */
  liveUrl: string | null;
  /** The attached calculators (0-3). Empty until the content_tools migration is applied. */
  tools: ContentTool[];
}

export interface BlogClusterDetail {
  id: string;
  clusterName: string;
  pillarTitle: string;
  source: "ai_generated" | "import";
  kind: ClusterKind;
  /** The cluster's point-of-contact (profiles.id), null when unassigned. */
  ownerId: string | null;
  /** False until the owner_id migration (20261030000001) is applied. */
  ownerReady: boolean;
  items: BlogClusterItemRow[];
}

export async function getBlogClusterDetail(projectId: string, clusterId: string): Promise<BlogClusterDetail | null> {
  const supabase = await createClient();
  // `kind` and `owner_id` each arrive via their own migration; peel them off the
  // select if missing so the cluster still opens at any migration stage.
  const loadCluster = (withKind: boolean, withOwner: boolean) => {
    const cols = ["id", "cluster_name", "pillar_title", "source"];
    if (withKind) cols.push("kind");
    if (withOwner) cols.push("owner_id");
    return supabase.from("topic_clusters").select(cols.join(", "))
      .eq("id", clusterId).eq("project_id", projectId).maybeSingle();
  };
  let ownerReady = true;
  let clusterRes = await loadCluster(true, true);
  if (clusterRes.error && isMissingColumn(clusterRes.error.message)) { ownerReady = false; clusterRes = await loadCluster(true, false); }
  if (clusterRes.error && isMissingColumn(clusterRes.error.message)) clusterRes = await loadCluster(false, false);
  if (!clusterRes.data) return null;
  const c = clusterRes.data as unknown as { id: string; cluster_name: string; pillar_title: string; source: string; kind?: string | null; owner_id?: string | null };
  const clusterKind = asClusterKind(c.kind);

  // tasks has three FKs into profiles (created_by, reviewed_by_id, team_member_id) -
  // the embed is ambiguous without naming the exact constraint to join through.
  // The artifact/publish columns are selected only when they exist (before the
  // migration the same read runs without them, so the cluster never fails to open).
  const BASE_COLS = `
      id, position, title, category, funnel_stage, content_type, target_keyword, vol_mo,
      serp_verdict, supporting_keywords, outline, faq_candidates, interlinks_to, interlinks_from,
      meta_description, url_slug, primary_cta, task_id,
      tasks ( status, published_url, team_member_id, profiles!tasks_team_member_id_fkey ( name ) )`;
  const ARTIFACT_COLS = `artifact_url, artifact_drive_url, published_url, published_at, content_kind`;
  // The calculator/tool embeds. Tier 3 reads up to 3 via the content_tool_items
  // join (migration 20261029000002); tier 2 falls back to the legacy single
  // tool_id embed (migration 20261028000001); then artifacts; then base only -
  // so the cluster still opens at every migration stage.
  const JOIN_TOOLS = `tools:content_tool_items ( position, tool:content_tools ( ${TOOL_FIELDS} ) )`;
  const SINGLE_TOOL = `tool:content_tools ( ${TOOL_FIELDS} )`;
  const loadItems = (tier: 0 | 1 | 2 | 3) =>
    supabase.from("topic_cluster_items")
      .select(
        tier === 3 ? `${BASE_COLS}, ${ARTIFACT_COLS}, ${JOIN_TOOLS}`
          : tier === 2 ? `${BASE_COLS}, ${ARTIFACT_COLS}, ${SINGLE_TOOL}`
          : tier === 1 ? `${BASE_COLS}, ${ARTIFACT_COLS}` : BASE_COLS)
      .eq("cluster_id", clusterId)
      .order("position", { ascending: true });

  // Best-effort tool read: the join table (pre-migration: missing) falls back to
  // the single tool_id embed, then to the known-good artifact read, then base.
  let itemsRes = await loadItems(3);
  if (itemsRes.error) itemsRes = await loadItems(2);
  if (itemsRes.error) itemsRes = await loadItems(1);
  if (itemsRes.error && isMissingColumn(itemsRes.error.message)) itemsRes = await loadItems(0);

  type Row = {
    id: string; position: number; title: string; category: string | null; funnel_stage: string | null;
    content_type: string | null; target_keyword: string | null; vol_mo: number | null; serp_verdict: string | null;
    supporting_keywords: Array<{ keyword: string; volume: number | null }> | null;
    outline: string[] | null; faq_candidates: string[] | null;
    interlinks_to: string[] | null; interlinks_from: string[] | null;
    meta_description: string | null; url_slug: string | null; primary_cta: string | null;
    task_id: string | null;
    tasks: { status: string | null; published_url: string | null; team_member_id: string | null; profiles: { name: string | null } | null } | null;
    artifact_url?: string | null; artifact_drive_url?: string | null; published_url?: string | null; published_at?: string | null;
    content_kind?: string | null;
    tool?: RawTool | null;
    tools?: Array<{ position: number | null; tool: RawTool | null }> | null;
  };
  const rawItems = (itemsRes.data ?? []) as unknown as Row[];

  const sitemapIndex = await loadSitemapIndex(supabase, projectId);

  const items = rawItems.map((r) => {
    const ownPublished = r.published_url ?? null;
    const taskPublished = r.tasks?.published_url ?? null;
    const publishedUrl = ownPublished ?? taskPublished; // merged, for display
    const artifactUrl = r.artifact_url ?? null;
    const { state, liveUrl } = resolvePublishState(
      { artifactUrl, publishedUrl: ownPublished, urlSlug: r.url_slug, taskPublishedUrl: taskPublished },
      sitemapIndex,
    );
    return {
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
      // Per-post override wins; otherwise the post is whatever the cluster is.
      kind: (r.content_kind as ContentKind | null) ?? clusterKind,
      artifactUrl,
      artifactDriveUrl: r.artifact_drive_url ?? null,
      publishedUrl,
      publishedAt: r.published_at ?? null,
      publishState: state,
      liveUrl,
      tools: itemTools(r),
    };
  });

  return {
    id: c.id,
    clusterName: c.cluster_name,
    pillarTitle: c.pillar_title,
    source: (c.source as "ai_generated" | "import") ?? "ai_generated",
    kind: clusterKind,
    ownerId: c.owner_id ?? null,
    ownerReady,
    items,
  };
}

// ============================================================================
// To Publish queue: every planned blog/guide across all clusters that has an
// artifact attached but isn't live yet - the list Dinesh picks from to upload
// to the site. "Not live yet" is resolved the same way as everywhere else
// (recorded URL / slug not in the latest sitemap, and no URL recorded).
// ============================================================================

export interface PublishQueueRow {
  id: string;
  clusterId: string;
  clusterName: string;
  title: string;
  kind: ContentKind;
  urlSlug: string | null;
  metaDescription: string | null;
  targetKeyword: string | null;
  artifactUrl: string | null;
  artifactDriveUrl: string | null;
  assigneeName: string | null;
  /** The attached calculators (0-3). Empty until the content_tools migration is applied. */
  tools: ContentTool[];
}

export async function getPublishQueue(projectId: string): Promise<{ ready: boolean; rows: PublishQueueRow[] }> {
  const supabase = await createClient();
  const BASE = `
    id, cluster_id, title, content_type, content_kind, url_slug, meta_description, target_keyword,
    artifact_url, artifact_drive_url, published_url,
    topic_clusters ( cluster_name ),
    tasks ( published_url, profiles!tasks_team_member_id_fkey ( name ) )`;
  const JOIN_TOOLS = `tools:content_tool_items ( position, tool:content_tools ( ${TOOL_FIELDS} ) )`;
  const SINGLE_TOOL = `tool:content_tools ( ${TOOL_FIELDS} )`;
  // tier 2: join table (up to 3) · tier 1: legacy single tool · tier 0: no tools.
  const query = (tier: 0 | 1 | 2) =>
    supabase.from("topic_cluster_items")
      .select(tier === 2 ? `${BASE}, ${JOIN_TOOLS}` : tier === 1 ? `${BASE}, ${SINGLE_TOOL}` : BASE)
      .eq("project_id", projectId).not("artifact_url", "is", null);
  // The tool embeds don't resolve until their migrations are applied - fall back
  // down the tiers so the queue still works. The artifact columns not existing is
  // the real "database update needed" case for this page.
  let res = await query(2);
  if (res.error) res = await query(1);
  if (res.error) res = await query(0);
  if (res.error) {
    if (isMissingColumn(res.error.message)) return { ready: false, rows: [] };
    return { ready: true, rows: [] };
  }

  type Row = {
    id: string; cluster_id: string; title: string; content_type: string | null; content_kind: string | null;
    url_slug: string | null; meta_description: string | null; target_keyword: string | null;
    artifact_url: string | null; artifact_drive_url: string | null; published_url: string | null;
    topic_clusters: { cluster_name: string } | null;
    tasks: { published_url: string | null; profiles: { name: string | null } | null } | null;
    tool?: RawTool | null;
    tools?: Array<{ position: number | null; tool: RawTool | null }> | null;
  };
  const rows = (res.data ?? []) as unknown as Row[];
  if (!rows.length) return { ready: true, rows: [] };

  const sitemapIndex = await loadSitemapIndex(supabase, projectId);

  // A post's blog/guide defaults to its cluster's kind. Fetched separately so a
  // not-yet-applied cluster.kind column can't break the whole queue read.
  const clusterIds = [...new Set(rows.map((r) => r.cluster_id))];
  const kindByCluster = new Map<string, ClusterKind>();
  if (clusterIds.length) {
    const kres = await supabase.from("topic_clusters").select("id, kind").in("id", clusterIds);
    if (!kres.error) for (const k of (kres.data ?? []) as { id: string; kind: string | null }[]) kindByCluster.set(k.id, asClusterKind(k.kind));
  }

  const out: PublishQueueRow[] = [];
  for (const r of rows) {
    const { state } = resolvePublishState(
      { artifactUrl: r.artifact_url, publishedUrl: r.published_url ?? null, urlSlug: r.url_slug, taskPublishedUrl: r.tasks?.published_url ?? null },
      sitemapIndex,
    );
    if (state !== "ready") continue; // only drafts not yet marked published here
    out.push({
      id: r.id,
      clusterId: r.cluster_id,
      clusterName: r.topic_clusters?.cluster_name ?? "Cluster",
      title: r.title,
      kind: (r.content_kind as ContentKind | null) ?? kindByCluster.get(r.cluster_id) ?? "blog",
      urlSlug: r.url_slug,
      metaDescription: r.meta_description,
      targetKeyword: r.target_keyword,
      artifactUrl: r.artifact_url,
      artifactDriveUrl: r.artifact_drive_url,
      assigneeName: r.tasks?.profiles?.name ?? null,
      tools: itemTools(r),
    });
  }
  return { ready: true, rows: out };
}

// ============================================================================
// Calculators overview: the whole content_tools library for a project, each with
// its maker and the posts it's attached to - the combined view behind the
// "Calculators" filter on the To Publish page.
// ============================================================================

export interface ToolUsage {
  itemId: string;
  title: string;
  kind: ContentKind;
  clusterId: string;
  clusterName: string;
  publishState: PublishState;
  liveUrl: string | null;
}

export interface ToolOverviewRow extends ContentTool {
  createdByName: string | null;
  createdAt: string | null;
  usedOn: ToolUsage[];
}

export async function getContentToolsOverview(projectId: string): Promise<{ ready: boolean; tools: ToolOverviewRow[] }> {
  const supabase = await createClient();
  const { data: toolData, error } = await supabase
    .from("content_tools")
    .select("id, name, content, inputs, output, formula, bundle_path, bundle_name, embed_url, created_by, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  // No content_tools table yet -> the page shows a "database update needed" notice.
  if (error) return { ready: false, tools: [] };

  type TRow = {
    id: string; name: string; content: string | null; inputs: string | null; output: string | null; formula: string | null;
    bundle_path: string | null; bundle_name: string | null; embed_url: string | null; created_by: string | null; created_at: string | null;
  };
  const toolRows = (toolData ?? []) as TRow[];
  if (!toolRows.length) return { ready: true, tools: [] };

  // Maker names.
  const creatorIds = [...new Set(toolRows.map((t) => t.created_by).filter((v): v is string => !!v))];
  const nameById = new Map<string, string>();
  if (creatorIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, name").in("id", creatorIds);
    for (const p of (profs ?? []) as { id: string; name: string | null }[]) if (p.name) nameById.set(p.id, p.name);
  }

  // Which posts use each tool. A tool-post pair comes from the content_tool_items
  // join (a post can list several tools); pre-migration it falls back to the
  // legacy single tool_id link, so the overview still works either way.
  const toolIds = toolRows.map((t) => t.id);
  let pairs: { itemId: string; toolId: string }[] = [];
  const { data: linkData, error: linkErr } = await supabase
    .from("content_tool_items").select("item_id, tool_id").in("tool_id", toolIds);
  if (!linkErr) {
    pairs = ((linkData ?? []) as { item_id: string; tool_id: string }[]).map((l) => ({ itemId: l.item_id, toolId: l.tool_id }));
  } else {
    const { data: legacy } = await supabase
      .from("topic_cluster_items").select("id, tool_id").in("tool_id", toolIds);
    pairs = ((legacy ?? []) as { id: string; tool_id: string }[]).map((l) => ({ itemId: l.id, toolId: l.tool_id }));
  }

  // Post details, fetched once by id and shared across however many tools use them.
  type IRow = {
    id: string; title: string; content_kind: string | null; cluster_id: string;
    url_slug: string | null; published_url: string | null; artifact_url: string | null;
    topic_clusters: { cluster_name: string | null; kind: string | null } | null;
    tasks: { published_url: string | null } | null;
  };
  const itemIds = [...new Set(pairs.map((p) => p.itemId))];
  const itemById = new Map<string, IRow>();
  if (itemIds.length) {
    const { data: itemData } = await supabase
      .from("topic_cluster_items")
      .select("id, title, content_kind, cluster_id, url_slug, published_url, artifact_url, topic_clusters(cluster_name, kind), tasks(published_url)")
      .in("id", itemIds);
    for (const it of (itemData ?? []) as unknown as IRow[]) itemById.set(it.id, it);
  }

  const sitemapIndex = await loadSitemapIndex(supabase, projectId);
  const usageByTool = new Map<string, ToolUsage[]>();
  for (const p of pairs) {
    const it = itemById.get(p.itemId);
    if (!it) continue;
    const { state, liveUrl } = resolvePublishState(
      { artifactUrl: it.artifact_url, publishedUrl: it.published_url, urlSlug: it.url_slug, taskPublishedUrl: it.tasks?.published_url ?? null },
      sitemapIndex,
    );
    const kind = (it.content_kind as ContentKind | null) ?? asClusterKind(it.topic_clusters?.kind);
    const arr = usageByTool.get(p.toolId) ?? [];
    arr.push({ itemId: it.id, title: it.title, kind, clusterId: it.cluster_id, clusterName: it.topic_clusters?.cluster_name ?? "Cluster", publishState: state, liveUrl });
    usageByTool.set(p.toolId, arr);
  }

  const tools: ToolOverviewRow[] = toolRows.map((t) => ({
    id: t.id, name: t.name, content: t.content, inputs: t.inputs, output: t.output, formula: t.formula,
    bundlePath: t.bundle_path, bundleName: t.bundle_name, embedUrl: t.embed_url,
    createdByName: t.created_by ? (nameById.get(t.created_by) ?? null) : null,
    createdAt: t.created_at,
    usedOn: usageByTool.get(t.id) ?? [],
  }));
  return { ready: true, tools };
}

// ============================================================================
// Analytics Ticket 8-9: Blog Clusters' ranking view - only posts confirmed
// LIVE, each joined against its own GSC numbers, LIVE (not the cached
// url_metrics snapshot table - that only stores fixed 30/60/90-day windows,
// which can't reproduce "This month" or "Last 7 days"). One current-period +
// one previous-period GSC call per published post, run in parallel, using
// the exact same compareRange Traffic Sources' date filter already computed
// (lib/data/analytics-range.ts) - so "This month" here really means this
// month, at the cost of a live API call per post every time a cluster opens.
//
// "Published" is resolved two ways, in order: (1) the item's linked Sprint
// task has a published_url - definitive; (2) else its pasted/AI-generated
// url_slug is matched against the project's latest sitemap snapshot
// (url_metrics_runs.url_list), matched on host-less path (see lib/url.ts
// resolveSitemapUrl - a bare slug, "host/path" and full URL all match). An
// item that resolves neither way was planned/
// uploaded but never actually published, and is excluded from the ranked
// list (surfaced separately as "not yet published" so nothing silently
// vanishes - see BlogClusterAnalytics.unpublishedCount).
// ============================================================================

export interface BlogClusterAnalyticsItem {
  id: string;
  title: string;
  liveUrl: string;
  position: number;
  /** Raw position change, positive = improved (moved up the results); null if no prior data. */
  positionDelta: number | null;
  clicks: number;
  clicksDeltaPct: number | null;
  impressions: number;
  ctr: number;
  ctrDeltaPct: number | null;
  topQueries: UrlTopQuery[];
}

export interface BlogClusterAnalytics {
  id: string;
  clusterName: string;
  totalCount: number;
  /** Planned posts that aren't on the live sitemap yet. */
  unpublishedCount: number;
  /** Live posts whose Search Console lookup failed, so they can't be ranked right now (kept countable, never silently dropped). */
  rankingUnavailableCount: number;
  connected: boolean;
  reason?: string;
  items: BlogClusterAnalyticsItem[];
}

function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return curr > 0 ? 100 : null;
  return Math.round(((curr - prev) / prev) * 100);
}

export async function getBlogClusterAnalytics(
  projectId: string, clusterId: string, siteUrl: string | null, compareRange: AnalyticsCompareRange,
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

  // Prefer the item's own recorded published_url (set from the To Publish queue)
  // when present, falling back to the linked task's. The item column is only
  // selected when it exists so this keeps working before the migration.
  const loadAnalyticsItems = (withPublished: boolean) =>
    supabase.from("topic_cluster_items")
      .select(withPublished ? "id, title, url_slug, task_id, published_url, tasks ( published_url )" : "id, title, url_slug, task_id, tasks ( published_url )")
      .eq("cluster_id", clusterId)
      .order("position", { ascending: true });
  let analyticsItemsRes = await loadAnalyticsItems(true);
  if (analyticsItemsRes.error && isMissingColumn(analyticsItemsRes.error.message)) analyticsItemsRes = await loadAnalyticsItems(false);
  type ItemRow = { id: string; title: string; url_slug: string | null; task_id: string | null; published_url?: string | null; tasks: { published_url: string | null } | null };
  const items = (analyticsItemsRes.data ?? []) as unknown as ItemRow[];
  const empty = { id: c.id, clusterName: c.cluster_name, totalCount: items.length, unpublishedCount: items.length, rankingUnavailableCount: 0, connected: true, items: [] };
  if (!items.length) return empty;

  const { data: latestRun } = await supabase
    .from("url_metrics_runs")
    .select("url_list")
    .eq("project_id", projectId)
    .order("run_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sitemapUrls = (latestRun as { url_list: string[] | null } | null)?.url_list ?? [];
  const sitemapIndex = buildSitemapIndex(sitemapUrls);

  // Matched on host-less PATH, not the whole string: a planned post is usually
  // stored as a bare slug ("my-post") while the sitemap holds
  // "https://www.we360.ai/blog/my-post/", which a whole-string compare can
  // never equal (only 2 of 107 items resolved before this).
  const resolved = new Map<string, string>(); // item.id -> live URL
  for (const it of items) {
    const publishedUrl = toExternalUrl(it.published_url ?? it.tasks?.published_url);
    if (publishedUrl) { resolved.set(it.id, publishedUrl); continue; }
    if (it.url_slug) {
      const match = resolveSitemapUrl(sitemapIndex, it.url_slug);
      if (match) resolved.set(it.id, match);
    }
  }
  if (!resolved.size) return empty;

  if (!siteUrl) {
    return { id: c.id, clusterName: c.cluster_name, totalCount: items.length, unpublishedCount: items.length - resolved.size, rankingUnavailableCount: 0, connected: false, reason: "No GSC property URL on this project.", items: [] };
  }

  const { getGscUrlSnapshotForRange } = await import("@/lib/google/gsc");
  const resolvedItems = items.filter((it) => resolved.has(it.id));
  const snapshots = await Promise.all(resolvedItems.map(async (it) => {
    const liveUrl = resolved.get(it.id)!;
    try {
      const [current, previous] = await Promise.all([
        getGscUrlSnapshotForRange(siteUrl, liveUrl, compareRange.current),
        getGscUrlSnapshotForRange(siteUrl, liveUrl, compareRange.previous).catch(() => null),
      ]);
      return { it, liveUrl, current, previous };
    } catch {
      return { it, liveUrl, current: null, previous: null };
    }
  }));

  const out: BlogClusterAnalyticsItem[] = snapshots
    .filter((s) => s.current)
    .map(({ it, liveUrl, current, previous }) => ({
      id: it.id,
      title: it.title,
      liveUrl,
      position: current!.position,
      positionDelta: previous && previous.position > 0 && current!.position > 0 ? Math.round((previous.position - current!.position) * 10) / 10 : null,
      clicks: current!.clicks,
      clicksDeltaPct: previous ? pctDelta(current!.clicks, previous.clicks) : null,
      impressions: current!.impressions,
      ctr: current!.ctr,
      ctrDeltaPct: previous ? pctDelta(current!.ctr, previous.ctr) : null,
      topQueries: current!.topQueries,
    }));

  return {
    id: c.id,
    clusterName: c.cluster_name,
    totalCount: items.length,
    unpublishedCount: items.length - resolved.size,
    rankingUnavailableCount: resolved.size - out.length,
    connected: true,
    items: out.sort((a, b) => (a.position || 999) - (b.position || 999)),
  };
}
