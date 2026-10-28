"use client";

// To Publish page body: a top filter across Guides / Blogs / Calculators.
// Guides/Blogs/All show the publish queue (whose own kind chips are hidden here,
// since this filter drives it); Calculators shows the combined tool library.

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { PublishQueue } from "@/components/sections/content-pipeline/publish-queue";
import { CalculatorsTable } from "@/components/sections/content-pipeline/calculators-table";
import type { PublishQueueRow, ToolOverviewRow } from "@/lib/data/blog-clusters";

type View = "all" | "blog" | "guide" | "calculators";

export function ToPublishView({ rows, tools, toolsReady, siteDomain }: {
  rows: PublishQueueRow[];
  tools: ToolOverviewRow[];
  toolsReady: boolean;
  siteDomain: string | null;
}) {
  const [view, setView] = useState<View>("all");

  const blogRows = useMemo(() => rows.filter((r) => r.kind === "blog"), [rows]);
  const guideRows = useMemo(() => rows.filter((r) => r.kind === "guide"), [rows]);
  const shownRows = view === "blog" ? blogRows : view === "guide" ? guideRows : rows;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Seg active={view === "all"} onClick={() => setView("all")}>All ({rows.length})</Seg>
        <Seg active={view === "blog"} onClick={() => setView("blog")}>Blogs ({blogRows.length})</Seg>
        <Seg active={view === "guide"} onClick={() => setView("guide")}>Guides ({guideRows.length})</Seg>
        <Seg active={view === "calculators"} onClick={() => setView("calculators")}>Calculators ({tools.length})</Seg>
      </div>

      {view === "calculators" ? (
        toolsReady ? (
          <CalculatorsTable tools={tools} />
        ) : (
          <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
            This needs a one-time database update first. Apply the 20261028000001 migration in Supabase, then calculators show up here.
          </Card>
        )
      ) : (
        <PublishQueue rows={shownRows} siteDomain={siteDomain} hideChips />
      )}
    </div>
  );
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      className={cn(
        "cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "border-[#5B45E0]/40 bg-[#5B45E0]/10 text-[#5B45E0] dark:text-[#7B62FF]" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
