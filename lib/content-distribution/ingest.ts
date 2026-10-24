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

// ---- Batched ingest (for the daily cron) ---------------------------------
// Same result as calling ingestDetectedPost per post, but it reads existing
// state ONCE and inserts in one batch each, so a whole day's pull across every
// platform stays well under the serverless time budget.

export interface BatchPost {
  websiteDomain: string;
  ownerId: string | null;
  target: TargetSpec;
  url: string;
  title: string;
  publishedDate: string | null;
}

export async function ingestDetectedPostsBatch(
  admin: SupabaseClient, projectId: string, posts: BatchPost[], now: Date = new Date(),
): Promise<{ submissionNew: boolean; creditNew: boolean }[]> {
  const today = todayIst(now);
  if (!posts.length) return [];

  // Websites: fetch the ones we need, create any missing (only a handful).
  const domains = [...new Set(posts.map((p) => p.websiteDomain))];
  const domainToId = new Map<string, string>();
  const { data: ws } = await admin.from("backlink_websites").select("id, domain").eq("project_id", projectId).in("domain", domains);
  for (const w of (ws as { id: string; domain: string }[] | null) ?? []) domainToId.set(w.domain, w.id);
  for (const d of domains) {
    if (domainToId.has(d)) continue;
    const { data: c } = await admin.from("backlink_websites").insert({ project_id: projectId, domain: d, created_by: null }).select("id").single();
    if (c) domainToId.set(d, (c as { id: string }).id);
  }

  // Existing state, one read each.
  const { data: subRows } = await admin.from("backlink_submissions").select("submission_url").eq("project_id", projectId).limit(20000);
  const existingSubKeys = new Set<string>();
  for (const s of (subRows as { submission_url: string }[] | null) ?? []) { const k = linkKey(s.submission_url); if (k) existingSubKeys.add(k); }

  const { data: logRows } = await admin.from("team_target_logs").select("target_id, link_key").eq("project_id", projectId).not("link_key", "is", null).limit(50000);
  const existingLogKeys = new Set<string>();
  for (const l of (logRows as { target_id: string; link_key: string }[] | null) ?? []) existingLogKeys.add(`${l.target_id}|${l.link_key}`);

  const { data: tgRows } = await admin.from("team_targets").select("id, task, owner_id").eq("project_id", projectId).is("removed_at", null);
  const targets = (tgRows as { id: string; task: string; owner_id: string | null }[] | null) ?? [];
  const targetCache = new Map<string, string | null>();
  const resolve = (ownerId: string | null, spec: TargetSpec): string | null => {
    const cacheKey = spec.type === "task" ? `task:${spec.task}` : `kw:${ownerId}:${spec.keyword}`;
    if (targetCache.has(cacheKey)) return targetCache.get(cacheKey)!;
    let id: string | null;
    if (spec.type === "task") id = targets.find((t) => t.task === spec.task)?.id ?? null;
    else if (!ownerId) id = null;
    else id = targets.filter((t) => t.owner_id === ownerId && t.task.toLowerCase().includes(spec.keyword) && !t.task.toLowerCase().includes("upload"))
      .sort((a, b) => a.task.length - b.task.length)[0]?.id ?? null;
    targetCache.set(cacheKey, id);
    return id;
  };

  const subInserts: Record<string, unknown>[] = [];
  const logInserts: Record<string, unknown>[] = [];
  const batchSub = new Set<string>();
  const batchLog = new Set<string>();

  const results = posts.map((p) => {
    const key = linkKey(p.url);
    const storedUrl = normalizeStoredUrl(p.url) ?? p.url;
    const date = p.publishedDate && p.publishedDate <= today ? p.publishedDate : today;
    const websiteId = domainToId.get(p.websiteDomain);
    let submissionNew = false, creditNew = false;

    if (websiteId && key && !existingSubKeys.has(key) && !batchSub.has(key)) {
      batchSub.add(key);
      subInserts.push({
        website_id: websiteId, project_id: projectId, submission_date: date, submission_url: storedUrl,
        blog_post_url: null, blog_post_label: p.title || "—", topic_name: p.title || null, assigned_to: p.ownerId,
        verification_status: "verified", verification_note: "Auto-detected live from the platform feed.",
        verified_at: now.toISOString(), created_by: null,
      });
      submissionNew = true;
    }
    if (key) {
      const targetId = resolve(p.ownerId, p.target);
      const lk = targetId ? `${targetId}|${key}` : null;
      if (targetId && lk && !existingLogKeys.has(lk) && !batchLog.has(lk)) {
        batchLog.add(lk);
        logInserts.push({
          project_id: projectId, target_id: targetId, log_date: date, link: storedUrl, link_key: key, quantity: 1,
          verification_kind: "own_site", verification_status: "ai_verified",
          verification_reason: `Auto-detected live on ${p.websiteDomain}.`, checked_at: now.toISOString(), reported_by: p.ownerId,
        });
        creditNew = true;
      }
    }
    return { submissionNew, creditNew };
  });

  // In-memory dedup against existing + within-batch means these batches are
  // clean, so one insert each. Best-effort: a failure self-heals next run.
  try { if (subInserts.length) await admin.from("backlink_submissions").insert(subInserts); } catch { /* best-effort */ }
  try { if (logInserts.length) await admin.from("team_target_logs").insert(logInserts); } catch { /* best-effort */ }
  return results;
}
