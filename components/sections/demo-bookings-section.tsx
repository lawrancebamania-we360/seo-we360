// Analytics · Deals captured — server round-trip (GA4 + HubSpot), streamed in its
// own Suspense boundary below Traffic sources. Fetches non-paid demo bookings
// (GA4) and real deal createdates (HubSpot), matches them into unique organic
// deals by channel, and also loads the CTA aggregate. The client panel renders it.

import { getGa4NonPaidDemoRows, getGa4DemoCta, getGa4PropertyTimezone } from "@/lib/google/ga4";
import { getHubspotVerification } from "@/lib/hubspot/leads";
import { buildOrganicDeals } from "@/lib/analytics/organic-deals";
import { resolveTrafficCompareRange, TRAFFIC_RANGE_PRESETS } from "@/lib/data/analytics-range";
import { DemoBookingsPanel } from "@/components/sections/demo-bookings-panel";

export async function DemoBookingsStreamed({ propertyId, range }: { propertyId: string | null; range: string }) {
  const window = resolveTrafficCompareRange(range).current;
  const [rowsRes, cta, hubspot, propertyTz] = await Promise.all([
    getGa4NonPaidDemoRows(propertyId, window),
    getGa4DemoCta(propertyId, window),
    getHubspotVerification(window),
    getGa4PropertyTimezone(propertyId),
  ]);

  const organic = buildOrganicDeals(rowsRes.rows, hubspot.verifyTimestamps, propertyTz);
  const rangeLabel = (TRAFFIC_RANGE_PRESETS.find((p) => p.key === range) ?? TRAFFIC_RANGE_PRESETS[1]).label;

  return (
    <DemoBookingsPanel
      organic={organic}
      gaOk={rowsRes.ok}
      gaReason={rowsRes.reason}
      hsOk={hubspot.ok}
      hsReason={hubspot.reason}
      cta={cta}
      rangeLabel={rangeLabel}
    />
  );
}
