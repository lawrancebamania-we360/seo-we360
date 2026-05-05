import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "@/lib/types/database";
import { generateBlogBrief } from "@/lib/seo-skills/blog-brief";
import { getApifyCreds } from "@/lib/integrations/secrets";

// Apify actor `trovevault/keyword-opportunity-finder` returns PAA questions
// with competition signals. We group them by the original seed keyword
// so the brief generator can attach them to the right blog task.
interface ApifyQuestion {
  question: string;
  allintitleCount: number;
  apifyActorCount: number;
  apifyStoreGap: boolean;
  opportunityScore: number;
  googleSearchUrl: string;
}

function competitionFor(allintitleCount: number): "Low Competition" | "Medium Competition" | "High Competition" {
  if (allintitleCount < 50) return "Low Competition";
  if (allintitleCount < 500) return "Medium Competition";
  return "High Competition";
}

function intentFor(question: string): "informational" | "commercial" | "transactional" | "navigational" {
  const q = question.toLowerCase();
  if (/\bbuy|cost|price|cheap|discount|book|reserve|voucher|gift\b/.test(q)) return "transactional";
  if (/\bbest|top|vs|compare|alternative|software|tool|cheapest\b/.test(q)) return "commercial";
  if (/\blogin|signup|account|my\b/.test(q)) return "navigational";
  return "informational";
}

function kdFor(allintitleCount: number): number {
  if (allintitleCount === 0) return 5;
  if (allintitleCount < 50) return 15;
  if (allintitleCount < 500) return 35;
  if (allintitleCount < 5000) return 55;
  return 75;
}

export interface ApifyRunResult {
  new_keywords: number;
  questions_found: number;
  skipped?: string;
  keywordBriefs: Array<{
    keyword: string;
    intent: string;
    competition: string;
    kd: number;
    paa: string[];
  }>;
}

export async function runApifyDiscovery(
  supabase: SupabaseClient,
  project: Project
): Promise<ApifyRunResult> {
  const creds = await getApifyCreds();
  if (!creds) return { new_keywords: 0, questions_found: 0, skipped: "APIFY_TOKEN missing", keywordBriefs: [] };
  const { token, actorId } = creds;
  const apifyActorSlug = actorId.replace("/", "~");

  const seeds = Array.isArray(project.apify_keywords) && project.apify_keywords.length > 0
    ? (project.apify_keywords as string[])
    : [`${project.industry ?? ""} ${project.domain.split(".")[0]}`.trim() || "industry keyword"];

  let totalNew = 0;
  let totalQuestions = 0;
  const keywordBriefs: ApifyRunResult["keywordBriefs"] = [];

  for (const seed of seeds.slice(0, 2)) {
    try {
      const runUrl = `https://api.apify.com/v2/acts/${apifyActorSlug}/run-sync-get-dataset-items?token=${token}`;
      const res = await fetch(runUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keyword: seed, limit: 8 }),
        signal: AbortSignal.timeout(55000),
      });
      if (!res.ok) continue;
      const items = (await res.json()) as ApifyQuestion[];
      totalQuestions += items.length;

      const top = [...items].sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 6);

      // Insert as keywords
      const rows = top.map((it) => ({
        project_id: project.id,
        keyword: it.question,
        search_volume: null,
        kd: kdFor(it.allintitleCount),
        competition: competitionFor(it.allintitleCount),
        intent: intentFor(it.question),
        source: "apify" as const,
        trend: "new" as const,
        priority: "medium" as const,
      }));

      const { error, count } = await supabase
        .from("keywords")
        .upsert(rows, { onConflict: "project_id,keyword", ignoreDuplicates: true, count: "exact" });
      if (error) continue;
      totalNew += count ?? rows.length;

      // Collect PAA set for brief attachment (shared across the group)
      const paaPool = items.map((i) => i.question).slice(0, 10);
      for (const t of top) {
        keywordBriefs.push({
          keyword: t.question,
          intent: intentFor(t.question),
          competition: competitionFor(t.allintitleCount),
          kd: kdFor(t.allintitleCount),
          paa: paaPool.filter((q) => q !== t.question).slice(0, 5),
        });
      }
    } catch {
      // swallow — try next seed
    }
  }

  return { new_keywords: totalNew, questions_found: totalQuestions, keywordBriefs };
}

// Helper for blog-discovery route — builds the brief for a task that was
// just created from an Apify-discovered keyword. Accepts optional competitors
// so the brief's competitor_refs are populated with the project's actual
// tracked competitors instead of placeholder text.
export function buildBriefForApifyKeyword(args: {
  keyword: string;
  intent: string;
  competition: string;
  paa: string[];
  project: Project;
  competitors?: Array<{ name: string; url: string }>;
}) {
  return generateBlogBrief({
    keyword: args.keyword,
    intent: args.intent,
    competition: args.competition,
    projectName: args.project.name,
    projectDomain: args.project.domain,
    industry: args.project.industry,
    paaQuestions: args.paa,
    competitors: args.competitors,
  });
}
