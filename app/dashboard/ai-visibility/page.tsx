import { requireSection } from "@/lib/auth/get-user";
import { getProjectSectionPermissions } from "@/lib/auth/section-permissions";
import { createClient } from "@/lib/supabase/server";
import { getAiVisibilityReport } from "@/lib/ai-citation/report";
import { getSourceGapReport } from "@/lib/ai-citation/source-gap";
import { getGa4AiReferralTraffic } from "@/lib/google/ga4";
import { configuredEngines } from "@/lib/ai-citation/engines";
import { ENGINE_LABEL } from "@/lib/ai-citation/types";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { AiVisibilityClient } from "@/components/sections/ai-visibility-client";
import { AiVisibilityHero } from "@/components/sections/ai-visibility-hero";
import { getAiVisibilityScope } from "@/lib/actions/ai-visibility";
import { getLatestRunBatch } from "@/lib/ai-citation/run-state";
import { getPersonas } from "@/lib/data/personas";
import { isGoogleServiceAccountConfigured } from "@/lib/google/auth";
import { profileForIndustry } from "@/lib/ai-citation/industry-profiles";
import { cleanCompetitorRows, cleanKeywords } from "@/lib/ai-citation/clean-inputs";

export const metadata = { title: "AI Visibility" };

export default async function AiVisibilityPage() {
  const ctx = await requireSection("ai_visibility");
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;
  const project = ctx.activeProject;

  const supabase = await createClient();
  const [report, promptsRes, perms, aiReferral, sourceGap, outreachRes, scope, compsRes, kwRes, personas] = await Promise.all([
    getAiVisibilityReport(supabase, project.id),
    supabase.from("ai_citation_prompts")
      .select("id, text, persona, topic, tags, demand").eq("project_id", project.id).eq("active", true)
      .order("created_at", { ascending: true }).limit(200),
    getProjectSectionPermissions(project.id),
    // Is being cited actually sending traffic? Best-effort GA4 AI-referral read.
    getGa4AiReferralTraffic(project.ga4_property_id ?? null, project.id),
    // Build 3: off-site domains AI cites for competitors but not us (live, no storage).
    getSourceGapReport(supabase, project.id),
    // Existing outreach tracker rows (degrades to empty before the migration is applied).
    supabase.from("ai_citation_outreach")
      .select("source_domain, action_type, status, notes, draft, draft_subject, draft_kind").eq("project_id", project.id),
    // Pre-run tracking scope (null before the user sets one).
    getAiVisibilityScope(project.id),
    supabase.from("competitors").select("id, name, url").eq("project_id", project.id),
    supabase.from("keywords").select("keyword").eq("project_id", project.id).limit(20),
    getPersonas(project.id),
  ]);

  // Durable state of the latest run (P0-5) so the client renders a truthful
  // running/failed/timed_out banner + Retry on first paint (then polls to
  // update). null before the migration is applied or before the first run.
  const latestRun = await getLatestRunBatch(supabase, project.id);
  // D5: drives the locked-persona cards — no Google → "Connect to unlock"; connected
  // with locked personas still present → the C5 "refresh + extend" offer.
  const googleConnected = await isGoogleServiceAccountConfigured();

  const outreach = (outreachRes.data ?? []) as { source_domain: string; action_type: string; status: string; notes: string | null; draft: string | null; draft_subject: string | null; draft_kind: string | null }[];
  // Cleaned competitor subset the scope drawer picks from (junk filtered out).
  const competitors = cleanCompetitorRows((compsRes.data ?? []) as { id: string; name: string; url: string }[]).map((c) => ({ id: c.id, name: c.name }));
  const suggestedTopics = profileForIndustry((project as { industry?: string | null }).industry).suggestedTopics;
  // Pre-fill the scope drawer's "get cited for" with the project's top clean keyword.
  const defaultKeyword = cleanKeywords(((kwRes.data ?? []) as { keyword: string }[]).map((k) => k.keyword), { brand: (project as { name?: string }).name ?? "", industry: (project as { industry?: string | null }).industry ?? "" })[0] ?? "";

  const engines = configuredEngines().map((e) => ({ key: e, label: ENGINE_LABEL[e] }));

  return (
    <div className="space-y-6 p-6 lg:px-10 lg:pt-8">
      <AiVisibilityHero />
      <AiVisibilityClient
        projectId={project.id}
        personas={personas}
        googleConnected={googleConnected}
        report={report}
        prompts={(promptsRes.data ?? []) as { id: string; text: string; persona: string | null; topic: string | null; tags: string[] | null; demand: string | null }[]}
        configuredEngines={engines}
        canManage={perms.ai_visibility.edit}
        aiReferral={aiReferral}
        sourceGap={sourceGap}
        outreach={outreach}
        competitors={competitors}
        suggestedTopics={suggestedTopics}
        defaultKeyword={defaultKeyword}
        scope={scope}
        initialRun={latestRun}
      />
    </div>
  );
}
