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
import type { BacklinkWebsiteSummary } from "@/lib/data/backlinks";

type SortKey = "domain" | "submissionCount" | "lastSubmissionTopic" | "lastSubmissionDate" | "lastSubmissionUrl";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; align: "left" | "right"; defaultDir: SortDir }[] = [
  { key: "domain", label: "Website", align: "left", defaultDir: "asc" },
  { key: "submissionCount", label: "Submissions", align: "right", defaultDir: "desc" },
  { key: "lastSubmissionTopic", label: "Topic", align: "left", defaultDir: "asc" },
  { key: "lastSubmissionDate", label: "Last submission", align: "right", defaultDir: "desc" },
  { key: "lastSubmissionUrl", label: "Submission link", align: "right", defaultDir: "asc" },
];

function compareNullable(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a == null) return 1; // nulls always sort last regardless of direction
  if (b == null) return -1;
  return a.localeCompare(b);
}

export function BacklinkWebsiteTable({ websites }: { websites: BacklinkWebsiteSummary[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("lastSubmissionDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const copy = [...websites];
    const dir = sortDir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      let primary: number;
      switch (sortKey) {
        case "submissionCount":
          primary = a.submissionCount - b.submissionCount;
          break;
        case "domain":
          primary = a.domain.localeCompare(b.domain);
          break;
        case "lastSubmissionTopic":
          primary = compareNullable(a.lastSubmissionTopic, b.lastSubmissionTopic);
          break;
        case "lastSubmissionUrl":
          primary = compareNullable(a.lastSubmissionUrl, b.lastSubmissionUrl);
          break;
        default:
          primary = compareNullable(a.lastSubmissionDate, b.lastSubmissionDate);
      }
      // Direction only flips the primary key - the alphabetical tiebreak
      // stays A-first regardless, per spec ("same date -> a first, z last").
      if (primary !== 0) return primary * dir;
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
              <td className="px-3 py-2.5 text-right text-muted-foreground">
                {w.lastSubmissionDate ?? "—"}
              </td>
              <td className="max-w-[220px] truncate px-3 py-2.5 text-right text-muted-foreground">
                {w.lastSubmissionUrl ? (
                  <a
                    href={w.lastSubmissionUrl}
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
