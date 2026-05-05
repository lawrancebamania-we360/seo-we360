import type { SupabaseClient } from "@supabase/supabase-js";

// Shared auth helpers for API routes that use the admin (service-role) Supabase
// client. Service role bypasses RLS, so these manual checks are load-bearing —
// any mutation that reaches admin.from(...).insert/update/delete must first call
// one of these gates with the caller's user.id + the target resource id.

export interface AccessDenied { allowed: false; reason: string; code: 404 | 403 }
export interface AccessGranted { allowed: true; role: "owner" | "admin" | "member" | "client" }
export type AccessResult = AccessGranted | AccessDenied;

/**
 * Verify the caller has access to the given project.
 * Platform admins (we360 staff) always pass; otherwise we look at profile role
 * plus explicit project_memberships.
 */
export async function verifyProjectAccess(
  admin: SupabaseClient,
  userId: string,
  projectId: string,
  options: { minRole?: "owner" | "admin" | "member" | "client" } = {}
): Promise<AccessResult> {
  const { data: project } = await admin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return { allowed: false, reason: "project not found", code: 404 };

  const { data: profile } = await admin
    .from("profiles")
    .select("role, platform_admin")
    .eq("id", userId)
    .maybeSingle();
  const prof = (profile ?? null) as { role?: string; platform_admin?: boolean } | null;
  if (prof?.platform_admin) {
    return { allowed: true, role: "owner" };
  }

  // super_admin/admin on the profile implicitly has access to every project.
  if (prof?.role === "super_admin" || prof?.role === "admin") {
    return { allowed: true, role: "admin" };
  }

  const { data: member } = await admin
    .from("project_memberships")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  const role = ((member as { role?: AccessGranted["role"] } | null)?.role) ?? "member";
  const order: Record<AccessGranted["role"], number> = { owner: 3, admin: 2, member: 1, client: 0 };
  const min = options.minRole ?? "client";
  if (!member && prof?.role !== "member") {
    return { allowed: false, reason: "no access to this project", code: 403 };
  }
  if (order[role] < order[min]) {
    return { allowed: false, reason: `requires ${min}+`, code: 403 };
  }
  return { allowed: true, role };
}
