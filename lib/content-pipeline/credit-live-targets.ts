// Content pipeline -> Team Targets bridge. When a planned blog/guide is LIVE
// (its URL is in the latest daily sitemap snapshot), that is the real-world
// achievement, so credit it to the team automatically:
//   - the WRITER (topic_cluster_items.writer_id) on their matching produce
//     target - a guide on their "Guides" target, a blog on "New Blogs" /
//     "Write & Upload Blogs", a listicle on "Listicles" - if they have one;
//   - DINESH on his upload target - "Upload Guides to website" for a guide,
//     "Upload Blogs to website" otherwise.
// Each person is credited on their own target (not double-counting one). Logs
// are verified own-site, quantity 1, deduped by the live URL (the
// team_target_logs unique index), and everything is best-effort: a missing
// table, a missing target, a duplicate, or any write error is swallowed so it
// can never break the daily metrics run.

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSitemapIndex, resolveSitemapUrl, toExternalUrl } from "@/lib/url";
import { classifyContentType, type ContentKind } from "@/lib/content-pipeline/content-type";
import { linkKey } from "@/lib/team-targets/parse";
import { todayIst } from "@/lib/team-targets/week";

// Dinesh's upload target name for a given kind.
export function uploadTargetTask(isGuide: boolean): string {
  return isGuide ? "Upload Guides to website" : "Upload Blogs to website";
}

// The word a writer's PRODUCE target contains for each kind (null = no credit).
const WRITER_KEYWORD: Record<ContentKind, string | null> = {
  guide: "guide", blog: "blog", listicle: "listicle", pillar: null, other: null,
};

async function findTargetByTask(admin: SupabaseClient, projectId: string, task: string): Promise<string | null> {
  const { data, error } = await admin
    .from("team_targets").select("id")
    .eq("project_id", projectId).eq("task", task).is("removed_at", null)
    .order("created_at", { ascending: true }).limit(1);
  if (error || !data?.length) return null;
  return (data[0] as { id: string }).id;
}

// The writer's own target for this kind: one they OWN whose task name contains
// the kind word but not "upload" (that is the uploader's job, not producing).
async function findWriterTarget(admin: SupabaseClient, projectId: string, writerId: string, kind: ContentKind): Promise<string | null> {
  const kw = WRITER_KEYWORD[kind];
  if (!kw) return null;
  const { data, error } = await admin
    .from("team_targets").select("id, task")
    .eq("project_id", projectId).eq("owner_id", writerId).is("removed_at", null);
  if (error || !data?.length) return null;
  const cands = (data as { id: string; task: string }[])
    .filter((t) => t.task.toLowerCase().includes(kw) && !t.task.toLowerCase().includes("upload"))
    .sort((a, b) => a.task.length - b.task.length);
  return cands[0]?.id ?? null;
}

// Insert one verified own-site log. Returns true only when a NEW row was written
// (a duplicate, caught by the unique index, returns false).
async function insertLog(
  admin: SupabaseClient,
  args: { projectId: string; targetId: string; link: string; reportedBy: string | null; now: Date },
): Promise<boolean> {
  const key = linkKey(args.link);
  if (!key) return false;
  const { error } = await admin.from("team_target_logs").insert({
    project_id: args.projectId,
    target_id: args.targetId,
    log_date: todayIst(args.now),
    link: args.link,
    link_key: key,
    quantity: 1,
    verification_kind: "own_site",
    verification_status: "ai_verified",
    verification_reason: "Confirmed live in the sitemap.",
    checked_at: args.now.toISOString(),
    reported_by: args.reportedBy,
  });
  return !error;
}

interface ItemRow {
  id: string; cluster_id: string | null; url_slug: string | null; published_url: string | null;
  content_kind: ContentKind | null; content_type: string | null; writer_id: string | null;
}

/**
 * Credit every planned item that is live in `urlList` to the writer and Dinesh.
 * Returns how many NEW logs were written (deduped), for logging/verification.
 */
export async function creditLiveContentToTargets(
  admin: SupabaseClient, projectId: string, urlList: string[], now: Date = new Date(),
): Promise<{ writer: number; uploader: number; liveItems: number }> {
  const index = buildSitemapIndex(urlList ?? []);
  if (index.size === 0) return { writer: 0, uploader: 0, liveItems: 0 };

  const { data: clustersData } = await admin.from("topic_clusters").select("id, kind").eq("project_id", projectId);
  const clusterKind = new Map((clustersData as { id: string; kind?: string | null }[] ?? []).map((c) => [c.id, c.kind ?? "blog"]));

  const { data: itemsData, error } = await admin
    .from("topic_cluster_items")
    .select("id, cluster_id, url_slug, published_url, content_kind, content_type, writer_id")
    .eq("project_id", projectId).limit(5000);
  if (error || !itemsData) return { writer: 0, uploader: 0, liveItems: 0 };
  const items = itemsData as ItemRow[];

  let writer = 0, uploader = 0, liveItems = 0;
  for (const it of items) {
    const recorded = toExternalUrl(it.published_url ?? undefined);
    const liveUrl = (recorded && resolveSitemapUrl(index, recorded))
      || (it.url_slug && resolveSitemapUrl(index, it.url_slug)) || null;
    if (!liveUrl) continue;
    liveItems++;

    // Effective kind: the per-post override, else inferred from the content type,
    // else the cluster's kind.
    const kind: ContentKind = it.content_kind
      ?? (it.content_type ? classifyContentType(it.content_type) : (clusterKind.get(it.cluster_id ?? "") === "guide" ? "guide" : "blog"));
    const isGuide = kind === "guide";

    const uploadTarget = await findTargetByTask(admin, projectId, uploadTargetTask(isGuide));
    if (uploadTarget && await insertLog(admin, { projectId, targetId: uploadTarget, link: liveUrl, reportedBy: null, now })) uploader++;

    if (it.writer_id) {
      const wt = await findWriterTarget(admin, projectId, it.writer_id, kind);
      if (wt && await insertLog(admin, { projectId, targetId: wt, link: liveUrl, reportedBy: it.writer_id, now })) writer++;
    }
  }
  return { writer, uploader, liveItems };
}
