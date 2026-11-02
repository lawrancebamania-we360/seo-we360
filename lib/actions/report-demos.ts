"use server";

// On-demand per-channel demo-booking detail — called when a source row in the
// Demo bookings panel is expanded. Resolves the active project's GA4 property
// (same way report-traffic.ts does) and the current window for the selected
// range, then hands off to the GA4 reader.

import { createClient } from "@/lib/supabase/server";
import { resolveTrafficCompareRange } from "@/lib/data/analytics-range";
import { getGa4DemoBookingDetail, type Ga4BookingDetailRow } from "@/lib/google/ga4";

export async function getDemoBookingDetail(
  range: string,
  channel: string,
): Promise<{ ok: boolean; reason?: string; rows: Ga4BookingDetailRow[] }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "Not authenticated.", rows: [] };

  const { data: project } = await supabase
    .from("projects").select("ga4_property_id")
    .eq("is_active", true).order("created_at", { ascending: true }).limit(1).maybeSingle();
  const propertyId = (project as { ga4_property_id?: string } | null)?.ga4_property_id ?? null;

  const window = resolveTrafficCompareRange(range).current;
  return getGa4DemoBookingDetail(propertyId, { start: window.start, end: window.end }, channel);
}
