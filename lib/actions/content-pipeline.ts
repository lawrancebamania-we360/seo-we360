"use server";

// Content pipeline: the two writes on a planned blog/guide beyond planning -
// a writer attaching the artifact they produced, and whoever uploads it to the
// site recording the live URL. Both go through the signed-in client, so RLS
// (has_project_access on topic_cluster_items) decides who may touch a row; the
// update is also scoped by project_id as a second guard.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toExternalUrl } from "@/lib/url";
import { isMissingColumn } from "@/lib/ai-citation/run-state";

const MIGRATION_NOTICE =
  "This needs a one-time database update first. Apply the 20261019000003 migration in Supabase, then try again.";

type Result = { ok: boolean; error?: string };

async function loadItem(item_id: string): Promise<{ projectId: string; clusterId: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("topic_cluster_items").select("project_id, cluster_id").eq("id", item_id).maybeSingle();
  const row = data as { project_id: string; cluster_id: string } | null;
  return row ? { projectId: row.project_id, clusterId: row.cluster_id } : null;
}

const KINDS = ["blog", "guide", "listicle", "pillar"] as const;
const KindInput = z.object({
  project_id: z.string().uuid(),
  item_ids: z.array(z.string().uuid()).min(1).max(500),
  kind: z.enum(KINDS),
});

// Tag one or many planned items with their real kind (Blog / Guide / ...). The
// import's "Content type" column is an SEO-planning taxonomy, not blog-vs-guide,
// so the team sets this explicitly and it overrides the inferred kind. Bulk by
// passing several item_ids; the cluster table selects rows and sets them at once.
export async function setClusterItemsKind(input: z.infer<typeof KindInput>): Promise<Result & { updated?: number }> {
  const parsed = KindInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick a type and at least one item." };
  const { project_id, item_ids, kind } = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data, error } = await supabase
    .from("topic_cluster_items").update({ content_kind: kind })
    .eq("project_id", project_id).in("id", item_ids).select("id, cluster_id");
  if (error) return { ok: false, error: isMissingColumn(error.message) ? MIGRATION_NOTICE : "Could not set the type." };

  const rows = (data ?? []) as { id: string; cluster_id: string }[];
  for (const c of new Set(rows.map((r) => r.cluster_id))) revalidatePath(`/dashboard/blog-clusters/${c}`);
  revalidatePath("/dashboard/to-publish");
  return { ok: true, updated: rows.length };
}

const ArtifactInput = z.object({
  item_id: z.string().uuid(),
  artifact_url: z.string().trim().max(2000).optional(),
  drive_url: z.string().trim().max(2000).optional(),
});

// A writer records what they produced: the draft/doc link and a Google Drive
// link for the images. Either can be set or cleared; a non-empty value that
// isn't a web address is refused rather than stored as a "link".
export async function setClusterItemArtifact(input: z.infer<typeof ArtifactInput>): Promise<Result> {
  const parsed = ArtifactInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Those details aren't valid." };
  const { item_id, artifact_url, drive_url } = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  let artifact: string | null = null;
  if (artifact_url && artifact_url.trim()) {
    artifact = toExternalUrl(artifact_url) ?? null;
    if (!artifact) return { ok: false, error: "That draft link doesn't look like a web address." };
  }
  let drive: string | null = null;
  if (drive_url && drive_url.trim()) {
    drive = toExternalUrl(drive_url) ?? null;
    if (!drive) return { ok: false, error: "That Google Drive link doesn't look like a web address." };
  }
  if (!artifact && !drive) return { ok: false, error: "Add a draft link or a Google Drive link." };

  const item = await loadItem(item_id);
  if (!item) return { ok: false, error: "That item wasn't found." };

  const { error } = await supabase
    .from("topic_cluster_items")
    .update({ artifact_url: artifact, artifact_drive_url: drive })
    .eq("id", item_id).eq("project_id", item.projectId);
  if (error) return { ok: false, error: isMissingColumn(error.message) ? MIGRATION_NOTICE : "Could not save that artifact." };

  revalidatePath(`/dashboard/blog-clusters/${item.clusterId}`);
  revalidatePath("/dashboard/to-publish");
  return { ok: true };
}

const PublishInput = z.object({
  item_id: z.string().uuid(),
  published_url: z.string().trim().min(1).max(2000),
});

// Whoever uploads the page to the site records the live URL. Open to any team
// member (Dinesh is a member). The daily sitemap snapshot then flips it from
// "pending" to "Live" on its own - nothing to click.
export async function markClusterItemPublished(input: z.infer<typeof PublishInput>): Promise<Result> {
  const parsed = PublishInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter the live page URL." };
  const { item_id, published_url } = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const url = toExternalUrl(published_url);
  if (!url) return { ok: false, error: "That doesn't look like a live page URL." };

  const item = await loadItem(item_id);
  if (!item) return { ok: false, error: "That item wasn't found." };

  const { error } = await supabase
    .from("topic_cluster_items")
    .update({ published_url: url, published_at: new Date().toISOString(), published_by: user.id })
    .eq("id", item_id).eq("project_id", item.projectId);
  if (error) return { ok: false, error: isMissingColumn(error.message) ? MIGRATION_NOTICE : "Could not mark that published." };

  revalidatePath(`/dashboard/blog-clusters/${item.clusterId}`);
  revalidatePath("/dashboard/to-publish");
  return { ok: true };
}

const UnpublishInput = z.object({ item_id: z.string().uuid() });

// Undo a mistaken publish (wrong URL): clears the recorded URL so the item
// returns to the queue. Any team member, same as recording it.
export async function unpublishClusterItem(input: z.infer<typeof UnpublishInput>): Promise<Result> {
  const { item_id } = UnpublishInput.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const item = await loadItem(item_id);
  if (!item) return { ok: false, error: "That item wasn't found." };

  const { error } = await supabase
    .from("topic_cluster_items")
    .update({ published_url: null, published_at: null, published_by: null })
    .eq("id", item_id).eq("project_id", item.projectId);
  if (error) return { ok: false, error: isMissingColumn(error.message) ? MIGRATION_NOTICE : "Could not undo that." };

  revalidatePath(`/dashboard/blog-clusters/${item.clusterId}`);
  revalidatePath("/dashboard/to-publish");
  return { ok: true };
}
