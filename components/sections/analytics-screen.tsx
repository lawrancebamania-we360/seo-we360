// Analytics — the informational companion to Overview. Surfaces GA4 + GSC data
// the app already collected but never rendered: the traffic-source mix, and
// (Ticket 6) five clickable category boxes - Top 10 Movers, Top 10 Page
// Views, Pages Going Stale, Top 20 Engaged/Disengaged, Blog Clusters -
// replacing the old always-stacked layout so only one is visible at a time.
// Composition root: local (Supabase) reads arrive resolved as props; the
// Google round-trips stream in their own <Suspense> boundaries so a slow
// GA4/GSC call never stalls the page.

import { Suspense } from "react";

import { TrafficSourcesStreamed } from "@/components/sections/traffic-sources-section";
import { RankingMoversStreamed, PageViewMoversStreamed } from "@/components/sections/weekly-movers-section";
import { ContentDecaySection } from "@/components/sections/content-decay-section";
import { EngagementExtremesSection } from "@/components/sections/engagement-extremes-section";
import { BlogClustersAnalyticsBox } from "@/components/sections/blog-clusters-analytics-box";
import { AnalyticsCategoryBoxes } from "@/components/sections/analytics-category-boxes";
import type { ContentFreshnessRow } from "@/lib/data/content-freshness";
import type { EngagementRateExtremes } from "@/lib/data/url-metrics";
import type { BlogClusterSummary } from "@/lib/data/blog-clusters";

export function AnalyticsScreen({
  range,
  projectId,
  siteUrl,
  propertyId,
  freshness,
  engagementExtremes,
  clusters,
}: {
  range: string;
  projectId: string;
  siteUrl: string | null;
  propertyId: string | null;
  freshness: ContentFreshnessRow[];
  engagementExtremes: EngagementRateExtremes;
  clusters: BlogClusterSummary[];
}) {
  return (
    <div className="space-y-8 px-6 pb-12 pt-6 lg:px-10">
      <div>
        <h1 className="font-heading text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl">
          Analytics
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          How people find your site, and which pages are winning or slipping.
        </p>
      </div>

      <Suspense fallback={<SectionSkeleton kind="donut" />}>
        <TrafficSourcesStreamed propertyId={propertyId} projectId={projectId} range={range} />
      </Suspense>

      <AnalyticsCategoryBoxes
        moversPanel={
          <Suspense fallback={<SectionSkeleton kind="movers" />}>
            <RankingMoversStreamed siteUrl={siteUrl} />
          </Suspense>
        }
        pageViewsPanel={
          <Suspense fallback={<SectionSkeleton kind="movers" />}>
            <PageViewMoversStreamed propertyId={propertyId} />
          </Suspense>
        }
        stalePanel={<ContentDecaySection rows={freshness} />}
        engagementPanel={<EngagementExtremesSection extremes={engagementExtremes} />}
        blogClustersPanel={<BlogClustersAnalyticsBox projectId={projectId} clusters={clusters} />}
      />
    </div>
  );
}

function SectionSkeleton({ kind }: { kind: "donut" | "movers" }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="h-3.5 w-64 animate-pulse rounded bg-muted" />
      </div>
      {kind === "donut" ? (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-lift">
          <div className="flex flex-col gap-7 lg:flex-row lg:items-center">
            <div className="mx-auto size-[120px] animate-pulse rounded-full bg-muted lg:mx-0" />
            <div className="flex-1 space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-3.5 w-full animate-pulse rounded bg-muted" />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-5 shadow-lift">
              <div className="space-y-3">
                {[0, 1, 2, 3].map((j) => (
                  <div key={j} className="h-8 w-full animate-pulse rounded bg-muted" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
