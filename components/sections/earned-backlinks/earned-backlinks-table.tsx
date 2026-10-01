"use client";

// Earned Backlinks: flat sortable list - adapted from Backlink Submissions'
// BacklinkWebsiteTable, with the SAME direction-vs-null-sentinel fix applied
// from the start (see compareNullable's comment there for the bug that was
// fixed tonight: a null's sort-last guarantee must never be flipped by the
// direction multiplier meant only for real-value comparisons).

import { useMemo, useState } from "react";
import { ExternalLink, ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EarnedBacklinkActions } from "@/components/sections/earned-backlinks/earned-backlink-actions";
import type { EarnedBacklinkRow } from "@/lib/data/earned-backlinks";
import type { Member } from "@/components/sections/assignee-picker";

type SortKey = "website" | "acquiredDate" | "domainRating" | "backlinkUrl" | "assigneeName";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; align: "left" | "right"; defaultDir: SortDir }[] = [
  { key: "website", label: "Website", align: "left", defaultDir: "asc" },
  { key: "acquiredDate", label: "Date", align: "right", defaultDir: "desc" },
  { key: "domainRating", label: "DR", align: "right", defaultDir: "desc" },
  { key: "backlinkUrl", label: "Link", align: "left", defaultDir: "asc" },
  { key: "assigneeName", label: "Assignee", align: "left", defaultDir: "asc" },
];

// Nulls always sort last, regardless of direction - `dir` only flips the
// ordering between two real values.
function compareNullableStr(a: string | null, b: string | null, dir: number): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a.localeCompare(b) * dir;
}
function compareNullableNum(a: number | null, b: number | null, dir: number): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * dir;
}

export function EarnedBacklinksTable({ websites, projectId, members, canManage }: {
  websites: EarnedBacklinkRow[];
  projectId: string;
  members: Member[];
  canManage: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("acquiredDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const copy = [...websites];
    const dir = sortDir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      let primary: number;
      switch (sortKey) {
        case "domainRating":
          primary = compareNullableNum(a.domainRating, b.domainRating, dir);
          break;
        case "backlinkUrl":
          primary = a.backlinkUrl.localeCompare(b.backlinkUrl) * dir;
          break;
        case "assigneeName":
          primary = compareNullableStr(a.assigneeName, b.assigneeName, dir);
          break;
        case "website":
          primary = a.website.localeCompare(b.website) * dir;
          break;
        default:
          primary = a.acquiredDate.localeCompare(b.acquiredDate) * dir;
      }
      if (primary !== 0) return primary;
      return a.website.localeCompare(b.website);
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
        No backlinks logged yet for this range. Add one, or paste a batch, to get started.
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
          {sorted.map((b) => (
            <tr key={b.id} className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30">
              <td className="max-w-[200px] truncate px-3 py-2.5 font-medium text-foreground" title={b.website}>
                {b.website}
              </td>
              <td className="px-3 py-2.5 text-right text-muted-foreground">{b.acquiredDate}</td>
              <td className="px-3 py-2.5 text-right font-mono text-[12.5px] tabular-nums text-foreground">
                {b.domainRating ?? "—"}
              </td>
              <td className="max-w-[260px] truncate px-3 py-2.5 text-muted-foreground">
                <a
                  href={b.backlinkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:underline hover:text-foreground"
                  title={b.backlinkUrl}
                >
                  {b.backlinkUrl} <ExternalLink className="size-3 shrink-0" />
                </a>
              </td>
              <td className="px-3 py-2.5">
                <EarnedBacklinkActions projectId={projectId} backlinkId={b.id} assignedTo={b.assignedTo} members={members} canManage={canManage} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
