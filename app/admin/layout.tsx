import { requirePlatformAdmin } from "@/lib/auth/get-user";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

// Platform-admin only. requirePlatformAdmin() redirects non-admins to /dashboard/overview.
// All admin mutations go through /api/admin/* which re-verify platform_admin server-side —
// the layout gate is a first line of defense, never the only one.

export const metadata = { title: "Platform admin · SEO · we360.ai" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePlatformAdmin();

  return (
    <div className="flex min-h-svh bg-background">
      <AdminSidebar userName={ctx.profile.name} />
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
