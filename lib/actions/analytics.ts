"use server";

// Analytics Ticket 10: on-demand fetch for the Blog Clusters box - the box
// lists clusters cheaply (getBlogClusters, already fetched server-side for
// the page), then lazy-loads one cluster's resolved-URL + ranking join only
// when the team actually clicks into it, instead of running that resolution
// for every cluster on every Analytics page load.

import { getBlogClusterAnalytics, type BlogClusterAnalytics } from "@/lib/data/blog-clusters";

export async function fetchBlogClusterAnalytics(projectId: string, clusterId: string): Promise<BlogClusterAnalytics | null> {
  return getBlogClusterAnalytics(projectId, clusterId, "30d");
}
