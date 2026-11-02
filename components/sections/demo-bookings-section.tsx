// Analytics · Demo bookings — server round-trip (GA4), streamed in its own
// Suspense boundary below Traffic sources. Fetches the non-paid bookings-by-
// channel breakdown; the client panel handles expand + per-booking detail.

import { getGa4DemoBookings } from "@/lib/google/ga4";
import { resolveTrafficCompareRange, TRAFFIC_RANGE_PRESETS } from "@/lib/data/analytics-range";
import { DemoBookingsPanel } from "@/components/sections/demo-bookings-panel";

export async function DemoBookingsStreamed({ propertyId, range }: { propertyId: string | null; range: string }) {
  const data = await getGa4DemoBookings(propertyId, resolveTrafficCompareRange(range));
  const rangeLabel = (TRAFFIC_RANGE_PRESETS.find((p) => p.key === range) ?? TRAFFIC_RANGE_PRESETS[1]).label;
  return <DemoBookingsPanel data={data} range={range} rangeLabel={rangeLabel} />;
}
