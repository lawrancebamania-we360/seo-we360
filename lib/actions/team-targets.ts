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
import { toExternalUrl, hostFromUrl } from "@/lib/url";
import { matchMember, parseTargetPaste, targetKey, parseLogPaste, linkKey, normalizeLogDate, type SkippedLine } from "@/lib/team-targets/parse";
import { isMissingTable, MIGRATION_NOTICE } from "@/lib/team-targets/db";
import { todayIst } from "@/lib/team-targets/week";
import type { TargetFrequency } from "@/lib/team-targets/types";

type Result = { ok: boolean; error?: string };
// isOwner = super_admin. Only the owner can hand-verify what the AI couldn't,
// since nearly everyone here is an admin and a second admin is not a real check.
interface Actor { userId: string; isAdmin: boolean; isOwner: boolean }

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
  return { actor: { userId: user.id, isAdmin: role === "admin" || role === "super_admin", isOwner: role === "super_admin" } };
}

async function authorizeAdmin(projectId: string): Promise<{ actor: Actor } | { error: string }> {
  const r = await authorize(projectId);
  if ("error" in r) return r;
  return r.actor.isAdmin ? r : { error: "Only admins can do this." };
}

async function authorizeOwner(projectId: string): Promise<{ actor: Actor } | { error: string }> {
  const r = await authorize(projectId);
  if ("error" in r) return r;
  return r.actor.isOwner ? r : { error: "Only the owner can do this." };
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

// ---- Logging an achievement (one by one, or bulk) ----------------------

interface TargetWrite { id: string; owner_id: string | null; co_owner_id: string | null; log_mode: "link" | "count"; removed_at: string | null }

function canLog(actor: Actor, t: TargetWrite): boolean {
  return actor.isAdmin || actor.userId === t.owner_id || actor.userId === t.co_owner_id;
}

// The targets a person may log against: their own (and co-owned); admins, all.
async function loadLoggableTargets(projectId: string, actor: Actor): Promise<{ id: string; task: string; owner_id: string | null; co_owner_id: string | null; log_mode: "link" | "count"; ownerName: string | null }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("team_targets").select("id, task, owner_id, co_owner_id, log_mode")
    .eq("project_id", projectId).is("removed_at", null).order("task");
  const rows = (data ?? []) as { id: string; task: string; owner_id: string | null; co_owner_id: string | null; log_mode: "link" | "count" }[];
  const mine = actor.isAdmin ? rows : rows.filter((r) => r.owner_id === actor.userId || r.co_owner_id === actor.userId);
  const ids = [...new Set(mine.map((r) => r.owner_id).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: profs } = await supabase.from("profiles").select("id, name").in("id", ids);
    for (const p of (profs ?? []) as { id: string; name: string }[]) names.set(p.id, p.name);
  }
  return mine.map((r) => ({ ...r, ownerName: r.owner_id ? names.get(r.owner_id) ?? null : null }));
}

const AddLogInput = z.object({
  project_id: ID,
  target_id: ID,
  log_date: z.string(),
  link: z.string().trim().max(2000, "That link is too long.").optional(),
  quantity: z.number().int("Enter a whole number.").min(1, "Enter at least 1.").max(1_000_000, "That number is too large.").optional(),
  note: z.string().trim().max(1000, "The note is too long (1000 characters at most).").optional(),
});

export interface AddLogResult { ok: boolean; error?: string; logId?: string; checkable?: boolean; duplicate?: boolean }

export async function addTeamTargetLog(input: z.infer<typeof AddLogInput>): Promise<AddLogResult> {
  const parsed = AddLogInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { project_id, target_id, log_date, link, quantity, note } = parsed.data;
  const auth = await authorize(project_id);
  if ("error" in auth) return { ok: false, error: auth.error };
  const { actor } = auth;

  const supabase = await createClient();
  const { data: tRow, error: tErr } = await supabase
    .from("team_targets").select("id, owner_id, co_owner_id, log_mode, removed_at")
    .eq("id", target_id).eq("project_id", project_id).maybeSingle();
  if (tErr) return { ok: false, error: isMissingTable(tErr) ? MIGRATION_NOTICE : "Could not read that target." };
  const t = tRow as TargetWrite | null;
  if (!t || t.removed_at) return { ok: false, error: "That target was not found." };
  if (!canLog(actor, t)) return { ok: false, error: "Only the owner, co-owner or an admin can log this." };

  const date = normalizeLogDate(log_date);
  if (!date) return { ok: false, error: "That date is not valid." };
  if (date > todayIst()) return { ok: false, error: "You can't log a date in the future." };

  let storedLink: string | null = null;
  let key: string | null = null;
  let qty = 1;
  let kind: "count" | null = null;

  if (t.log_mode === "count") {
    if (quantity == null) return { ok: false, error: "Enter how many you did." };
    qty = quantity;
    kind = "count"; // a number can't be AI-checked; the owner verifies it
    if (link) {
      storedLink = toExternalUrl(link) ?? null;
      if (!storedLink) return { ok: false, error: "That proof link doesn't look like a web address." };
      key = linkKey(link);
    }
  } else {
    if (!link) return { ok: false, error: "Paste the link to what you did." };
    storedLink = toExternalUrl(link) ?? null;
    if (!storedLink) return { ok: false, error: "That link doesn't look like a web address." };
    key = linkKey(link);
  }

  const admin = createAdminClient();
  if (key) {
    const { data: dup } = await admin.from("team_target_logs").select("id").eq("target_id", target_id).eq("link_key", key).maybeSingle();
    if (dup) return { ok: false, error: "That link is already logged for this target.", duplicate: true };
  }

  const { data: created, error } = await admin.from("team_target_logs").insert({
    target_id, project_id, log_date: date, link: storedLink, link_key: key, quantity: qty,
    note: note || null, verification_status: "pending", verification_kind: kind, reported_by: actor.userId,
  }).select("id").single();
  if (error || !created) return { ok: false, error: "Could not save that." };

  revalidatePath(PAGE);
  // A link target can be auto-checked; a count log waits for the owner.
  return { ok: true, logId: (created as { id: string }).id, checkable: t.log_mode === "link" };
}

// Bulk: parse + match to targets (step 1), then commit the reviewed rows (step 2).

const LogPreviewInput = z.object({
  project_id: ID,
  pasted_text: z.string().min(1, "Paste your rows first.").max(200_000, "That paste is too large."),
});

export interface PreviewLogRow { tempId: string; taskText: string; date: string; link: string; note: string; targetId: string | null }
export interface LogTargetOption { value: string; label: string }
export interface PreviewLogsResult { ok: boolean; error?: string; rows?: PreviewLogRow[]; options?: LogTargetOption[]; skipped?: SkippedLine[] }

export async function previewTeamLogsImport(input: z.infer<typeof LogPreviewInput>): Promise<PreviewLogsResult> {
  const parsed = LogPreviewInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { project_id, pasted_text } = parsed.data;
  const auth = await authorize(project_id);
  if ("error" in auth) return { ok: false, error: auth.error };

  const { rows, skipped } = parseLogPaste(pasted_text);
  if (!rows.length) return { ok: false, skipped, error: "No usable rows found. Each row needs a Task, a Date and a Link." };

  const targets = await loadLoggableTargets(project_id, auth.actor);
  const options: LogTargetOption[] = targets.map((t) => ({ value: t.id, label: t.ownerName ? `${t.task} - ${t.ownerName}` : t.task }));
  const byName = new Map<string, string[]>();
  for (const t of targets) { const k = t.task.trim().toLowerCase(); byName.set(k, [...(byName.get(k) ?? []), t.id]); }

  const preview = rows.map((r, i): PreviewLogRow => {
    const hits = byName.get(r.taskText.trim().toLowerCase()) ?? [];
    return { tempId: `log-${i}`, taskText: r.taskText, date: r.date, link: r.link, note: r.note, targetId: hits.length === 1 ? hits[0] : null };
  });
  return { ok: true, rows: preview, options, skipped };
}

const LogCommitInput = z.object({
  project_id: ID,
  rows: z.array(z.object({
    target_id: ID,
    log_date: z.string(),
    link: z.string().trim().min(1).max(2000),
    note: z.string().trim().max(1000).optional(),
  })).min(1, "There is nothing to import.").max(500, "Import at most 500 rows at a time."),
});

export interface CommitLogsResult { ok: boolean; error?: string; created?: number; skipped?: number; logIds?: string[] }

export async function commitTeamLogsImport(input: z.infer<typeof LogCommitInput>): Promise<CommitLogsResult> {
  const parsed = LogCommitInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { project_id, rows } = parsed.data;
  const auth = await authorize(project_id);
  if ("error" in auth) return { ok: false, error: auth.error };

  const loggable = await loadLoggableTargets(project_id, auth.actor);
  const byId = new Map(loggable.map((t) => [t.id, t]));
  const admin = createAdminClient();
  let created = 0, skipped = 0;
  const logIds: string[] = [];
  const seenKeys = new Set<string>();

  for (const row of rows) {
    const t = byId.get(row.target_id);
    if (!t) { skipped++; continue; }                   // not a target this person may log against
    const date = normalizeLogDate(row.log_date);
    const storedLink = toExternalUrl(row.link);
    const key = linkKey(row.link);
    if (!date || date > todayIst() || !storedLink || !key) { skipped++; continue; }
    if (seenKeys.has(`${row.target_id}|${key}`)) { skipped++; continue; }  // duplicate within this paste
    seenKeys.add(`${row.target_id}|${key}`);

    const { data: dup } = await admin.from("team_target_logs").select("id").eq("target_id", row.target_id).eq("link_key", key).maybeSingle();
    if (dup) { skipped++; continue; }

    const kind = t.log_mode === "count" ? "count" : null;
    const { data: ins, error } = await admin.from("team_target_logs").insert({
      target_id: row.target_id, project_id, log_date: date, link: storedLink, link_key: key, quantity: 1,
      note: row.note || null, verification_status: "pending", verification_kind: kind, reported_by: auth.actor.userId,
    }).select("id").single();
    if (error || !ins) { skipped++; continue; }
    created++;
    if (t.log_mode === "link") logIds.push((ins as { id: string }).id);  // these can be AI-checked
  }

  revalidatePath(PAGE);
  return { ok: true, created, skipped, logIds };
}

// ---- AI verification + owner manual verify -----------------------------

const LogIdInput = z.object({ project_id: ID, log_id: ID });

interface LogWithTarget {
  id: string; link: string | null; link_key: string | null; verification_status: string; reported_by: string | null;
  target: { owner_id: string | null; co_owner_id: string | null; log_mode: "link" | "count"; task: string } | null;
}

async function loadLog(projectId: string, logId: string): Promise<{ log?: LogWithTarget; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_target_logs")
    .select("id, link, link_key, verification_status, reported_by, target:team_targets(owner_id, co_owner_id, log_mode, task)")
    .eq("id", logId).eq("project_id", projectId).maybeSingle();
  if (error) return { error: isMissingTable(error) ? MIGRATION_NOTICE : "Could not read that log." };
  if (!data) return { error: "That log was not found." };
  return { log: data as unknown as LogWithTarget };
}

export interface VerifyLogResult { ok: boolean; error?: string; status?: string; reason?: string }

// Open the link and decide: our own site -> is the page live; a third-party site
// -> fetch it and let the platform LLM judge whether it is real and on-topic. A
// blocked/login-walled page is "unreachable" (couldn't check), never "not found".
export async function verifyTeamTargetLog(input: z.infer<typeof LogIdInput>): Promise<VerifyLogResult> {
  const parsed = LogIdInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { project_id, log_id } = parsed.data;
  const auth = await authorize(project_id);
  if ("error" in auth) return { ok: false, error: auth.error };

  const { log, error } = await loadLog(project_id, log_id);
  if (error) return { ok: false, error };
  const l = log!;
  if (!l.target) return { ok: false, error: "That target was not found." };
  if (!canLog(auth.actor, { id: "", owner_id: l.target.owner_id, co_owner_id: l.target.co_owner_id, log_mode: l.target.log_mode, removed_at: null }))
    return { ok: false, error: "Only the owner, co-owner or an admin can check this." };
  if (l.target.log_mode === "count" || !l.link) return { ok: false, error: "This one has no link to check. The owner verifies it by hand." };

  const task = l.target.task;
  const linkHost = hostFromUrl(l.link);
  let ownDomain = "";
  {
    const supabase = await createClient();
    const { data: proj } = await supabase.from("projects").select("domain").eq("id", project_id).maybeSingle();
    ownDomain = hostFromUrl((proj as { domain?: string } | null)?.domain ?? "");
  }
  const isOwn = !!ownDomain && (linkHost === ownDomain || linkHost.endsWith(`.${ownDomain}`));

  let status: VerifyLogResult["status"];
  let reason: string;
  let kind: "own_site" | "third_party";
  try {
    const { fetchPage } = await import("@/lib/seo-skills/fetch");
    const page = await fetchPage(l.link, 12000);
    if (isOwn) {
      kind = "own_site";
      if (page.statusCode >= 400) { status = "not_found"; reason = `The page returned HTTP ${page.statusCode}.`; }
      else { status = "ai_verified"; reason = "The page is live on our site."; }
    } else {
      kind = "third_party";
      if (page.statusCode >= 400) { status = "not_found"; reason = `The page returned HTTP ${page.statusCode}.`; }
      else {
        const body = page.$("body").text().replace(/\s+/g, " ").trim().slice(0, 6000);
        if (body.length < 200) {
          status = "unreachable";
          reason = "The page loaded but returned almost no readable text (likely a login wall or needs JavaScript). Check it by hand.";
        } else {
          const { callPlatformLLM } = await import("@/lib/ai/platform-llm");
          const result = await callPlatformLLM({
            model: "sonnet", jsonMode: true, maxTokens: 300,
            prompt: `Someone logged this live page as proof of the task "${task}". Below is the visible text scraped from it. Decide whether the page is a real published page that substantively relates to that task (not a 404, a parked page, or an unrelated page).\n\nReply with ONLY this JSON: {"real": boolean, "note": "one short sentence"}\n\nPage text:\n"""\n${body}\n"""`,
          });
          const parsedLlm = JSON.parse(result.text) as { real?: boolean; note?: string };
          status = parsedLlm.real ? "ai_verified" : "mismatch";
          reason = parsedLlm.note?.trim() || (parsedLlm.real ? "Confirmed by AI." : "The page does not appear to match this task.");
        }
      }
    }
  } catch (e) {
    kind = isOwn ? "own_site" : "third_party";
    status = "unreachable";
    reason = `Could not fetch the link (${e instanceof Error ? e.message : "unknown error"}). Check it by hand.`;
  }

  const admin = createAdminClient();
  await admin.from("team_target_logs")
    .update({ verification_status: status, verification_reason: reason, verification_kind: kind, checked_at: new Date().toISOString() })
    .eq("id", log_id).eq("project_id", project_id);

  revalidatePath(PAGE);
  return { ok: true, status, reason };
}

// The owner (super_admin) hand-verifies what the AI couldn't (count logs, or a
// link the AI couldn't reach) - never a log they reported themselves.
export async function ownerVerifyTeamTargetLog(input: z.infer<typeof LogIdInput>): Promise<Result> {
  const parsed = LogIdInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { project_id, log_id } = parsed.data;
  const auth = await authorizeOwner(project_id);
  if ("error" in auth) return { ok: false, error: auth.error };

  const { log, error } = await loadLog(project_id, log_id);
  if (error) return { ok: false, error };
  const l = log!;
  if (l.reported_by === auth.actor.userId) return { ok: false, error: "You can't verify something you logged yourself." };
  if (l.verification_status === "ai_verified" || l.verification_status === "owner_verified") return { ok: false, error: "This is already verified." };

  const admin = createAdminClient();
  await admin.from("team_target_logs")
    .update({ verification_status: "owner_verified", verified_by: auth.actor.userId, verified_at: new Date().toISOString() })
    .eq("id", log_id).eq("project_id", project_id);

  revalidatePath(PAGE);
  return { ok: true };
}

// Remove a miskeyed log (the person who logged it, or an admin).
export async function deleteTeamTargetLog(input: z.infer<typeof LogIdInput>): Promise<Result> {
  const parsed = LogIdInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { project_id, log_id } = parsed.data;
  const auth = await authorize(project_id);
  if ("error" in auth) return { ok: false, error: auth.error };

  const { log, error } = await loadLog(project_id, log_id);
  if (error) return { ok: false, error };
  if (log!.reported_by !== auth.actor.userId && !auth.actor.isAdmin) return { ok: false, error: "Only the person who logged it, or an admin, can remove it." };

  const admin = createAdminClient();
  await admin.from("team_target_logs").delete().eq("id", log_id).eq("project_id", project_id);
  revalidatePath(PAGE);
  return { ok: true };
}
