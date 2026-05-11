"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Image from "next/image";
import {
  LayoutDashboard, ListChecks, Search, Swords,
  CalendarRange, Trophy, Users, FolderCog, GitBranch, FileSearch,
  PanelLeftClose, PanelLeftOpen, GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/dashboard/user-menu";
import { ThemeToggle } from "@/components/dashboard/theme-toggle";
import { HealthCard } from "@/components/dashboard/health-card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SidebarProvider, useSidebar } from "@/components/dashboard/sidebar-context";
import type { Profile, Project } from "@/lib/types/database";
import type { HealthSnapshot } from "@/lib/data/health";

interface Props {
  profile: Profile;
  projects: Project[];
  activeProject: Project | null;
  canManageTeam: boolean;
  canManageProjects: boolean;
  health: HealthSnapshot;
  /** Per-section permission map for the current user (empty for admins). */
  permissions: Record<string, { can_view: boolean }>;
}

// Map nav routes to permission section keys. Routes set to `null` are
// always visible to all members (no gating). `seo_gaps` is also used as the
// section key for /dashboard/blog-audit (closest existing section).
const NAV_SECTION: Record<string, string | null> = {
  "/dashboard/overview":    "overview",
  "/dashboard/timeline":    null,        // always visible
  "/dashboard/tasks":       "tasks",
  "/dashboard/keywords":    "keywords",
  "/dashboard/competitors": "competitors",
  "/dashboard/sprint":      "sprint",
  "/dashboard/blog-audit":  "seo_gaps",
};

// Monochromatic we360 nav palette — primary purple for everything except Wins
// which gets the brand yellow accent (admin-only, deserves visual emphasis).
// No more rainbow tones — keeps the sidebar quiet so the active item pops.
type NavTone = "primary" | "yellow";
type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean; tone: NavTone };

// Wins moved to ADMIN_NAV (per direction: only admins should see it).
// SEO Gaps + Technical are rolled into Web Tasks. Articles is reachable from
// the blog-task "Generate with AI" flow.
const DEFAULT_NAV: NavItem[] = [
  { href: "/dashboard/overview",   label: "Overview",    icon: LayoutDashboard, exact: true, tone: "primary" },
  { href: "/dashboard/timeline",   label: "Timeline",    icon: GitBranch,      tone: "primary" },
  { href: "/dashboard/tasks",      label: "Web Tasks",   icon: ListChecks,     tone: "primary" },
  { href: "/dashboard/keywords",   label: "Keywords",    icon: Search,         tone: "primary" },
  { href: "/dashboard/competitors", label: "Competitors", icon: Swords,        tone: "primary" },
  { href: "/dashboard/sprint",     label: "Blog Sprint", icon: CalendarRange,  tone: "primary" },
  { href: "/dashboard/blog-audit", label: "Blog audit",  icon: FileSearch,     tone: "primary" },
];

// Admin-only nav — Wins gets the yellow accent so it stands out as a
// reward / status surface vs the work-tracking nav above.
const ADMIN_NAV: NavItem[] = [
  { href: "/dashboard/wins",     label: "Wins",     icon: Trophy,    tone: "yellow"  },
  { href: "/dashboard/team",     label: "Team",     icon: Users,     tone: "primary" },
  { href: "/dashboard/projects", label: "Projects", icon: FolderCog, tone: "primary" },
];

const TONE: Record<NavTone, { icon: string; active: string; activeIcon: string; hoverShadow: string }> = {
  // Primary purple — used for nearly everything. Inactive state is a muted
  // light-purple icon over neutral text; active state lifts to brand purple.
  primary: {
    icon: "text-[#7B62FF]/80",
    active: "bg-[#5B45E0]/10 text-[#5B45E0] dark:text-[#7B62FF]",
    activeIcon: "text-[#5B45E0] dark:text-[#7B62FF]",
    hoverShadow: "hover:shadow-[0_4px_12px_-6px_rgb(91_69_224/0.35)]",
  },
  // Brand yellow — reserved for Wins so it pops without breaking the palette.
  yellow: {
    icon: "text-[#FEB800]",
    active: "bg-[#FEB800]/15 text-[#231D4F] dark:text-[#FEB800]",
    activeIcon: "text-[#FEB800] fill-[#FEB800]/30",
    hoverShadow: "hover:shadow-[0_4px_12px_-6px_rgb(254_184_0/0.40)]",
  },
};

const ORDER_KEY = "we360.nav_order_v1";

export function Sidebar(props: Props) {
  return (
    <SidebarProvider>
      <SidebarInner {...props} />
    </SidebarProvider>
  );
}

function SidebarInner({ profile, activeProject, canManageTeam, canManageProjects, health, permissions }: Props) {
  const { collapsed, toggle } = useSidebar();
  const pathname = usePathname();

  const [order, setOrder] = useState<string[]>(() => DEFAULT_NAV.map((n) => n.href));
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ORDER_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        const known = new Set(DEFAULT_NAV.map((n) => n.href));
        const ordered = parsed.filter((h) => known.has(h));
        const missing = DEFAULT_NAV.map((n) => n.href).filter((h) => !ordered.includes(h));
        setOrder([...ordered, ...missing]);
      }
    } catch { /* ignore */ }
  }, []);

  const persistOrder = (next: string[]) => {
    setOrder(next);
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  // Filter nav items by per-section permissions. Admins (canManageTeam) skip
  // this filter — they always see everything. For members, a nav item is
  // hidden when its mapped section has can_view=false.
  const isMember = !canManageTeam;
  const isAllowed = (href: string): boolean => {
    if (!isMember) return true;
    const section = NAV_SECTION[href];
    if (section === null || section === undefined) return true; // unmapped → visible
    const perm = permissions[section];
    // Default: if no explicit row, assume access (legacy seeded users).
    return perm?.can_view ?? true;
  };

  const navMap = new Map(DEFAULT_NAV.map((n) => [n.href, n]));
  const orderedNav = order
    .map((h) => navMap.get(h))
    .filter((item): item is NavItem => Boolean(item) && isAllowed(item!.href));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIndex = order.indexOf(String(e.active.id));
    const newIndex = order.indexOf(String(e.over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    persistOrder(arrayMove(order, oldIndex, newIndex));
  };

  const showAdmin = canManageTeam || canManageProjects;

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 256 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="hidden lg:flex shrink-0 flex-col border-r border-border bg-sidebar/50 backdrop-blur-sm sticky top-0 h-svh overflow-hidden"
    >
      {/* Top bar: we360 logo + collapse toggle. The logo links to Overview;
          when the sidebar is collapsed only the mark is shown and the
          toggle button moves below it on its own row. */}
      <div className={cn("flex flex-col border-b border-border shrink-0", collapsed ? "items-center gap-1 py-2" : "px-3 py-2")}>
        <div className={cn("flex items-center w-full", collapsed ? "justify-center" : "justify-between gap-2")}>
          <Link href="/dashboard/overview" className="flex items-center min-w-0 group" aria-label="We360 home">
            {collapsed ? (
              <Image
                src="/we360-mark.png"
                alt="We360"
                width={28}
                height={28}
                priority
                className="rounded-md transition-transform group-hover:scale-105"
              />
            ) : (
              <Image
                src="/we360-logo.webp"
                alt="We360.ai"
                width={108}
                height={28}
                priority
                className="h-7 w-auto object-contain transition-transform group-hover:scale-[1.02]"
              />
            )}
          </Link>
          {!collapsed && (
            <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="Collapse sidebar">
              <PanelLeftClose className="size-4" />
            </Button>
          )}
        </div>
        {collapsed && (
          <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="Expand sidebar">
            <PanelLeftOpen className="size-4" />
          </Button>
        )}
      </div>

      <nav className={cn("flex-1 overflow-y-auto min-h-0 we360-scroll", collapsed ? "px-2" : "px-3", "pb-3")}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <div className="space-y-0.5">
              {orderedNav.map((item) => {
                const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                return <SortableNavLink key={item.href} item={item} active={active} collapsed={collapsed} />;
              })}
            </div>
          </SortableContext>
        </DndContext>

        {showAdmin && (
          <>
            {!collapsed && (
              <div className="mt-5 mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Admin
              </div>
            )}
            {collapsed && <div className="my-4 mx-2 h-px bg-border" />}
            <div className="space-y-0.5">
              {ADMIN_NAV.map((item) => {
                const active = pathname.startsWith(item.href);
                return <NavLink key={item.href} item={item} active={active} collapsed={collapsed} />;
              })}
            </div>
          </>
        )}

        {activeProject && (
          <div className={cn("mt-3", collapsed ? "flex justify-center" : "px-1")}>
            <HealthCard health={health} collapsed={collapsed} />
          </div>
        )}
      </nav>

      <div className={cn("border-t border-border p-2 flex items-center shrink-0", collapsed ? "flex-col gap-1" : "gap-1")}>
        <div className={cn("min-w-0", collapsed ? "w-full" : "flex-1")}>
          <UserMenu profile={profile} collapsed={collapsed} />
        </div>
        {!collapsed && <ThemeToggle />}
      </div>
      {collapsed && (
        <div className="border-t border-border p-1 flex justify-center shrink-0">
          <ThemeToggle />
        </div>
      )}
    </motion.aside>
  );
}

function SortableNavLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: item.href });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined };

  return (
    <div ref={setNodeRef} style={style} className={cn("relative group", isDragging && "opacity-80")}>
      <NavLink item={item} active={active} collapsed={collapsed} />
      {!collapsed && (
        <button
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="absolute left-0 top-1/2 -translate-y-1/2 -ml-3 p-1 opacity-0 group-hover:opacity-60 hover:opacity-100 cursor-grab active:cursor-grabbing touch-none"
          onClick={(e) => e.preventDefault()}
        >
          <GripVertical className="size-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

function NavLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const Icon = item.icon;
  const t = TONE[item.tone];

  const content = (
    <Link
      href={item.href}
      className={cn(
        "relative group/nav flex items-center rounded-md text-sm transition-all duration-200",
        collapsed ? "justify-center size-10" : "gap-2.5 px-2.5 py-2",
        active
          ? cn(t.active, "font-medium shadow-sm")
          : cn("text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground", t.hoverShadow)
      )}
    >
      {active && !collapsed && (
        <motion.div
          layoutId="nav-active"
          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-current opacity-70"
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
      <Icon
        className={cn(
          "size-4 shrink-0 transition-all group-hover/nav:scale-110",
          active ? t.activeIcon : t.icon
        )}
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger render={<div className="block">{content}</div>} />
        <TooltipContent side="right" sideOffset={8}>{item.label}</TooltipContent>
      </Tooltip>
    );
  }
  return content;
}
