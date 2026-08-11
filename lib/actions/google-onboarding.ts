"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/get-user";
import {
  listGa4Properties,
  listGscSites,
  type AvailableProperties,
  type GoogleConnectionState,
} from "@/lib/google/list-properties";

/** Current global Google OAuth connection + the active project's assigned props. */
export async function getGoogleConnection(): Promise<GoogleConnectionState> {
  await requireAdmin();
  const admin = createAdminClient();
  const [{ data: intg }, { data: proj }] = await Promise.all([
    admin.from("integrations").select("config, enabled").eq("provider", "google").is("project_id", null).limit(1),
    admin.from("projects").select("ga4_property_id, gsc_property_url").eq("is_active", true).limit(1),
  ]);
  const row = (intg?.[0] ?? null) as
    | { config?: { auth_type?: string; connected_email?: string; connected_at?: string }; enabled?: boolean }
    | null;
  const cfg = row?.config;
  const p = (proj?.[0] ?? null) as { ga4_property_id?: string | null; gsc_property_url?: string | null } | null;
  const connected = !!cfg && cfg.auth_type === "oauth" && row?.enabled !== false;
  return {
    connected,
    email: connected ? cfg!.connected_email ?? null : null,
    connectedAt: connected ? cfg!.connected_at ?? null : null,
    currentGa4: p?.ga4_property_id ?? null,
    currentGsc: p?.gsc_property_url ?? null,
  };
}

/** Disable the global Google connection (soft — clears the stored token). */
export async function disconnectGoogle(): Promise<void> {
  await requireAdmin();
  const admin = createAdminClient();
  await admin
    .from("integrations")
    .update({ enabled: false, status: "disabled", config: {}, last_error: null })
    .eq("provider", "google")
    .is("project_id", null);
  revalidatePath("/dashboard/integrations");
}

/** Fetch the pickable GA4 properties + GSC sites for the connected account. */
export async function listAvailableProperties(): Promise<AvailableProperties> {
  await requireAdmin();
  try {
    const [ga4, gsc] = await Promise.all([listGa4Properties(), listGscSites()]);
    return { ga4, gsc, error: null };
  } catch (e) {
    return { ga4: [], gsc: [], error: e instanceof Error ? e.message : "Could not list properties" };
  }
}

/** Assign a chosen GA4 property + GSC site to the active project. */
export async function saveProjectProperties(input: {
  ga4PropertyId?: string;
  gscSiteUrl?: string;
}): Promise<void> {
  await requireAdmin();
  const update: Record<string, string> = {};
  if (input.ga4PropertyId) update.ga4_property_id = input.ga4PropertyId.trim();
  if (input.gscSiteUrl) update.gsc_property_url = input.gscSiteUrl.trim();
  if (Object.keys(update).length === 0) return;

  const admin = createAdminClient();
  await admin.from("projects").update(update).eq("is_active", true);

  revalidatePath("/dashboard/integrations");
  revalidatePath("/dashboard/overview");
  revalidatePath("/dashboard/analytics");
}
