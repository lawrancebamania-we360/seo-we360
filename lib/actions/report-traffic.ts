"use server";

import { createClient } from "@/lib/supabase/server";
import { executeAction, type GA4Metric } from "@/lib/integrations/composio";

// Whole-site GA4 ORGANIC SEARCH traffic, last calendar month vs current
// month-to-date. Powers the two comparison boxes at the top of the Reports
// page.
//
// "Organic" = sessions whose default channel group is "Organic Search" —
// i.e. visitors who arrived from a search engine, not direct / paid /
// social / referral. This is the number that reflects SEO performance.
//
// Live Composio GA4 call, run on demand from the client component so a
// slow/failed GA4 call degrades only the boxes, not the whole report.

export interface MonthlyTrafficComparison {
  ok: boolean;
  error?: string;
  lastMonth: { label: string; sessions: number };
  thisMonth: { label: string; sessions: number; partial: boolean };
  deltaPct: number | null;   // % change this vs last (null if last month is 0)
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export async function getMonthlyTrafficComparison(): Promise<MonthlyTrafficComparison> {
  const empty: MonthlyTrafficComparison = {
    ok: false,
    lastMonth: { label: "", sessions: 0 },
    thisMonth: { label: "", sessions: 0, partial: true },
    deltaPct: null,
  };

  // Resolve the GA4 property id from the active project.
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("ga4_property_id")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const propertyId = (project as { ga4_property_id?: string } | null)?.ga4_property_id;
  if (!propertyId) {
    return { ...empty, error: "GA4 property not configured on the project." };
  }

  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  // Current month: 1st -> today.
  const thisStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  // Last month: 1st -> last day.
  const lastStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));

  const thisLabel = `${MONTHS[thisStart.getUTCMonth()]} ${thisStart.getUTCFullYear()}`;
  const lastLabel = `${MONTHS[lastStart.getUTCMonth()]} ${lastStart.getUTCFullYear()}`;

  try {
    const [lastSessions, thisSessions] = await Promise.all([
      organicSessions(propertyId, iso(lastStart), iso(lastEnd)),
      organicSessions(propertyId, iso(thisStart), iso(now)),
    ]);
    const deltaPct = lastSessions > 0
      ? ((thisSessions - lastSessions) / lastSessions) * 100
      : null;
    return {
      ok: true,
      lastMonth: { label: lastLabel, sessions: lastSessions },
      thisMonth: { label: `${thisLabel} (so far)`, sessions: thisSessions, partial: true },
      deltaPct,
    };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : "GA4 fetch failed" };
  }
}

// Whole-site ORGANIC SEARCH sessions for an explicit date range.
// The dimensionFilter restricts the count to the "Organic Search" channel;
// with no `dimensions` in the request, GA4 still returns a single totals
// row — the aggregated organic-only session count.
async function organicSessions(propertyId: string, startDate: string, endDate: string): Promise<number> {
  const input = {
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate, endDate }],
    metrics: [{ name: "sessions" }],
    dimensionFilter: {
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: { matchType: "EXACT", value: "Organic Search" },
      },
    },
  };
  const result = await executeAction<GA4Metric>("GOOGLE_ANALYTICS_RUN_REPORT", input);
  const row = result.data.rows?.[0];
  return parseInt(row?.metricValues?.[0]?.value ?? "0", 10) || 0;
}
