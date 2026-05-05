import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runApifyDiscovery, buildBriefForApifyKeyword } from "@/lib/cron/phase-6-apify";
import { isCronAuthorized } from "@/lib/auth/cron";
import { ARTICLE } from "@/lib/constants";

// Monday 9 AM IST cron — Apify discovers blog topics; each becomes a rich
// blog_task on the Blog Sprint board with a full programmatic brief
// (H1/H2/H3/sections/PAA/internal-links/writer-notes) attached.

export const runtime = "nodejs";
export const maxDuration = 60;

function wordTargetFor(comp: string | null): number {
  if (comp === "Low Competition") return ARTICLE.WORD_TARGET_LOW;
  if (comp === "Medium Competition") return ARTICLE.WORD_TARGET_MED;
  if (comp === "High Competition") return ARTICLE.WORD_TARGET_HIGH;
  return ARTICLE.WORD_TARGET_DEFAULT;
}

function priorityFor(comp: string | null): "critical" | "high" | "medium" | "low" {
  if (comp === "Low Competition") return "high";
  if (comp === "Medium Competition") return "medium";
  return "low";
}

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: projects } = await supabase.from("projects").select("*").eq("is_active", true);
  const results: Record<string, unknown> = {};

  for (const project of projects ?? []) {
    try {
      const discovery = await runApifyDiscovery(supabase, project);

      // Fetch project's competitors once so we can thread them into every brief
      const { data: competitorRows } = await supabase
        .from("competitors")
        .select("name, url")
        .eq("project_id", project.id)
        .limit(10);
      const competitors = (competitorRows ?? []) as Array<{ name: string; url: string }>;

      let tasksCreated = 0;
      for (const kb of discovery.keywordBriefs) {
        const { data: kwRow } = await supabase
          .from("keywords")
          .select("id")
          .eq("project_id", project.id)
          .eq("keyword", kb.keyword)
          .maybeSingle();

        const nextMonday = new Date();
        const daysUntilMonday = (8 - nextMonday.getDay()) % 7 || 7;
        nextMonday.setDate(nextMonday.getDate() + daysUntilMonday);

        const brief = buildBriefForApifyKeyword({
          keyword: kb.keyword,
          intent: kb.intent,
          competition: kb.competition,
          paa: kb.paa,
          project,
          competitors,
        });

        const { error } = await supabase.from("tasks").insert({
          project_id: project.id,
          title: `Write article: ${kb.keyword}`,
          kind: "blog_task",
          source: "cron_audit",
          keyword_id: (kwRow as { id?: string } | null)?.id ?? null,
          target_keyword: kb.keyword,
          competition: kb.competition,
          intent: kb.intent,
          word_count_target: wordTargetFor(kb.competition),
          priority: priorityFor(kb.competition),
          brief,
          issue: `Apify flagged this as a ${kb.competition.toLowerCase()} ranking opportunity (KD ${kb.kd}, ${kb.intent}).`,
          impl: `Full brief attached — H1, H2s, H3s, sections, PAA, internal links, writer notes all pre-populated. Click the card to view, edit, or generate.`,
          scheduled_date: nextMonday.toISOString().slice(0, 10),
        });
        if (!error) tasksCreated++;
      }

      results[project.id] = { domain: project.domain, apify: discovery, blog_tasks_created: tasksCreated };
    } catch (e) {
      results[project.id] = { domain: project.domain, error: e instanceof Error ? e.message : String(e) };
    }
  }

  return NextResponse.json({ ok: true, ran_at: new Date().toISOString(), results });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
