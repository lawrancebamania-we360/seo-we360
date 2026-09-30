"use client";

// Backlinks (Ticket 3): the website list. Each row links to the website's own
// detail page (a real navigation, not a drawer - same "card links to its own
// page" shape as Blog Clusters' list, not the "row opens a Sheet" shape used
// for individual posts inside a cluster, since a website's detail view is
// itself a full page here).

import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { BacklinkWebsiteSummary } from "@/lib/data/backlinks";

export function BacklinkWebsiteTable({ websites }: { websites: BacklinkWebsiteSummary[] }) {
  if (!websites.length) {
    return (
      <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
        No websites yet for this range. Paste in your submissions to get started.
      </Card>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="px-3 py-2.5 font-semibold">Website</th>
            <th className="px-3 py-2.5 font-semibold text-right">Submissions</th>
            <th className="px-3 py-2.5 font-semibold text-right">Last submission</th>
          </tr>
        </thead>
        <tbody>
          {websites.map((w) => (
            <tr key={w.id} className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30">
              <td className="px-3 py-2.5">
                <Link href={`/dashboard/backlinks/${w.id}`} className="font-medium text-foreground hover:underline">
                  {w.domain}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-[12.5px] tabular-nums text-foreground">
                {w.submissionCount.toLocaleString()}
              </td>
              <td className="px-3 py-2.5 text-right text-muted-foreground">
                {w.lastSubmissionDate ? (
                  w.lastSubmissionUrl ? (
                    <a
                      href={w.lastSubmissionUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="hover:underline hover:text-foreground"
                      title="Open this submission"
                    >
                      {w.lastSubmissionDate}
                    </a>
                  ) : (
                    w.lastSubmissionDate
                  )
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
