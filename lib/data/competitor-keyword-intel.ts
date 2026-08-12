import { createClient } from "@/lib/supabase/server";

// Real competitor keyword data — sourced from the santhej/website-traffic-intel
// Apify actor, run monthly by lib/cron/phase-11-competitor-keywords.ts. Feeds
// the Competitors page's "What they rank for" boards, "Keyword gap" panel, and
// the scorecard's Domain Rating column (which reuses the existing
// domain_authority table already collected by phase-9-intelligence.ts).

export type CompetitorTopKeyword = { keyword: string; position: number | null; volume: number | null };

export type CompetitorKeywordSnapshot = {
  competitorId: string;
  domain: string;
  estimatedTraffic: number | null;
  keywordsRanked: number | null;
  topKeywords: CompetitorTopKeyword[];
  checkedAt: string;
  // Month-over-month — null until a second monthly snapshot exists.
  keywordsRankedDelta: number | null;
};

type SnapshotRow = {
  competitor_id: string;
  domain: string;
  estimated_traffic: number | null;
  keywords_ranked: number | null;
  top_keywords: CompetitorTopKeyword[] | null;
  checked_at: string;
};

/** Latest + previous monthly snapshot per tracked competitor, with the keyword-count delta already computed. */
export async function getCompetitorKeywordSnapshots(projectId: string): Promise<Map<string, CompetitorKeywordSnapshot>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("competitor_keyword_snapshots")
    .select("competitor_id, domain, estimated_traffic, keywords_ranked, top_keywords, checked_at")
    .eq("project_id", projectId)
    .order("checked_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as SnapshotRow[];

  const byCompetitor = new Map<string, SnapshotRow[]>();
  for (const r of rows) {
    const arr = byCompetitor.get(r.competitor_id) ?? [];
    arr.push(r);
    byCompetitor.set(r.competitor_id, arr);
  }

  const out = new Map<string, CompetitorKeywordSnapshot>();
  for (const [competitorId, snaps] of byCompetitor) {
    const [latest, previous] = snaps; // already checked_at desc
    out.set(competitorId, {
      competitorId,
      domain: latest.domain,
      estimatedTraffic: latest.estimated_traffic,
      keywordsRanked: latest.keywords_ranked,
      topKeywords: latest.top_keywords ?? [],
      checkedAt: latest.checked_at,
      keywordsRankedDelta:
        previous && latest.keywords_ranked != null && previous.keywords_ranked != null
          ? latest.keywords_ranked - previous.keywords_ranked
          : null,
    });
  }
  return out;
}

export type CompetitorKeywordGap = {
  competitorId: string;
  keyword: string;
  volume: number | null;
  ourPosition: number | null;
  priority: "High" | "Medium" | "Low";
  intent: string | null;
};

/** Latest ranking-gap rows across all tracked competitors, highest-priority/volume first. */
export async function getCompetitorKeywordGaps(projectId: string, limit = 8): Promise<CompetitorKeywordGap[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("competitor_keyword_gaps")
    .select("competitor_id, keyword, volume, our_position, priority, intent, checked_at")
    .eq("project_id", projectId)
    .order("checked_at", { ascending: false })
    .limit(100);
  type Row = {
    competitor_id: string; keyword: string; volume: number | null; our_position: number | null;
    priority: "High" | "Medium" | "Low" | null; intent: string | null; checked_at: string;
  };
  const rows = (data ?? []) as Row[];

  // Rows are inserted per-competitor within the same monthly run, so the most
  // recent ~10 rows per competitor are that competitor's latest batch.
  const byCompetitor = new Map<string, Row[]>();
  for (const r of rows) {
    const arr = byCompetitor.get(r.competitor_id) ?? [];
    if (arr.length < 10) arr.push(r);
    byCompetitor.set(r.competitor_id, arr);
  }

  const priorityRank = { High: 0, Medium: 1, Low: 2 } as const;
  const merged = [...byCompetitor.values()].flat();
  merged.sort((a, b) => {
    const pr = priorityRank[a.priority ?? "Low"] - priorityRank[b.priority ?? "Low"];
    if (pr !== 0) return pr;
    return (b.volume ?? 0) - (a.volume ?? 0);
  });

  return merged.slice(0, limit).map((r) => ({
    competitorId: r.competitor_id,
    keyword: r.keyword,
    volume: r.volume,
    ourPosition: r.our_position,
    priority: r.priority ?? "Low",
    intent: r.intent,
  }));
}

export type DomainRating = { domain: string; score: number | null; isProjectDomain: boolean };

/** Latest Domain Rating per domain — reuses domain_authority (zhorex/domain-authority-checker), already collected monthly by phase-9-intelligence.ts's daTask(). */
export async function getCompetitorDomainRatings(projectId: string): Promise<Map<string, DomainRating>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("domain_authority")
    .select("domain, da_score, is_project_domain, checked_at")
    .eq("project_id", projectId)
    .order("checked_at", { ascending: false })
    .limit(100);
  type Row = { domain: string; da_score: number | null; is_project_domain: boolean | null; checked_at: string };
  const rows = (data ?? []) as Row[];

  const byDomain = new Map<string, DomainRating>();
  for (const r of rows) {
    if (byDomain.has(r.domain)) continue; // first hit per domain = latest (rows are checked_at desc)
    byDomain.set(r.domain, { domain: r.domain, score: r.da_score, isProjectDomain: !!r.is_project_domain });
  }
  return byDomain;
}
