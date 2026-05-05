import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "@/lib/types/database";
import { isGoogleServiceAccountConfigured, getGoogleAccessToken } from "@/lib/google/auth";
import { inspectUrls, summarizeIndexation } from "@/lib/google/gsc-inspect";
import { isBrandQuery } from "@/lib/google/brand-regex";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

/**
 * Phase 5 — GSC rank tracking + indexation.
 *
 * (1) Pull Search Analytics for the last 28 days, dimensions=[query,page].
 *     Update each keyword row in our DB with its current best position.
 *
 * (2) Run URL Inspection on every URL in the project sitemap + every URL
 *     earning impressions, cap at 200 to stay inside the 2,000/day quota.
 *     Upsert into gsc_index_status.
 *
 * Writes:
 *   - keywords.current_rank / previous_rank
 *   - gsc_index_status (one row per URL)
 *   - audit_findings (one "indexation" finding per URL not PASS)
 */
export async function updateKeywordRankings(
  supabase: SupabaseClient,
  project: Project
): Promise<{
  updated: number;
  inspected: number;
  indexed: number;
  skipped?: string;
  summary?: ReturnType<typeof summarizeIndexation>;
}> {
  if (!(await isGoogleServiceAccountConfigured())) {
    return { updated: 0, inspected: 0, indexed: 0, skipped: "GOOGLE_SERVICE_ACCOUNT_JSON missing" };
  }
  const siteUrl = project.gsc_property_url;
  if (!siteUrl) {
    return { updated: 0, inspected: 0, indexed: 0, skipped: "project has no gsc_property_url" };
  }

  // ------------------------------------------------------------------
  // (1) Rank tracking
  // ------------------------------------------------------------------
  const token = await getGoogleAccessToken(SCOPE);
  const endDate = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - 31 * 86400000).toISOString().slice(0, 10);
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ["query", "page"],
        rowLimit: 25000,
      }),
      signal: AbortSignal.timeout(25000),
    }
  );
  if (!res.ok) {
    return { updated: 0, inspected: 0, indexed: 0, skipped: `GSC ${res.status}` };
  }
  const data = (await res.json()) as { rows?: Array<{ keys: string[]; clicks: number; impressions: number; position: number }> };
  const rows = data.rows ?? [];

  // Best-rank-per-query (lowest position), impression-weighted
  const best = new Map<string, { page: string; position: number; impressions: number; clicks: number }>();
  for (const r of rows) {
    const q = r.keys[0]?.toLowerCase();
    const p = r.keys[1];
    if (!q || !p) continue;
    const cur = best.get(q);
    if (!cur || r.position < cur.position) {
      best.set(q, { page: p, position: r.position, impressions: r.impressions, clicks: r.clicks });
    }
  }

  // Update existing keyword rows. Only update rows that already exist so we
  // don't stuff irrelevant branded/non-ICP queries into the table; use the
  // `getOpportunityPools` API for that discovery flow.
  const { data: existing } = await supabase
    .from("keywords")
    .select("id, keyword, current_rank")
    .eq("project_id", project.id);
  let updated = 0;
  for (const k of (existing ?? []) as Array<{ id: string; keyword: string; current_rank: number | null }>) {
    const hit = best.get(k.keyword.toLowerCase());
    if (!hit) continue;
    const newRank = Math.round(hit.position);
    const { error } = await supabase
      .from("keywords")
      .update({
        previous_rank: k.current_rank,
        current_rank: newRank,
        last_checked: new Date().toISOString(),
      })
      .eq("id", k.id);
    if (!error) updated++;
  }

  // ------------------------------------------------------------------
  // (2) Indexation status
  // ------------------------------------------------------------------
  // Source candidate URLs: top 200 impressions-earning pages from the query
  // rows + sitemap URLs in seo_gaps. Dedupe.
  const urlHits = new Map<string, number>();
  for (const r of rows) {
    const p = r.keys[1];
    if (!p) continue;
    urlHits.set(p, (urlHits.get(p) ?? 0) + r.impressions);
  }
  const { data: gapUrls } = await supabase
    .from("seo_gaps").select("page_url").eq("project_id", project.id).limit(500);
  for (const g of ((gapUrls ?? []) as Array<{ page_url: string }>)) {
    if (!urlHits.has(g.page_url)) urlHits.set(g.page_url, 0);
  }
  const urlsToInspect = [...urlHits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 200)
    .map(([u]) => u);

  const inspections = urlsToInspect.length > 0
    ? await inspectUrls(siteUrl, urlsToInspect, { concurrency: 2, throttleMs: 350, maxUrls: 200 })
    : [];

  for (const i of inspections) {
    await supabase
      .from("gsc_index_status")
      .upsert({
        project_id: project.id,
        url: i.url,
        verdict: i.verdict,
        coverage_state: i.coverage_state,
        robots_txt_state: i.robots_txt_state,
        indexing_state: i.indexing_state,
        page_fetch_state: i.page_fetch_state,
        google_canonical: i.google_canonical,
        user_canonical: i.user_canonical,
        last_crawl_time: i.last_crawl_time,
        mobile_usability_verdict: i.mobile_usability_verdict,
        rich_results_verdict: i.rich_results_verdict,
        details: i.error ? { error: i.error } : {},
        checked_at: new Date().toISOString(),
      }, { onConflict: "project_id,url" });

    // Surface non-PASS verdicts as audit findings so they show up in the
    // Technical + SEO Gaps views.
    if (i.verdict && i.verdict !== "PASS") {
      await supabase.from("audit_findings").insert({
        project_id: project.id,
        url: i.url,
        skill: "indexation",
        check_name: "gsc_url_inspection",
        status: i.verdict === "FAIL" ? "fail" : "warn",
        pillar: "SEO",
        priority: i.verdict === "FAIL" ? "high" : "medium",
        message: `Google: ${i.coverage_state ?? i.verdict}`,
        impl: isBrandQuery(i.url) ? "brand URL — investigate manually"
          : "Check robots.txt/noindex, reduce redirect chains, verify canonical alignment.",
        details: { verdict: i.verdict, coverage: i.coverage_state, indexing: i.indexing_state },
      });
    }
  }

  const summary = summarizeIndexation(inspections);
  return { updated, inspected: inspections.length, indexed: summary.pass, summary };
}
