"use client";

// Blog Clusters list: the cards, with each cluster's Blog/Guide type shown (and
// switchable in place for managers), plus a Blog/Guide filter. Guides live under
// a separate URL section, so the whole cluster carries the type and its posts
// inherit it.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Network } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ClusterKindBadge, ClusterKindSelect } from "@/components/sections/content-pipeline/item-controls";
import { CLUSTER_KIND_LABEL, CLUSTER_KINDS, type ClusterKind } from "@/lib/content-pipeline/content-type";
import type { BlogClusterSummary } from "@/lib/data/blog-clusters";

export function ClusterList({ clusters, projectId, canManage }: { clusters: BlogClusterSummary[]; projectId: string; canManage: boolean }) {
  const [filter, setFilter] = useState<ClusterKind | "all">("all");

  const present = useMemo(() => CLUSTER_KINDS.filter((k) => clusters.some((c) => c.kind === k)), [clusters]);
  const shown = filter === "all" ? clusters : clusters.filter((c) => c.kind === filter);

  if (clusters.length === 0) {
    return (
      <Card className="border-dashed p-12 text-center space-y-2">
        <Network className="size-8 text-muted-foreground mx-auto" />
        <div className="text-sm font-medium">No clusters yet</div>
        <div className="text-xs text-muted-foreground max-w-md mx-auto">
          {canManage ? "Paste in a cluster from your content-planning sheet to get started." : "Ask an owner or admin to add the first cluster."}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {present.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>All ({clusters.length})</Chip>
          {present.map((k) => (
            <Chip key={k} active={filter === k} onClick={() => setFilter(k)}>
              {CLUSTER_KIND_LABEL[k]}s ({clusters.filter((c) => c.kind === k).length})
            </Chip>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => (
          <Link key={c.id} href={`/dashboard/blog-clusters/${c.id}`}>
            <Card className="p-5 h-full transition-colors hover:border-primary/50 hover:bg-muted/30 cursor-pointer">
              <div className="flex items-start justify-between gap-2">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                  <Network className="size-4" />
                </div>
                <div className="flex items-center gap-1.5">
                  {canManage ? <ClusterKindSelect projectId={projectId} clusterId={c.id} kind={c.kind} /> : <ClusterKindBadge kind={c.kind} />}
                  {c.source === "import" && <Badge variant="outline" className="text-[10px]">Imported</Badge>}
                </div>
              </div>
              <h3 className="mt-3 font-heading text-[15px] font-bold text-foreground truncate">{c.clusterName}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {c.itemCount} post{c.itemCount === 1 ? "" : "s"} · {c.assignedCount} assigned
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground/70">
                Added {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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
