"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Settings, ShieldCheck, ArrowLeft, ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/settings", label: "Settings", icon: Settings },
  { href: "/admin/audit-trail", label: "Audit trail", icon: ScrollText },
];

export function AdminSidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 border-r bg-background/80 flex flex-col h-svh sticky top-0">
      <div className="px-4 py-4 border-b space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 via-orange-500 to-amber-500 text-white shadow-md shadow-rose-500/30">
            <ShieldCheck className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold leading-tight">we360 Admin</div>
            <div className="text-[10px] text-muted-foreground leading-tight">Admin · {userName}</div>
          </div>
        </div>
        <Link
          href="/dashboard/overview"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3" />
          Back to dashboard
        </Link>
      </div>

      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto we360-scroll">
        {NAV.map((it) => {
          const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                active
                  ? "bg-muted text-foreground font-medium shadow-sm"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              <it.icon className="size-3.5" />
              {it.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t text-[10px] text-muted-foreground">
        Platform admin access · forensic actions logged
      </div>
    </aside>
  );
}
