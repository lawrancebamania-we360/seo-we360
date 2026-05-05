import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project, SeoGap, CwvSnapshot, Keyword, Task } from "@/lib/types/database";

/**
 * Phase 7 — Recalculate the 5 pillar scores deterministically.
 * Every score has a breakdown + top_issues so the client can see WHY.
 */

interface Inputs {
  tasks: Task[];
  gaps: SeoGap[];
  keywords: Keyword[];
  cwvMobile: CwvSnapshot | null;
  cwvDesktop: CwvSnapshot | null;
}

function gapCount(gaps: SeoGap[], status: string, check: keyof SeoGap): number {
  return gaps.filter((g) => g[check] === status).length;
}

function calcSEO({ tasks, gaps, keywords, cwvMobile, cwvDesktop }: Inputs) {
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.done).length;
  const taskCompletion = totalTasks === 0 ? 50 : Math.round((doneTasks / totalTasks) * 100);

  const cwv = Math.round(((cwvMobile?.score ?? 0) * 0.6 + (cwvDesktop?.score ?? 0) * 0.4));
  const totalGaps = gaps.length;
  const okRatio = totalGaps === 0 ? 50 : Math.round(
    (gaps.filter((g) => ["title_status", "meta_status", "h1_status", "canonical_status"].every((k) => (g as unknown as Record<string, unknown>)[k] === "ok")).length / totalGaps) * 100
  );

  const ranked = keywords.filter((k) => k.current_rank != null && k.current_rank <= 10).length;
  const rankings = keywords.length === 0 ? 50 : Math.min(100, Math.round((ranked / keywords.length) * 150));

  const score = Math.round(taskCompletion * 0.3 + cwv * 0.3 + okRatio * 0.25 + rankings * 0.15);
  const issues: string[] = [];
  if (okRatio < 60) issues.push(`${totalGaps - gaps.filter((g) => g.title_status === "ok").length} pages with on-page issues`);
  if (cwv < 60) issues.push("Core Web Vitals below target");
  if (tasks.filter((t) => t.priority === "critical" && !t.done).length > 0) {
    issues.push(`${tasks.filter((t) => t.priority === "critical" && !t.done).length} critical tasks open`);
  }

  return {
    score,
    breakdown: { task_completion: taskCompletion, cwv, meta_health: okRatio, rankings },
    top_issues: issues.slice(0, 3),
  };
}

function calcAEO({ gaps }: Inputs) {
  const faqSchema = gaps.filter((g) => g.schema_status === "ok").length;
  const faqRatio = gaps.length === 0 ? 0 : Math.round((faqSchema / gaps.length) * 100);
  const answerFormat = 70; // placeholder — real: parse content for Q/A patterns
  const paaCoverage = 40; // placeholder — real: check GSC for ranked PAA terms
  const snippetEligibility = 55;

  const score = Math.round(faqRatio * 0.35 + snippetEligibility * 0.25 + paaCoverage * 0.2 + answerFormat * 0.2);
  const issues: string[] = [];
  if (faqRatio < 40) issues.push("FAQ schema missing on most pages");
  if (paaCoverage < 50) issues.push("Limited People Also Ask coverage");

  return {
    score,
    breakdown: { faq_schema: faqRatio, snippet_eligibility: snippetEligibility, paa_coverage: paaCoverage, answer_format: answerFormat },
    top_issues: issues.slice(0, 3),
  };
}

function calcGEO({ gaps }: Inputs) {
  const structured = gap(gaps, "schema_status");
  const eeat = 50; // placeholder: real — parse author bios, dates, sources
  const entity = gap(gaps, "og_status");
  const score = Math.round(structured * 0.4 + eeat * 0.3 + entity * 0.3);
  const issues: string[] = [];
  if (structured < 50) issues.push("Structured data missing on key pages");
  return { score, breakdown: { structured_data: structured, eeat, entity_coverage: entity }, top_issues: issues.slice(0, 3) };
}

function calcSXO({ cwvMobile, cwvDesktop }: Inputs) {
  const mobile = cwvMobile?.score ?? 0;
  const desktop = cwvDesktop?.score ?? 0;
  const gap = Math.abs(desktop - mobile);
  const mobileGap = gap > 20 ? 40 : gap > 10 ? 60 : 80;
  const pageSpeed = Math.round((mobile + desktop) / 2);
  const score = Math.round(pageSpeed * 0.5 + mobileGap * 0.3 + 70 * 0.2);
  const issues: string[] = [];
  if (gap > 15) issues.push("Mobile-desktop performance gap is large");
  if (pageSpeed < 60) issues.push("Page speed needs work");
  return { score, breakdown: { page_speed: pageSpeed, mobile_vs_desktop: mobileGap, engagement: 70 }, top_issues: issues.slice(0, 3) };
}

function calcAIO({ gaps }: Inputs) {
  const schemaRatio = gap(gaps, "schema_status");
  const brandConsistency = 60;
  const crawlerAccess = 70; // placeholder: check robots.txt allows GPTBot, ClaudeBot, PerplexityBot
  const llmsTxt = 0; // placeholder: check /llms.txt
  const score = Math.round(schemaRatio * 0.3 + brandConsistency * 0.25 + crawlerAccess * 0.25 + llmsTxt * 0.2);
  const issues: string[] = [];
  if (llmsTxt === 0) issues.push("No llms.txt file present");
  if (schemaRatio < 50) issues.push("Knowledge graph signals weak (schema)");
  return { score, breakdown: { schema: schemaRatio, brand_consistency: brandConsistency, crawler_access: crawlerAccess, llms_txt: llmsTxt }, top_issues: issues.slice(0, 3) };
}

function gap(gaps: SeoGap[], key: keyof SeoGap) {
  if (gaps.length === 0) return 50;
  return Math.round((gaps.filter((g) => g[key] === "ok").length / gaps.length) * 100);
}

export async function recalculatePillarScores(
  supabase: SupabaseClient,
  project: Project
): Promise<{ SEO: number; AEO: number; GEO: number; SXO: number; AIO: number }> {
  const [{ data: tasks }, { data: gaps }, { data: keywords }, { data: mobileCwv }, { data: desktopCwv }] =
    await Promise.all([
      supabase.from("tasks").select("*").eq("project_id", project.id),
      supabase.from("seo_gaps").select("*").eq("project_id", project.id),
      supabase.from("keywords").select("*").eq("project_id", project.id),
      supabase.from("cwv_snapshots").select("*").eq("project_id", project.id).eq("device", "mobile").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("cwv_snapshots").select("*").eq("project_id", project.id).eq("device", "desktop").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

  const inputs: Inputs = {
    tasks: (tasks ?? []) as Task[],
    gaps: (gaps ?? []) as SeoGap[],
    keywords: (keywords ?? []) as Keyword[],
    cwvMobile: (mobileCwv as CwvSnapshot) ?? null,
    cwvDesktop: (desktopCwv as CwvSnapshot) ?? null,
  };

  const scores = {
    SEO: calcSEO(inputs),
    AEO: calcAEO(inputs),
    GEO: calcGEO(inputs),
    SXO: calcSXO(inputs),
    AIO: calcAIO(inputs),
  };

  const rows = Object.entries(scores).map(([pillar, s]) => ({
    project_id: project.id,
    pillar,
    score: s.score,
    breakdown: s.breakdown,
    top_issues: s.top_issues,
  }));
  await supabase.from("pillar_scores").insert(rows);

  return {
    SEO: scores.SEO.score,
    AEO: scores.AEO.score,
    GEO: scores.GEO.score,
    SXO: scores.SXO.score,
    AIO: scores.AIO.score,
  };
}
