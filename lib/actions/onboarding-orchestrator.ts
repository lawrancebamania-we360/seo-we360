"use server";

// Minimal onboarding-orchestrator surface for the imported persona-review UI.
// Klimb's full orchestrator drives its onboarding funnel; We360 only needs the
// one action persona-review calls: "unlock my locked personas and extend the
// report to cover all my buyers". We unlock any locked personas + reactivate
// their prompts, then delegate to the real regeneratePersonas action (which
// enforces auth + refreshes the AI-inferred persona set).

import { getUserContext } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { regeneratePersonas } from "@/lib/actions/ai-visibility";

export async function unlockPersonasAndExtend(input: { project_id: string }): Promise<{ ok: boolean; error?: string }> {
  // getUserContext redirects unauthenticated callers to /login.
  await getUserContext();

  const admin = createAdminClient();
  try {
    const { data: locked } = await admin
      .from("ai_citation_personas")
      .select("label")
      .eq("project_id", input.project_id)
      .eq("locked", true);
    const labels = ((locked ?? []) as { label: string }[]).map((p) => p.label);
    if (labels.length) {
      await admin.from("ai_citation_personas").update({ locked: false } as never).eq("project_id", input.project_id).eq("locked", true);
      await admin.from("ai_citation_prompts").update({ active: true }).eq("project_id", input.project_id).in("persona", labels);
    }
  } catch { /* best-effort unlock — a project that never locked has nothing to clear */ }

  // regeneratePersonas enforces project access and refreshes the persona set.
  const r = await regeneratePersonas({ project_id: input.project_id });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}
