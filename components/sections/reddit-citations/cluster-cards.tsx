"use client";

// Reddit Citations: the month cards. Each links to its detail and shows how many
// citations it has, how many Leena has published, and who contributed. Admins
// get a quiet remove action.

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquareQuote, CheckCircle2, FileText, Loader2, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { deleteRedditCluster } from "@/lib/actions/reddit-citations";
import type { RedditClusterCard } from "@/lib/data/reddit-citations";

export function ClusterCards({ clusters, canManage }: { clusters: RedditClusterCard[]; canManage: boolean }) {
  if (!clusters.length) {
    return (
      <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
        No months yet. {canManage ? "Add one with “New month”." : "An admin adds the first month."}
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {clusters.map((c) => <MonthCard key={c.id} c={c} canManage={canManage} />)}
    </div>
  );
}

function MonthCard({ c, canManage }: { c: RedditClusterCard; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const remove = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (busy || !confirm(`Remove ${c.label}? Its citations are removed from the list.`)) return;
    setBusy(true);
    try {
      const r = await deleteRedditCluster({ cluster_id: c.id });
      if (!r.ok) { toast.error(r.error ?? "Could not remove that month."); return; }
      toast.success("Month removed.");
      router.refresh();
    } finally { setBusy(false); }
  };

  return (
    <Link href={`/dashboard/reddit-citations/${c.id}`} className="group">
      <Card className="relative h-full p-4 transition-colors hover:border-[#7B62FF]/40 hover:bg-muted/20">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageSquareQuote className="size-4 text-[#7B62FF]" />
            <span className="text-base font-semibold text-foreground">{c.label}</span>
          </div>
          {canManage && (
            <button type="button" onClick={remove} disabled={busy} title="Remove month"
              className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-error-600 group-hover:opacity-100">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            </button>
          )}
        </div>

        <div className="mt-3 flex items-center gap-4 text-[13px]">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <MessageSquareQuote className="size-3.5" /> {c.citationCount} citation{c.citationCount === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-1 text-success-700 dark:text-success-400">
            <CheckCircle2 className="size-3.5" /> {c.publishedCount} published
          </span>
        </div>

        {c.hasKeywordPlan && (
          <div className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
            <FileText className="size-3" /> Keyword plan set
          </div>
        )}

        {c.ownerNames.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {c.ownerNames.map((n) => (
              <span key={n} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{n}</span>
            ))}
          </div>
        )}
      </Card>
    </Link>
  );
}
