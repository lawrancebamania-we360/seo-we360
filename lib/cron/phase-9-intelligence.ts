import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "@/lib/types/database";
import {
  runSerpRankTracker, runBacklinkProfile,
  runDomainAuthority, runContentGap,
} from "@/lib/apify/intelligence";
import { getApifyCreds } from "@/lib/integrations/secrets";

// Orchestrates the 4 Apify intelligence actors for a single project.
//
// We run actors SEQUENTIALLY — not in parallel — because the Apify free plan
// has an 8GB concurrent-memory cap across all running actor instances. DA + SERP
// together already exceed it (~10GB). Sequential execution guarantees each
// actor releases its memory before the next one starts; total wall time is the
// sum (~80s for all four) but we never trip the cap. Upgrade Apify to a paid
// plan and this can flip back to Promise.all if you want the speed back.
//
// AI Overview used to be a separate actor (clearpath/google-ai-overview) but
// apify/google-search-scraper already returns `aiOverview` on each SERP item,
// so we extract it inside runSerpRankTracker in one shot — saves $0.24/run and
// one memory-eating concurrent actor slot.

type ActorName = "serp" | "backlinks" | "domain_authority" | "content_gap" | "ai_overview";

async function startRun(supabase: SupabaseClient, projectId: string, actor: ActorName): Promise<string | null> {
  const { data } = await supabase.from("intelligence_runs").insert({
    project_id: projectId, actor, status: "running",
  }).select("id").single();
  return (data as { id?: string } | null)?.id ?? null;
}

async function finishRun(
  supabase: SupabaseClient, runId: string | null,
  status: "success" | "failed" | "skipped",
  extras: { rows_inserted?: number; cost_estimate_usd?: number; error_message?: string } = {}
) {
  if (!runId) return;
  await supabase.from("intelligence_runs").update({
    status, completed_at: new Date().toISOString(), ...extras,
  }).eq("id", runId);
}

export interface IntelligenceRunResult {
  serp: { rows: number; skipped?: string; error?: string; cost_usd: number };
  ai_overview: { rows: number; skipped?: string; error?: string; cost_usd: number };
  backlinks: { rows: number; skipped?: string; error?: string; cost_usd: number };
  domain_authority: { rows: number; skipped?: string; error?: string; cost_usd: number };
  content_gap: { rows: number; skipped?: string; error?: string; cost_usd: number };
  total_cost_usd: number;
}

export async function runIntelligencePhase(
  supabase: SupabaseClient,
  project: Project
): Promise<IntelligenceRunResult> {
  const creds = await getApifyCreds();
  const empty: IntelligenceRunResult = {
    serp: { rows: 0, skipped: "APIFY_TOKEN missing", cost_usd: 0 },
    ai_overview: { rows: 0, skipped: "APIFY_TOKEN missing", cost_usd: 0 },
    backlinks: { rows: 0, skipped: "APIFY_TOKEN missing", cost_usd: 0 },
    domain_authority: { rows: 0, skipped: "APIFY_TOKEN missing", cost_usd: 0 },
    content_gap: { rows: 0, skipped: "APIFY_TOKEN missing", cost_usd: 0 },
    total_cost_usd: 0,
  };
  if (!creds) return empty;
  const token = creds.token;

  // ---- source keywords + competitors from DB ----
  // Cap at 10 because apify/google-search-scraper takes ~7s per query serially
  // even when multiple are submitted. 10 × 7s ≈ 70s ceiling; Apify usually
  // parallelises to keep it closer to 40–50s, which fits our 55s timeout.
  // Prioritise striking-distance queries (pos 11–20) since they're the highest
  // ROI to track per the plan.
  const { data: kwRows } = await supabase
    .from("keywords")
    .select("keyword, cluster, current_rank")
    .eq("project_id", project.id)
    .order("current_rank", { ascending: true, nullsFirst: false })
    .limit(10);
  const keywords = ((kwRows ?? []) as Array<{ keyword: string }>).map((r) => r.keyword);
  const seedKeywords = keywords.length > 0 ? keywords :
    (Array.isArray(project.target_keywords_seed) ? project.target_keywords_seed : []);

  const { data: compRows } = await supabase
    .from("competitors").select("url").eq("project_id", project.id).limit(5);
  const competitorDomains = ((compRows ?? []) as Array<{ url: string }>)
    .map((c) => c.url.replace(/^https?:\/\//, "").replace(/\/$/, ""));

  // ========== Actor 1 — SERP + AI Overview (folded into one call) ==========
  const serpTask = async () => {
    const runId = await startRun(supabase, project.id, "serp");
    const aoRunId = await startRun(supabase, project.id, "ai_overview");
    if (seedKeywords.length === 0) {
      await finishRun(supabase, runId, "skipped", { error_message: "no keywords" });
      await finishRun(supabase, aoRunId, "skipped", { error_message: "no keywords" });
      return {
        serp: { rows: 0, skipped: "no keywords", cost_usd: 0 },
        ai_overview: { rows: 0, skipped: "no keywords", cost_usd: 0 },
      };
    }
    try {
      const { results, ai_overview_results, cost_estimate_usd } = await runSerpRankTracker({
        token, keywords: seedKeywords, projectDomain: project.domain,
        country: project.country ?? "in",
      });
      if (results.length > 0) {
        await supabase.from("serp_rankings").insert(results.map((r) => ({
          project_id: project.id, keyword: r.keyword, position: r.position, url: r.url,
          owns_featured_snippet: r.owns_featured_snippet, owns_paa: r.owns_paa,
          paa_questions: r.paa_questions, related_searches: r.related_searches,
          total_results: r.total_results, country: project.country ?? "in", device: "desktop",
        })));
      }
      // AI Overview rows come from the same response — write separately so the
      // existing /api/ai-overview + dashboard widgets keep working unchanged.
      const aoRows = ai_overview_results.filter((r) => r.ai_overview_appeared);
      if (aoRows.length > 0) {
        await supabase.from("ai_overview_citations").insert(aoRows.map((r) => ({
          project_id: project.id, keyword: r.keyword,
          ai_overview_appeared: r.ai_overview_appeared, project_cited: r.project_cited,
          cited_url: r.cited_url, ai_overview_text: r.ai_overview_text,
          cited_sources: r.cited_sources,
        })));
      }
      await finishRun(supabase, runId, "success", { rows_inserted: results.length, cost_estimate_usd });
      await finishRun(supabase, aoRunId, "success", { rows_inserted: aoRows.length, cost_estimate_usd: 0 });
      return {
        serp: { rows: results.length, cost_usd: cost_estimate_usd },
        ai_overview: { rows: aoRows.length, cost_usd: 0 },
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await finishRun(supabase, runId, "failed", { error_message: msg });
      await finishRun(supabase, aoRunId, "failed", { error_message: msg });
      return {
        serp: { rows: 0, error: msg, cost_usd: 0 },
        ai_overview: { rows: 0, error: msg, cost_usd: 0 },
      };
    }
  };

  const backlinksTask = async () => {
    const runId = await startRun(supabase, project.id, "backlinks");
    try {
      const { result, cost_estimate_usd } = await runBacklinkProfile({
        token, projectDomain: project.domain, maxResults: 200,
      });
      if (result) {
        await supabase.from("backlink_profile").insert({
          project_id: project.id,
          total_backlinks: result.total_backlinks,
          referring_domains: result.referring_domains,
          dofollow_count: result.dofollow_count,
          nofollow_count: result.nofollow_count,
          top_backlinks: result.top_backlinks,
          top_anchors: result.top_anchors,
        });
      }
      await finishRun(supabase, runId, result ? "success" : "skipped", {
        rows_inserted: result ? 1 : 0, cost_estimate_usd,
        error_message: result ? undefined : "no backlinks returned",
      });
      return { rows: result ? 1 : 0, cost_usd: cost_estimate_usd };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await finishRun(supabase, runId, "failed", { error_message: msg });
      return { rows: 0, error: msg, cost_usd: 0 };
    }
  };

  const daTask = async () => {
    const runId = await startRun(supabase, project.id, "domain_authority");
    try {
      const { results, cost_estimate_usd } = await runDomainAuthority({
        token, projectDomain: project.domain, competitorDomains,
      });
      if (results.length > 0) {
        await supabase.from("domain_authority").insert(results.map((r) => ({
          project_id: project.id, domain: r.domain, is_project_domain: r.is_project_domain,
          da_score: r.da_score, http_healthy: r.http_healthy, ssl_valid: r.ssl_valid,
          domain_age_days: r.domain_age_days, has_sitemap: r.has_sitemap,
          has_robots: r.has_robots, tech_stack: r.tech_stack,
        })));
      }
      await finishRun(supabase, runId, "success", { rows_inserted: results.length, cost_estimate_usd });
      return { rows: results.length, cost_usd: cost_estimate_usd };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await finishRun(supabase, runId, "failed", { error_message: msg });
      return { rows: 0, error: msg, cost_usd: 0 };
    }
  };

  const contentGapTask = async () => {
    const runId = await startRun(supabase, project.id, "content_gap");
    if (seedKeywords.length === 0) {
      await finishRun(supabase, runId, "skipped", { error_message: "no keywords" });
      return { rows: 0, skipped: "no keywords", cost_usd: 0 };
    }
    try {
      // Only analyze top 5 keywords in kickoff/monthly to fit the budget
      const { results, cost_estimate_usd } = await runContentGap({
        token, keywords: seedKeywords.slice(0, 5),
        projectDomain: project.domain, competitorDomains,
      });
      if (results.length > 0) {
        // Note (Apr 2026): apilab/ai-content-gap-agent's actual response
        // schema doesn't include gap_score / suggested_keywords /
        // featured_snippet_opportunity. We persist what the actor DOES return
        // (outline, missing topics, plus the new fields: angle suggestions,
        // top URLs, reddit titles, PAA Qs) and leave the legacy columns null.
        await supabase.from("content_gaps").insert(results.map((r) => ({
          project_id: project.id,
          keyword: r.keyword,
          gap_score: null,
          missing_subtopics: r.missing_subtopics,
          // Stash the actor's enriched signals into suggested_keywords as a
          // structured blob so we don't lose them — the column is jsonb.
          suggested_keywords: {
            angle_suggestions: r.angle_suggestions,
            top_urls: r.top_urls,
            reddit_titles: r.reddit_titles,
            paa_questions: r.paa_questions,
          },
          suggested_outline: r.suggested_outline,
          featured_snippet_opportunity: false,
        })));
      }
      await finishRun(supabase, runId, "success", { rows_inserted: results.length, cost_estimate_usd });
      return { rows: results.length, cost_usd: cost_estimate_usd };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await finishRun(supabase, runId, "failed", { error_message: msg });
      return { rows: 0, error: msg, cost_usd: 0 };
    }
  };

  // Sequential execution — see comment at top of file for why. Each `await`
  // waits for Apify to release that actor's memory before we launch the next.
  const serpResult = await serpTask();        // SERP + AI Overview
  const backlinks = await backlinksTask();
  const domain_authority = await daTask();
  const content_gap = await contentGapTask();

  const totalCost = serpResult.serp.cost_usd + backlinks.cost_usd +
    domain_authority.cost_usd + content_gap.cost_usd;

  return {
    serp: serpResult.serp,
    ai_overview: serpResult.ai_overview,
    backlinks,
    domain_authority,
    content_gap,
    total_cost_usd: Number(totalCost.toFixed(4)),
  };
}
