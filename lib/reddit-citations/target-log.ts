// Reddit Citations -> Team Targets bridge. Adding a citation feeds the row
// owner's "Reddit citations" target (5/month each for Namrata/Lokesh/Naveen);
// marking one published feeds Leena's "Publish Reddit citations" target
// (15/month); setting the month's keyword plan feeds the one keyword-plan target.
//
// A Reddit thread/comment is a THIRD-PARTY link, so logs go in as third_party /
// pending and are confirmed through the existing Team Targets verify flow (AI or
// owner) - a log only counts as done once verified, same as any other link log.
//
// Pulled out of the server action as a plain, client-injectable function so it
// can be exercised with a fake Supabase client. Everything is best-effort: a
// missing team_target_logs table, no matching target, a duplicate link, or any
// write error must never fail the citation write.

import type { SupabaseClient } from "@supabase/supabase-js";
import { linkKey } from "@/lib/team-targets/parse";
import { todayIst } from "@/lib/team-targets/week";

export const ADD_TASK = "Reddit citations";
export const PUBLISH_TASK = "Publish Reddit citations";
export const KEYWORD_PLAN_TASK = "Keyword plan to Leena (Reddit citations)";

// The matching target (id + its owner), or null if it isn't there (migration not
// applied, or no such target). Scoped to the project and task, removed excluded;
// an ownerId narrows to one person's target (contributors share the task name).
async function findTarget(
  admin: SupabaseClient, projectId: string, task: string, ownerId?: string | null,
): Promise<{ id: string; ownerId: string | null } | null> {
  let q = admin
    .from("team_targets").select("id, owner_id")
    .eq("project_id", projectId).eq("task", task).is("removed_at", null);
  if (ownerId) q = q.eq("owner_id", ownerId);
  const { data, error } = await q.order("created_at", { ascending: true }).limit(1);
  if (error || !data || !data.length) return null;
  const row = data[0] as { id: string; owner_id: string | null };
  return { id: row.id, ownerId: row.owner_id };
}

// link_key matches the team-targets logging exactly (normalized host+path), so
// the team_target_logs_link_uniq index dedupes a re-add or a hand-made log.
async function insertLog(
  admin: SupabaseClient,
  args: { projectId: string; targetId: string; link: string; reportedBy: string | null; now?: Date },
): Promise<void> {
  await admin.from("team_target_logs").insert({
    project_id: args.projectId,
    target_id: args.targetId,
    log_date: todayIst(args.now ?? new Date()),
    link: args.link,
    link_key: linkKey(args.link),
    quantity: 1,
    verification_kind: "third_party",
    verification_status: "pending",
    reported_by: args.reportedBy,
  });
}

async function deleteLog(
  admin: SupabaseClient, projectId: string, targetId: string, link: string,
): Promise<void> {
  const key = linkKey(link);
  if (!key) return;
  await admin.from("team_target_logs").delete()
    .eq("project_id", projectId).eq("target_id", targetId).eq("link_key", key);
}

// A contributor added a citation -> credit their own "Reddit citations" target.
export async function logCitationAdded(
  admin: SupabaseClient,
  args: { projectId: string; ownerId: string | null; redditLink: string | null; now?: Date },
): Promise<void> {
  try {
    if (!args.ownerId || !args.redditLink) return;
    const target = await findTarget(admin, args.projectId, ADD_TASK, args.ownerId);
    if (!target) return;
    await insertLog(admin, { projectId: args.projectId, targetId: target.id, link: args.redditLink, reportedBy: args.ownerId, now: args.now });
  } catch { /* best-effort */ }
}

// Reverse of the above: a citation was deleted or its link/owner changed.
export async function removeCitationAddedLog(
  admin: SupabaseClient,
  args: { projectId: string; ownerId: string | null; redditLink: string | null },
): Promise<void> {
  try {
    if (!args.ownerId || !args.redditLink) return;
    const target = await findTarget(admin, args.projectId, ADD_TASK, args.ownerId);
    if (!target) return;
    await deleteLog(admin, args.projectId, target.id, args.redditLink);
  } catch { /* best-effort */ }
}

// Leena (or an admin on her behalf) marked a citation published -> credit the
// "Publish Reddit citations" target, under its owner (Leena) whoever clicked.
export async function logCitationPublished(
  admin: SupabaseClient,
  args: { projectId: string; link: string | null; now?: Date },
): Promise<void> {
  try {
    if (!args.link) return;
    const target = await findTarget(admin, args.projectId, PUBLISH_TASK);
    if (!target) return;
    await insertLog(admin, { projectId: args.projectId, targetId: target.id, link: args.link, reportedBy: target.ownerId, now: args.now });
  } catch { /* best-effort */ }
}

export async function removeCitationPublishedLog(
  admin: SupabaseClient, args: { projectId: string; link: string | null },
): Promise<void> {
  try {
    if (!args.link) return;
    const target = await findTarget(admin, args.projectId, PUBLISH_TASK);
    if (!target) return;
    await deleteLog(admin, args.projectId, target.id, args.link);
  } catch { /* best-effort */ }
}

// The month's keyword plan was handed to Leena -> credit the keyword-plan target
// (its owner, e.g. Lawrance). The plan doc link is the log link.
export async function logKeywordPlan(
  admin: SupabaseClient, args: { projectId: string; planUrl: string | null; now?: Date },
): Promise<void> {
  try {
    if (!args.planUrl) return;
    const target = await findTarget(admin, args.projectId, KEYWORD_PLAN_TASK);
    if (!target) return;
    await insertLog(admin, { projectId: args.projectId, targetId: target.id, link: args.planUrl, reportedBy: target.ownerId, now: args.now });
  } catch { /* best-effort */ }
}
