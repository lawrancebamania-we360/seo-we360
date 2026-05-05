import { getUserContext } from "@/lib/auth/get-user";
import { getOverallHealth } from "@/lib/data/health";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MobileNav } from "@/components/dashboard/mobile-nav";
import { UserMenu } from "@/components/dashboard/user-menu";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getUserContext();
  const health = await getOverallHealth(ctx.activeProject?.id ?? null);

  return (
    <div className="flex h-svh bg-background overflow-hidden">
      <Sidebar
        profile={ctx.profile}
        projects={ctx.projects}
        activeProject={ctx.activeProject}
        canManageTeam={ctx.canManageTeam}
        canManageProjects={ctx.canManageProjects}
        health={health}
        permissions={ctx.permissions}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex h-14 shrink-0 items-center justify-between border-b border-border px-4 bg-background/80 backdrop-blur sticky top-0 z-30">
          <MobileNav canManageTeam={ctx.canManageTeam} />
          <div className="font-semibold tracking-tight text-[#231D4F] dark:text-white">
            SEO <span className="text-[#5B45E0]">we360</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <UserMenu profile={ctx.profile} />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
