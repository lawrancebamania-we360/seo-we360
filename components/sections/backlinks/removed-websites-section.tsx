"use client";

// Backlinks: the websites taken off the list. Collapsed by default so it stays
// out of the way, but always reachable so a removal is never a one-way door.

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatDay } from "@/lib/format-datetime";
import { RestoreWebsiteButton } from "@/components/sections/backlinks/website-removal";
import type { RemovedBacklinkWebsite } from "@/lib/data/backlinks";

export function RemovedWebsitesSection({
  projectId, websites, canManage,
}: {
  projectId: string;
  websites: RemovedBacklinkWebsite[];
  canManage: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!websites.length) return null;

  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        Removed websites ({websites.length})
      </button>
      {open && (
        <ul className="divide-y divide-border/60 border-t border-border">
          {websites.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <Link href={`/dashboard/backlinks/${w.id}`} className="font-medium text-foreground hover:underline">
                  {w.domain}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {w.submissionCount.toLocaleString()} submission{w.submissionCount === 1 ? "" : "s"} kept. Removed {formatDay(w.removedAt)}.
                </p>
              </div>
              {canManage && <RestoreWebsiteButton projectId={projectId} websiteId={w.id} domain={w.domain} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
