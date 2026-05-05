"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

const CompetitorSchema = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  url: z.string().url(),
  da: z.number().int().min(0).max(100).optional().nullable(),
  traffic: z.number().int().min(0).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function createCompetitor(input: z.infer<typeof CompetitorSchema>) {
  const parsed = CompetitorSchema.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("competitors")
    .insert({
      project_id: parsed.project_id,
      name: parsed.name,
      url: parsed.url,
      da: parsed.da ?? null,
      traffic: parsed.traffic ?? null,
      notes: parsed.notes ?? null,
      analysis_status: "pending",
    })
    .select()
    .single();
  if (error) throw error;

  revalidatePath("/dashboard/competitors");

  // Kick off async analysis — fire and forget
  try {
    const appUrl = env().NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    fetch(`${appUrl}/api/competitors/${data.id}/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
    }).catch(() => { /* swallow — UI will show pending status */ });
  } catch { /* ignore */ }

  return data;
}

export async function deleteCompetitor(competitorId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (me as { role?: string } | null)?.role;
  if (role !== "super_admin" && role !== "admin") throw new Error("Not authorized");

  const { error } = await supabase.from("competitors").delete().eq("id", competitorId);
  if (error) throw error;
  revalidatePath("/dashboard/competitors");
}
