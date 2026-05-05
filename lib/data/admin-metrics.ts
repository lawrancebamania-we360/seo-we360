import { createAdminClient } from "@/lib/supabase/admin";

export interface AdminMetrics {
  users_total: number;
  new_signups_30d: number;
}

export async function getAdminMetrics(): Promise<AdminMetrics> {
  const admin = createAdminClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

  const [usersTotalRes, newSignupsRes] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", thirtyDaysAgo),
  ]);

  return {
    users_total: usersTotalRes.count ?? 0,
    new_signups_30d: newSignupsRes.count ?? 0,
  };
}

export interface UserListRow {
  id: string;
  email: string;
  name: string;
  role: string;
  platform_admin: boolean;
  created_at: string;
  last_active: string;
}

export async function getUserList(): Promise<UserListRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, email, name, role, platform_admin, created_at, last_active")
    .order("created_at", { ascending: false });
  return (data ?? []) as UserListRow[];
}
