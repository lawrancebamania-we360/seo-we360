"use server";

// Team Targets: every write. The tables are read-only for signed-in users (see
// the migration), so these actions use the service role AFTER deciding who the
// caller is:
//   - add / edit / remove / import targets ........ admins
//   - report a week's number ...................... the target's owner, its
//                                                    co-owner, or an admin
//   - verify or send back a reported number ....... admins, but never for a
//                                                    number they reported
//                                                    themselves
// That last rule is what makes "verified" mean a second pair of eyes.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toExternalUrl } from "@/lib/url";
import { matchMember, parseTargetPaste, targetKey, type SkippedLine } from "@/lib/team-targets/parse";
import { isMissingTable, MIGRATION_NOTICE } from "@/lib/team-targets/db";
import { currentWeekStart, isMonday } from "@/lib/team-targets/week";
import type { TargetFrequency } from "@/lib/team-targets/types";

type Result = { ok: boolean; error?: string };
interface Actor { userId: string; isAdmin: boolean }

const PAGE = "/dashboard/team-targets";
const FREQUENCIES = ["daily", "weekly", "monthly"] as const;

// Input comes from the browser, so a bad value must come back as a sentence the
// person can act on, not as a thrown error that leaves their dialog hanging.
const ID = z.string().uuid("Something went wrong with that request. Refresh the page and try again.");
const firstIssue = (err: z.ZodError): string => err.issues[0]?.message || "Some of those details are not valid.";

// Signed in, allowed into this project, and is the person an admin? The service
// role below ignores RLS, so project access has to be checked here.
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

async function authorizeAdmin(projectId: string): Promise<{ actor: Actor } | { error: string }> {
  const r = await authorize(projectId);
  if ("error" in r) return r;
  return r.actor.isAdmin ? r : { error: "Only admins can do this." };
}

// Real, non-client team members: the only people a target can be owned by.
async function loadMembers(): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, name").neq("role", "client").order("name");
  return (data ?? []) as { id: string; name: string }[];
}

interface ExistingTarget { id: string; task: string; owner_id: string | null; removed_at: string | null }

async function loadExistingTargets(projectId: string): Promise<{ targets?: ExistingTarget[]; error?: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("team_targets").select("id, task, owner_id, removed_at").eq("project_id", projectId);
  if (error) return { error: isMissingTable(error) ? MIGRATION_NOTICE : "Could not read the existing targets." };
  return { targets: (data ?? []) as ExistingTarget[] };
}

function indexTargets(targets: ExistingTarget[]): Map<string, ExistingTarget> {
  const map = new Map<string, ExistingTarget>();
  for (const t of targets) if (t.owner_id) map.set(targetKey(t.task, t.owner_id), t);
  return map;
}

// ---- Import: parse and match only (step 1), then a separate commit (step 2) ----

const PreviewInput = z.object({
  project_id: ID,
  pasted_text: z.string().min(1, "Paste your rows first.").max(200_000, "That paste is too large. Import it in smaller batches."),
});

export interface PreviewTargetRow {
  tempId: string;
  task: string;
  ownerName: string;
  coOwnerName: string;
  target: number;
  frequency: TargetFrequency;
  /** The team member the pasted name matched, or null when the person must pick one. */
  ownerId: string | null;
  coOwnerId: string | null;
  /** True when the same task for the same owner already exists, so importing updates it. */
  exists: boolean;
}

export interface PreviewTeamTargetsResult {
  ok: boolean;
  error?: string;
  rows?: PreviewTargetRow[];
  skipped?: SkippedLine[];
}

export async function previewTeamTargetsImport(input: z.infer<typeof PreviewInput>): Promise<PreviewTeamTargetsResult> {
  const parsed = PreviewInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { project_id, pasted_text } = parsed.data;
  const auth = await authorizeAdmin(project_id);
  if ("error" in auth) return { ok: false, error: auth.error };

  const { rows, skipped } = parseTargetPaste(pasted_text);
  if (!rows.length) {
    return {
      ok: false,
      skipped,
      error: "No usable rows found. Each row needs a Task, an Owner, a whole-number Target and a Frequency (daily, weekly or monthly).",
    };
  }

  const existing = await loadExistingTargets(project_id);
  if (existing.error) return { ok: false, error: existing.error };
  const index = indexTargets(existing.targets ?? []);
  const members = await loadMembers();

  const preview = rows.map((r, i): PreviewTargetRow => {
    const ownerId = matchMember(r.ownerName, members);
    return {
      tempId: `row-${i}`,
      task: r.task,
      ownerName: r.ownerName,
      coOwnerName: r.coOwnerName,
      target: r.target,
      frequency: r.frequency,
      ownerId,
      coOwnerId: r.coOwnerName ? matchMember(r.coOwnerName, members) : null,
      exists: ownerId ? index.has(targetKey(r.task, ownerId)) : false,
    };
  });
  return { ok: true, rows: preview, skipped };
}

const TargetFields = {
  task: z.string().trim().min(1, "Give the task a name.").max(200, "The task name is too long (200 characters at most)."),
  owner_id: ID,
  co_owner_id: ID.nullable(),
  target: z.number().int("The target must be a whole number.").min(1, "The target must be at least 1.").max(1_000_000, "That target is too large."),
  frequency: z.enum(FREQUENCIES),
};

const CommitInput = z.object({
  project_id: ID,
  rows: z.array(z.object(TargetFields)).min(1, "There is nothing to import.").max(500, "Import at most 500 rows at a time."),
});

export interface CommitTeamTargetsResult {
  ok: boolean;
  error?: string;
  created?: number;
  updated?: number;
  restored?: number;
  skipped?: number;
}

export async function commitTeamTargetsImport(input: z.infer<typeof CommitInput>): Promise<CommitTeamTargetsResult> {
  const parsed = CommitInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { project_id, rows } = parsed.data;
  const auth = await authorizeAdmin(project_id);
  if ("error" in auth) return { ok: false, error: auth.error };

  const existing = await loadExistingTargets(project_id);
  if (existing.error) return { ok: false, error: existing.error };
  const index = indexTargets(existing.targets ?? []);
  const memberIds = new Set((await loadMembers()).map((m) => m.id));

  const admin = createAdminClient();
  let created = 0, updated = 0, restored = 0, skipped = 0;

  for (const row of rows) {
    // Ids come from the browser: only real team members may own a target.
    const coOwner = row.co_owner_id && row.co_owner_id !== row.owner_id ? row.co_owner_id : null;
    if (!memberIds.has(row.owner_id) || (coOwner && !memberIds.has(coOwner))) { skipped++; continue; }

    const key = targetKey(row.task, row.owner_id);
    const found = index.get(key);
    if (found) {
      const { error } = await admin.from("team_targets")
        .update({ target: row.target, frequency: row.frequency, co_owner_id: coOwner, removed_at: null, updated_at: new Date().toISOString() })
        .eq("id", found.id).eq("project_id", project_id);
      if (error) { skipped++; continue; }
      if (found.removed_at) { restored++; found.removed_at = null; } else updated++;
    } else {
      const { data, error } = await admin.from("team_targets")
        .insert({ project_id, task: row.task, owner_id: row.owner_id, co_owner_id: coOwner, target: row.target, frequency: row.frequency, created_by: auth.actor.userId })
        .select("id").single();
      if (error || !data) { skipped++; continue; }
      index.set(key, { id: (data as { id: string }).id, task: row.task, owner_id: row.owner_id, removed_at: null });
      created++;
    }
  }

  revalidatePath(PAGE);
  return { ok: true, created, updated, restored, skipped };
}

// ---- Add / edit / remove one target ------------------------------------

const SaveInput = z.object({
  project_id: ID,
  id: ID.optional(),
  ...TargetFields,
});

export async function saveTeamTarget(input: z.infer<typeof SaveInput>): Promise<Result> {
  const parsed = SaveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { project_id, id, task, owner_id, co_owner_id, target, frequency } = parsed.data;
  const auth = await authorizeAdmin(project_id);
  if ("error" in auth) return { ok: false, error: auth.error };

  const memberIds = new Set((await loadMembers()).map((m) => m.id));
  const coOwner = co_owner_id && co_owner_id !== owner_id ? co_owner_id : null;
  if (!memberIds.has(owner_id)) return { ok: false, error: "Pick an owner from the team." };
  if (coOwner && !memberIds.has(coOwner)) return { ok: false, error: "Pick a co-owner from the team, or leave it empty." };

  const existing = await loadExistingTargets(project_id);
  if (existing.error) return { ok: false, error: existing.error };
  const clash = indexTargets(existing.targets ?? []).get(targetKey(task, owner_id));
  const admin = createAdminClient();
  const now = new Date().toISOString();

  if (id) {
    if (clash && clash.id !== id && !clash.removed_at) return { ok: false, error: "That owner already has a target with this task name." };
    const { data, error } = await admin.from("team_targets")
      .update({ task, owner_id, co_owner_id: coOwner, target, frequency, updated_at: now })
      .eq("id", id).eq("project_id", project_id).select("id");
    if (error) return { ok: false, error: "Could not save that target." };
    if (!data?.length) return { ok: false, error: "That target was not found." };
  } else if (clash) {
    if (!clash.removed_at) return { ok: false, error: "That owner already has a target with this task name." };
    // Same task and owner as a removed one: bring it back with its history.
    const { error } = await admin.from("team_targets")
      .update({ co_owner_id: coOwner, target, frequency, removed_at: null, updated_at: now })
      .eq("id", clash.id).eq("project_id", project_id);
    if (error) return { ok: false, error: "Could not save that target." };
  } else {
    const { error } = await admin.from("team_targets")
      .insert({ project_id, task, owner_id, co_owner_id: coOwner, target, frequency, created_by: auth.actor.userId });
    if (error) return { ok: false, error: "Could not save that target." };
  }

  revalidatePath(PAGE);
  return { ok: true };
}

const RemoveInput = z.object({
  project_id: ID,
  target_id: ID,
});

// Hides the target. Every number reported against it stays in the database, and
// adding the same task for the same owner again brings it back.
export async function removeTeamTarget(input: z.infer<typeof RemoveInput>): Promise<Result> {
  const parsed = RemoveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { project_id, target_id } = parsed.data;
  const auth = await authorizeAdmin(project_id);
  if ("error" in auth) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const { data, error } = await admin.from("team_targets")
    .update({ removed_at: new Date().toISOString() }).eq("id", target_id).eq("project_id", project_id).select("id");
  if (error) return { ok: false, error: isMissingTable(error) ? MIGRATION_NOTICE : "Could not remove that target." };
  if (!data?.length) return { ok: false, error: "That target was not found." };

  revalidatePath(PAGE);
  return { ok: true };
}

// ---- Reporting a week's number -----------------------------------------

const ReportInput = z.object({
  project_id: ID,
  target_id: ID,
  week_start: z.string(),
  achieved: z.number("Enter the number you completed.").int("Enter a whole number.").min(0, "The number can't be negative.").max(1_000_000, "That number is too large."),
  note: z.string().trim().max(1000, "The note is too long (1000 characters at most).").optional(),
  proof_url: z.string().trim().max(2000, "The proof link is too long.").optional(),
});

export async function reportTeamTargetNumber(input: z.infer<typeof ReportInput>): Promise<Result> {
  const parsed = ReportInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { project_id, target_id, week_start, achieved, note, proof_url } = parsed.data;
  const auth = await authorize(project_id);
  if ("error" in auth) return { ok: false, error: auth.error };
  const { actor } = auth;

  if (!isMonday(week_start)) return { ok: false, error: "That is not a valid week." };
  if (week_start > currentWeekStart()) return { ok: false, error: "You can't report a week that hasn't started yet." };

  // Read with the signed-in client so project access applies a second time.
  const supabase = await createClient();
  const { data: target, error: targetErr } = await supabase
    .from("team_targets").select("id, owner_id, co_owner_id, removed_at")
    .eq("id", target_id).eq("project_id", project_id).maybeSingle();
  if (targetErr) return { ok: false, error: isMissingTable(targetErr) ? MIGRATION_NOTICE : "Could not read that target." };
  const t = target as { owner_id: string | null; co_owner_id: string | null; removed_at: string | null } | null;
  if (!t || t.removed_at) return { ok: false, error: "That target was not found." };

  const involved = actor.userId === t.owner_id || actor.userId === t.co_owner_id;
  if (!involved && !actor.isAdmin) return { ok: false, error: "Only the owner, the co-owner or an admin can report this number." };

  // toExternalUrl (not normalizeStoredUrl, which keeps whatever was typed) so
  // that text which isn't a web address is refused rather than stored as a "link".
  let proof: string | null = null;
  if (proof_url) {
    proof = toExternalUrl(proof_url) ?? null;
    if (!proof) return { ok: false, error: "That proof link doesn't look like a web address." };
  }

  // Re-reporting a week replaces the number and puts it back in the queue to be
  // verified: a verified figure must never silently change underneath its tick.
  const admin = createAdminClient();
  const { error } = await admin.from("team_target_entries").upsert(
    {
      target_id, project_id, week_start, achieved,
      note: note || null, proof_url: proof,
      status: "pending", reported_by: actor.userId, reported_at: new Date().toISOString(),
      reviewed_by: null, reviewed_at: null, review_note: null,
    },
    { onConflict: "target_id,week_start" },
  );
  if (error) return { ok: false, error: "Could not save that number." };

  revalidatePath(PAGE);
  return { ok: true };
}

// ---- Verifying ---------------------------------------------------------

const ReviewInput = z.object({
  project_id: ID,
  entry_id: ID,
  decision: z.enum(["verify", "send_back"]),
  note: z.string().trim().max(1000, "The note is too long (1000 characters at most).").optional(),
});

export async function reviewTeamTargetEntry(input: z.infer<typeof ReviewInput>): Promise<Result> {
  const parsed = ReviewInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { project_id, entry_id, decision, note } = parsed.data;
  const auth = await authorizeAdmin(project_id);
  if ("error" in auth) return { ok: false, error: auth.error };
  const { actor } = auth;

  if (decision === "send_back" && !note) return { ok: false, error: "Say what needs fixing so they know what to change." };

  const supabase = await createClient();
  const { data: entry, error: readErr } = await supabase
    .from("team_target_entries").select("id, status, reported_by")
    .eq("id", entry_id).eq("project_id", project_id).maybeSingle();
  if (readErr) return { ok: false, error: isMissingTable(readErr) ? MIGRATION_NOTICE : "Could not read that number." };
  const e = entry as { status: string; reported_by: string | null } | null;
  if (!e) return { ok: false, error: "That number was not found." };
  if (e.status !== "pending") return { ok: false, error: "That number has already been reviewed." };
  if (e.reported_by === actor.userId) return { ok: false, error: "You can't verify a number you reported yourself. Ask another admin." };

  const admin = createAdminClient();
  const { data, error } = await admin.from("team_target_entries")
    .update({
      status: decision === "verify" ? "verified" : "sent_back",
      reviewed_by: actor.userId,
      reviewed_at: new Date().toISOString(),
      review_note: decision === "send_back" ? note : null,
    })
    .eq("id", entry_id).eq("project_id", project_id).eq("status", "pending").select("id");
  if (error) return { ok: false, error: "Could not save that review." };
  if (!data?.length) return { ok: false, error: "That number changed while you were reviewing it. Refresh and look again." };

  revalidatePath(PAGE);
  return { ok: true };
}
