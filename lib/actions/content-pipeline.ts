"use server";

// Content pipeline: the two writes on a planned blog/guide beyond planning -
// a writer attaching the artifact they produced, and whoever uploads it to the
// site recording the live URL. Both go through the signed-in client, so RLS
// (has_project_access on topic_cluster_items) decides who may touch a row; the
// update is also scoped by project_id as a second guard.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toExternalUrl } from "@/lib/url";
import { isMissingColumn } from "@/lib/ai-citation/run-state";
import { logPublishToTeamTarget, removePublishTargetLog } from "@/lib/content-pipeline/target-log";

const MIGRATION_NOTICE =
  "This needs a one-time database update first. Apply the 20261019000003 migration in Supabase, then try again.";

type Result = { ok: boolean; error?: string };

// content_type is an older column (migration 20260929110001), so this read is
// safe before 20261019000003 is applied - the publish/unpublish writes below
// are what surface the migration notice.
async function loadItem(item_id: string): Promise<{ projectId: string; clusterId: string; contentType: string | null } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("topic_cluster_items").select("project_id, cluster_id, content_type").eq("id", item_id).maybeSingle();
  const row = data as { project_id: string; cluster_id: string; content_type: string | null } | null;
  return row ? { projectId: row.project_id, clusterId: row.cluster_id, contentType: row.content_type } : null;
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

  // This upload IS Dinesh's "Upload Blogs/Guides to website" target work, so log
  // it there too. Best-effort: never let a target-log hiccup fail the publish.
  await logPublishToTeamTarget(createAdminClient(), {
    projectId: item.projectId, contentType: item.contentType, publishedUrl: url, reportedBy: user.id,
  });

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

  // The URL about to be cleared, read before the update so its auto-created
  // team-target log can be removed. Degrades to null before 20261019000003
  // (published_url missing) - there'd be nothing to unpublish in that case.
  let previousUrl: string | null = null;
  {
    const { data } = await supabase
      .from("topic_cluster_items").select("published_url").eq("id", item_id).maybeSingle();
    previousUrl = (data as { published_url?: string | null } | null)?.published_url ?? null;
  }

  const { error } = await supabase
    .from("topic_cluster_items")
    .update({ published_url: null, published_at: null, published_by: null })
    .eq("id", item_id).eq("project_id", item.projectId);
  if (error) return { ok: false, error: isMissingColumn(error.message) ? MIGRATION_NOTICE : "Could not undo that." };

  // Drop the log this publish created (best-effort), so the undo is symmetric.
  if (previousUrl) {
    await removePublishTargetLog(createAdminClient(), {
      projectId: item.projectId, contentType: item.contentType, publishedUrl: previousUrl,
    });
  }

  revalidatePath(`/dashboard/blog-clusters/${item.clusterId}`);
  revalidatePath("/dashboard/to-publish");
  return { ok: true };
}
