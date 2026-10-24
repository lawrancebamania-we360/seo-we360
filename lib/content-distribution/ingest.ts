// Content distribution: record one detected post. Shared by the feed cron and
// the Claude-in-Chrome pulls, so both land identically:
//   1. find-or-create the Backlink-Submissions website,
//   2. add a VERIFIED submission (assigned to the owner) unless it's already there,
//   3. credit the mapped Team Target (deduped by the post URL).
// Everything is best-effort and idempotent: a duplicate post (same URL) adds
// nothing on a re-run.

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeStoredUrl, urlVariants } from "@/lib/url";
import { linkKey } from "@/lib/team-targets/parse";
import { todayIst } from "@/lib/team-targets/week";
import type { TargetSpec } from "@/lib/content-distribution/platforms";

export interface IngestInput {
  projectId: string;
  websiteDomain: string;
  ownerId: string | null;
  target: TargetSpec;
  url: string;
  title: string;
  publishedDate: string | null;  // YYYY-MM-DD
  now?: Date;
}
export interface IngestResult { submissionNew: boolean; creditNew: boolean }

async function findOrCreateWebsite(admin: SupabaseClient, projectId: string, domain: string): Promise<string | null> {
  const { data: existing } = await admin
    .from("backlink_websites").select("id").eq("project_id", projectId).eq("domain", domain).limit(1).maybeSingle();
  if (existing) return (existing as { id: string }).id;
  const { data: created, error } = await admin
    .from("backlink_websites").insert({ project_id: projectId, domain, created_by: null }).select("id").single();
  if (error || !created) return null;
  return (created as { id: string }).id;
}

async function resolveTarget(admin: SupabaseClient, projectId: string, ownerId: string | null, spec: TargetSpec): Promise<string | null> {
  if (spec.type === "task") {
    const { data } = await admin.from("team_targets").select("id")
      .eq("project_id", projectId).eq("task", spec.task).is("removed_at", null)
      .order("created_at", { ascending: true }).limit(1);
    return (data as { id: string }[] | null)?.[0]?.id ?? null;
  }
  if (!ownerId) return null;
  const { data } = await admin.from("team_targets").select("id, task")
    .eq("project_id", projectId).eq("owner_id", ownerId).is("removed_at", null);
  const cands = ((data as { id: string; task: string }[] | null) ?? [])
    .filter((t) => t.task.toLowerCase().includes(spec.keyword) && !t.task.toLowerCase().includes("upload"))
    .sort((a, b) => a.task.length - b.task.length);
  return cands[0]?.id ?? null;
}

export async function ingestDetectedPost(admin: SupabaseClient, input: IngestInput): Promise<IngestResult> {
  const now = input.now ?? new Date();
  const today = todayIst(now);
  const storedUrl = normalizeStoredUrl(input.url) ?? input.url;
  const key = linkKey(input.url);
  // Not after today - a feed's odd future date shouldn't land the credit in a period that hasn't started.
  const date = input.publishedDate && input.publishedDate <= today ? input.publishedDate : today;

  let submissionNew = false, creditNew = false;

  const websiteId = await findOrCreateWebsite(admin, input.projectId, input.websiteDomain);
  if (websiteId) {
    const { data: dup } = await admin
      .from("backlink_submissions").select("id")
      .eq("website_id", websiteId).in("submission_url", urlVariants(input.url)).limit(1).maybeSingle();
    if (!dup) {
      const { error } = await admin.from("backlink_submissions").insert({
        website_id: websiteId, project_id: input.projectId,
        submission_date: date, submission_url: storedUrl,
        blog_post_url: null, blog_post_label: input.title || "—",
        topic_name: input.title || null, assigned_to: input.ownerId,
        verification_status: "verified", verification_note: "Auto-detected live from the platform feed.",
        verified_at: now.toISOString(), created_by: null,
      });
      submissionNew = !error;
    }
  }

  if (key) {
    const targetId = await resolveTarget(admin, input.projectId, input.ownerId, input.target);
    if (targetId) {
      const { error } = await admin.from("team_target_logs").insert({
        project_id: input.projectId, target_id: targetId, log_date: date,
        link: storedUrl, link_key: key, quantity: 1,
        verification_kind: "own_site", verification_status: "ai_verified",
        verification_reason: `Auto-detected live on ${input.websiteDomain}.`,
        checked_at: now.toISOString(), reported_by: input.ownerId,
      });
      creditNew = !error;   // a duplicate (unique index) returns false
    }
  }

  return { submissionNew, creditNew };
}
