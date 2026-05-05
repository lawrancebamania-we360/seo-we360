"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_PROJECT_COOKIE } from "@/lib/auth/get-user";

// Single-project mode. Project creation is disabled — the we360.ai row is
// seeded by migration 20260424000002_seed_we360_project.sql. We still keep the
// active-project cookie + archive toggles so admin tooling has a handle.

export async function setActiveProject(projectId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_PROJECT_COOKIE, projectId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase.from("profiles").update({ active_project_id: projectId }).eq("id", user.id);
  }
  revalidatePath("/", "layout");
}

export async function archiveProject(projectId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (me as { role?: string } | null)?.role;
  if (role !== "super_admin" && role !== "admin") throw new Error("Not authorized");

  await supabase.from("projects").update({ is_active: false }).eq("id", projectId);
  revalidatePath("/", "layout");
}

export async function unarchiveProject(projectId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (me as { role?: string } | null)?.role;
  if (role !== "super_admin" && role !== "admin") throw new Error("Not authorized");

  await supabase.from("projects").update({ is_active: true }).eq("id", projectId);
  revalidatePath("/", "layout");
}

export async function deleteProject(projectId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((me as { role?: string } | null)?.role !== "super_admin") {
    throw new Error("Only super admins can permanently delete projects");
  }

  const admin = createAdminClient();
  const { error } = await admin.from("projects").delete().eq("id", projectId);
  if (error) throw error;

  revalidatePath("/", "layout");
}
