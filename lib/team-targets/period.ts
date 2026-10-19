// Team Targets: turning a chosen time window into the numbers the dashboard
// lives on. Everything is date-only (YYYY-MM-DD, India time) so there is no
// timezone drift. Weeks are Mon-Fri working weeks.

import { addDays, isIsoDate, todayIst } from "@/lib/team-targets/week";
import type { TargetFrequency } from "@/lib/team-targets/types";

export const WORKING_DAYS_PER_WEEK = 5;

export type PeriodKey = "this_month" | "last_month" | "last_3_months" | "this_quarter" | "this_year" | "custom";

export interface Period {
  key: PeriodKey;
  start: string;   // inclusive YYYY-MM-DD
  end: string;     // inclusive YYYY-MM-DD
  label: string;
}

// While a period is open: how we track against the pace line. Once it has
// ended, "behind" no longer makes sense, so finished periods use met/short/missed.
export type TargetStatus =
  | "ahead" | "on_track" | "behind" | "far_behind" | "not_due" | "na"
  | "met" | "short" | "missed";

// One place for the thresholds, so the dashboard copy and the chips never drift.
export const FAR_BEHIND_RATIO = 0.7;   // below this share of pace = far behind / missed
export const PACE_TOLERANCE = 0.1;     // within 10% of pace = on track

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function parse(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m: m - 1, d };
}
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}
function lastDayOfMonth(y: number, m: number): string {
  return ymd(y, m, daysInMonth(y, m));
}

/** Resolve a preset (or a custom start/end) into a concrete, labelled window. */
export function resolvePeriod(key: string, customStart?: string, customEnd?: string, now: Date = new Date()): Period {
  const today = todayIst(now);
  const { y, m } = parse(today);

  switch (key as PeriodKey) {
    case "last_month": {
      const lm = m === 0 ? 11 : m - 1;
      const ly = m === 0 ? y - 1 : y;
      return { key: "last_month", start: ymd(ly, lm, 1), end: lastDayOfMonth(ly, lm), label: `${MONTHS[lm]} ${ly}` };
    }
    case "last_3_months": {
      // The current month plus the two before it.
      const startM = m - 2;
      const sy = startM < 0 ? y - 1 : y;
      const sm = (startM + 12) % 12;
      return { key: "last_3_months", start: ymd(sy, sm, 1), end: today, label: `${MONTHS[sm]} ${sy} to ${MONTHS[m]} ${y}` };
    }
    case "this_quarter": {
      const q = Math.floor(m / 3);
      const sm = q * 3;
      return { key: "this_quarter", start: ymd(y, sm, 1), end: today, label: `Q${q + 1} ${y}` };
    }
    case "this_year":
      return { key: "this_year", start: ymd(y, 0, 1), end: today, label: `${y}` };
    case "custom": {
      const start = isIsoDate(customStart) ? customStart! : ymd(y, m, 1);
      const end = isIsoDate(customEnd) && customEnd! >= start ? customEnd! : today;
      return { key: "custom", start, end, label: `${formatDay(start)} to ${formatDay(end)}` };
    }
    default: // this_month
      return { key: "this_month", start: ymd(y, m, 1), end: lastDayOfMonth(y, m), label: `${MONTHS[m]} ${y}` };
  }
}

function formatDay(iso: string): string {
  const { y, m, d } = parse(iso);
  return `${MONTHS[m]} ${d}, ${y}`;
}
export function formatPeriodRange(p: Period): string {
  return p.label;
}

/** Mon-Fri days in [start, end] inclusive. */
export function workingDaysBetween(start: string, end: string): number {
  if (end < start) return 0;
  let count = 0;
  let cur = start;
  // Cap the walk so a pathological custom range can't loop forever.
  for (let i = 0; i < 3660 && cur <= end; i++) {
    const dow = new Date(`${cur}T00:00:00Z`).getUTCDay(); // 0 Sun .. 6 Sat
    if (dow !== 0 && dow !== 6) count++;
    cur = addDays(cur, 1);
  }
  return count;
}

/** Calendar days in [start, end] inclusive. */
export function calendarDaysBetween(start: string, end: string): number {
  if (end < start) return 0;
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

/**
 * Sum of month overlaps in the range, each month counted as the fraction of its
 * days that fall inside the window. Whole-month presets give a clean integer
 * (this month = 1, a quarter = 3); a partial custom range is pro-rated.
 */
export function monthsBetween(start: string, end: string): number {
  if (end < start) return 0;
  let total = 0;
  let { y, m } = parse(start);
  const endParsed = parse(end);
  for (let i = 0; i < 400; i++) {
    const mStart = ymd(y, m, 1);
    const mEnd = lastDayOfMonth(y, m);
    const lo = mStart > start ? mStart : start;
    const hi = mEnd < end ? mEnd : end;
    total += calendarDaysBetween(lo, hi) / daysInMonth(y, m);
    if (y === endParsed.y && m === endParsed.m) break;
    m++; if (m > 11) { m = 0; y++; }
  }
  return total;
}

/** How many units this target is expected to produce across the whole window. */
export function periodExpected(frequency: TargetFrequency, target: number, p: Period): number {
  if (frequency === "daily") return target * workingDaysBetween(p.start, p.end);
  if (frequency === "weekly") return target * (workingDaysBetween(p.start, p.end) / WORKING_DAYS_PER_WEEK);
  return target * monthsBetween(p.start, p.end);
}

export function periodEnded(p: Period, now: Date = new Date()): boolean {
  return p.end < todayIst(now);
}

/**
 * Expected SO FAR, pro-rated through YESTERDAY's closed days, so nobody reads as
 * "behind" at 9am on a day they haven't finished. 0 before the window opens, the
 * whole thing once it has closed. Daily/weekly pace is by working days, monthly
 * by calendar days (a weekend still "owes" a monthly goal).
 */
export function expectedToDate(frequency: TargetFrequency, target: number, p: Period, now: Date = new Date()): number {
  const today = todayIst(now);
  if (today <= p.start) return 0;                                   // first day not closed yet
  if (today > p.end) return periodExpected(frequency, target, p);   // whole window closed
  const yesterday = addDays(today, -1);
  const full = periodExpected(frequency, target, p);
  const fraction = frequency === "monthly"
    ? calendarDaysBetween(p.start, yesterday) / calendarDaysBetween(p.start, p.end)
    : workingDaysBetween(p.start, yesterday) / Math.max(1, workingDaysBetween(p.start, p.end));
  return full * Math.min(1, Math.max(0, fraction));
}

/**
 * The status chip for one target. An open period is judged against the pace line
 * (expected so far); a finished period is judged against the whole goal.
 *   na        - nothing was expected this period (e.g. a weekend-only range)
 *   not_due   - expected, but nothing is due yet, and nothing done
 *   ahead/on_track/behind/far_behind - open period, vs pace
 *   met/short/missed                 - closed period, vs the full goal
 */
export function targetStatus(done: number, expectedPeriod: number, expToDate: number, ended: boolean): TargetStatus {
  if (expectedPeriod <= 0) return "na";
  if (ended) {
    const r = done / expectedPeriod;
    if (r >= 1) return "met";
    if (r >= FAR_BEHIND_RATIO) return "short";
    return "missed";
  }
  if (expToDate <= 0) return done > 0 ? "ahead" : "not_due";
  const tol = Math.max(1, PACE_TOLERANCE * expToDate);
  if (done >= expToDate + tol) return "ahead";
  if (done < FAR_BEHIND_RATIO * expToDate) return "far_behind";
  if (done < expToDate - tol) return "behind";
  return "on_track";
}

/** True for the statuses a manager should chase (used for the "behind pace" count). */
export function isBehindStatus(s: TargetStatus): boolean {
  return s === "behind" || s === "far_behind" || s === "short" || s === "missed";
}
