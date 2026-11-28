"use client";

// Renders the collabs table ONCE and fills in the GA4 visits / demos / deals
// when the streamed attribution promise resolves. (The previous Suspense
// fallback rendered a second table and swapped it in, which closed any row or
// dialog opened in the first few seconds.) On a refresh the old numbers stay
// up until the new ones land, instead of flashing back to "…".

import { useEffect, useState } from "react";
import { InfluencerCollabsTable } from "@/components/sections/influencer-collabs/influencer-collabs-table";
import { UtmLinksPanel } from "@/components/sections/influencer-collabs/utm-links-panel";
import type { InfluencerAttribution } from "@/lib/data/influencer-attribution";

type Props = Omit<React.ComponentProps<typeof InfluencerCollabsTable>, "attribution"> & {
  attributionPromise: Promise<InfluencerAttribution>;
};

const FAILED: InfluencerAttribution = {
  ready: false, reason: "Couldn't load the Google Analytics numbers.", dealsReady: false, byPost: {}, totals: null, utmLinks: [],
};

export function InfluencerCollabsTableLive({ attributionPromise, ...props }: Props) {
  const [attribution, setAttribution] = useState<InfluencerAttribution | null>(null);
  useEffect(() => {
    let alive = true;
    attributionPromise.then(
      (a) => { if (alive) setAttribution(a); },
      () => { if (alive) setAttribution(FAILED); },
    );
    return () => { alive = false; };
  }, [attributionPromise]);
  return (
    <div className="space-y-8">
      <InfluencerCollabsTable {...props} attribution={attribution} />
      <UtmLinksPanel attribution={attribution} collabs={props.collabs} />
    </div>
  );
}
