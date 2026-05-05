"use client";

import type { Project } from "@/lib/types/database";

// Single-tenant mode: the we360.ai dashboard tracks exactly one project
// (we360.ai itself). The former multi-project switcher + "New project" dialog
// have been removed. This component just renders a static brand pill so the
// sidebar keeps its shape.

interface Props {
  projects: Project[];
  activeProject: Project | null;
  canCreate: boolean;   // ignored — kept for call-site compat
}

export function ProjectSwitcher({ activeProject }: Props) {
  const name = activeProject?.name ?? "we360.ai";
  const domain = activeProject?.domain ?? "we360.ai";
  return (
    <div
      className="flex items-center gap-2 min-w-0 rounded-md border border-[#E5E7EB] bg-white dark:bg-card px-3 h-10"
      aria-label="Active project"
    >
      <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#5B45E0] text-[10px] font-bold text-white">
        {name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium leading-tight text-[#231D4F] dark:text-white">
          {name}
        </div>
        <div className="truncate text-[10px] text-muted-foreground leading-tight">
          {domain}
        </div>
      </div>
    </div>
  );
}
