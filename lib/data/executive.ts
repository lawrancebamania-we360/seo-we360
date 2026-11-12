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
import { getTeamTargetsDashboard, backlinkRuleFor } from "@/lib/data/team-targets";
import type { Period } from "@/lib/team-targets/period";
import { addDays, currentWeekStart, formatWeekRange } from "@/lib/team-targets/week";
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

// The traffic goal chart starts here (per direction: August 2026 onward, earlier
// months left out).
const GOAL_HISTORY_START = "2026-08-01";

/** Traffic actuals from GA4: every complete month since GOAL_HISTORY_START + "last 30 days" (today). */
async function getTrafficActuals(ga4PropertyId: string | null, today: string): Promise<{
  connected: boolean; reason: string | null; history: MetricPoint[]; delta: number | null;
}> {
  const [ty, tm] = today.split("-").map(Number);
  const start = GOAL_HISTORY_START;
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

type CollabRow = {
  amount_paid: number | string | null; currency: string | null;
  post_date: string | null; closing_date: string | null; platform?: string | null;
};

// Budget tracking starts October 2026.
const SPEND_TRACKING_START = "2026-10-01";

/** A collab's money counts in the month the deal CLOSED (when it's committed),
 *  else its post date. Closes before tracking began roll into October 2026 -
 *  per direction, the first LinkedIn batch (5 posts, ~$300) is October's. */
function collabSpendDate(r: CollabRow): string | null {
  const d = r.closing_date ?? r.post_date;
  if (!d) return null;
  return d < SPEND_TRACKING_START ? SPEND_TRACKING_START : d;
}

// Monthly budgets in USD, per direction (2026-11-12). Returns null where an
// activity has no budget that month.
//   Paid backlinks   $1,000 / month
//   YouTube collabs  $1,000 / quarter from Nov 2026 -> ~$333 / month
//   LinkedIn collabs Oct 2026: $300 for 5 posts
function budgetFor(activity: string, month: string): { usd: number | null; items: number | null } {
  if (activity === "backlinks") return month >= "2026-10" ? { usd: 1000, items: null } : { usd: null, items: null };
  if (activity === "youtube") return month >= "2026-11" ? { usd: Math.round(1000 / 3), items: null } : { usd: null, items: null };
  if (activity === "linkedin") return month === "2026-10" ? { usd: 300, items: 5 } : { usd: null, items: null };
  return { usd: null, items: null };
}

export interface SpendMonth {
  spent: number;              // USD
  budget: number | null;      // USD, null = no budget that month
  items: number;              // paid links bought / posts delivered
  itemsTarget: number | null; // e.g. 5 posts for October's LinkedIn batch
}
export interface SpendActivity { key: string; label: string; unit: string; last: SpendMonth; current: SpendMonth }
export interface SpendComparison {
  ready: boolean;
  lastLabel: string;
  currentLabel: string;
  activities: SpendActivity[];
  total: { last: { spent: number; budget: number }; current: { spent: number; budget: number } };
}

/** Money spent per activity, last month vs this month, against each month's budget. */
async function getSpendComparison(projectId: string, today: string): Promise<SpendComparison> {
  const currentKey = today.slice(0, 7);
  const lastKey = shiftMonth(currentKey, -1);
  const supabase = await createClient();
  const usd = (amount: unknown, currency: unknown) => (currency === "INR" ? toNum(amount) * USD_PER_INR : toNum(amount));

  const acts = new Map<string, { key: string; label: string; unit: string; m: Record<string, { spent: number; items: number }> }>();
  const act = (key: string, label: string, unit: string) => {
    let a = acts.get(key);
    if (!a) { a = { key, label, unit, m: { [lastKey]: { spent: 0, items: 0 }, [currentKey]: { spent: 0, items: 0 } } }; acts.set(key, a); }
    return a;
  };
  act("backlinks", "Paid backlinks", "links");
  act("linkedin", "LinkedIn collabs", "posts");
  act("youtube", "YouTube collabs", "posts");
  let anyTable = false;

  const bl = await supabase
    .from("earned_backlinks")
    .select("acquired_date, amount_paid, currency")
    .eq("project_id", projectId)
    .gte("acquired_date", `${lastKey}-01`)
    .lte("acquired_date", monthEnd(currentKey))
    .not("amount_paid", "is", null);
  if (bl.error) {
    if (!(isMissingTable(bl.error.message) || isMissingColumn(bl.error.message))) throw new Error(bl.error.message);
  } else {
    anyTable = true;
    for (const r of (bl.data ?? []) as { acquired_date: string; amount_paid: number | string; currency: string }[]) {
      const v = usd(r.amount_paid, r.currency);
      const slot = act("backlinks", "Paid backlinks", "links").m[r.acquired_date.slice(0, 7)];
      if (v <= 0 || !slot) continue;
      slot.spent += v; slot.items++;
    }
  }

  const co = await supabase
    .from("influencer_collabs")
    .select("platform, amount_paid, currency, post_date, closing_date")
    .eq("project_id", projectId);
  if (co.error) {
    if (!(isMissingTable(co.error.message) || isMissingColumn(co.error.message))) throw new Error(co.error.message);
  } else {
    anyTable = true;
    for (const r of (co.data ?? []) as CollabRow[]) {
      const d = collabSpendDate(r);
      if (!d) continue;
      const platform = (r.platform ?? "Other").trim() || "Other";
      const key = platform.toLowerCase();
      const label = key === "linkedin" ? "LinkedIn collabs" : key === "youtube" ? "YouTube collabs" : `${platform} collabs`;
      const slot = act(key, label, "posts").m[d.slice(0, 7)];
      if (!slot) continue;
      slot.spent += usd(r.amount_paid, r.currency); // a free collab is still a post, at $0
      slot.items++;
    }
  }

  const month = (a: { key: string; m: Record<string, { spent: number; items: number }> }, k: string): SpendMonth => {
    const b = budgetFor(a.key, k);
    return { spent: Math.round(a.m[k].spent), budget: b.usd, items: a.m[k].items, itemsTarget: b.items };
  };
  const activities: SpendActivity[] = [...acts.values()]
    .map((a) => ({ key: a.key, label: a.label, unit: a.unit, last: month(a, lastKey), current: month(a, currentKey) }))
    // Show an activity when it has a budget or spend in either month.
    .filter((a) => a.last.budget !== null || a.current.budget !== null || a.last.items > 0 || a.current.items > 0);

  const sum = (pick: (a: SpendActivity) => SpendMonth) => ({
    spent: activities.reduce((s, a) => s + pick(a).spent, 0),
    budget: activities.reduce((s, a) => s + (pick(a).budget ?? 0), 0),
  });
  return {
    ready: anyTable, lastLabel: monthLabel(lastKey), currentLabel: monthLabel(currentKey),
    activities, total: { last: sum((a) => a.last), current: sum((a) => a.current) },
  };
}

// ---------------------------------------------------------------------------
// Team completion: this week vs last week, per person (Team Targets' own math)
// ---------------------------------------------------------------------------

export interface WeekTask { task: string; done: number; expected: number }
export interface TeamWeekPerson {
  id: string; name: string;
  thisWeek: number;          // 0..1 completion, mean of their targets (Team Targets' rule)
  pace: number;              // 0..1 where they should be by today
  lastWeek: number | null;   // 0..1, null when they had nothing due last week
  tasks: WeekTask[];         // this week's targets with something expected
}
export interface TeamWeekComparison {
  ready: boolean;
  thisLabel: string;
  lastLabel: string;
  team: { thisWeek: number; lastWeek: number };
  people: TeamWeekPerson[];
}

function buildTeamWeek(thisW: TeamTargetsDashboard, lastW: TeamTargetsDashboard, thisLabel: string, lastLabel: string): TeamWeekComparison {
  const lastBy = new Map(lastW.people.map((p) => [p.personId, p]));
  const lastHasWork = new Set(lastW.targets.filter((t) => t.expectedPeriod > 0 && t.ownerId).map((t) => t.ownerId as string));
  const people: TeamWeekPerson[] = [];
  for (const p of thisW.people) {
    const tasks = thisW.targets
      .filter((t) => t.ownerId === p.personId && t.expectedPeriod > 0)
      .map((t) => ({ task: t.task, done: t.doneVerified, expected: t.expectedPeriod }))
      .sort((a, b) => Number(a.done >= a.expected) - Number(b.done >= b.expected) || a.task.localeCompare(b.task));
    if (!tasks.length) continue; // nothing due for them this week
    const last = lastBy.get(p.personId);
    people.push({
      id: p.personId, name: p.name,
      thisWeek: p.completion, pace: p.paceCompletion,
      lastWeek: last && lastHasWork.has(p.personId) ? last.completion : null,
      tasks,
    });
  }
  people.sort((a, b) => b.thisWeek - a.thisWeek || a.name.localeCompare(b.name));
  return {
    ready: thisW.ready, thisLabel, lastLabel,
    team: { thisWeek: thisW.totals.completion, lastWeek: lastW.totals.completion },
    people,
  };
}

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

  // Collabs count in the month the deal closed (collabSpendDate), so the date
  // filter is applied in code, not in the query.
  const coRes = await supabase
    .from("influencer_collabs")
    .select("amount_paid, currency, post_date, closing_date")
    .eq("project_id", projectId)
    .not("amount_paid", "is", null);
  if (coRes.error) {
    if (!(isMissingTable(coRes.error.message) || isMissingColumn(coRes.error.message))) throw new Error(coRes.error.message);
  } else {
    anyTable = true;
    for (const r of (coRes.data ?? []) as CollabRow[]) {
      const d = collabSpendDate(r);
      if (!d || d < range.start || d > range.end) continue;
      const v = usd(r.amount_paid, r.currency);
      if (v <= 0) continue;
      collabsUsd += v; collabsCount++;
      const k = monthKey(d);
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

export interface BacklinksByPerson {
  id: string; name: string;
  count: number; free: number; paid: number;
  paidUsd: number;          // spent on this person's paid links in range (USD)
  avgDr: number | null;
}
export interface BacklinksEarned {
  ready: boolean; count: number; free: number; paid: number; paidUsd: number;
  avgDr: number | null; byPerson: BacklinksByPerson[];
}

type BacklinkRow = {
  domain_rating: number | null; assigned_to: string | null;
  amount_paid: number | string | null; currency: string | null; link_type?: string | null;
  profiles: { name: string | null } | null;
};

async function getBacklinksEarned(projectId: string, range: DateRange): Promise<BacklinksEarned> {
  const empty: BacklinksEarned = { ready: false, count: 0, free: 0, paid: 0, paidUsd: 0, avgDr: null, byPerson: [] };
  const supabase = await createClient();
  const BASE = "domain_rating, assigned_to, amount_paid, currency, profiles!earned_backlinks_assigned_to_fkey ( name )";
  const sel = (cols: string) => supabase
    .from("earned_backlinks")
    .select(cols)
    .eq("project_id", projectId)
    .gte("acquired_date", range.start)
    .lte("acquired_date", range.end);
  let res = await sel(`${BASE}, link_type`);
  if (res.error && isMissingColumn(res.error.message)) res = await sel(BASE);
  if (res.error) {
    if (isMissingTable(res.error.message) || isMissingColumn(res.error.message)) return empty;
    throw new Error(res.error.message);
  }
  const rows = (res.data ?? []) as unknown as BacklinkRow[];
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const usd = (amount: unknown, currency: unknown) => (currency === "INR" ? toNum(amount) * USD_PER_INR : toNum(amount));
  // Same "paid" rule as Team Targets: an amount was paid, or the link type is "Paid".
  const isPaid = (r: BacklinkRow) => toNum(r.amount_paid) > 0 || /^paid$/i.test((r.link_type ?? "").trim());

  let free = 0, paid = 0, paidUsd = 0;
  const drs: number[] = [];
  const per = new Map<string, { id: string; name: string; drs: number[]; free: number; paid: number; paidUsd: number }>();
  for (const r of rows) {
    const k = r.assigned_to ?? "none";
    const e = per.get(k) ?? { id: k, name: r.profiles?.name ?? "Unassigned", drs: [], free: 0, paid: 0, paidUsd: 0 };
    if (isPaid(r)) {
      const spent = usd(r.amount_paid, r.currency);
      e.paid++; e.paidUsd += spent; paid++; paidUsd += spent;
    } else {
      e.free++; free++;
    }
    if (typeof r.domain_rating === "number") { e.drs.push(r.domain_rating); drs.push(r.domain_rating); }
    per.set(k, e);
  }
  const byPerson = [...per.values()].map((e) => ({
    id: e.id, name: e.name, count: e.free + e.paid, free: e.free, paid: e.paid,
    paidUsd: Math.round(e.paidUsd), avgDr: avg(e.drs),
  }));
  return { ready: true, count: rows.length, free, paid, paidUsd: Math.round(paidUsd), avgDr: avg(drs), byPerson };
}

// ---------------------------------------------------------------------------
// Backlinks: last month vs this month, per person, against each month's target.
// Always the two calendar months (not the range filter), per direction.
// ---------------------------------------------------------------------------

// Team Targets keeps only a target's CURRENT number, so a month whose target
// was different is recorded here (per person). Months not listed use the
// current Team Targets numbers. October 2026: 5 free + 2 paid each.
const BACKLINK_TARGET_HISTORY: Record<string, { free: number; paid: number }> = {
  "2026-10": { free: 5, paid: 2 },
};

export interface BacklinkMonthStat {
  free: number;          // unpaid links (exchange, guest post, free)
  paid: number;          // paid links at/above the paid target's DR bar: count toward it
  paidBelow: number;     // paid links under the DR bar: shown, not counted
  paidUsd: number;       // spent on `paid`
  paidBelowUsd: number;  // spent on `paidBelow`
  avgDr: number | null;
  freeTarget: number | null;
  paidTarget: number | null;
}
export interface BacklinkPersonMonths { id: string; name: string; last: BacklinkMonthStat; current: BacklinkMonthStat }
export interface BacklinkComparison {
  ready: boolean;
  lastLabel: string;
  currentLabel: string;
  paidMinDr: number;
  people: BacklinkPersonMonths[];
}

const blankStat = (): BacklinkMonthStat => ({
  free: 0, paid: 0, paidBelow: 0, paidUsd: 0, paidBelowUsd: 0, avgDr: null, freeTarget: null, paidTarget: null,
});

function shiftMonth(key: string, by: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthlyTarget(t: { target: number; frequency: string }): number {
  if (t.frequency === "monthly") return t.target;
  if (t.frequency === "weekly") return Math.round((t.target * 52) / 12);
  return Math.round(t.target * 22); // daily -> ~22 working days
}

async function getBacklinkComparison(projectId: string, today: string, team: TeamTargetsDashboard): Promise<BacklinkComparison> {
  const currentKey = today.slice(0, 7);
  const lastKey = shiftMonth(currentKey, -1);
  const base = { lastLabel: monthLabel(lastKey), currentLabel: monthLabel(currentKey) };

  const people = new Map<string, BacklinkPersonMonths>();
  const ensure = (id: string, name: string | null): BacklinkPersonMonths => {
    let p = people.get(id);
    if (!p) { p = { id, name: name ?? "Unknown", last: blankStat(), current: blankStat() }; people.set(id, p); }
    else if (p.name === "Unknown" && name) p.name = name;
    return p;
  };

  // This month's targets per person come from Team Targets' backlink tasks;
  // every owner shows, even with zero links.
  let paidMinDr = 70;
  for (const t of team.targets) {
    const rule = backlinkRuleFor(t.task);
    if (!rule || !t.ownerId) continue;
    if (rule.paid && rule.minDr !== null) paidMinDr = rule.minDr;
    const p = ensure(t.ownerId, t.ownerName);
    const n = monthlyTarget(t);
    if (rule.paid) p.current.paidTarget = (p.current.paidTarget ?? 0) + n;
    else p.current.freeTarget = (p.current.freeTarget ?? 0) + n;
  }
  const hist = BACKLINK_TARGET_HISTORY[lastKey];
  for (const p of people.values()) {
    p.last.freeTarget = p.current.freeTarget === null ? null : hist ? hist.free : p.current.freeTarget;
    p.last.paidTarget = p.current.paidTarget === null ? null : hist ? hist.paid : p.current.paidTarget;
  }

  const supabase = await createClient();
  const BASE = "acquired_date, domain_rating, assigned_to, amount_paid, currency, profiles!earned_backlinks_assigned_to_fkey ( name )";
  const sel = (cols: string) => supabase
    .from("earned_backlinks")
    .select(cols)
    .eq("project_id", projectId)
    .gte("acquired_date", `${lastKey}-01`)
    .lte("acquired_date", monthEnd(currentKey));
  let res = await sel(`${BASE}, link_type`);
  if (res.error && isMissingColumn(res.error.message)) res = await sel(BASE);
  if (res.error) {
    if (isMissingTable(res.error.message) || isMissingColumn(res.error.message)) return { ...base, ready: false, paidMinDr, people: [] };
    throw new Error(res.error.message);
  }

  const usd = (amount: unknown, currency: unknown) => (currency === "INR" ? toNum(amount) * USD_PER_INR : toNum(amount));
  const drs = new Map<BacklinkMonthStat, number[]>();
  for (const r of (res.data ?? []) as unknown as (BacklinkRow & { acquired_date: string })[]) {
    const p = ensure(r.assigned_to ?? "none", r.assigned_to ? r.profiles?.name ?? null : "Unassigned");
    const month = r.acquired_date.slice(0, 7);
    const s = month === currentKey ? p.current : month === lastKey ? p.last : null;
    if (!s) continue;
    const paid = toNum(r.amount_paid) > 0 || /^paid$/i.test((r.link_type ?? "").trim());
    if (!paid) s.free++;
    else if ((r.domain_rating ?? 0) >= paidMinDr) { s.paid++; s.paidUsd += usd(r.amount_paid, r.currency); }
    else { s.paidBelow++; s.paidBelowUsd += usd(r.amount_paid, r.currency); }
    if (typeof r.domain_rating === "number") drs.set(s, [...(drs.get(s) ?? []), r.domain_rating]);
  }
  for (const p of people.values()) {
    for (const s of [p.last, p.current]) {
      const d = drs.get(s) ?? [];
      s.avgDr = d.length ? Math.round(d.reduce((a, b) => a + b, 0) / d.length) : null;
      s.paidUsd = Math.round(s.paidUsd);
      s.paidBelowUsd = Math.round(s.paidBelowUsd);
    }
  }

  const total = (s: BacklinkMonthStat) => s.free + s.paid;
  const list = [...people.values()].sort((a, b) => total(b.current) - total(a.current) || a.name.localeCompare(b.name));
  return { ...base, ready: true, paidMinDr, people: list };
}

/** Everyone who owns a backlink target shows on the chart, even with zero links in range. */
function withBacklinkOwners(b: BacklinksEarned, team: TeamTargetsDashboard): BacklinksEarned {
  if (!b.ready) return b;
  const seen = new Set(b.byPerson.map((p) => p.id));
  const people = [...b.byPerson];
  for (const t of team.targets) {
    if (!backlinkRuleFor(t.task)) continue;
    const owners: [string | null, string | null][] = [
      [t.ownerId, t.ownerName], [t.coOwnerId, t.coOwnerName], [t.coOwner2Id, t.coOwner2Name],
    ];
    for (const [id, name] of owners) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      people.push({ id, name: name ?? "Unknown", count: 0, free: 0, paid: 0, paidUsd: 0, avgDr: null });
    }
  }
  people.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { ...b, byPerson: people };
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
  spend: SpendSummary;                 // range-based (the Money spent tile)
  spendMonths: SpendComparison;        // per activity, last month vs this month, vs budget
  backlinks: BacklinksEarned;
  backlinkMonths: BacklinkComparison;  // last month vs this month, per person
  teamWeek: TeamWeekComparison;        // this week vs last week, per person
  // Cost efficiency (USD), null when the denominator is missing/zero.
  costPerDrPoint: number | null;
  costPerBacklink: number | null;
}

export async function getExecutiveDashboard(
  projectId: string, rangeKey: string, ga4PropertyId: string | null = null,
): Promise<ExecutiveDashboard> {
  const { range, label, key } = resolveExecRange(rangeKey);
  const today = istToday();
  // Weeks run Monday-Sunday, exactly as on the Team Targets page.
  const weekStart = currentWeekStart();
  const lastWeekStart = addDays(weekStart, -7);
  const thisWeek: Period = { key: "custom", start: weekStart, end: addDays(weekStart, 6), label: "This week" };
  const lastWeek: Period = { key: "custom", start: lastWeekStart, end: addDays(lastWeekStart, 6), label: "Last week" };

  const [manual, trafficActuals, spend, spendMonths, backlinksRaw, teamThis, teamLast] = await Promise.all([
    getManualPoints(projectId),
    getTrafficActuals(ga4PropertyId, today),
    getSpendSummary(projectId, range),
    getSpendComparison(projectId, today),
    getBacklinksEarned(projectId, range),
    getTeamTargetsDashboard(projectId, thisWeek),
    getTeamTargetsDashboard(projectId, lastWeek),
  ]);

  const backlinks = withBacklinkOwners(backlinksRaw, teamThis);
  const backlinkMonths = await getBacklinkComparison(projectId, today, teamThis);
  const teamWeek = buildTeamWeek(
    teamThis, teamLast,
    `This week (${formatWeekRange(weekStart)})`, `last week (${formatWeekRange(lastWeekStart)})`,
  );
  const pts = manual.rows;
  const strip =(p: ManualPoint): MetricPoint => ({ id: p.id, date: p.date, value: p.value, note: p.note });
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
    spend, spendMonths, backlinks, backlinkMonths, teamWeek,
    costPerDrPoint, costPerBacklink,
  };
}
