// Analytics (Ticket 3): the date-range filter for Traffic Sources' delta
// comparisons. Same URL-param-driven preset pattern as Backlinks'
// resolveBacklinkRange, but each preset here ALSO carries its own comparison
// ("previous") window, computed the way this team actually reasons about it:
//
//   - Last 7 days / Last 30 days / Last 3 months / Last 6 months: trailing
//     window vs the equal-length window immediately before it.
//   - This month: month-to-date vs the SAME NUMBER OF ELAPSED DAYS in the
//     prior month, not the whole prior month - a 7-day-old month compared
//     against a full 30-31 day prior month would show a manufactured 75%+
//     drop that's really just "the month isn't over yet."
//   - This year: year-to-date vs the same elapsed-day count last year, same
//     reasoning applied at the year scale.

export type TrafficRangeKey =
  | "last_7_days" | "last_30_days" | "this_month" | "last_3_months" | "last_6_months" | "this_year";

export interface DateRange { start: string; end: string } // inclusive, YYYY-MM-DD

export interface AnalyticsCompareRange {
  current: DateRange;
  previous: DateRange;
}

export const TRAFFIC_RANGE_PRESETS: { key: TrafficRangeKey; label: string }[] = [
  { key: "last_7_days", label: "Last 7 days" },
  { key: "last_30_days", label: "Last 30 days" },
  { key: "this_month", label: "This month" },
  { key: "last_3_months", label: "Last 3 months" },
  { key: "last_6_months", label: "Last 6 months" },
  { key: "this_year", label: "This year" },
];

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number): Date => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const addMonths = (d: Date, n: number): Date => { const r = new Date(d); r.setMonth(r.getMonth() + n); return r; };
const daysBetween = (a: Date, b: Date): number => Math.round((b.getTime() - a.getTime()) / 86400000);

function trailingWindow(now: Date, days: number): AnalyticsCompareRange {
  const currentStart = addDays(now, -(days - 1));
  const previousEnd = addDays(currentStart, -1);
  const previousStart = addDays(previousEnd, -(days - 1));
  return { current: { start: iso(currentStart), end: iso(now) }, previous: { start: iso(previousStart), end: iso(previousEnd) } };
}

function trailingMonths(now: Date, months: number): AnalyticsCompareRange {
  const currentStart = addMonths(now, -months);
  const previousEnd = addDays(currentStart, -1);
  const previousStart = addMonths(previousEnd, -months);
  return { current: { start: iso(currentStart), end: iso(now) }, previous: { start: iso(previousStart), end: iso(previousEnd) } };
}

export function resolveTrafficCompareRange(rangeKey: string, now: Date = new Date()): AnalyticsCompareRange {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (rangeKey as TrafficRangeKey) {
    case "last_7_days":
      return trailingWindow(today, 7);
    case "this_month": {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const elapsedDays = daysBetween(monthStart, today) + 1;
      const priorMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const priorMonthEquivalentEnd = addDays(priorMonthStart, elapsedDays - 1);
      return { current: { start: iso(monthStart), end: iso(today) }, previous: { start: iso(priorMonthStart), end: iso(priorMonthEquivalentEnd) } };
    }
    case "last_3_months":
      return trailingMonths(today, 3);
    case "last_6_months":
      return trailingMonths(today, 6);
    case "this_year": {
      const yearStart = new Date(today.getFullYear(), 0, 1);
      const elapsedDays = daysBetween(yearStart, today) + 1;
      const priorYearStart = new Date(today.getFullYear() - 1, 0, 1);
      const priorYearEquivalentEnd = addDays(priorYearStart, elapsedDays - 1);
      return { current: { start: iso(yearStart), end: iso(today) }, previous: { start: iso(priorYearStart), end: iso(priorYearEquivalentEnd) } };
    }
    default: // "last_30_days"
      return trailingWindow(today, 30);
  }
}
