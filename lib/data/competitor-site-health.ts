import { createClient } from "@/lib/supabase/server";

// Competitor site health = a real mobile PageSpeed Insights snapshot per rival
// (Lighthouse performance score + the Core Web Vitals). Same data source as the
// project's own CWV pillar (lib/cron/phase-4-cwv.ts), pointed at competitor URLs
// and cached in competitor_site_health (one latest row per competitor+device).
// The read side (getCompetitorSiteHealth) is called from the Competitors page;
// the fetch side (fetchPageSpeedMobile) runs behind the on-demand refresh route.

export interface CompetitorSiteHealthRow {
  competitorId: string;
  url: string;
  score: number | null;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  ttfb: number | null;
  fcp: number | null;
  fetchedAt: string;
}

export interface CompetitorCwvMetrics {
  score: number | null;
  lcp: number | null;
  cls: number | null;
  inp: number | null;
  ttfb: number | null;
  fcp: number | null;
}

/** Latest cached mobile site-health per competitor, keyed by competitor id. */
export async function getCompetitorSiteHealth(projectId: string): Promise<Record<string, CompetitorSiteHealthRow>> {
  const supabase = await createClient();
  // Degrades to {} before migration 20260725000001 is applied (missing table).
  const { data } = await supabase
    .from("competitor_site_health")
    .select("competitor_id, url, score, lcp, cls, inp, ttfb, fcp, fetched_at")
    .eq("project_id", projectId)
    .eq("device", "mobile");

  const rows = (data ?? []) as Array<{
    competitor_id: string; url: string; score: number | null;
    lcp: number | null; cls: number | null; inp: number | null; ttfb: number | null; fcp: number | null;
    fetched_at: string;
  }>;
  const out: Record<string, CompetitorSiteHealthRow> = {};
  for (const r of rows) {
    out[r.competitor_id] = {
      competitorId: r.competitor_id, url: r.url, score: r.score,
      lcp: r.lcp, cls: r.cls, inp: r.inp, ttfb: r.ttfb, fcp: r.fcp, fetchedAt: r.fetched_at,
    };
  }
  return out;
}

/**
 * One mobile PageSpeed Insights run for an arbitrary URL. Mirrors the parse in
 * lib/cron/phase-4-cwv.ts but performance-only (cheaper — PSI bills per request)
 * and mobile-only (the ranking-relevant device). Returns null on any failure or
 * partial result (PSI can 200 with no performance score) so a broken run never
 * writes a misleading score:0 row.
 */
export async function fetchPageSpeedMobile(url: string, apiKey: string, timeoutMs = 25000): Promise<CompetitorCwvMetrics | null> {
  try {
    const psUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=PERFORMANCE&key=${apiKey}`;
    const res = await fetch(psUrl, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const data = await res.json();
    const lh = data.lighthouseResult;
    const rawScore = lh?.categories?.performance?.score;
    const audits = lh?.audits ?? {};
    const num = (k: string): number | null => {
      const v = audits[k]?.numericValue;
      return typeof v === "number" ? v : null;
    };
    const sec = (k: string): number | null => {
      const v = num(k);
      return v != null ? v / 1000 : null;
    };
    return {
      score: typeof rawScore === "number" ? Math.round(rawScore * 100) : null,
      lcp: sec("largest-contentful-paint"),
      cls: num("cumulative-layout-shift"),
      inp: num("interaction-to-next-paint"),
      ttfb: sec("server-response-time"),
      fcp: sec("first-contentful-paint"),
    };
  } catch {
    return null;
  }
}
