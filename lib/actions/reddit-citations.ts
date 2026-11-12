"use server";

// Reddit Citations: every write. Reddit/citation tables are read-only for
// signed-in users (RLS select only), so these actions use the service role AFTER
// deciding who the caller is - a project member may add/edit/publish citations;
// only admins create or remove a month. Adding or publishing a row feeds the
// matching Team Target through the best-effort bridge (never blocks the write).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toExternalUrl } from "@/lib/url";
import { linkKey } from "@/lib/team-targets/parse";
import { isMissingTable } from "@/lib/team-targets/db";
import { currentMonthKey } from "@/lib/data/reddit-citations";
import {
  logCitationAdded, removeCitationAddedLog, logCitationPublished, removeCitationPublishedLog, logKeywordPlan,
} from "@/lib/reddit-citations/target-log";

type Result = { ok: boolean; error?: string };
const PAGE = "/dashboard/reddit-citations";
const MIGRATION_NOTICE = "This needs a one-time database update first. Apply the 20261112000001 migration in Supabase, then try again.";
const ID = z.string().uuid();

interface Actor { userId: string; isAdmin: boolean }

async function authorize(projectId: string): Promise<{ actor: Actor } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };
  const { data: access } = await supabase.rpc("has_project_access", { p_project_id: projectId });
  if (access !== true) return { error: "You do not have access to this project." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (profile as { role?: string } | null)?.role;
  return { actor: { userId: user.id, isAdmin: role === "admin" || role === "super_admin" } };
}

// A cluster the caller can see (RLS), with its project; null when not found.
async function loadCluster(clusterId: string): Promise<{ projectId: string; clusterId: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reddit_citation_clusters").select("project_id").eq("id", clusterId).is("removed_at", null).maybeSingle();
  const row = data as { project_id: string } | null;
  return row ? { projectId: row.project_id, clusterId } : null;
}

interface ItemRow { project_id: string; cluster_id: string; owner_id: string | null; reddit_link: string | null; published: boolean; published_url: string | null }
async function loadItem(itemId: string): Promise<ItemRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reddit_citation_items")
    .select("project_id, cluster_id, owner_id, reddit_link, published, published_url")
    .eq("id", itemId).maybeSingle();
  return (data as ItemRow | null) ?? null;
}

// ---- Month clusters (admin) ----------------------------------------------

const CreateInput = z.object({
  project_id: ID,
  month_key: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  title: z.string().trim().max(120).optional(),
});

export async function createRedditCluster(input: z.infer<typeof CreateInput>): Promise<Result & { clusterId?: string }> {
  const parsed = CreateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Those details aren't valid." };
  const { project_id, month_key, title } = parsed.data;
  const auth = await authorize(project_id);
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!auth.actor.isAdmin) return { ok: false, error: "Only admins can add a month." };

  const admin = createAdminClient();
  const { data, error } = await admin.from("reddit_citation_clusters")
    .insert({ project_id, month_key: month_key ?? currentMonthKey(), title: title || null, created_by: auth.actor.userId })
    .select("id").single();
  if (error) {
    if (isMissingTable(error)) return { ok: false, error: MIGRATION_NOTICE };
    if (error.code === "23505") return { ok: false, error: "That month already exists." };
    return { ok: false, error: "Could not add that month." };
  }
  revalidatePath(PAGE);
  return { ok: true, clusterId: (data as { id: string }).id };
}

const DeleteClusterInput = z.object({ cluster_id: ID });
export async function deleteRedditCluster(input: z.infer<typeof DeleteClusterInput>): Promise<Result> {
  const parsed = DeleteClusterInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const cluster = await loadCluster(parsed.data.cluster_id);
  if (!cluster) return { ok: false, error: "That month wasn't found." };
  const auth = await authorize(cluster.projectId);
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!auth.actor.isAdmin) return { ok: false, error: "Only admins can remove a month." };

  const admin = createAdminClient();
  const { error } = await admin.from("reddit_citation_clusters")
    .update({ removed_at: new Date().toISOString() }).eq("id", cluster.clusterId).eq("project_id", cluster.projectId);
  if (error) return { ok: false, error: "Could not remove that month." };
  revalidatePath(PAGE);
  return { ok: true };
}

const KeywordPlanInput = z.object({ cluster_id: ID, url: z.string().trim().max(2000).optional() });
export async function setClusterKeywordPlan(input: z.infer<typeof KeywordPlanInput>): Promise<Result> {
  const parsed = KeywordPlanInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const cluster = await loadCluster(parsed.data.cluster_id);
  if (!cluster) return { ok: false, error: "That month wasn't found." };
  const auth = await authorize(cluster.projectId);
  if ("error" in auth) return { ok: false, error: auth.error };

  let url: string | null = null;
  if (parsed.data.url && parsed.data.url.trim()) {
    url = toExternalUrl(parsed.data.url) ?? null;
    if (!url) return { ok: false, error: "That plan link doesn't look like a web address." };
  }
  const admin = createAdminClient();
  const { error } = await admin.from("reddit_citation_clusters")
    .update({ keyword_plan_url: url }).eq("id", cluster.clusterId).eq("project_id", cluster.projectId);
  if (error) return { ok: false, error: isMissingTable(error) ? MIGRATION_NOTICE : "Could not save that." };

  if (url) await logKeywordPlan(admin, { projectId: cluster.projectId, planUrl: url });
  revalidatePath(PAGE);
  revalidatePath(`${PAGE}/${cluster.clusterId}`);
  return { ok: true };
}

// ---- Citations (any member) ----------------------------------------------

const AddInput = z.object({
  cluster_id: ID,
  prompt: z.string().trim().min(1, "Enter the prompt.").max(500),
  source: z.string().trim().max(120).optional(),
  reddit_link: z.string().trim().max(2000).optional(),
  example: z.string().trim().max(8000).optional(),
  owner_id: ID.optional(),
});

export async function addRedditCitation(input: z.infer<typeof AddInput>): Promise<Result> {
  const parsed = AddInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const { cluster_id, prompt, source, reddit_link, example, owner_id } = parsed.data;
  const cluster = await loadCluster(cluster_id);
  if (!cluster) return { ok: false, error: "That month wasn't found." };
  const auth = await authorize(cluster.projectId);
  if ("error" in auth) return { ok: false, error: auth.error };

  let link: string | null = null;
  if (reddit_link && reddit_link.trim()) {
    link = toExternalUrl(reddit_link) ?? null;
    if (!link) return { ok: false, error: "That Reddit link doesn't look like a web address." };
  }
  const owner = owner_id ?? auth.actor.userId;

  const admin = createAdminClient();
  const { data: last } = await admin.from("reddit_citation_items")
    .select("position").eq("cluster_id", cluster_id).order("position", { ascending: false }).limit(1).maybeSingle();
  const position = ((last as { position?: number } | null)?.position ?? 0) + 1;

  const { error } = await admin.from("reddit_citation_items").insert({
    cluster_id, project_id: cluster.projectId, position, prompt,
    source: source || null, reddit_link: link, reddit_link_key: link ? linkKey(link) : null,
    example: example || null, owner_id: owner, added_by: auth.actor.userId,
  });
  if (error) return { ok: false, error: isMissingTable(error) ? MIGRATION_NOTICE : "Could not add that citation." };

  await logCitationAdded(admin, { projectId: cluster.projectId, ownerId: owner, redditLink: link });
  revalidatePath(`${PAGE}/${cluster_id}`);
  revalidatePath(PAGE);
  return { ok: true };
}

const UpdateInput = z.object({
  item_id: ID,
  prompt: z.string().trim().min(1).max(500),
  source: z.string().trim().max(120).optional(),
  reddit_link: z.string().trim().max(2000).optional(),
  example: z.string().trim().max(8000).optional(),
  owner_id: ID.optional(),
});

export async function updateRedditCitation(input: z.infer<typeof UpdateInput>): Promise<Result> {
  const parsed = UpdateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const { item_id, prompt, source, reddit_link, example, owner_id } = parsed.data;
  const item = await loadItem(item_id);
  if (!item) return { ok: false, error: "That citation wasn't found." };
  const auth = await authorize(item.project_id);
  if ("error" in auth) return { ok: false, error: auth.error };

  let link: string | null = null;
  if (reddit_link && reddit_link.trim()) {
    link = toExternalUrl(reddit_link) ?? null;
    if (!link) return { ok: false, error: "That Reddit link doesn't look like a web address." };
  }
  const owner = owner_id ?? item.owner_id;

  const admin = createAdminClient();
  const { error } = await admin.from("reddit_citation_items").update({
    prompt, source: source || null, reddit_link: link, reddit_link_key: link ? linkKey(link) : null,
    example: example || null, owner_id: owner,
  }).eq("id", item_id).eq("project_id", item.project_id);
  if (error) return { ok: false, error: "Could not save that citation." };

  // Keep the contributor log in step with the link/owner (best-effort).
  await removeCitationAddedLog(admin, { projectId: item.project_id, ownerId: item.owner_id, redditLink: item.reddit_link });
  await logCitationAdded(admin, { projectId: item.project_id, ownerId: owner, redditLink: link });
  revalidatePath(`${PAGE}/${item.cluster_id}`);
  return { ok: true };
}

const PublishInput = z.object({ item_id: ID, published: z.boolean(), published_url: z.string().trim().max(2000).optional() });

export async function setCitationPublished(input: z.infer<typeof PublishInput>): Promise<Result> {
  const parsed = PublishInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { item_id, published, published_url } = parsed.data;
  const item = await loadItem(item_id);
  if (!item) return { ok: false, error: "That citation wasn't found." };
  const auth = await authorize(item.project_id);
  if ("error" in auth) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  if (published) {
    let liveUrl: string | null = null;
    if (published_url && published_url.trim()) {
      liveUrl = toExternalUrl(published_url) ?? null;
      if (!liveUrl) return { ok: false, error: "That comment link doesn't look like a web address." };
    }
    const { error } = await admin.from("reddit_citation_items").update({
      published: true, published_url: liveUrl, published_at: new Date().toISOString(), published_by: auth.actor.userId,
    }).eq("id", item_id).eq("project_id", item.project_id);
    if (error) return { ok: false, error: "Could not mark that published." };
    await logCitationPublished(admin, { projectId: item.project_id, link: liveUrl ?? item.reddit_link });
  } else {
    const { error } = await admin.from("reddit_citation_items").update({
      published: false, published_url: null, published_at: null, published_by: null,
    }).eq("id", item_id).eq("project_id", item.project_id);
    if (error) return { ok: false, error: "Could not undo that." };
    await removeCitationPublishedLog(admin, { projectId: item.project_id, link: item.published_url ?? item.reddit_link });
  }
  revalidatePath(`${PAGE}/${item.cluster_id}`);
  revalidatePath(PAGE);
  return { ok: true };
}

const DeleteItemInput = z.object({ item_id: ID });
export async function deleteRedditCitation(input: z.infer<typeof DeleteItemInput>): Promise<Result> {
  const parsed = DeleteItemInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const item = await loadItem(parsed.data.item_id);
  if (!item) return { ok: false, error: "That citation wasn't found." };
  const auth = await authorize(item.project_id);
  if ("error" in auth) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const { error } = await admin.from("reddit_citation_items").delete().eq("id", parsed.data.item_id).eq("project_id", item.project_id);
  if (error) return { ok: false, error: "Could not remove that citation." };

  await removeCitationAddedLog(admin, { projectId: item.project_id, ownerId: item.owner_id, redditLink: item.reddit_link });
  if (item.published) await removeCitationPublishedLog(admin, { projectId: item.project_id, link: item.published_url ?? item.reddit_link });
  revalidatePath(`${PAGE}/${item.cluster_id}`);
  revalidatePath(PAGE);
  return { ok: true };
}
