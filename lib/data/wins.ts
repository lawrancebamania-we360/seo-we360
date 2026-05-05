import { createClient } from "@/lib/supabase/server";
import type { Win, PillarScore, Pillar } from "@/lib/types/database";

export interface WinsTimelinePoint {
  week_start: string;        // ISO date, Monday of the week
  week_label: string;        // "Jan 6" style label for the chart x-axis
  wins: number;
  tasks_closed: number;
  SEO: number | null;
  AEO: number | null;
  GEO: number | null;
  SXO: number | null;
  AIO: number | null;
}

export interface WinsTimeline {
  weeks: WinsTimelinePoint[];
  first_week: string;
  last_week: string;
  total_wins: number;
  total_tasks_closed: number;
  pillars_delta: Record<Pillar, number | null>;  // current - oldest-available
}

export interface WeeklyWinSummary {
  thisWeekWins: Win[];
  lastWeekWinCount: number;
  thisWeekCount: number;
  tasksClosedThisWeek: number;
  tasksClosedLastWeek: number;
  aiVerifiedThisWeek: number;
  pillarDeltas: Array<{
    pillar: Pillar;
    currentScore: number;
    priorScore: number | null;
    delta: number | null;
  }>;
  topImpactTasks: Array<{
    id: string;
    title: string;
    impact: string | null;
    completed_at: string | null;
    verified_by_ai: boolean;
    pillar: Pillar | null;
  }>;
}

const DAY_MS = 86400000;
function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

export async function getWeeklyWinSummary(projectId: string): Promise<WeeklyWinSummary> {
  const supabase = await createClient();
  const sevenDaysAgo = daysAgoISO(7);
  const fourteenDaysAgo = daysAgoISO(14);

  const [winsThisWeekRes, winsLastWeekRes, tasksThisWeekRes, tasksLastWeekRes, pillarRes, impactRes] = await Promise.all([
    supabase.from("wins").select("*").eq("project_id", projectId).gte("created_at", sevenDaysAgo).order("created_at", { ascending: false }),
    supabase.from("wins").select("id").eq("project_id", projectId).gte("created_at", fourteenDaysAgo).lt("created_at", sevenDaysAgo),
    supabase.from("tasks").select("id, verified_by_ai").eq("project_id", projectId).eq("done", true).gte("completed_at", sevenDaysAgo),
    supabase.from("tasks").select("id").eq("project_id", projectId).eq("done", true).gte("completed_at", fourteenDaysAgo).lt("completed_at", sevenDaysAgo),
    supabase.from("pillar_scores").select("*").eq("project_id", projectId).order("captured_at", { ascending: false }).limit(50),
    supabase
      .from("tasks")
      .select("id, title, impact, completed_at, verified_by_ai, pillar")
      .eq("project_id", projectId)
      .eq("done", true)
      .gte("completed_at", sevenDaysAgo)
      .not("impact", "is", null)
      .order("completed_at", { ascending: false })
      .limit(5),
  ]);

  const thisWeekWins = (winsThisWeekRes.data ?? []) as Win[];
  const lastWeekWinCount = (winsLastWeekRes.data ?? []).length;
  const tasksThisWeekRows = (tasksThisWeekRes.data ?? []) as Array<{ id: string; verified_by_ai: boolean }>;
  const tasksLastWeekCount = (tasksLastWeekRes.data ?? []).length;
  const aiVerifiedThisWeek = tasksThisWeekRows.filter((t) => t.verified_by_ai).length;

  // Pillar deltas: latest score vs 7-day-older score per pillar
  const pillarRows = (pillarRes.data ?? []) as PillarScore[];
  const pillars: Pillar[] = ["SEO", "AEO", "GEO", "SXO", "AIO"];
  const pillarDeltas = pillars.map((p) => {
    const byPillar = pillarRows.filter((r) => r.pillar === p);
    const current = byPillar[0] ?? null;
    const prior = byPillar.find((r) => new Date(r.captured_at).getTime() < Date.now() - 7 * DAY_MS) ?? null;
    return {
      pillar: p,
      currentScore: current?.score ?? 0,
      priorScore: prior?.score ?? null,
      delta: current && prior ? current.score - prior.score : null,
    };
  });

  return {
    thisWeekWins,
    thisWeekCount: thisWeekWins.length,
    lastWeekWinCount,
    tasksClosedThisWeek: tasksThisWeekRows.length,
    tasksClosedLastWeek: tasksLastWeekCount,
    aiVerifiedThisWeek,
    pillarDeltas,
    topImpactTasks: (impactRes.data ?? []) as WeeklyWinSummary["topImpactTasks"],
  };
}

// ISO week helpers — Monday-start weeks so rows align with our cron cadence.
function mondayOf(d: Date): Date {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  const day = copy.getUTCDay();            // 0=Sun..6=Sat
  const offset = day === 0 ? -6 : 1 - day; // shift to Monday
  copy.setUTCDate(copy.getUTCDate() + offset);
  return copy;
}
function weekLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export async function getWinsTimeline(projectId: string, weeks = 12): Promise<WinsTimeline> {
  const supabase = await createClient();
  const now = new Date();
  const currentWeekStart = mondayOf(now);
  const firstWeekStart = new Date(currentWeekStart);
  firstWeekStart.setUTCDate(firstWeekStart.getUTCDate() - (weeks - 1) * 7);
  const windowStartISO = firstWeekStart.toISOString();

  const [winsRes, tasksRes, pillarRes] = await Promise.all([
    supabase
      .from("wins")
      .select("created_at")
      .eq("project_id", projectId)
      .gte("created_at", windowStartISO),
    supabase
      .from("tasks")
      .select("completed_at")
      .eq("project_id", projectId)
      .eq("done", true)
      .gte("completed_at", windowStartISO),
    supabase
      .from("pillar_scores")
      .select("pillar, score, captured_at")
      .eq("project_id", projectId)
      .gte("captured_at", windowStartISO)
      .order("captured_at", { ascending: true }),
  ]);

  type WinRow = { created_at: string };
  type TaskRow = { completed_at: string | null };
  type PillarRow = { pillar: Pillar; score: number; captured_at: string };

  // Initialise one bucket per week
  const weekMap = new Map<string, WinsTimelinePoint>();
  for (let i = 0; i < weeks; i++) {
    const d = new Date(firstWeekStart);
    d.setUTCDate(d.getUTCDate() + i * 7);
    const key = d.toISOString().slice(0, 10);
    weekMap.set(key, {
      week_start: key,
      week_label: weekLabel(d),
      wins: 0,
      tasks_closed: 0,
      SEO: null, AEO: null, GEO: null, SXO: null, AIO: null,
    });
  }

  // Bucket wins
  for (const w of (winsRes.data ?? []) as WinRow[]) {
    const key = mondayOf(new Date(w.created_at)).toISOString().slice(0, 10);
    const bucket = weekMap.get(key);
    if (bucket) bucket.wins++;
  }
  // Bucket tasks closed
  for (const t of (tasksRes.data ?? []) as TaskRow[]) {
    if (!t.completed_at) continue;
    const key = mondayOf(new Date(t.completed_at)).toISOString().slice(0, 10);
    const bucket = weekMap.get(key);
    if (bucket) bucket.tasks_closed++;
  }
  // Pillar score: take the LATEST score captured inside each week (avoids mid-week noise)
  const latestPerWeekPerPillar = new Map<string, PillarRow>();
  for (const row of (pillarRes.data ?? []) as PillarRow[]) {
    const key = `${mondayOf(new Date(row.captured_at)).toISOString().slice(0, 10)}::${row.pillar}`;
    const existing = latestPerWeekPerPillar.get(key);
    if (!existing || new Date(row.captured_at) > new Date(existing.captured_at)) {
      latestPerWeekPerPillar.set(key, row);
    }
  }
  for (const [key, row] of latestPerWeekPerPillar) {
    const [weekKey, pillar] = key.split("::") as [string, Pillar];
    const bucket = weekMap.get(weekKey);
    if (bucket) bucket[pillar] = row.score;
  }

  // Carry-forward pillar scores so the chart doesn't break on weeks with no snapshot
  const pillars: Pillar[] = ["SEO", "AEO", "GEO", "SXO", "AIO"];
  const sortedWeeks = [...weekMap.values()].sort((a, b) => a.week_start.localeCompare(b.week_start));
  const carry: Record<Pillar, number | null> = { SEO: null, AEO: null, GEO: null, SXO: null, AIO: null };
  for (const w of sortedWeeks) {
    for (const p of pillars) {
      if (w[p] === null) w[p] = carry[p];
      else carry[p] = w[p];
    }
  }

  // Delta: first non-null vs last non-null per pillar
  const pillarsDelta: Record<Pillar, number | null> = { SEO: null, AEO: null, GEO: null, SXO: null, AIO: null };
  for (const p of pillars) {
    const firstVal = sortedWeeks.find((w) => w[p] !== null)?.[p] ?? null;
    const lastVal = [...sortedWeeks].reverse().find((w) => w[p] !== null)?.[p] ?? null;
    pillarsDelta[p] = firstVal != null && lastVal != null ? lastVal - firstVal : null;
  }

  const totalWins = sortedWeeks.reduce((n, w) => n + w.wins, 0);
  const totalTasksClosed = sortedWeeks.reduce((n, w) => n + w.tasks_closed, 0);

  return {
    weeks: sortedWeeks,
    first_week: sortedWeeks[0]?.week_start ?? "",
    last_week: sortedWeeks[sortedWeeks.length - 1]?.week_start ?? "",
    total_wins: totalWins,
    total_tasks_closed: totalTasksClosed,
    pillars_delta: pillarsDelta,
  };
}
