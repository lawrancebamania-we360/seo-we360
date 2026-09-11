"use server";

// Ticket 9: budget-cap tracking for the 4 AI-Visibility-spend providers (the 3
// ai_visibility_* engine cards + apify's google_aio share). Separate from
// saveIntegrationConfig (lib/actions/integrations.ts) so setting a cap can stamp
// budget_period_start on first-set without that generic action needing to know
// about this field's special semantics.

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { IntegrationProvider } from "@/lib/types/database";

async function requireAdminRole(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (me as { role?: string } | null)?.role;
  if (role !== "super_admin" && role !== "admin") return { ok: false, error: "Not authorized" };
  return { ok: true };
}

/** Set (or update) a provider's budget cap in USD. Stamps budget_period_start to
 *  now on the FIRST time a cap is set for this provider, so spend tracking starts
 *  from "when you told us your budget", not from the dawn of the project. */
export async function setAiVisibilityBudget(provider: IntegrationProvider, capUsd: number): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdminRole();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!Number.isFinite(capUsd) || capUsd <= 0) return { ok: false, error: "Enter a budget greater than $0." };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("integrations").select("id, config").eq("provider", provider).is("project_id", null).limit(1);
  const row = existing?.[0] as { id: string; config: Record<string, string> | null } | undefined;
  const prevConfig = row?.config ?? {};
  const nextConfig = {
    ...prevConfig,
    budget_cap_usd: String(capUsd),
    budget_period_start: prevConfig.budget_period_start ?? new Date().toISOString(),
  };

  if (row) {
    const { error } = await admin.from("integrations").update({ config: nextConfig, status: "connected", last_checked_at: new Date().toISOString() }).eq("id", row.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin.from("integrations").insert({ project_id: null, provider, config: nextConfig, status: "connected", enabled: true, last_checked_at: new Date().toISOString() });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard/integrations");
  return { ok: true };
}

/** Reset usage tracking: bump budget_period_start to now, WITHOUT touching run
 *  history - "amount left" reads as the full cap again from this point forward. */
export async function resetAiVisibilityUsage(provider: IntegrationProvider): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdminRole();
  if (!auth.ok) return { ok: false, error: auth.error };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("integrations").select("id, config").eq("provider", provider).is("project_id", null).limit(1);
  const row = existing?.[0] as { id: string; config: Record<string, string> | null } | undefined;
  if (!row) return { ok: false, error: "No budget set for this provider yet." };

  const nextConfig = { ...(row.config ?? {}), budget_period_start: new Date().toISOString() };
  const { error } = await admin.from("integrations").update({ config: nextConfig }).eq("id", row.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/integrations");
  return { ok: true };
}
