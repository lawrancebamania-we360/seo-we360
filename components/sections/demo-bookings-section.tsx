// Analytics · Demo bookings — server round-trip (GA4), streamed in its own
// Suspense boundary below Traffic sources. Fetches the non-paid bookings-by-
// channel breakdown; the client panel handles expand + per-booking detail.

import { getGa4DemoBookings, getGa4DemoCta, getGa4PropertyTimezone } from "@/lib/google/ga4";
import { getHubspotVerification } from "@/lib/hubspot/leads";
import { resolveTrafficCompareRange, TRAFFIC_RANGE_PRESETS } from "@/lib/data/analytics-range";
import { DemoBookingsPanel } from "@/components/sections/demo-bookings-panel";

export async function DemoBookingsStreamed({ propertyId, range }: { propertyId: string | null; range: string }) {
  const compareRange = resolveTrafficCompareRange(range);
  const [data, cta, hubspot, propertyTz] = await Promise.all([
    getGa4DemoBookings(propertyId, compareRange),
    getGa4DemoCta(propertyId, compareRange.current),
    getHubspotVerification(compareRange.current),
    getGa4PropertyTimezone(propertyId),
  ]);
  const rangeLabel = (TRAFFIC_RANGE_PRESETS.find((p) => p.key === range) ?? TRAFFIC_RANGE_PRESETS[1]).label;
  return <DemoBookingsPanel data={data} cta={cta} hubspot={hubspot} propertyTz={propertyTz} range={range} rangeLabel={rangeLabel} />;
}
