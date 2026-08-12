import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "@/lib/types/database";
import { runCompetitorDomainOverview, runCompetitorKeywordGap } from "@/lib/apify/competitor-intel";
import { getApifyCreds } from "@/lib/integrations/secrets";

// Phase 11 — competitor keyword intelligence (santhej/website-traffic-intel).
// Runs monthly, from its OWN /refresh-competitor-keywords route (own 60s
// Vercel function budget) rather than chained inside phase-9's request — up
// to 6 sequential Apify calls (1 overview + up to 5 keyword_gap) would risk
// blowing a shared 60s budget on top of phase-9's own ~80s. Timeouts below
// are tuned tighter than phase-9's 55s default accordingly; a slow/timed-out
// call degrades to 0 rows for that competitor rather than failing the phase.
//
//   1. One batched "overview" run across all tracked competitors → keyword
//      count + top keywords per competitor (feeds "What they rank for").
//   2. One "keyword_gap" run PER competitor, target=project vs competitor →
//      genuine ranking gaps (feeds the "Keyword gap" panel).

export interface CompetitorKeywordPhaseResult {
  overview: { rows: number; skipped?: string; error?: string; cost_usd: number };
  gaps: { rows: number; skipped?: string; error?: string; cost_usd: number };
  total_cost_usd: number;
}

async function startRun(supabase: SupabaseClient, projectId: string): Promise<string | null> {
  const { data } = await supabase.from("intelligence_runs").insert({
    project_id: projectId, actor: "competitor_keywords", status: "running",
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

export async function runCompetitorKeywordPhase(
  supabase: SupabaseClient,
  project: Project
): Promise<CompetitorKeywordPhaseResult> {
  const creds = await getApifyCreds();
  const empty: CompetitorKeywordPhaseResult = {
    overview: { rows: 0, skipped: "APIFY_TOKEN missing", cost_usd: 0 },
    gaps: { rows: 0, skipped: "APIFY_TOKEN missing", cost_usd: 0 },
    total_cost_usd: 0,
  };
  if (!creds) return empty;
  const token = creds.token;

  const { data: compRows } = await supabase
    .from("competitors")
    .select("id, url")
    .eq("project_id", project.id)
    .limit(5);
  const competitors = ((compRows ?? []) as Array<{ id: string; url: string }>);
  if (competitors.length === 0) {
    return {
      overview: { rows: 0, skipped: "no competitors", cost_usd: 0 },
      gaps: { rows: 0, skipped: "no competitors", cost_usd: 0 },
      total_cost_usd: 0,
    };
  }

  // ========== 1. Overview — one batched call for all competitor domains ==========
  const overviewRunId = await startRun(supabase, project.id);
  let overview: { rows: number; error?: string; cost_usd: number };
  try {
    const { results, cost_estimate_usd } = await runCompetitorDomainOverview({
      token,
      domains: competitors.map((c) => c.url),
      country: project.country,
      timeoutMs: 20_000,
    });

    // Match results back to competitor rows by normalized domain.
    const clean = (d: string) => d.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/^www\./, "");
    const domainToCompetitor = new Map(competitors.map((c) => [clean(c.url), c]));

    const insertRows = results
      .map((r) => {
        const comp = domainToCompetitor.get(r.domain);
        if (!comp) return null;
        return {
          project_id: project.id,
          competitor_id: comp.id,
          domain: r.domain,
          estimated_traffic: r.estimated_traffic,
          keywords_ranked: r.keywords_ranked,
          top_keywords: r.top_keywords,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (insertRows.length > 0) {
      await supabase.from("competitor_keyword_snapshots").insert(insertRows);
    }
    await finishRun(supabase, overviewRunId, "success", { rows_inserted: insertRows.length, cost_estimate_usd });
    overview = { rows: insertRows.length, cost_usd: cost_estimate_usd };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishRun(supabase, overviewRunId, "failed", { error_message: msg });
    overview = { rows: 0, error: msg, cost_usd: 0 };
  }

  // ========== 2. Keyword gap — one call per competitor ==========
  const gapRunId = await startRun(supabase, project.id);
  let gaps: { rows: number; error?: string; cost_usd: number };
  try {
    let totalRows = 0;
    let totalCost = 0;
    for (const comp of competitors) {
      const { results, cost_estimate_usd } = await runCompetitorKeywordGap({
        token,
        projectDomain: project.domain,
        competitorDomain: comp.url,
        country: project.country,
        timeoutMs: 7_000,
      });
      totalCost += cost_estimate_usd;
      const top = results.slice(0, 10);
      if (top.length > 0) {
        await supabase.from("competitor_keyword_gaps").insert(top.map((r) => ({
          project_id: project.id,
          competitor_id: comp.id,
          keyword: r.keyword,
          volume: r.volume,
          cpc: r.cpc,
          competitor_position: r.competitor_position,
          our_position: r.our_position,
          priority: r.priority,
          intent: r.intent,
        })));
        totalRows += top.length;
      }
    }
    await finishRun(supabase, gapRunId, "success", { rows_inserted: totalRows, cost_estimate_usd: totalCost });
    gaps = { rows: totalRows, cost_usd: Number(totalCost.toFixed(4)) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishRun(supabase, gapRunId, "failed", { error_message: msg });
    gaps = { rows: 0, error: msg, cost_usd: 0 };
  }

  return {
    overview,
    gaps,
    total_cost_usd: Number((overview.cost_usd + gaps.cost_usd).toFixed(4)),
  };
}
