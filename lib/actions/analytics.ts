"use server";

// Analytics Ticket 10: on-demand fetch for the Blog Clusters box - the box
// lists clusters cheaply (getBlogClusters, already fetched server-side for
// the page), then lazy-loads one cluster's resolved-URL + ranking join only
// when the team actually clicks into it, instead of running that resolution
// for every cluster on every Analytics page load.
//
// compareRange is computed client-side (resolveTrafficCompareRange is a pure
// function) from whichever date-range preset is selected in Traffic Sources
// above, so the cluster's position/clicks/CTR deltas match that exact
// window - see lib/data/blog-clusters.ts for why this is live GSC, not the
// cached url_metrics snapshot table.

import { getBlogClusterAnalytics, type BlogClusterAnalytics } from "@/lib/data/blog-clusters";
import type { AnalyticsCompareRange } from "@/lib/data/analytics-range";

export async function fetchBlogClusterAnalytics(
  projectId: string, clusterId: string, siteUrl: string | null, compareRange: AnalyticsCompareRange,
): Promise<BlogClusterAnalytics | null> {
  return getBlogClusterAnalytics(projectId, clusterId, siteUrl, compareRange);
}
