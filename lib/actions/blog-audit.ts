"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { BlogAuditStatus } from "@/lib/data/blog-audit";

/**
 * Mark a single audit row's status (todo / in_progress / done / skipped).
 * SEO lead works the dashboard — when they execute the merge/prune/refresh,
 * they bump the status here. action_taken_at is auto-stamped on done/skipped.
 */
export async function updateBlogAuditStatus(
  rowId: string,
  status: BlogAuditStatus,
  actionNotes?: string
) {
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "done" || status === "skipped") {
    patch.action_taken_at = new Date().toISOString();
  } else {
    patch.action_taken_at = null;
  }
  if (actionNotes !== undefined) patch.action_notes = actionNotes;
  const { error } = await supabase.from("blog_audit").update(patch).eq("id", rowId);
  if (error) throw error;
  revalidatePath("/dashboard/blog-audit");
}

/** Manually override the merge target for a row (when the auto-detected target isn't right). */
export async function updateBlogAuditMergeTarget(rowId: string, targetUrl: string | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("blog_audit")
    .update({ merge_target_url: targetUrl, merge_target_score: null })
    .eq("id", rowId);
  if (error) throw error;
  revalidatePath("/dashboard/blog-audit");
}
