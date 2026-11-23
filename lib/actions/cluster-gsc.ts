"use server";

// Blog Clusters - GSC queries: actions behind the cluster page's GSC section
// (refresh, edit a query, apply all, add a suggested post, set the hub page).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isMissingTable } from "@/lib/team-targets/db";
import { refreshClusterGscQueries, rebuildClusterPostPlans, GSC_MIGRATION } from "@/lib/blog-clusters/gsc-refresh";
import { slugify, titleFromQuery } from "@/lib/blog-clusters/query-match";

const MIGRATION_ERROR = `Apply migration ${GSC_MIGRATION} in Supabase first.`;

async function authed() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

const ClusterInput = z.object({ project_id: z.string().uuid(), cluster_id: z.string().uuid() });

export interface RefreshActionResult {
  ok: boolean;
  error?: string;
  fetched?: number;
  added?: number;
  assigned?: number;
  ai?: "ok" | "fallback" | "skipped";
  aiError?: string | null;
}

/** GC-2/GC-3: pull the cluster's GSC queries and assign the new ones. Runs on Vercel (GSC 403s locally). */
export async function refreshClusterGsc(input: z.infer<typeof ClusterInput>): Promise<RefreshActionResult> {
  const parsed = ClusterInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid cluster." };
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: project } = await supabase.from("projects").select("gsc_property_url").eq("id", parsed.data.project_id).maybeSingle();
  const res = await refreshClusterGscQueries(supabase, {
    projectId: parsed.data.project_id,
    clusterId: parsed.data.cluster_id,
    siteUrl: (project as { gsc_property_url: string | null } | null)?.gsc_property_url ?? null,
  });
  revalidatePath(`/dashboard/blog-clusters/${parsed.data.cluster_id}`);
  return res;
}

const UpdateQueryInput = z.object({
  project_id: z.string().uuid(),
  id: z.string().uuid(),
  action: z.enum(["unassigned", "assign", "hub", "update_existing", "new_post", "ignore"]).optional(),
  item_id: z.string().uuid().nullable().optional(),
  usage: z.enum(["h2", "faq", "body"]).nullable().optional(),
  anchors: z.array(z.string().trim().min(1).max(120)).max(5).optional(),
  status: z.enum(["suggested", "accepted", "rejected"]).optional(),
});

/** GC-4: edit one query by hand. Marks it manual so refreshes never overwrite it. */
export async function updateClusterGscQuery(input: z.infer<typeof UpdateQueryInput>): Promise<{ ok: boolean; error?: string }> {
  const parsed = UpdateQueryInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid change." };
  const { project_id, id, ...rest } = parsed.data;
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not authenticated." };

  const patch: Record<string, unknown> = { assigned_by: "manual" };
  if (rest.action !== undefined) {
    patch.action = rest.action;
    if (rest.action !== "assign") patch.item_id = null;
    if (rest.action !== "assign" && rest.action !== "hub") patch.usage = null;
  }
  if (rest.item_id !== undefined) patch.item_id = rest.item_id;
  if (rest.usage !== undefined) patch.usage = rest.usage;
  if (rest.anchors !== undefined) patch.anchors = rest.anchors;
  if (rest.status !== undefined) patch.status = rest.status;
  // Choosing a post implies "use it in a post".
  if (rest.item_id) patch.action = "assign";

  const { data, error } = await supabase.from("topic_cluster_gsc_queries")
    .update(patch).eq("id", id).eq("project_id", project_id).select("cluster_id, status");
  if (error) return { ok: false, error: isMissingTable(error) ? MIGRATION_ERROR : error.message };
  const row = (data as { cluster_id: string; status: string }[] | null)?.[0];
  // An edit to an already-accepted query changes what's written into the posts.
  if (row?.status === "accepted" || rest.status !== undefined) {
    await rebuildClusterPostPlans(supabase, { projectId: project_id, clusterId: row?.cluster_id ?? "" });
  }
  if (row) revalidatePath(`/dashboard/blog-clusters/${row.cluster_id}`);
  return { ok: true };
}

/** GC-5: accept every suggestion and write queries + anchors into each post. */
export async function applyAllClusterSuggestions(input: z.infer<typeof ClusterInput>): Promise<{ ok: boolean; error?: string; accepted?: number; posts?: number }> {
  const parsed = ClusterInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid cluster." };
  const { project_id, cluster_id } = parsed.data;
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data, error } = await supabase.from("topic_cluster_gsc_queries")
    .update({ status: "accepted" })
    .eq("cluster_id", cluster_id).eq("project_id", project_id).eq("status", "suggested")
    .in("action", ["assign", "hub", "update_existing"])
    .select("id");
  if (error) return { ok: false, error: isMissingTable(error) ? MIGRATION_ERROR : error.message };

  const rebuilt = await rebuildClusterPostPlans(supabase, { projectId: project_id, clusterId: cluster_id });
  if (!rebuilt.ok) return { ok: false, error: rebuilt.error };
  revalidatePath(`/dashboard/blog-clusters/${cluster_id}`);
  return { ok: true, accepted: (data ?? []).length, posts: rebuilt.posts };
}

const QueryRef = z.object({ project_id: z.string().uuid(), query_id: z.string().uuid() });

/** GC-6: turn a "new post" suggestion into a planned post in the cluster, in one click. */
export async function createPostFromGscQuery(input: z.infer<typeof QueryRef>): Promise<{ ok: boolean; error?: string; itemId?: string }> {
  const parsed = QueryRef.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid query." };
  const { project_id, query_id } = parsed.data;
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: q, error: qErr } = await supabase.from("topic_cluster_gsc_queries")
    .select("id, cluster_id, query, impressions").eq("id", query_id).eq("project_id", project_id).maybeSingle();
  if (qErr) return { ok: false, error: isMissingTable(qErr) ? MIGRATION_ERROR : qErr.message };
  if (!q) return { ok: false, error: "Query not found." };
  const row = q as { id: string; cluster_id: string; query: string; impressions: number };

  const { data: posRows } = await supabase.from("topic_cluster_items").select("position")
    .eq("cluster_id", row.cluster_id).order("position", { ascending: false }).limit(1);
  const nextPos = (((posRows as { position: number }[] | null)?.[0]?.position) ?? 0) + 1;

  const { data: created, error: insErr } = await supabase.from("topic_cluster_items").insert({
    cluster_id: row.cluster_id,
    project_id,
    position: nextPos,
    title: titleFromQuery(row.query),
    target_keyword: row.query,
    url_slug: slugify(row.query),
    reason: `Suggested from Search Console: ${row.impressions.toLocaleString()} impressions in 90 days and no post covered it.`,
  }).select("id").single();
  if (insErr || !created) return { ok: false, error: insErr?.message ?? "Could not create the post." };
  const itemId = (created as { id: string }).id;

  await supabase.from("topic_cluster_gsc_queries")
    .update({ action: "assign", item_id: itemId, usage: "body", status: "accepted", assigned_by: "manual", anchors: [row.query] })
    .eq("id", row.id);
  await rebuildClusterPostPlans(supabase, { projectId: project_id, clusterId: row.cluster_id });

  revalidatePath(`/dashboard/blog-clusters/${row.cluster_id}`);
  revalidatePath("/dashboard/blog-clusters");
  return { ok: true, itemId };
}

const HubInput = z.object({
  project_id: z.string().uuid(),
  cluster_id: z.string().uuid(),
  hub_slug: z.string().trim().max(300).nullable(),
  hub_keyword: z.string().trim().max(200).nullable(),
});

/** Set the cluster's hub page (URL/slug + primary keyword) used for interlinking. */
export async function setClusterHub(input: z.infer<typeof HubInput>): Promise<{ ok: boolean; error?: string }> {
  const parsed = HubInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid hub page." };
  const { project_id, cluster_id, hub_slug, hub_keyword } = parsed.data;
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { error } = await supabase.from("topic_clusters")
    .update({ pillar_slug: hub_slug || null, pillar_primary_keyword: hub_keyword || null })
    .eq("id", cluster_id).eq("project_id", project_id);
  if (error) return { ok: false, error: error.message };
  // The hub changes every post's anchor plan.
  await rebuildClusterPostPlans(supabase, { projectId: project_id, clusterId: cluster_id }).catch(() => null);
  revalidatePath(`/dashboard/blog-clusters/${cluster_id}`);
  return { ok: true };
}
