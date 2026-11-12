// Executive Dashboard data layer.
//
// One concise, leadership-facing view: target vs achieved (traffic & DR),
// money spent and the effect it bought, and what each person is working on -
// all for a selectable date range (default: this month).
//
// Everything here is DB-backed so it works the same locally and in prod (GA4
// and GSC return 403 off the Vercel runtime). Traffic and DR come from the
// hand-entered seo_metric_points table; money from earned_backlinks +
// influencer_collabs; team from the existing Team Targets dashboard. Each reader degrades (ready=false, zero
// rows) when its table/column isn't there yet, so the page never 500s before
// the migration is applied.

import { createClient } from "@/lib/supabase/server";
import { isMissingTable, isMissingColumn } from "@/lib/ai-citation/run-state";
import {
  resolveTrafficCompareRange,
  TRAFFIC_RANGE_PRESETS,
  type TrafficRangeKey,
  type DateRange,
} from "@/lib/data/analytics-range";
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

export const EXEC_RANGE_DEFAULT: TrafficRangeKey = "this_month";
export function resolveExecRange(key: string): { range: DateRange; label: string; key: TrafficRangeKey } {
  const k = (TRAFFIC_RANGE_PRESETS.some((p) => p.key === key) ? key : EXEC_RANGE_DEFAULT) as TrafficRangeKey;
  const label = TRAFFIC_RANGE_PRESETS.find((p) => p.key === k)!.label;
  return { range: resolveTrafficCompareRange(k).current, label, key: k };
}

// ---------------------------------------------------------------------------
// Metric points (DR + Traffic, actual + target)
// ---------------------------------------------------------------------------

export interface MetricPoint { date: string; value: number; note: string | null; id: string }
export interface MetricSeries {
  ready: boolean;
  metric: "dr" | "traffic";
  actual: MetricPoint[];       // measured values in range, oldest -> newest
  targets: MetricPoint[];      // target values in range
  latestActual: number | null; // most recent actual on/before range end
  latestTarget: number | null; // most recent target on/before range end
  firstActual: number | null;  // oldest actual in range (for delta/effect)
  delta: number | null;        // latestActual - firstActual
}

async function getMetricSeries(projectId: string, metric: "dr" | "traffic", range: DateRange): Promise<MetricSeries> {
  const empty: MetricSeries = {
    ready: false, metric, actual: [], targets: [],
    latestActual: null, latestTarget: null, firstActual: null, delta: null,
  };
  const supabase = await createClient();
  // Pull everything on/before range end so "latest target/actual" is correct
  // even when the last point was set before the window opened.
  const { data, error } = await supabase
    .from("seo_metric_points")
    .select("id, kind, value, as_of, note")
    .eq("project_id", projectId)
    .eq("metric", metric)
    .lte("as_of", range.end)
    .order("as_of", { ascending: true });
  if (error) {
    if (isMissingTable(error.message) || isMissingColumn(error.message)) return empty;
    throw new Error(`Could not load ${metric} points: ${error.message}`);
  }
  const rows = (data ?? []) as { id: string; kind: string; value: number; as_of: string; note: string | null }[];
  const inRange = (r: { as_of: string }) => r.as_of >= range.start && r.as_of <= range.end;
  const actualAll = rows.filter((r) => r.kind === "actual");
  const targetAll = rows.filter((r) => r.kind === "target");
  const actual = actualAll.filter(inRange).map((r) => ({ id: r.id, date: r.as_of, value: toNum(r.value), note: r.note }));
  const targets = targetAll.filter(inRange).map((r) => ({ id: r.id, date: r.as_of, value: toNum(r.value), note: r.note }));
  const latestActual = actualAll.length ? toNum(actualAll[actualAll.length - 1].value) : null;
  const latestTarget = targetAll.length ? toNum(targetAll[targetAll.length - 1].value) : null;
  const firstActual = actual.length ? actual[0].value : null;
  const delta = latestActual !== null && firstActual !== null ? Math.round((latestActual - firstActual) * 100) / 100 : null;
  return { ready: true, metric, actual, targets, latestActual, latestTarget, firstActual, delta };
}

// ---------------------------------------------------------------------------
// Money spent (USD) + the content it bought
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
  traffic: MetricSeries;
  dr: MetricSeries;
  spend: SpendSummary;
  backlinks: BacklinksEarned;
  team: TeamTargetsDashboard;
  // Cost efficiency (USD), null when the denominator is missing/zero.
  costPerDrPoint: number | null;
  costPerBacklink: number | null;
}

export async function getExecutiveDashboard(projectId: string, rangeKey: string): Promise<ExecutiveDashboard> {
  const { range, label, key } = resolveExecRange(rangeKey);
  const teamPeriod: Period = { key: "custom", start: range.start, end: range.end, label };

  const [traffic, dr, spend, backlinks, team] = await Promise.all([
    getMetricSeries(projectId, "traffic", range),
    getMetricSeries(projectId, "dr", range),
    getSpendSummary(projectId, range),
    getBacklinksEarned(projectId, range),
    getTeamTargetsDashboard(projectId, teamPeriod),
  ]);

  const costPerDrPoint = dr.delta && dr.delta > 0 ? Math.round(spend.totalUsd / dr.delta) : null;
  const costPerBacklink = spend.backlinksCount > 0 ? Math.round(spend.backlinksUsd / spend.backlinksCount) : null;

  return {
    rangeKey: key, rangeLabel: label, range,
    traffic, dr, spend, backlinks, team,
    costPerDrPoint, costPerBacklink,
  };
}
