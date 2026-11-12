// Competitors: a domain's Top Pages by organic traffic (Ahrefs via Apify).
// Reader for the Competitors page's "Top 10 pages" board. Grouped by competitor
// (competitor_id) with the project's own domain under the key "__project__".
// Degrades to empty (ready=false) until the migration is applied.

import { createClient } from "@/lib/supabase/server";
import { isMissingTable, isMissingColumn } from "@/lib/ai-citation/run-state";
import { PROJECT_KEY, type CompetitorTopPagesGroup } from "@/lib/types/competitor-top-pages";

export { PROJECT_KEY };
export type { CompetitorTopPage, CompetitorTopPagesGroup } from "@/lib/types/competitor-top-pages";

export async function getCompetitorTopPages(
  projectId: string,
): Promise<{ ready: boolean; groups: Map<string, CompetitorTopPagesGroup> }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("competitor_top_pages")
    .select("competitor_id, domain, url, estimated_traffic, traffic_share, rank, fetched_at")
    .eq("project_id", projectId)
    .order("rank", { ascending: true });

  if (error) {
    if (isMissingTable(error.message) || isMissingColumn(error.message)) return { ready: false, groups: new Map() };
    throw new Error(`Could not load competitor top pages: ${error.message}`);
  }

  const groups = new Map<string, CompetitorTopPagesGroup>();
  for (const r of (data ?? []) as {
    competitor_id: string | null; domain: string; url: string;
    estimated_traffic: number | null; traffic_share: number | null; rank: number; fetched_at: string;
  }[]) {
    const key = r.competitor_id ?? PROJECT_KEY;
    const g = groups.get(key) ?? { domain: r.domain, fetchedAt: r.fetched_at, pages: [] };
    g.pages.push({ url: r.url, estimatedTraffic: r.estimated_traffic, trafficShare: r.traffic_share, rank: r.rank });
    groups.set(key, g);
  }
  return { ready: true, groups };
}
