"use client";

// Analytics Ticket 6: "too many things shown, overwhelming" - replaces the
// old stacked-vertically layout with 5 clickable boxes; clicking one reveals
// ONLY that section below, clicking the active one again collapses it.
// Panels are pre-rendered server-side (including their own Suspense
// boundaries for the Google round-trips) and passed in as nodes - this shell
// only toggles which one is visible, it doesn't fetch anything itself.

import { useState, type ReactNode } from "react";
import { TrendingUp, Eye, AlertTriangle, Users, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

type BoxKey = "movers" | "page_views" | "stale" | "engagement" | "blog_clusters";

const BOXES: { key: BoxKey; label: string; icon: typeof TrendingUp }[] = [
  { key: "movers", label: "Top 10 Movers", icon: TrendingUp },
  { key: "page_views", label: "Top 10 Page Views", icon: Eye },
  { key: "stale", label: "Pages Going Stale", icon: AlertTriangle },
  { key: "engagement", label: "Top 20 Engaged/Disengaged", icon: Users },
  { key: "blog_clusters", label: "Blog Clusters", icon: Layers },
];

export function AnalyticsCategoryBoxes({
  moversPanel, pageViewsPanel, stalePanel, engagementPanel, blogClustersPanel,
}: {
  moversPanel: ReactNode;
  pageViewsPanel: ReactNode;
  stalePanel: ReactNode;
  engagementPanel: ReactNode;
  blogClustersPanel: ReactNode;
}) {
  const [active, setActive] = useState<BoxKey | null>(null);
  const panels: Record<BoxKey, ReactNode> = {
    movers: moversPanel,
    page_views: pageViewsPanel,
    stale: stalePanel,
    engagement: engagementPanel,
    blog_clusters: blogClustersPanel,
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {BOXES.map((box) => {
          const Icon = box.icon;
          const isActive = active === box.key;
          return (
            <button
              key={box.key}
              type="button"
              onClick={() => setActive((prev) => (prev === box.key ? null : box.key))}
              aria-pressed={isActive}
              className={cn(
                "flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all",
                isActive
                  ? "border-primary/40 bg-primary/5 shadow-lift"
                  : "border-border bg-card hover:-translate-y-0.5 hover:shadow-lift",
              )}
            >
              <span className={cn("grid size-8 place-items-center rounded-xl", isActive ? "bg-primary/15 text-primary" : "bg-muted text-slate-500")}>
                <Icon className="size-4" />
              </span>
              <span className={cn("text-[13px] font-semibold leading-tight", isActive ? "text-primary" : "text-foreground")}>
                {box.label}
              </span>
            </button>
          );
        })}
      </div>

      {active ? (
        <div>{panels[active]}</div>
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-6 py-8 text-center text-[13px] text-slate-400">
          Click a box above to see that data.
        </p>
      )}
    </div>
  );
}
