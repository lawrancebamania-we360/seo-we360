// Team Targets: calendar helpers. Weeks run Monday to Sunday and are keyed by
// their Monday as a plain YYYY-MM-DD string, so there is no time-of-day or
// server-timezone drift in anything stored or compared.

import type { TargetFrequency } from "@/lib/team-targets/types";

/** A "daily" target is expected on working days only. Change here if the team works six days. */
export const WORKING_DAYS_PER_WEEK = 5;

const DAY_MS = 86_400_000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtcMs(iso: string): number {
  const m = ISO.exec(iso)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isIsoDate(v: string | undefined | null): v is string {
  if (!v || !ISO.test(v)) return false;
  const ms = toUtcMs(v);
  return !Number.isNaN(ms) && fromUtcMs(ms) === v;
}

/** Today's calendar date in India, where this team works. The server itself runs in UTC. */
export function todayIst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(iso: string, days: number): string {
  return fromUtcMs(toUtcMs(iso) + days * DAY_MS);
}

/** The Monday on or before the given date. */
export function weekStartOf(iso: string): string {
  const day = new Date(toUtcMs(iso)).getUTCDay(); // 0 = Sunday
  return addDays(iso, -(day === 0 ? 6 : day - 1));
}

export function currentWeekStart(now: Date = new Date()): string {
  return weekStartOf(todayIst(now));
}

export function isMonday(iso: string): boolean {
  return isIsoDate(iso) && new Date(toUtcMs(iso)).getUTCDay() === 1;
}

/** "2026-10" for a week: a week belongs to the month its Monday falls in. */
export function monthKeyOfWeek(weekStart: string): string {
  return weekStart.slice(0, 7);
}

/**
 * What one week should add up to. Daily goals count working days; weekly goals
 * are as stated; a monthly goal has no per-week figure (it is tracked against
 * the month instead), so this returns null for it.
 */
export function expectedForWeek(frequency: TargetFrequency, target: number): number | null {
  if (frequency === "daily") return target * WORKING_DAYS_PER_WEEK;
  if (frequency === "weekly") return target;
  return null;
}

const SHORT = { month: "short", day: "numeric", timeZone: "UTC" } as const;

/** "Oct 13 - Oct 19, 2026" */
export function formatWeekRange(weekStart: string): string {
  const start = new Date(toUtcMs(weekStart));
  const end = new Date(toUtcMs(addDays(weekStart, 6)));
  const s = start.toLocaleDateString("en-US", SHORT);
  const e = end.toLocaleDateString("en-US", SHORT);
  return `${s} - ${e}, ${end.getUTCFullYear()}`;
}
