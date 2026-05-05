"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SectionKey, UserRole } from "@/lib/types/database";
import { env } from "@/lib/env";

const InviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["super_admin", "admin", "member", "client"]),
  project_ids: z.array(z.string().uuid()).default([]),
  section_permissions: z
    .record(
      z.string(),
      z.object({
        can_view: z.boolean().default(true),
        can_add: z.boolean().default(false),
        can_edit: z.boolean().default(false),
        can_complete: z.boolean().default(false),
        can_delete: z.boolean().default(false),
      })
    )
    .default({}),
});

export async function inviteTeamMember(input: z.infer<typeof InviteSchema>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const myRole = (me as { role?: string } | null)?.role;
  if (!myRole || (myRole !== "super_admin" && myRole !== "admin")) {
    throw new Error("Not authorized");
  }
  if ((input.role === "admin" || input.role === "super_admin") && myRole !== "super_admin") {
    throw new Error("Only super admins can create admins or super admins");
  }

  const parsed = InviteSchema.parse(input);
  const admin = createAdminClient();
  const redirectTo = `${env().NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback?next=/profile`;

  // 1. Invite the user via email (Supabase sends a magic link; user sets password on first click)
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(parsed.email, {
    data: { name: parsed.name, role: parsed.role },
    redirectTo,
  });
  if (inviteErr || !invited?.user) throw inviteErr ?? new Error("Invite failed");
  const newUserId = invited.user.id;

  // 2. Ensure profile has the right role + name (trigger auto-creates with defaults)
  await admin.from("profiles").update({ role: parsed.role as UserRole, name: parsed.name }).eq("id", newUserId);

  // 3. Project memberships — only relevant for members/clients; admins and super_admins see all
  const needsMemberships = parsed.role === "member" || parsed.role === "client";
  if (needsMemberships && parsed.project_ids.length > 0) {
    await admin.from("project_memberships").insert(
      parsed.project_ids.map((pid) => ({ user_id: newUserId, project_id: pid, added_by: user.id }))
    );

    const permRows = parsed.project_ids.flatMap((pid) =>
      Object.entries(parsed.section_permissions).map(([section, perms]) => ({
        user_id: newUserId,
        project_id: pid,
        section: section as SectionKey,
        ...perms,
      }))
    );
    if (permRows.length > 0) {
      await admin.from("member_permissions").insert(permRows);
    }
  }

  revalidatePath("/dashboard/team");
  return { email: parsed.email };
}

export async function updateMemberRole(userId: string, role: UserRole) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const myRole = (me as { role?: string } | null)?.role;
  if (!myRole || myRole !== "super_admin") throw new Error("Only super admins can change roles");

  await supabase.from("profiles").update({ role }).eq("id", userId);
  revalidatePath("/dashboard/team");
}

export async function removeMember(userId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const myRole = (me as { role?: string } | null)?.role;
  if (!myRole || myRole !== "super_admin") throw new Error("Only super admins can remove members");

  const admin = createAdminClient();
  await admin.auth.admin.deleteUser(userId);
  revalidatePath("/dashboard/team");
}
