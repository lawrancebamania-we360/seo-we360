// Executive Dashboard data layer.
//
// One concise, leadership-facing view: target vs achieved (traffic & DR),
// money spent and the effect it bought, and what each person is working on -
// all for a selectable date range (default: this month).
//
// Sources: traffic is LIVE GA4 - the same counted-channel sessions the
// Analytics nav's Traffic sources card shows (works on the Vercel runtime;
// locally GA4 returns 403, so the card shows its "not connected" reason).
// DR (Ahrefs) actuals and the DR / traffic GOALS are hand-entered in
// seo_metric_points. Money comes from earned_backlinks + influencer_collabs;
// team from the existing Team Targets dashboard. Each reader degrades
// (ready=false, zero rows) when its table/column isn't there yet, so the page
// never 500s before a migration is applied.
//
// Goals are deliberately NOT range-filtered: a goal has its own deadline, so
// its chart always runs from the first reading to that deadline.

import { createClient } from "@/lib/supabase/server";
import { isMissingTable, isMissingColumn } from "@/lib/ai-citation/run-state";
import {
  resolveTrafficCompareRange,
  TRAFFIC_RANGE_PRESETS,
  type TrafficRangeKey,
  type DateRange,
} from "@/lib/data/analytics-range";
import { getGa4OrganicMonthly, getGa4MonthlySessions } from "@/lib/google/ga4";
import { getTeamTargetsDashboard } from "@/lib/data/team-targets";
import type { Period } from "@/lib/team-targets/period";
import type { TeamTargetsDashboard } from "@/lib/team-targets/types";

export { TRAFFIC_RANGE_PRESETS };
export type { TrafficRangeKey, DateRange };

// INR -> USD. The team pays most influencer collabs in INR and some backlinks
// in INR; the exec view is USD-only (per direction). This is a documented,
// deliberately fixed accounting constant (not a live FX feed) so historical
// spend doesn't wobble with the daily rate - ~Rs.83 to the dollar.
export const USD_PER_INR = 0.012;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}
/** Every YYYY-MM bucket from start..end inclusive, so the x-axis has no gaps. */
function monthBuckets(range: DateRange): string[] {
  const out: string[] = [];
  const [sy, sm] = range.start.split("-").map(Number);
  const [ey, em] = range.end.split("-").map(Number);
  let y = sy, m = sm;
  // Guard against a pathological range producing a huge array.
  for (let i = 0; i < 240 && (y < ey || (y === ey && m <= em)); i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out.length ? out : [monthKey(range.end)];
}
const toNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Today's date in IST as YYYY-MM-DD (the team works in IST). */
function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export const EXEC_RANGE_DEFAULT: TrafficRangeKey = "this_month";
export function resolveExecRange(key: string): { range: DateRange; label: string; key: TrafficRangeKey } {
  const k = (TRAFFIC_RANGE_PRESETS.some((p) => p.key === key) ? key : EXEC_RANGE_DEFAULT) as TrafficRangeKey;
  const label = TRAFFIC_RANGE_PRESETS.find((p) => p.key === k)!.label;
  return { range: resolveTrafficCompareRange(k).current, label, key: k };
}

// ---------------------------------------------------------------------------
// DR + Traffic: actuals and goals
// ---------------------------------------------------------------------------

export interface MetricPoint { date: string; value: number; note: string | null; id: string }
export interface ManualPoint extends MetricPoint { metric: "dr" | "traffic"; kind: "actual" | "target" }
export interface MetricGoal { value: number; date: string }

export interface MetricSeries {
  ready: boolean;              // the source is there (table exists / GA4 reachable)
  metric: "dr" | "traffic";
  source: "manual" | "ga4";
  reason: string | null;       // why there's no data, when there isn't
  history: MetricPoint[];      // every actual, oldest -> newest
  latestActual: number | null;
  latestActualDate: string | null;
  goal: MetricGoal | null;     // the active goal: nearest on/after today, else the latest
  latestTarget: number | null; // = goal?.value
  delta: number | null;        // change vs the previous reading
  rangeDelta: number | null;   // change across the selected range (for $ per DR point)
}

type PointRow = { id: string; metric: "dr" | "traffic"; kind: "actual" | "target"; value: number | string; as_of: string; note: string | null };

async function getManualPoints(projectId: string): Promise<{ ready: boolean; rows: ManualPoint[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("seo_metric_points")
    .select("id, metric, kind, value, as_of, note")
    .eq("project_id", projectId)
    .order("as_of", { ascending: true });
  if (error) {
    if (isMissingTable(error.message) || isMissingColumn(error.message)) return { ready: false, rows: [] };
    throw new Error(`Could not load DR / traffic points: ${error.message}`);
  }
  return {
    ready: true,
    rows: ((data ?? []) as PointRow[]).map((r) => ({
      id: r.id, metric: r.metric, kind: r.kind, value: toNum(r.value), date: r.as_of, note: r.note,
    })),
  };
}

function pickGoal(targets: MetricPoint[], today: string): MetricGoal | null {
  if (!targets.length) return null;
  const g = targets.find((t) => t.date >= today) ?? targets[targets.length - 1];
  return { value: g.value, date: g.date };
}

function buildSeries(args: {
  metric: "dr" | "traffic"; source: "manual" | "ga4"; ready: boolean; reason: string | null;
  history: MetricPoint[]; targets: MetricPoint[]; range: DateRange; today: string; delta?: number | null;
}): MetricSeries {
  const { history, range } = args;
  const last = history.length ? history[history.length - 1] : null;
  const prev = history.length > 1 ? history[history.length - 2] : null;
  const goal = pickGoal(args.targets, args.today);

  // Value at the range end vs just before it opened (carried forward).
  let endVal: number | null = null, startVal: number | null = null;
  for (const p of history) {
    if (p.date <= range.end) endVal = p.value;
    if (p.date < range.start) startVal = p.value;
  }
  if (startVal === null) startVal = history.find((p) => p.date >= range.start && p.date <= range.end)?.value ?? null;

  return {
    ready: args.ready, metric: args.metric, source: args.source, reason: args.reason,
    history,
    latestActual: last ? last.value : null,
    latestActualDate: last ? last.date : null,
    goal,
    latestTarget: goal ? goal.value : null,
    delta: args.delta !== undefined ? args.delta : last && prev ? round2(last.value - prev.value) : null,
    rangeDelta: endVal !== null && startVal !== null ? round2(endVal - startVal) : null,
  };
}

/** Last day of a YYYY-MM month as YYYY-MM-DD. */
function monthEnd(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${key}-${String(d).padStart(2, "0")}`;
}

/** Traffic actuals from GA4: the last 6 complete months + "last 30 days" (today). */
async function getTrafficActuals(ga4PropertyId: string | null, today: string): Promise<{
  connected: boolean; reason: string | null; history: MetricPoint[]; delta: number | null;
}> {
  const [ty, tm] = today.split("-").map(Number);
  const back = new Date(Date.UTC(ty, tm - 1 - 6, 1));
  const start = `${back.getUTCFullYear()}-${String(back.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const prevMonth = new Date(Date.UTC(ty, tm - 2, 1));
  const end = monthEnd(`${prevMonth.getUTCFullYear()}-${String(prevMonth.getUTCMonth() + 1).padStart(2, "0")}`);

  const [now, monthly] = await Promise.all([
    getGa4OrganicMonthly(ga4PropertyId, resolveTrafficCompareRange("last_30_days")),
    getGa4MonthlySessions(ga4PropertyId, start, end),
  ]);
  if (!now.connected) return { connected: false, reason: now.reason ?? "GA4 not connected.", history: [], delta: null };

  const history: MetricPoint[] = monthly.months.map((m) => ({
    id: `ga4-${m.month}`, date: monthEnd(m.month), value: m.sessions, note: "GA4 · full month",
  }));
  history.push({ id: "ga4-last30", date: today, value: now.monthlySessions, note: "GA4 · last 30 days" });
  return { connected: true, reason: null, history, delta: now.monthlySessions - now.priorSessions };
}

// ---------------------------------------------------------------------------
// Money spent (USD)
// ---------------------------------------------------------------------------

export interface SpendBucket { key: string; label: string; backlinks: number; collabs: number; total: number }
export interface SpendSummary {
  ready: boolean;
  buckets: SpendBucket[];
  backlinksUsd: number;
  collabsUsd: number;
  totalUsd: number;
  backlinksCount: number;  // paid backlinks in range
  collabsCount: number;    // paid collabs in range
}

async function getSpendSummary(projectId: string, range: DateRange): Promise<SpendSummary> {
  const supabase = await createClient();
  const keys = monthBuckets(range);
  const bl = new Map<string, number>(keys.map((k) => [k, 0]));
  const co = new Map<string, number>(keys.map((k) => [k, 0]));
  let backlinksUsd = 0, collabsUsd = 0, backlinksCount = 0, collabsCount = 0;
  let anyTable = false;

  const usd = (amount: unknown, currency: unknown): number => {
    const a = toNum(amount);
    return (currency === "INR" ? a * USD_PER_INR : a);
  };

  const blRes = await supabase
    .from("earned_backlinks")
    .select("amount_paid, currency, acquired_date")
    .eq("project_id", projectId)
    .gte("acquired_date", range.start)
    .lte("acquired_date", range.end)
    .not("amount_paid", "is", null);
  if (blRes.error) {
    if (!(isMissingTable(blRes.error.message) || isMissingColumn(blRes.error.message))) throw new Error(blRes.error.message);
  } else {
    anyTable = true;
    for (const r of (blRes.data ?? []) as { amount_paid: number; currency: string; acquired_date: string }[]) {
      const v = usd(r.amount_paid, r.currency);
      if (v <= 0) continue;
      backlinksUsd += v; backlinksCount++;
      const k = monthKey(r.acquired_date);
      bl.set(k, (bl.get(k) ?? 0) + v);
    }
  }

  const coRes = await supabase
    .from("influencer_collabs")
    .select("amount_paid, currency, post_date")
    .eq("project_id", projectId)
    .gte("post_date", range.start)
    .lte("post_date", range.end)
    .not("amount_paid", "is", null);
  if (coRes.error) {
    if (!(isMissingTable(coRes.error.message) || isMissingColumn(coRes.error.message))) throw new Error(coRes.error.message);
  } else {
    anyTable = true;
    for (const r of (coRes.data ?? []) as { amount_paid: number; currency: string; post_date: string }[]) {
      const v = usd(r.amount_paid, r.currency);
      if (v <= 0) continue;
      collabsUsd += v; collabsCount++;
      const k = monthKey(r.post_date);
      co.set(k, (co.get(k) ?? 0) + v);
    }
  }

  const round = (n: number) => Math.round(n);
  const buckets: SpendBucket[] = keys.map((k) => {
    const b = round(bl.get(k) ?? 0), c = round(co.get(k) ?? 0);
    return { key: k, label: monthLabel(k), backlinks: b, collabs: c, total: b + c };
  });
  return {
    ready: anyTable, buckets,
    backlinksUsd: round(backlinksUsd), collabsUsd: round(collabsUsd), totalUsd: round(backlinksUsd + collabsUsd),
    backlinksCount, collabsCount,
  };
}

// ---------------------------------------------------------------------------
// Backlinks earned (count + DR context, for the "effect" story)
// ---------------------------------------------------------------------------

export interface BacklinksEarned { ready: boolean; count: number; avgDr: number | null }

async function getBacklinksEarned(projectId: string, range: DateRange): Promise<BacklinksEarned> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("earned_backlinks")
    .select("domain_rating")
    .eq("project_id", projectId)
    .gte("acquired_date", range.start)
    .lte("acquired_date", range.end);
  if (error) {
    if (isMissingTable(error.message) || isMissingColumn(error.message)) return { ready: false, count: 0, avgDr: null };
    throw new Error(error.message);
  }
  const rows = (data ?? []) as { domain_rating: number | null }[];
  const drs = rows.map((r) => r.domain_rating).filter((d): d is number => typeof d === "number");
  const avgDr = drs.length ? Math.round(drs.reduce((a, b) => a + b, 0) / drs.length) : null;
  return { ready: true, count: rows.length, avgDr };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export interface ExecutiveDashboard {
  rangeKey: TrafficRangeKey;
  rangeLabel: string;
  range: DateRange;
  today: string;
  traffic: MetricSeries;
  dr: MetricSeries;
  manualPoints: ManualPoint[]; // every hand-entered DR / traffic point (the editor's list)
  spend: SpendSummary;
  backlinks: BacklinksEarned;
  team: TeamTargetsDashboard;
  // Cost efficiency (USD), null when the denominator is missing/zero.
  costPerDrPoint: number | null;
  costPerBacklink: number | null;
}

export async function getExecutiveDashboard(
  projectId: string, rangeKey: string, ga4PropertyId: string | null = null,
): Promise<ExecutiveDashboard> {
  const { range, label, key } = resolveExecRange(rangeKey);
  const teamPeriod: Period = { key: "custom", start: range.start, end: range.end, label };
  const today = istToday();

  const [manual, trafficActuals, spend, backlinks, team] = await Promise.all([
    getManualPoints(projectId),
    getTrafficActuals(ga4PropertyId, today),
    getSpendSummary(projectId, range),
    getBacklinksEarned(projectId, range),
    getTeamTargetsDashboard(projectId, teamPeriod),
  ]);

  const pts = manual.rows;
  const strip = (p: ManualPoint): MetricPoint => ({ id: p.id, date: p.date, value: p.value, note: p.note });
  const of = (metric: "dr" | "traffic", kind: "actual" | "target") =>
    pts.filter((p) => p.metric === metric && p.kind === kind).map(strip);

  const dr = buildSeries({
    metric: "dr", source: "manual", ready: manual.ready,
    reason: manual.ready ? null : "Add the 20261112000002 migration, then record DR readings.",
    history: of("dr", "actual"), targets: of("dr", "target"), range, today,
  });
  const traffic = buildSeries({
    metric: "traffic", source: "ga4", ready: trafficActuals.connected, reason: trafficActuals.reason,
    history: trafficActuals.history, targets: of("traffic", "target"), range, today, delta: trafficActuals.delta,
  });

  const costPerDrPoint = dr.rangeDelta && dr.rangeDelta > 0 ? Math.round(spend.totalUsd / dr.rangeDelta) : null;
  const costPerBacklink = spend.backlinksCount > 0 ? Math.round(spend.backlinksUsd / spend.backlinksCount) : null;

  return {
    rangeKey: key, rangeLabel: label, range, today,
    traffic, dr, manualPoints: pts,
    spend, backlinks, team,
    costPerDrPoint, costPerBacklink,
  };
}
