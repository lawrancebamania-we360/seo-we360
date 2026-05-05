import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditUrl, fetchDomainContext } from "@/lib/seo-skills/orchestrator";
import { verifyProjectAccess } from "@/lib/auth/verify-access";
import type { Competitor, Project } from "@/lib/types/database";
import { getApifyCreds } from "@/lib/integrations/secrets";
import { env } from "@/lib/env";

function isInternalCall(request: NextRequest): boolean {
  const { CRON_SECRET } = env();
  if (!CRON_SECRET) return false;
  return request.headers.get("authorization") === `Bearer ${CRON_SECRET}`;
}

// Competitor auto-analysis — runs our 8 SEO skills against the competitor's
// homepage, compares findings to our project's latest findings, and generates
// "they're winning at X" / "we can beat them at Y" insights.
// Optionally pulls their top-ranking keywords via Apify (~$0.05).

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const internal = isInternalCall(request);

  if (!internal) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const role = (profile as { role?: string } | null)?.role;
    if (role === "client") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id: competitorId } = await params;
  const admin = createAdminClient();

  const { data: competitor } = await admin.from("competitors").select("*").eq("id", competitorId).maybeSingle();
  if (!competitor) return NextResponse.json({ error: "competitor not found" }, { status: 404 });

  if (!internal) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    // Verify caller belongs to the target project's org
    const access = await verifyProjectAccess(admin, user.id, (competitor as Competitor).project_id, { minRole: "member" });
    if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code });
  }

  const { data: project } = await admin.from("projects").select("*").eq("id", (competitor as Competitor).project_id).maybeSingle();
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  await admin.from("competitors").update({ analysis_status: "analyzing" }).eq("id", competitorId);

  try {
    const competitorUrl = (competitor as Competitor).url;
    const domainCtx = await fetchDomainContext(new URL(competitorUrl).hostname);
    // auditUrl now returns { findings, meta }; we only need the findings here
    const { findings: competitorFindings } = await auditUrl(competitorUrl, project as Project, domainCtx);

    // Pull the project's latest homepage audit for comparison
    const projectHomepage = `https://${(project as Project).domain}/`;
    const { data: ourFindings } = await admin
      .from("audit_findings")
      .select("*")
      .eq("project_id", (project as Project).id)
      .eq("url", projectHomepage)
      .order("created_at", { ascending: false })
      .limit(50);

    const ourOkChecks = new Set(
      (ourFindings ?? []).filter((f) => (f as { status: string }).status === "ok").map((f) => (f as { check_name: string }).check_name)
    );
    const ourBrokenChecks = new Set(
      (ourFindings ?? []).filter((f) => ["fail", "missing"].includes((f as { status: string }).status)).map((f) => (f as { check_name: string }).check_name)
    );

    const theirWins: string[] = [];
    const weWin: string[] = [];
    const weCanSteal: string[] = [];

    for (const f of competitorFindings) {
      if (f.status === "ok" && ourBrokenChecks.has(f.check)) {
        theirWins.push(`${f.skill} · ${f.check}: ${f.message}`);
      }
      if ((f.status === "fail" || f.status === "missing") && ourOkChecks.has(f.check)) {
        weWin.push(`${f.skill} · ${f.check}: ${f.message}`);
      }
      if (f.status === "ok") {
        weCanSteal.push(`${f.check}: ${f.message}`);
      }
    }

    // Optional — fetch their top keywords via Apify for a ranking-gap view
    let keywordGap: Array<{ question: string; opportunityScore: number }> = [];
    const apifyCreds = await getApifyCreds();
    if (apifyCreds) {
      try {
        const domainName = new URL(competitorUrl).hostname.replace(/^www\./, "");
        const actorSlug = apifyCreds.actorId.replace("/", "~");
        const res = await fetch(
          `https://api.apify.com/v2/acts/${actorSlug}/run-sync-get-dataset-items?token=${apifyCreds.token}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ keyword: `${domainName} ${project.industry ?? ""}`.trim(), limit: 6 }),
            signal: AbortSignal.timeout(45000),
          }
        );
        if (res.ok) {
          const items = (await res.json()) as Array<{ question: string; opportunityScore: number }>;
          keywordGap = items.slice(0, 6);
        }
      } catch { /* swallow */ }
    }

    const analysis = {
      analyzed_at: new Date().toISOString(),
      competitor_findings_count: competitorFindings.length,
      they_win: theirWins.slice(0, 8),
      we_win: weWin.slice(0, 8),
      we_can_steal: weCanSteal.slice(0, 10),
      keyword_gap: keywordGap,
      summary:
        theirWins.length > weWin.length
          ? `They're winning in ${theirWins.length} areas vs your ${weWin.length} — focus on parity checks first.`
          : `You're ahead in ${weWin.length} areas vs their ${theirWins.length} — steal their remaining strengths to pull further ahead.`,
    };

    await admin
      .from("competitors")
      .update({
        auto_analysis: analysis,
        analysis_status: "complete",
        last_analyzed_at: new Date().toISOString(),
      })
      .eq("id", competitorId);

    return NextResponse.json({ ok: true, analysis });
  } catch (e) {
    await admin
      .from("competitors")
      .update({
        analysis_status: "failed",
        auto_analysis: { error: e instanceof Error ? e.message : String(e) },
      })
      .eq("id", competitorId);
    // Don't echo internal errors to the client — log server-side only
    console.error("[competitors/analyze] failed", { competitorId, err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "analysis failed" }, { status: 500 });
  }
}
