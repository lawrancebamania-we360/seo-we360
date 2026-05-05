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
}

type NavTone = "violet" | "emerald" | "rose" | "sky" | "amber" | "orange" | "fuchsia" | "gold";
type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean; tone: NavTone };

// SEO Gaps + Technical were rolled into Web Tasks (PSI sprint covers everything
// audit_findings tracked). Articles is reachable from blog tasks (Generate with
// AI flow), so it stays as a route but doesn't need its own sidebar slot.
const DEFAULT_NAV: NavItem[] = [
  { href: "/dashboard/overview", label: "Overview", icon: LayoutDashboard, exact: true, tone: "violet" },
  { href: "/dashboard/timeline", label: "Timeline", icon: GitBranch, tone: "violet" },
  { href: "/dashboard/tasks", label: "Web Tasks", icon: ListChecks, tone: "emerald" },
  { href: "/dashboard/keywords", label: "Keywords", icon: Search, tone: "sky" },
  { href: "/dashboard/competitors", label: "Competitors", icon: Swords, tone: "orange" },
  { href: "/dashboard/sprint", label: "Blog Sprint", icon: CalendarRange, tone: "fuchsia" },
  { href: "/dashboard/blog-audit", label: "Blog audit", icon: FileSearch, tone: "rose" },
  { href: "/dashboard/wins", label: "Wins", icon: Trophy, tone: "gold" },
];

// Integrations moved to the user-menu dropdown — one-off setup,
// not day-to-day navigation. Sidebar stays focused on live work.
const ADMIN_NAV: NavItem[] = [
  { href: "/dashboard/team", label: "Team", icon: Users, tone: "violet" },
  { href: "/dashboard/projects", label: "Projects", icon: FolderCog, tone: "amber" },
];

const TONE: Record<NavTone, { icon: string; active: string; activeIcon: string; hoverShadow: string }> = {
  violet: {
    icon: "text-violet-500",
    active: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
    activeIcon: "text-violet-600 dark:text-violet-400",
    hoverShadow: "hover:shadow-[0_4px_12px_-6px_rgb(139_92_246/0.35)]",
  },
  emerald: {
    icon: "text-emerald-500",
    active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    activeIcon: "text-emerald-600 dark:text-emerald-400",
    hoverShadow: "hover:shadow-[0_4px_12px_-6px_rgb(16_185_129/0.35)]",
  },
  rose: {
    icon: "text-rose-500",
    active: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
    activeIcon: "text-rose-600 dark:text-rose-400",
    hoverShadow: "hover:shadow-[0_4px_12px_-6px_rgb(244_63_94/0.35)]",
  },
  sky: {
    icon: "text-sky-500",
    active: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    activeIcon: "text-sky-600 dark:text-sky-400",
    hoverShadow: "hover:shadow-[0_4px_12px_-6px_rgb(14_165_233/0.35)]",
  },
  amber: {
    icon: "text-amber-500",
    active: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    activeIcon: "text-amber-600 dark:text-amber-400",
    hoverShadow: "hover:shadow-[0_4px_12px_-6px_rgb(245_158_11/0.35)]",
  },
  orange: {
    icon: "text-orange-500",
    active: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
    activeIcon: "text-orange-600 dark:text-orange-400",
    hoverShadow: "hover:shadow-[0_4px_12px_-6px_rgb(249_115_22/0.35)]",
  },
  fuchsia: {
    icon: "text-fuchsia-500",
    active: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
    activeIcon: "text-fuchsia-600 dark:text-fuchsia-400",
    hoverShadow: "hover:shadow-[0_4px_12px_-6px_rgb(217_70_239/0.35)]",
  },
  gold: {
    icon: "text-yellow-500",
    active: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
    activeIcon: "text-yellow-600 dark:text-yellow-400 fill-yellow-400",
    hoverShadow: "hover:shadow-[0_4px_12px_-6px_rgb(234_179_8/0.45)]",
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

function SidebarInner({ profile, activeProject, canManageTeam, canManageProjects, health }: Props) {
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

  const navMap = new Map(DEFAULT_NAV.map((n) => [n.href, n]));
  const orderedNav = order.map((h) => navMap.get(h)).filter(Boolean) as NavItem[];

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
      <div className={cn("flex h-12 items-center border-b border-border shrink-0 px-2", collapsed ? "justify-center" : "justify-end")}>
        <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </Button>
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
