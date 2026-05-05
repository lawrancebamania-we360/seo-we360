import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runFullSiteAudit } from "@/lib/cron/phase-1-audit";
import { runApifyDiscovery, buildBriefForApifyKeyword } from "@/lib/cron/phase-6-apify";
import { recalculatePillarScores } from "@/lib/cron/phase-7-pillars";
import { verifyProjectAccess } from "@/lib/auth/verify-access";

// Manually triggered site audit — used by the "Run audit now" button and
// auto-called when a new project is created.
// Auth: logged-in admin only.
// Optional: include_blog_discovery=true also runs Apify and creates blog_task
// entries (used on first-time project kickoff).

export const runtime = "nodejs";
export const maxDuration = 60;

function priorityFor(comp: string | null): "critical" | "high" | "medium" | "low" {
  if (comp === "Low Competition") return "high";
  if (comp === "Medium Competition") return "medium";
  return "low";
}

function wordTargetFor(comp: string | null): number {
  if (comp === "Low Competition") return 1400;
  if (comp === "Medium Competition") return 2000;
  if (comp === "High Competition") return 2800;
  return 1500;
}

const Body = z.object({
  project_id: z.string().uuid(),
  max_urls: z.number().int().min(5).max(100).optional(),
  include_blog_discovery: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (profile as { role?: string } | null)?.role;
  if (role !== "super_admin" && role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await request.json()); }
  catch { return NextResponse.json({ error: "invalid body" }, { status: 400 }); }

  const admin = createAdminClient();

  // Verify the caller has org-level access to this project before running any work
  const access = await verifyProjectAccess(admin, user.id, body.project_id, { minRole: "admin" });
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code });

  const { data: project, error } = await admin.from("projects").select("*").eq("id", body.project_id).single();
  if (error || !project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const runId = crypto.randomUUID();
  const maxUrls = body.max_urls ?? 50;

  const audit = await runFullSiteAudit(admin, project, { maxUrls, runId });

  let blogTasksCreated = 0;
  let apify: Awaited<ReturnType<typeof runApifyDiscovery>> | null = null;
  if (body.include_blog_discovery) {
    try {
      apify = await runApifyDiscovery(admin, project);
      // Pull tracked competitors so the brief references them specifically
      const { data: competitorRows } = await admin
        .from("competitors").select("name, url")
        .eq("project_id", project.id).limit(10);
      const competitors = (competitorRows ?? []) as Array<{ name: string; url: string }>;
      for (const kb of apify.keywordBriefs) {
        const { data: kwRow } = await admin
          .from("keywords").select("id")
          .eq("project_id", project.id).eq("keyword", kb.keyword).maybeSingle();
        const brief = buildBriefForApifyKeyword({
          keyword: kb.keyword,
          intent: kb.intent,
          competition: kb.competition,
          paa: kb.paa,
          project,
          competitors,
        });
        const nextMonday = new Date();
        nextMonday.setDate(nextMonday.getDate() + ((8 - nextMonday.getDay()) % 7 || 7));
        const { error: insErr } = await admin.from("tasks").insert({
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
          issue: `Apify flagged this as a ${kb.competition.toLowerCase()} ranking opportunity (KD ${kb.kd}).`,
          impl: "Full brief attached — click the card to view, edit or generate.",
          scheduled_date: nextMonday.toISOString().slice(0, 10),
        });
        if (!insErr) blogTasksCreated++;
      }
    } catch {
      // swallow — audit already succeeded
    }
  }

  const pillars = await recalculatePillarScores(admin, project);

  return NextResponse.json({
    ok: true,
    run_id: runId,
    ...audit,
    blog_tasks_created: blogTasksCreated,
    apify,
    pillars,
  });
}
