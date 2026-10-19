// Content pipeline -> Team Targets bridge. Dinesh's job is uploading finished
// blogs/guides to the site; he also has the Team Targets "Upload Blogs to
// website" (4/week) and "Upload Guides to website" (6/day) targets. When a
// planned item is marked published in the content pipeline, that IS the upload,
// so this logs it against the matching target automatically - he doesn't log the
// same page twice, and it rides the same daily sitemap verification as any other
// own-site link log.
//
// Pulled out of the server action as a plain, client-injectable function so it
// can be exercised with a fake Supabase client. Everything here is best-effort:
// a missing team_target_logs table, no such target, a duplicate link, or any
// write error must never fail the publish - the publish has already succeeded.

import type { SupabaseClient } from "@supabase/supabase-js";
import { linkKey } from "@/lib/team-targets/parse";
import { todayIst } from "@/lib/team-targets/week";

// The target a published page counts toward: a guide -> the Guides target;
// anything else -> the Blogs target. Blog-vs-guide is the content pipeline's own
// kind (the cluster's kind, or a per-post content_kind override) - the caller
// resolves it; this just maps to the task names preloaded in 20261019000002.
export function publishTargetTask(isGuide: boolean): string {
  return isGuide ? "Upload Guides to website" : "Upload Blogs to website";
}

// Dinesh's matching upload target in this project, or null if it isn't there
// (migration not applied, or an admin removed it). Scoped to the project and
// task, removed targets excluded; the migration gives this task to Dinesh only,
// so matching on task + project finds his row. Any read error -> null (skip).
async function findUploadTarget(
  admin: SupabaseClient,
  projectId: string,
  task: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("team_targets")
    .select("id")
    .eq("project_id", projectId)
    .eq("task", task)
    .is("removed_at", null)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error || !data || !data.length) return null;
  return (data[0] as { id: string }).id;
}

// Log a just-published page against the matching upload target. Called with the
// admin client (the logs table is RLS select-only; writes go through the service
// role after the caller is authorized, same as every other team-target write).
export async function logPublishToTeamTarget(
  admin: SupabaseClient,
  args: {
    projectId: string;
    isGuide: boolean;
    publishedUrl: string;
    reportedBy: string;
    now?: Date;
  },
): Promise<void> {
  try {
    const targetId = await findUploadTarget(admin, args.projectId, publishTargetTask(args.isGuide));
    if (!targetId) return;

    // link_key matches the team-targets logging exactly (normalized host+path),
    // so the team_target_logs_link_uniq index dedupes against a hand-made log of
    // the same page and against re-publishing the same URL.
    await admin.from("team_target_logs").insert({
      project_id: args.projectId,
      target_id: targetId,
      log_date: todayIst(args.now ?? new Date()),
      link: args.publishedUrl,
      link_key: linkKey(args.publishedUrl),
      quantity: 1,
      verification_kind: "own_site",
      verification_status: "pending",
      reported_by: args.reportedBy,
    });
    // A unique-index violation (already logged) or any other write error is
    // swallowed below - the publish stands regardless.
  } catch {
    // best-effort
  }
}

// Reverse of the above for undoing a publish: when the recorded URL is cleared,
// drop the auto-created log. Keyed exactly as it was written (target + link_key),
// so a hand-made log on the same target but a different page is left untouched.
export async function removePublishTargetLog(
  admin: SupabaseClient,
  args: {
    projectId: string;
    isGuide: boolean;
    publishedUrl: string;
  },
): Promise<void> {
  try {
    const key = linkKey(args.publishedUrl);
    if (!key) return;
    const targetId = await findUploadTarget(admin, args.projectId, publishTargetTask(args.isGuide));
    if (!targetId) return;

    await admin
      .from("team_target_logs")
      .delete()
      .eq("project_id", args.projectId)
      .eq("target_id", targetId)
      .eq("link_key", key);
  } catch {
    // best-effort
  }
}
