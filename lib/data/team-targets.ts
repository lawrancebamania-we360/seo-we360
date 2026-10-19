// Team Targets: the board for one week. Targets come with the number reported
// for that week (if any); a monthly target also carries the month so far,
// since "5 per month" is judged over the month, not each week on its own.
//
// Read with the signed-in client, so RLS (has_project_access) decides what
// the person can see. Writes live in lib/actions/team-targets.ts.

import { createClient } from "@/lib/supabase/server";
import { isMissingTable } from "@/lib/team-targets/db";
import { expectedForWeek, monthKeyOfWeek } from "@/lib/team-targets/week";
import type { EntryStatus, TargetFrequency } from "@/lib/team-targets/types";

export interface TargetEntry {
  id: string;
  achieved: number;
  note: string | null;
  proofUrl: string | null;
  status: EntryStatus;
  reportedBy: string | null;
  reportedByName: string | null;
  reportedAt: string;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

export interface TargetRow {
  id: string;
  task: string;
  ownerId: string | null;
  ownerName: string | null;
  coOwnerId: string | null;
  coOwnerName: string | null;
  target: number;
  frequency: TargetFrequency;
  /** What this week should add up to; null for a monthly target. */
  expectedThisWeek: number | null;
  /** Monthly targets only: reported so far this month (sent-back numbers excluded). */
  monthSoFar: number | null;
  entry: TargetEntry | null;
}

export interface TeamTargetsBoard {
  /** False until the migration has been applied. */
  ready: boolean;
  weekStart: string;
  targets: TargetRow[];
}

interface TargetDb {
  id: string; task: string; owner_id: string | null; co_owner_id: string | null;
  target: number; frequency: TargetFrequency;
}
interface EntryDb {
  id: string; target_id: string; week_start: string; achieved: number; note: string | null; proof_url: string | null;
  status: EntryStatus; reported_by: string | null; reported_at: string;
  reviewed_by: string | null; reviewed_at: string | null; review_note: string | null;
}

export async function getTeamTargetsBoard(projectId: string, weekStart: string): Promise<TeamTargetsBoard> {
  const supabase = await createClient();

  const { data: targetsData, error } = await supabase
    .from("team_targets")
    .select("id, task, owner_id, co_owner_id, target, frequency")
    .eq("project_id", projectId)
    .is("removed_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    if (isMissingTable(error)) return { ready: false, weekStart, targets: [] };
    throw new Error(`Could not load team targets: ${error.message}`);
  }
  const targets = (targetsData ?? []) as TargetDb[];
  if (!targets.length) return { ready: true, weekStart, targets: [] };

  // This week's entries plus the earlier weeks of the same month (for monthly
  // goals). A week belongs to the month its Monday falls in.
  const monthStart = `${monthKeyOfWeek(weekStart)}-01`;
  const { data: entriesData } = await supabase
    .from("team_target_entries")
    .select("id, target_id, week_start, achieved, note, proof_url, status, reported_by, reported_at, reviewed_by, reviewed_at, review_note")
    .eq("project_id", projectId)
    .gte("week_start", monthStart)
    .lte("week_start", weekStart);
  const entries = (entriesData ?? []) as EntryDb[];

  const personIds = new Set<string>();
  for (const t of targets) { if (t.owner_id) personIds.add(t.owner_id); if (t.co_owner_id) personIds.add(t.co_owner_id); }
  for (const e of entries) { if (e.week_start === weekStart) { if (e.reported_by) personIds.add(e.reported_by); if (e.reviewed_by) personIds.add(e.reviewed_by); } }
  const names = new Map<string, string>();
  if (personIds.size) {
    const { data: profiles } = await supabase.from("profiles").select("id, name").in("id", [...personIds]);
    for (const p of (profiles ?? []) as { id: string; name: string }[]) names.set(p.id, p.name);
  }
  const nameOf = (id: string | null): string | null => (id ? (names.get(id) ?? null) : null);

  const thisWeek = new Map<string, EntryDb>();
  const monthSum = new Map<string, number>();
  for (const e of entries) {
    if (e.week_start === weekStart) thisWeek.set(e.target_id, e);
    if (e.status !== "sent_back" && monthKeyOfWeek(e.week_start) === monthKeyOfWeek(weekStart)) {
      monthSum.set(e.target_id, (monthSum.get(e.target_id) ?? 0) + e.achieved);
    }
  }

  const rows: TargetRow[] = targets.map((t) => {
    const e = thisWeek.get(t.id);
    return {
      id: t.id,
      task: t.task,
      ownerId: t.owner_id,
      ownerName: nameOf(t.owner_id),
      coOwnerId: t.co_owner_id,
      coOwnerName: nameOf(t.co_owner_id),
      target: t.target,
      frequency: t.frequency,
      expectedThisWeek: expectedForWeek(t.frequency, t.target),
      monthSoFar: t.frequency === "monthly" ? (monthSum.get(t.id) ?? 0) : null,
      entry: e
        ? {
            id: e.id, achieved: e.achieved, note: e.note, proofUrl: e.proof_url, status: e.status,
            reportedBy: e.reported_by, reportedByName: nameOf(e.reported_by), reportedAt: e.reported_at,
            reviewedBy: e.reviewed_by, reviewedByName: nameOf(e.reviewed_by), reviewedAt: e.reviewed_at, reviewNote: e.review_note,
          }
        : null,
    };
  });

  return { ready: true, weekStart, targets: rows };
}
