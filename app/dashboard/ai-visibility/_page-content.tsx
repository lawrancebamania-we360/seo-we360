import { requireSection } from "@/lib/auth/get-user";
import { getProjectSectionPermissions } from "@/lib/auth/section-permissions";
import { createClient } from "@/lib/supabase/server";
import { getAiVisibilityReport } from "@/lib/ai-citation/report";
import { getSourceGapReport } from "@/lib/ai-citation/source-gap";
import { getGa4AiReferralTraffic } from "@/lib/google/ga4";
import { configuredEngines } from "@/lib/ai-citation/engines";
import { ENGINE_LABEL, type AiEngine, type AiVisibilityCategory } from "@/lib/ai-citation/types";
import { getIntegrations } from "@/lib/data/integrations";
import type { IntegrationProvider } from "@/lib/types/database";
import { EmptyProjectState } from "@/components/dashboard/empty-project";
import { AiVisibilityClient } from "@/components/sections/ai-visibility-client";
import { AiVisibilityHero } from "@/components/sections/ai-visibility-hero";
import { getAiVisibilityScope } from "@/lib/actions/ai-visibility";
import { getLatestRunBatch, isMissingColumn } from "@/lib/ai-citation/run-state";
import { getPersonas } from "@/lib/data/personas";
import { isGoogleServiceAccountConfigured } from "@/lib/google/auth";
import { profileForIndustry } from "@/lib/ai-citation/industry-profiles";
import { cleanCompetitorRows, cleanKeywords } from "@/lib/ai-citation/clean-inputs";
import { normalizeCountry } from "@/lib/geo/countries";

// Shared body for both category pages (employee-monitoring/, workforce-analytics/).
// The report (score/heatmaps/answers/sources), the source-gap read, and the
// prompts list are all scoped to THIS category (ticket 7), same as every
// run/generate action (tickets 4-5) - the two pages are fully independent.
export async function AiVisibilityCategoryPage({ category }: { category: AiVisibilityCategory }) {
  const ctx = await requireSection("ai_visibility");
  if (!ctx.activeProject) return <EmptyProjectState canCreate={ctx.canManageProjects} />;
  const project = ctx.activeProject;

  const supabase = await createClient();
  // The category's questions for the Buyer Prompts card. Deleted ones (deleted_at
  // set) are hidden but their rows, and every answer recorded for them, stay in the
  // database. Before that column exists the same read runs without the filter, so
  // the list never goes blank on a database that hasn't been updated yet.
  const loadPrompts = (hideDeleted: boolean) => {
    let q = supabase.from("ai_citation_prompts")
      .select("id, text, persona, topic, tags, demand, active").eq("project_id", project.id).eq("category", category);
    if (hideDeleted) q = q.is("deleted_at", null);
    return q.order("created_at", { ascending: true }).limit(200);
  };
  const [report, promptsFirst, perms, aiReferral, sourceGap, outreachRes, scope, compsRes, kwRes, personas, integrations] = await Promise.all([
    getAiVisibilityReport(supabase, project.id, category),
    // Ticket 6: fetch BOTH active and inactive prompts - the Buyer Prompts card
    // manages the on/off toggle in place, so a paused prompt needs to still
    // render (dimmed) rather than disappear. Runs still only ever see active
    // ones (run.ts's own query filters .eq("active", true) independently).
    loadPrompts(true),
    getProjectSectionPermissions(project.id),
    // Is being cited actually sending traffic? Best-effort GA4 AI-referral read.
    getGa4AiReferralTraffic(project.ga4_property_id ?? null, project.id),
    // Build 3: off-site domains AI cites for competitors but not us (live, no storage).
    getSourceGapReport(supabase, project.id, category),
    // Existing outreach tracker rows (degrades to empty before the migration is applied).
    supabase.from("ai_citation_outreach")
      .select("source_domain, action_type, status, notes, draft, draft_subject, draft_kind").eq("project_id", project.id),
    // Pre-run tracking scope (null before the user sets one).
    getAiVisibilityScope(project.id),
    supabase.from("competitors").select("id, name, url").eq("project_id", project.id),
    supabase.from("keywords").select("keyword").eq("project_id", project.id).limit(20),
    getPersonas(project.id),
    getIntegrations(),
  ]);

  const promptsRes = promptsFirst.error && isMissingColumn(promptsFirst.error.message) ? await loadPrompts(false) : promptsFirst;

  // Durable state of the latest run (P0-5) so the client renders a truthful
  // running/failed/timed_out banner + Retry on first paint (then polls to
  // update). null before the migration is applied or before the first run.
  const latestRun = await getLatestRunBatch(supabase, project.id, category);
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

  // The project's market as a valid ISO-2 code (null when the stored value is not a
  // recognizable country). Seeds the run dialog's Geography picker; a run that keeps
  // exactly this one country behaves as it always did.
  const projectCountry = normalizeCountry(project.country);

  // Ticket 10's run-test modal shows amount-left per engine. Maps each AI-citation
  // engine to the integration card that tracks its spend (google_aio shares the
  // 'apify' card - see BUDGET_ENGINES in lib/data/integrations.ts).
  const ENGINE_TO_PROVIDER: Record<AiEngine, IntegrationProvider | null> = {
    chatgpt: "ai_visibility_chatgpt", claude: "ai_visibility_claude", gemini: "ai_visibility_gemini",
    google_aio: "apify", perplexity: null,
  };
  const byProvider = new Map(integrations.map((it) => [it.provider, it]));
  const engineBudgets = Object.fromEntries(
    (["chatgpt", "claude", "gemini", "google_aio"] as AiEngine[]).map((e) => {
      const provider = ENGINE_TO_PROVIDER[e];
      const it = provider ? byProvider.get(provider) : undefined;
      return [e, { capUsd: it?.budgetCapUsd ?? null, spentUsd: it?.spendSoFarUsd ?? null }];
    }),
  ) as Record<AiEngine, { capUsd: number | null; spentUsd: number | null }>;

  return (
    <div className="space-y-6 p-6 lg:px-10 lg:pt-8">
      <AiVisibilityHero category={category} />
      <AiVisibilityClient
        projectId={project.id}
        category={category}
        personas={personas}
        googleConnected={googleConnected}
        report={report}
        prompts={(promptsRes.data ?? []) as { id: string; text: string; persona: string | null; topic: string | null; tags: string[] | null; demand: string | null; active: boolean }[]}
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
        engineBudgets={engineBudgets}
        projectCountry={projectCountry}
      />
    </div>
  );
}
