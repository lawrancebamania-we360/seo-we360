// Analytics · Content -> demo funnels — server round-trip (GA4 alpha funnel API),
// streamed in its own Suspense boundary. Fetches the Blogs / Guides / Marketing
// funnels in parallel and hands plain data (with labels) to the client cards.

import { getGa4ContentDemoFunnel, FUNNEL_SEGMENTS } from "@/lib/google/ga4";
import { resolveTrafficCompareRange, TRAFFIC_RANGE_PRESETS } from "@/lib/data/analytics-range";
import { ContentFunnels, type FunnelCard } from "@/components/sections/content-funnels";

export async function ContentFunnelsStreamed({ propertyId, range }: { propertyId: string | null; range: string }) {
  const window = resolveTrafficCompareRange(range).current;
  const results = await Promise.all(FUNNEL_SEGMENTS.map((s) => getGa4ContentDemoFunnel(propertyId, window, s.key)));
  const funnels: FunnelCard[] = FUNNEL_SEGMENTS.map((s, i) => ({ ...results[i], label: s.label, step1Label: s.step1 }));
  const rangeLabel = (TRAFFIC_RANGE_PRESETS.find((p) => p.key === range) ?? TRAFFIC_RANGE_PRESETS[1]).label;
  return <ContentFunnels funnels={funnels} rangeLabel={rangeLabel} />;
}
