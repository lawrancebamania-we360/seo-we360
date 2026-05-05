"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const NAV = [
  { href: "/dashboard/overview", label: "Overview" },
  { href: "/dashboard/timeline", label: "Timeline" },
  { href: "/dashboard/tasks", label: "Web Tasks" },
  { href: "/dashboard/keywords", label: "Keywords" },
  { href: "/dashboard/competitors", label: "Competitors" },
  { href: "/dashboard/sprint", label: "Blog Sprint" },
  { href: "/dashboard/blog-audit", label: "Blog audit" },
];

// Admin-only routes — Wins moved here per access policy (no longer in
// the default nav for members).
const ADMIN_NAV = [
  { href: "/dashboard/wins", label: "Wins" },
  { href: "/dashboard/team", label: "Team" },
  { href: "/dashboard/projects", label: "Projects" },
];

export function MobileNav({ canManageTeam }: { canManageTeam: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const allItems = canManageTeam ? [...NAV, ...ADMIN_NAV] : NAV;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={(p) => <Button {...p} variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu"><Menu className="size-5" /></Button>} />
      <SheetContent side="left" className="p-0 w-72">
        <div className="flex h-16 items-center gap-2 border-b border-border px-4">
          <Image
            src="/we360-logo.webp"
            alt="we360.ai"
            width={120}
            height={24}
            priority
            className="h-6 w-auto dark:brightness-0 dark:invert"
          />
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground whitespace-nowrap ml-1">
            Internal SEO
          </div>
        </div>
        <nav className="p-3 space-y-0.5">
          {allItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "block rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
