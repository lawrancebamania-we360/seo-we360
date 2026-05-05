import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile, Project } from "@/lib/types/database";

export const ACTIVE_PROJECT_COOKIE = "we360.active_project_id";

export interface UserContext {
  userId: string;
  email: string;
  profile: Profile & { platform_admin?: boolean };
  projects: Project[];
  activeProject: Project | null;
  canManageTeam: boolean;
  canManageProjects: boolean;
  isPlatformAdmin: boolean;
  /**
   * Per-section permissions for the active project. Empty for admins/
   * super-admins (they have full access by virtue of role). For members and
   * clients, this drives sidebar nav visibility and page-level access gates.
   */
  permissions: Record<string, { can_view: boolean; can_add: boolean; can_edit: boolean; can_complete: boolean; can_delete: boolean }>;
}

/**
 * Fetch the current user with profile, projects, active project, and platform-admin flag.
 * Redirects to /login if no session.
 */
export async function getUserContext(): Promise<UserContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=session_expired");
  }

  let { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Self-heal: if the handle_new_user trigger didn't fire (or the trigger
  // raised), create the profile from auth metadata instead of locking the
  // user out into a redirect loop.
  if (!profile) {
    const email = user.email ?? "";
    if (!email.toLowerCase().endsWith("@we360.ai")) {
      await supabase.auth.signOut();
      redirect("/login?error=domain_not_allowed");
    }
    const meta = (user.user_metadata ?? {}) as { name?: string; full_name?: string };
    const name =
      (meta.name && meta.name.trim()) ||
      (meta.full_name && meta.full_name.trim()) ||
      email.split("@")[0];

    const admin = createAdminClient();
    const { data: created, error: createErr } = await admin
      .from("profiles")
      .upsert(
        { id: user.id, email, name, role: "member" },
        { onConflict: "id" }
      )
      .select("*")
      .single();
    if (createErr || !created) {
      console.error("[getUserContext] profile auto-create failed", { userId: user.id, err: createErr?.message });
      await supabase.auth.signOut();
      redirect("/login?error=profile_missing");
    }
    profile = created;
  }
  const typedProfile = profile as Profile & { platform_admin?: boolean };

  const isAdmin = typedProfile.role === "super_admin" || typedProfile.role === "admin";
  const isPlatformAdmin = typedProfile.platform_admin === true;

  // All we360 staff see all projects; otherwise go through project memberships.
  let projects: Project[] = [];
  if (isAdmin) {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    projects = (data ?? []) as Project[];
  } else {
    const { data } = await supabase
      .from("project_memberships")
      .select("project:projects(*)")
      .eq("user_id", user.id);
    projects = ((data ?? [])
      .map((m) => m.project)
      .filter(Boolean) as unknown as Project[])
      .filter((p) => p.is_active);
  }

  const cookieStore = await cookies();
  const cookieProjectId = cookieStore.get(ACTIVE_PROJECT_COOKIE)?.value;
  const preferredProjectId = cookieProjectId ?? typedProfile.active_project_id ?? projects[0]?.id;
  const activeProject = projects.find((p) => p.id === preferredProjectId) ?? projects[0] ?? null;

  // Pull this user's per-section permissions for the active project. Admins
  // and super-admins skip the lookup since they have full access regardless.
  let permissions: UserContext["permissions"] = {};
  if (!isAdmin && activeProject) {
    const { data } = await supabase
      .from("member_permissions")
      .select("section, can_view, can_add, can_edit, can_complete, can_delete")
      .eq("user_id", user.id)
      .eq("project_id", activeProject.id);
    for (const row of (data ?? []) as Array<{ section: string; can_view: boolean; can_add: boolean; can_edit: boolean; can_complete: boolean; can_delete: boolean }>) {
      permissions[row.section] = {
        can_view: !!row.can_view,
        can_add: !!row.can_add,
        can_edit: !!row.can_edit,
        can_complete: !!row.can_complete,
        can_delete: !!row.can_delete,
      };
    }
  }

  return {
    userId: user.id,
    email: user.email ?? typedProfile.email,
    profile: typedProfile,
    projects,
    activeProject,
    canManageTeam: isAdmin,
    canManageProjects: isAdmin,
    isPlatformAdmin,
    permissions,
  };
}

export async function requireAdmin(): Promise<UserContext> {
  const ctx = await getUserContext();
  if (ctx.profile.role === "member") {
    redirect("/");
  }
  return ctx;
}

export async function requireSuperAdmin(): Promise<UserContext> {
  const ctx = await getUserContext();
  if (ctx.profile.role !== "super_admin") {
    redirect("/");
  }
  return ctx;
}

export async function requirePlatformAdmin(): Promise<UserContext> {
  const ctx = await getUserContext();
  if (!ctx.isPlatformAdmin) {
    redirect("/dashboard/overview");
  }
  return ctx;
}

/**
 * Page-level gate driven by member_permissions.can_view. Admins and
 * super-admins bypass the check. Members are redirected to /dashboard if
 * their permission row says can_view=false for the given section.
 *
 * Used to back up the sidebar filter — a determined user could still type
 * the URL directly, so each gated page should also call this.
 */
export async function requireSection(section: string): Promise<UserContext> {
  const ctx = await getUserContext();
  if (ctx.canManageTeam) return ctx;          // admins always pass
  const perm = ctx.permissions[section];
  if (perm && perm.can_view === false) {
    // Send them somewhere they CAN see. Sprint is the most common landing
    // for non-admin team members; falls back to /dashboard otherwise.
    redirect("/dashboard/sprint");
  }
  return ctx;
}
