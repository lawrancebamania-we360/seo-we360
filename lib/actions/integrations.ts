"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { IntegrationProvider } from "@/lib/types/database";

export async function saveIntegrationConfig(
  provider: IntegrationProvider,
  config: Record<string, string>
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (me as { role?: string } | null)?.role;
  if (role !== "super_admin" && role !== "admin") throw new Error("Not authorized");

  // Filter empty strings (don't overwrite with blanks)
  const clean = Object.fromEntries(Object.entries(config).filter(([, v]) => v && v.trim().length > 0));

  const admin = createAdminClient();
  const { error } = await admin
    .from("integrations")
    .upsert({
      project_id: null,
      provider,
      config: clean,
      status: Object.keys(clean).length > 0 ? "connected" : "setup_required",
      last_checked_at: new Date().toISOString(),
      enabled: true,
    }, { onConflict: "project_id,provider" });
  if (error) throw error;

  // GA4 Property ID and GSC Property URL are consumed by the overview page +
  // crons from the `projects` row, not from `integrations.config`. Mirror them
  // across on save so the single-tenant we360.ai project always reflects what
  // the UI says.
  if (provider === "ga4" && clean.property_id) {
    await admin
      .from("projects")
      .update({ ga4_property_id: clean.property_id.trim() })
      .eq("is_active", true);
  }
  if (provider === "gsc" && clean.property_url) {
    await admin
      .from("projects")
      .update({ gsc_property_url: clean.property_url.trim() })
      .eq("is_active", true);
  }

  revalidatePath("/dashboard/integrations");
  revalidatePath("/dashboard/overview");
}
