"use client";

// Backlinks (Ticket 3): the website list. Each row links to the website's own
// detail page (a real navigation, not a drawer - same "card links to its own
// page" shape as Blog Clusters' list, not the "row opens a Sheet" shape used
// for individual posts inside a cluster, since a website's detail view is
// itself a full page here).
//
// Ticket 19: every column is sortable client-side (the full list is already
// on the page - no server round-trip needed to re-order it). The list arrives
// pre-sorted from getBacklinkWebsites (Ticket 20's default: most recent
// activity first, alphabetical tie-break) - that's just the initial sort
// state here, not a separate behavior.

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { toExternalUrl } from "@/lib/url";
import { RemoveWebsiteButton } from "@/components/sections/backlinks/website-removal";
import type { BacklinkWebsiteSummary } from "@/lib/data/backlinks";

type SortKey = "domain" | "submissionCount" | "lastSubmissionTopic" | "lastSubmissionDate" | "lastSubmissionUrl" | "lastSubmissionAssigneeName";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; align: "left" | "right"; defaultDir: SortDir }[] = [
  { key: "domain", label: "Website", align: "left", defaultDir: "asc" },
  { key: "submissionCount", label: "Submissions", align: "right", defaultDir: "desc" },
  { key: "lastSubmissionTopic", label: "Topic", align: "left", defaultDir: "asc" },
  { key: "lastSubmissionAssigneeName", label: "Assignee", align: "left", defaultDir: "asc" },
  { key: "lastSubmissionDate", label: "Last submission", align: "right", defaultDir: "desc" },
  { key: "lastSubmissionUrl", label: "Submission link", align: "right", defaultDir: "asc" },
];

// `dir` only flips the ordering between two REAL values - a null is always
// last, full stop. Bug fixed here: the previous version returned the null
// sentinel (+1/-1) as part of the same number the caller then multiplied by
// `dir`, so with the default sortDir="desc" (dir=-1) every null-date row got
// flipped to the FRONT instead of staying last - exactly the "no-submission
// rows on top, today's submission at the bottom" report.
function compareNullable(a: string | null, b: string | null, dir: number): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a.localeCompare(b) * dir;
}

export function BacklinkWebsiteTable({ websites, projectId, canManage }: {
  websites: BacklinkWebsiteSummary[];
  projectId: string;
  canManage: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("lastSubmissionDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const copy = [...websites];
    const dir = sortDir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      let primary: number;
      switch (sortKey) {
        case "submissionCount":
          primary = (a.submissionCount - b.submissionCount) * dir;
          break;
        case "domain":
          primary = a.domain.localeCompare(b.domain) * dir;
          break;
        case "lastSubmissionTopic":
          primary = compareNullable(a.lastSubmissionTopic, b.lastSubmissionTopic, dir);
          break;
        case "lastSubmissionUrl":
          primary = compareNullable(a.lastSubmissionUrl, b.lastSubmissionUrl, dir);
          break;
        case "lastSubmissionAssigneeName":
          primary = compareNullable(a.lastSubmissionAssigneeName, b.lastSubmissionAssigneeName, dir);
          break;
        default:
          primary = compareNullable(a.lastSubmissionDate, b.lastSubmissionDate, dir);
      }
      // Direction only flips the primary key - the alphabetical tiebreak
      // stays A-first regardless, per spec ("same date -> a first, z last").
      if (primary !== 0) return primary;
      return a.domain.localeCompare(b.domain);
    });
    return copy;
  }, [websites, sortKey, sortDir]);

  const toggleSort = (col: (typeof COLUMNS)[number]) => {
    if (sortKey === col.key) { setSortDir((d) => (d === "asc" ? "desc" : "asc")); return; }
    setSortKey(col.key);
    setSortDir(col.defaultDir);
  };

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
            {COLUMNS.map((col) => (
              <th key={col.key} className={`px-3 py-2.5 font-semibold ${col.align === "right" ? "text-right" : "text-left"}`}>
                <button
                  type="button"
                  onClick={() => toggleSort(col)}
                  className={`inline-flex items-center gap-1 hover:text-foreground ${col.align === "right" ? "flex-row-reverse" : ""}`}
                >
                  {col.label}
                  {sortKey === col.key ? (
                    sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                  ) : (
                    <ArrowUpDown className="size-3 opacity-40" />
                  )}
                </button>
              </th>
            ))}
            {canManage && <th className="w-10 px-2 py-2.5"><span className="sr-only">Remove</span></th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((w) => (
            <tr key={w.id} className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30">
              <td className="px-3 py-2.5">
                <Link href={`/dashboard/backlinks/${w.id}`} className="font-medium text-foreground hover:underline">
                  {w.domain}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-right font-mono text-[12.5px] tabular-nums text-foreground">
                {w.submissionCount.toLocaleString()}
              </td>
              <td className="max-w-[220px] truncate px-3 py-2.5 text-muted-foreground" title={w.lastSubmissionTopic ?? undefined}>
                {w.lastSubmissionTopic ?? "—"}
              </td>
              <td className="max-w-[160px] truncate px-3 py-2.5 text-muted-foreground" title={w.lastSubmissionAssigneeName ?? undefined}>
                {w.lastSubmissionAssigneeName ?? "—"}
              </td>
              <td className="px-3 py-2.5 text-right text-muted-foreground">
                {w.lastSubmissionDate ?? "—"}
              </td>
              <td className="max-w-[220px] truncate px-3 py-2.5 text-right text-muted-foreground">
                {w.lastSubmissionUrl ? (
                  <a
                    href={toExternalUrl(w.lastSubmissionUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="hover:underline hover:text-foreground"
                    title={w.lastSubmissionUrl}
                  >
                    {w.lastSubmissionUrl}
                  </a>
                ) : (
                  "—"
                )}
              </td>
              {canManage && (
                <td className="px-2 py-2.5 text-right">
                  <RemoveWebsiteButton projectId={projectId} websiteId={w.id} domain={w.domain} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
