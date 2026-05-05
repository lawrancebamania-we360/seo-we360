import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runFullSiteAudit } from "@/lib/cron/phase-1-audit";
import { runApifyDiscovery, buildBriefForApifyKeyword } from "@/lib/cron/phase-6-apify";
import { runPageSpeed } from "@/lib/cron/phase-4-cwv";
import { recalculatePillarScores } from "@/lib/cron/phase-7-pillars";
import { runIntelligencePhase } from "@/lib/cron/phase-9-intelligence";
import { runCannibalization, runFreshness } from "@/lib/cron/phase-10-gsc-ga4-weekly";
import { verifyProjectAccess } from "@/lib/auth/verify-access";
import { env } from "@/lib/env";
import type { Project } from "@/lib/types/database";

// Background kickoff queue.
// - POST /api/projects/[id]/kickoff          → user-triggered entry, creates job + starts phase chain, returns 202
// - POST /api/projects/[id]/kickoff?phase=X  → internal self-invocation (auth via CRON_SECRET)
// - GET  /api/projects/[id]/kickoff?job_id=X → poll endpoint for the progress UI

export const runtime = "nodejs";
export const maxDuration = 60;

const PHASES = ["audit", "apify", "pagespeed", "intelligence", "competitors", "analytics", "pillars"] as const;
type Phase = typeof PHASES[number];

interface JobRow {
  id: string;
  project_id: string;
  status: "queued" | "running" | "complete" | "failed";
  phase: string | null;
  phases_complete: string[];
  result: Record<string, unknown>;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

function isInternalCall(request: NextRequest): boolean {
  const { CRON_SECRET } = env();
  if (!CRON_SECRET) return false;
  return request.headers.get("authorization") === `Bearer ${CRON_SECRET}`;
}

function nextPhaseUrl(baseUrl: string, projectId: string, phase: Phase, jobId: string) {
  return `${baseUrl}/api/projects/${projectId}/kickoff?phase=${phase}&job_id=${jobId}`;
}

async function triggerPhase(projectId: string, phase: Phase, jobId: string) {
  const e = env();
  const baseUrl = e.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  // Fire-and-forget — don't await
  fetch(nextPhaseUrl(baseUrl, projectId, phase, jobId), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${e.CRON_SECRET ?? ""}`,
    },
  }).catch(() => { /* swallow — job row will show failure via missing heartbeat */ });
}

async function runPhase(phase: Phase, project: Project) {
  const admin = createAdminClient();
  switch (phase) {
    case "audit": {
      return await runFullSiteAudit(admin, project, { maxUrls: 50 });
    }
    case "apify": {
      const discovery = await runApifyDiscovery(admin, project);
      const { data: competitorRows } = await admin
        .from("competitors").select("name, url")
        .eq("project_id", project.id).limit(10);
      const competitors = (competitorRows ?? []) as Array<{ name: string; url: string }>;
      let tasksCreated = 0;
      for (const kb of discovery.keywordBriefs) {
        const { data: kwRow } = await admin
          .from("keywords").select("id")
          .eq("project_id", project.id).eq("keyword", kb.keyword).maybeSingle();
        const brief = buildBriefForApifyKeyword({
          keyword: kb.keyword, intent: kb.intent, competition: kb.competition, paa: kb.paa, project,
          competitors,
        });
        const nextMonday = new Date();
        nextMonday.setDate(nextMonday.getDate() + ((8 - nextMonday.getDay()) % 7 || 7));
        const wordTarget = kb.competition === "Low Competition" ? 1400 : kb.competition === "Medium Competition" ? 2000 : 2800;
        const priority = kb.competition === "Low Competition" ? "high" : kb.competition === "Medium Competition" ? "medium" : "low";
        const { error } = await admin.from("tasks").insert({
          project_id: project.id,
          title: `Write article: ${kb.keyword}`,
          kind: "blog_task",
          source: "cron_audit",
          keyword_id: (kwRow as { id?: string } | null)?.id ?? null,
          target_keyword: kb.keyword,
          competition: kb.competition,
          intent: kb.intent,
          word_count_target: wordTarget,
          priority,
          brief,
          scheduled_date: nextMonday.toISOString().slice(0, 10),
        });
        if (!error) tasksCreated++;
      }
      return { ...discovery, blog_tasks_created: tasksCreated };
    }
    case "pagespeed": {
      // Disabled — PSI data is imported externally from we360-psi dev brief.
      return { skipped: "pagespeed disabled: using external PSI import" };
    }
    case "intelligence": {
      return await runIntelligencePhase(admin, project);
    }
    case "competitors": {
      // Fan-out analyze each competitor in parallel (capped at 5 concurrent).
      // Each sub-call runs the 13 SEO skills against the competitor's homepage
      // + pulls their top-ranked keywords via Apify.
      const { data: competitors } = await admin
        .from("competitors")
        .select("id, name, url")
        .eq("project_id", project.id);
      const rows = (competitors ?? []) as Array<{ id: string; name: string; url: string }>;
      if (rows.length === 0) return { analyzed: 0, skipped: "no competitors" };

      const e2 = env();
      const baseUrl = e2.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const queue = [...rows];
      const results: Array<{ id: string; name: string; ok: boolean }> = [];
      async function worker() {
        while (queue.length > 0) {
          const c = queue.shift();
          if (!c) return;
          try {
            const r = await fetch(`${baseUrl}/api/competitors/${c.id}/analyze`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${e2.CRON_SECRET ?? ""}`,
              },
              signal: AbortSignal.timeout(55000),
            });
            results.push({ id: c.id, name: c.name, ok: r.ok });
          } catch {
            results.push({ id: c.id, name: c.name, ok: false });
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, rows.length) }, () => worker()));
      return {
        analyzed: results.length,
        succeeded: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
      };
    }
    case "analytics": {
      // Cannibalization + content-freshness both hit GSC/GA4. They'll just
      // return { connected: false } on brand-new projects with no data yet —
      // that's fine, the real payoff is when the monthly cron re-runs them.
      const [cannibalization, freshness] = await Promise.all([
        runCannibalization(admin, project),
        runFreshness(admin, project),
      ]);
      return { cannibalization, freshness };
    }
    case "pillars": {
      return await recalculatePillarScores(admin, project);
    }
  }
}

// ------------------------------------------------------------
// Entry point: create job + start phase chain (user-triggered)
// OR: process a specific phase (internal call)
// ------------------------------------------------------------
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const url = new URL(request.url);
  const phase = url.searchParams.get("phase") as Phase | null;
  const jobId = url.searchParams.get("job_id");

  const admin = createAdminClient();
  const { data: project } = await admin.from("projects").select("*").eq("id", projectId).maybeSingle();
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  // --- Internal phase invocation ---
  if (phase && jobId) {
    if (!isInternalCall(request)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    try {
      await admin.from("project_kickoff_jobs").update({
        status: "running",
        phase,
        started_at: new Date().toISOString(),
      }).eq("id", jobId).is("completed_at", null);

      const result = await runPhase(phase, project as Project);

      const { data: job } = await admin.from("project_kickoff_jobs").select("*").eq("id", jobId).single();
      const completed = [...((job as JobRow).phases_complete ?? []), phase];
      const fullResult = { ...((job as JobRow).result ?? {}), [phase]: result };

      const currentIdx = PHASES.indexOf(phase);
      const nextPhase: Phase | null = currentIdx < PHASES.length - 1 ? PHASES[currentIdx + 1] : null;

      if (nextPhase) {
        await admin.from("project_kickoff_jobs").update({
          phases_complete: completed,
          result: fullResult,
          phase: nextPhase,
        }).eq("id", jobId);
        await triggerPhase(projectId, nextPhase, jobId);
      } else {
        await admin.from("project_kickoff_jobs").update({
          phases_complete: completed,
          result: fullResult,
          status: "complete",
          completed_at: new Date().toISOString(),
          phase: null,
        }).eq("id", jobId);
      }
      return NextResponse.json({ ok: true, phase, result });
    } catch (e) {
      await admin.from("project_kickoff_jobs").update({
        status: "failed",
        error_message: e instanceof Error ? e.message : String(e),
        completed_at: new Date().toISOString(),
      }).eq("id", jobId);
      return NextResponse.json({ error: e instanceof Error ? e.message : "phase failed" }, { status: 500 });
    }
  }

  // --- User-triggered entry ---
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (profile as { role?: string } | null)?.role;
  if (role !== "super_admin" && role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Verify caller has access to the project
  const access = await verifyProjectAccess(admin, user.id, projectId, { minRole: "admin" });
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code });

  const { data: created, error: createErr } = await admin
    .from("project_kickoff_jobs")
    .insert({
      project_id: projectId,
      status: "queued",
      phase: PHASES[0],
      phases_complete: [],
      created_by: user.id,
    })
    .select()
    .single();
  if (createErr || !created) {
    console.error("[projects/kickoff] queue failed", { projectId, err: createErr?.message });
    return NextResponse.json({ error: "could not queue kickoff" }, { status: 500 });
  }

  await triggerPhase(projectId, PHASES[0], (created as JobRow).id);
  return NextResponse.json({ ok: true, job_id: (created as JobRow).id, phases: PHASES }, { status: 202 });
}

// ------------------------------------------------------------
// Poll endpoint
// ------------------------------------------------------------
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const url = new URL(request.url);
  const jobId = url.searchParams.get("job_id");
  if (!jobId) return NextResponse.json({ error: "job_id required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: job } = await admin
    .from("project_kickoff_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });

  const j = job as JobRow;
  return NextResponse.json({
    job_id: j.id,
    status: j.status,
    phase: j.phase,
    phases_complete: j.phases_complete,
    total_phases: PHASES.length,
    result: j.result,
    error_message: j.error_message,
  });
}
