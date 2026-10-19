// Team Targets: everything the dashboard reads for a chosen period. One target
// can have many logs; a log counts toward "done" only once it is verified (by
// AI or by the owner).
//
// Units are not comparable across targets (2/week vs 800/month), so completion
// is the MEAN of each target's own capped completion, not a sum of units. The
// same equal-weighting is used for the team, each person, and the burn-up line.
// Raw unit totals are still shown, but split into "content" and "volume" (the
// high-cardinality targets) so one never swamps the other.
//
// Read with the signed-in client so RLS decides what the person can see; all
// writes live in lib/actions/team-targets.ts.

import { createClient } from "@/lib/supabase/server";
import { isMissingTable } from "@/lib/team-targets/db";
import {
  calendarDaysBetween, expectedToDate, isBehindStatus, periodEnded,
  periodExpected, targetStatus, workingDaysBetween, type Period, type TargetStatus,
} from "@/lib/team-targets/period";
import { addDays } from "@/lib/team-targets/week";
import { isVerified, isAwaiting } from "@/lib/team-targets/types";
import type {
  TargetFrequency, LogVerification, LogMode, TargetLog, DashboardTarget,
  PersonRollup, BurnupPoint, DashboardTotals, TeamTargetsDashboard, LoggableTarget,
} from "@/lib/team-targets/types";

// The DTOs live in the (client-safe) types module so client components can
// import them without pulling this server-only file into the browser bundle.
// Re-exported here for the server code that already imports them from here.
export type {
  LogVerification, LogMode, TargetLog, DashboardTarget, PersonRollup,
  BurnupPoint, DashboardTotals, TeamTargetsDashboard, LoggableTarget,
} from "@/lib/team-targets/types";
export { isVerified, isAwaiting, isFailed } from "@/lib/team-targets/types";

interface TargetDb {
  id: string; task: string; owner_id: string | null; co_owner_id: string | null;
  target: number; frequency: TargetFrequency; log_mode: LogMode; is_volume: boolean; created_at: string;
}
interface LogDb {
  id: string; target_id: string; log_date: string; link: string | null; quantity: number; note: string | null;
  verification_status: LogVerification; verification_reason: string | null; verification_kind: TargetLog["kind"];
  reported_by: string | null; reported_at: string; verified_by: string | null; verified_at: string | null;
}

// Order statuses worst -> best so a person's rolled-up chip shows their worst target.
const STATUS_SEVERITY: Record<TargetStatus, number> = {
  missed: 0, far_behind: 1, behind: 2, short: 3, not_due: 4, na: 5, on_track: 6, met: 7, ahead: 8,
};
const ON_PACE: TargetStatus[] = ["ahead", "on_track", "met"];

export async function getTeamTargetsDashboard(
  projectId: string, period: Period, now: Date = new Date(), personId?: string | null,
): Promise<TeamTargetsDashboard> {
  const supabase = await createClient();
  const ended = periodEnded(period, now);
  const empty = (ready: boolean): TeamTargetsDashboard => ({
    ready, ended, period, targets: [], people: [],
    totals: {
      completion: 0, paceCompletion: 0, contentDone: 0, contentExpected: 0, contentRemaining: 0,
      volumeDone: 0, volumeExpected: 0, volumeRemaining: 0, awaiting: 0, failed: 0,
      behindCount: 0, needsAttention: 0, targetCount: 0,
    },
    burnup: [],
  });

  const { data: targetsData, error } = await supabase
    .from("team_targets")
    .select("id, task, owner_id, co_owner_id, target, frequency, log_mode, is_volume, created_at")
    .eq("project_id", projectId)
    .is("removed_at", null)
    .order("created_at", { ascending: true });
  if (error) {
    if (isMissingTable(error)) return empty(false);
    throw new Error(`Could not load team targets: ${error.message}`);
  }
  let targets = (targetsData ?? []) as TargetDb[];
  // Person filter: keep the targets that person owns or co-owns, so every tile,
  // chart and the burn-up all narrow to them.
  if (personId) targets = targets.filter((t) => t.owner_id === personId || t.co_owner_id === personId);
  if (!targets.length) return empty(true);
  const targetIds = new Set(targets.map((t) => t.id));

  const { data: logsData } = await supabase
    .from("team_target_logs")
    .select("id, target_id, log_date, link, quantity, note, verification_status, verification_reason, verification_kind, reported_by, reported_at, verified_by, verified_at")
    .eq("project_id", projectId)
    .gte("log_date", period.start)
    .lte("log_date", period.end)
    .order("log_date", { ascending: true });
  const logs = ((logsData ?? []) as LogDb[]).filter((l) => targetIds.has(l.target_id));

  const ids = new Set<string>();
  for (const t of targets) { if (t.owner_id) ids.add(t.owner_id); if (t.co_owner_id) ids.add(t.co_owner_id); }
  for (const l of logs) { if (l.reported_by) ids.add(l.reported_by); if (l.verified_by) ids.add(l.verified_by); }
  const names = new Map<string, string>();
  if (ids.size) {
    const { data: profs } = await supabase.from("profiles").select("id, name").in("id", [...ids]);
    for (const p of (profs ?? []) as { id: string; name: string }[]) names.set(p.id, p.name);
  }
  const nameOf = (id: string | null) => (id ? names.get(id) ?? null : null);

  const logsByTarget = new Map<string, LogDb[]>();
  for (const l of logs) { const arr = logsByTarget.get(l.target_id) ?? []; arr.push(l); logsByTarget.set(l.target_id, arr); }

  const cap = (done: number, exp: number): number | null => (exp > 0 ? Math.min(1, done / exp) : null);

  const rows: DashboardTarget[] = targets.map((t) => {
    const tl = logsByTarget.get(t.id) ?? [];
    let done = 0, awaiting = 0, failed = 0, needs = 0;
    for (const l of tl) {
      if (isVerified(l.verification_status)) done += l.quantity;
      else if (isAwaiting(l.verification_status)) { awaiting += l.quantity; needs++; }
      else failed += l.quantity;
    }
    const expPeriod = Math.round(periodExpected(t.frequency, t.target, period));
    const expToDate = expectedToDate(t.frequency, t.target, period, now);
    return {
      id: t.id, task: t.task, ownerId: t.owner_id, ownerName: nameOf(t.owner_id),
      coOwnerId: t.co_owner_id, coOwnerName: nameOf(t.co_owner_id),
      target: t.target, frequency: t.frequency, logMode: t.log_mode, isVolume: t.is_volume,
      doneVerified: done, awaiting, failed,
      expectedPeriod: expPeriod, expectedToDate: expToDate,
      remaining: Math.max(0, expPeriod - done),
      completion: cap(done, expPeriod),
      paceCompletion: cap(expToDate, expPeriod),
      status: targetStatus(done, expPeriod, expToDate, ended),
      needsAttention: needs,
      logs: tl.slice().reverse().map((l): TargetLog => ({
        id: l.id, logDate: l.log_date, link: l.link, quantity: l.quantity, note: l.note,
        status: l.verification_status, reason: l.verification_reason, kind: l.verification_kind,
        reportedBy: l.reported_by, reportedByName: nameOf(l.reported_by), reportedAt: l.reported_at,
        verifiedByName: nameOf(l.verified_by), verifiedAt: l.verified_at,
      })),
    };
  });

  const mean = (xs: (number | null)[]): number => {
    const vals = xs.filter((x): x is number => x != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  // Per-person rollup across the targets they OWN (a co-owned target rolls up
  // under its owner, so every target is counted once).
  const peopleMap = new Map<string, { base: Omit<PersonRollup, "completion" | "paceCompletion" | "status" | "onPace">; comp: (number | null)[]; pace: (number | null)[]; statuses: TargetStatus[]; onPace: number }>();
  for (const r of rows) {
    const pid = r.ownerId ?? "none";
    const e = peopleMap.get(pid) ?? {
      base: { personId: pid, name: r.ownerName ?? "No owner", targetCount: 0, doneVerified: 0, awaiting: 0, failed: 0 },
      comp: [], pace: [], statuses: [], onPace: 0,
    };
    e.base.targetCount++;
    e.base.doneVerified += r.doneVerified;
    e.base.awaiting += r.awaiting;
    e.base.failed += r.failed;
    e.comp.push(r.completion);
    e.pace.push(r.paceCompletion);
    e.statuses.push(r.status);
    if (ON_PACE.includes(r.status)) e.onPace++;
    peopleMap.set(pid, e);
  }
  const people: PersonRollup[] = [...peopleMap.values()].map((e) => ({
    ...e.base,
    onPace: e.onPace,
    completion: mean(e.comp),
    paceCompletion: mean(e.pace),
    status: e.statuses.slice().sort((a, b) => STATUS_SEVERITY[a] - STATUS_SEVERITY[b])[0] ?? "na",
  })).sort((a, b) => a.completion - a.paceCompletion - (b.completion - b.paceCompletion) || a.name.localeCompare(b.name));

  const contentRows = rows.filter((r) => !r.isVolume);
  const volumeRows = rows.filter((r) => r.isVolume);
  const sum = (rs: DashboardTarget[], f: (r: DashboardTarget) => number) => rs.reduce((a, r) => a + f(r), 0);
  const totals: DashboardTotals = {
    completion: mean(rows.map((r) => r.completion)),
    paceCompletion: mean(rows.map((r) => r.paceCompletion)),
    contentDone: sum(contentRows, (r) => r.doneVerified),
    contentExpected: sum(contentRows, (r) => r.expectedPeriod),
    contentRemaining: sum(contentRows, (r) => r.remaining),
    volumeDone: sum(volumeRows, (r) => r.doneVerified),
    volumeExpected: sum(volumeRows, (r) => r.expectedPeriod),
    volumeRemaining: sum(volumeRows, (r) => r.remaining),
    awaiting: sum(rows, (r) => r.awaiting),
    failed: sum(rows, (r) => r.failed),
    behindCount: rows.filter((r) => isBehindStatus(r.status)).length,
    needsAttention: sum(rows, (r) => r.needsAttention),
    targetCount: rows.length,
  };

  const burnup = buildBurnup(targets, logs, period, now);
  return { ready: true, ended, period, targets: rows, people, totals, burnup };
}

/** Targets a person may log against: their own + co-owned; admins get all. Used
 *  to fill the "+ Add" dialog's task picker. Empty before the migration. */
export async function getLoggableTargets(projectId: string, userId: string, isAdmin: boolean): Promise<LoggableTarget[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_targets").select("id, task, owner_id, co_owner_id, log_mode")
    .eq("project_id", projectId).is("removed_at", null).order("task");
  if (error || !data) return [];
  const rows = data as { id: string; task: string; owner_id: string | null; co_owner_id: string | null; log_mode: LogMode }[];
  const mine = isAdmin ? rows : rows.filter((r) => r.owner_id === userId || r.co_owner_id === userId);
  const ids = [...new Set(mine.map((r) => r.owner_id).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: profs } = await supabase.from("profiles").select("id, name").in("id", ids);
    for (const p of (profs ?? []) as { id: string; name: string }[]) names.set(p.id, p.name);
  }
  return mine.map((r) => ({ id: r.id, task: r.task, ownerName: r.owner_id ? names.get(r.owner_id) ?? null : null, logMode: r.log_mode }));
}

// Cumulative team completion (mean of per-target capped completion) vs the ideal
// pace line, both as 0..1, sampled across the period up to today. Done is plotted
// by the date work was LOGGED, so a link verified later raises past points.
function buildBurnup(targets: TargetDb[], logs: LogDb[], period: Period, now: Date): BurnupPoint[] {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const lastDay = today < period.end ? today : period.end;
  if (lastDay < period.start) return [];

  const exp = new Map<string, number>();
  let nWeekday = 0, nMonthly = 0;
  for (const t of targets) {
    const e = Math.round(periodExpected(t.frequency, t.target, period));
    exp.set(t.id, e);
    if (e > 0) { if (t.frequency === "monthly") nMonthly++; else nWeekday++; }
  }
  const nWithExp = nWeekday + nMonthly;
  if (nWithExp === 0) return [];
  const totalWork = Math.max(1, workingDaysBetween(period.start, period.end));
  const totalCal = Math.max(1, calendarDaysBetween(period.start, period.end));

  // Verified units per target per day.
  const doneTargetDay = new Map<string, Map<string, number>>();
  for (const l of logs) {
    if (!isVerified(l.verification_status)) continue;
    const m = doneTargetDay.get(l.target_id) ?? new Map<string, number>();
    m.set(l.log_date, (m.get(l.log_date) ?? 0) + l.quantity);
    doneTargetDay.set(l.target_id, m);
  }

  const span = calendarDaysBetween(period.start, lastDay);
  const step = span > 120 ? 7 : 1;
  const cumDone = new Map<string, number>();   // per target
  const points: BurnupPoint[] = [];
  let cumWork = 0, cur = period.start, idx = 0;
  while (cur <= lastDay) {
    const dow = new Date(`${cur}T00:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) cumWork++;
    for (const t of targets) {
      const add = doneTargetDay.get(t.id)?.get(cur);
      if (add) cumDone.set(t.id, (cumDone.get(t.id) ?? 0) + add);
    }
    if (idx % step === 0 || cur === lastDay) {
      const cumCal = calendarDaysBetween(period.start, cur);
      const workFrac = Math.min(1, cumWork / totalWork);
      const monthFrac = Math.min(1, cumCal / totalCal);
      let doneSum = 0;
      for (const t of targets) {
        const e = exp.get(t.id) ?? 0;
        if (e > 0) doneSum += Math.min(1, (cumDone.get(t.id) ?? 0) / e);
      }
      const ideal = (nWeekday * workFrac + nMonthly * monthFrac) / nWithExp;
      points.push({ date: cur, done: doneSum / nWithExp, ideal });
    }
    cur = addDays(cur, 1); idx++;
  }
  return points;
}
