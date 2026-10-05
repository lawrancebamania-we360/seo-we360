"use client";

// Influencer Collabs: flat sortable list - same shape as Earned Backlinks'
// table, with the same direction-invariant null-handling (a null must always
// sort last regardless of asc/desc - the bug fixed in Backlink Submissions
// earlier tonight must not be reintroduced here). Default sort: Post Date
// descending, per explicit instruction.

import { useMemo, useState } from "react";
import { ExternalLink, ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { toExternalUrl } from "@/lib/url";
import { InfluencerCollabActions } from "@/components/sections/influencer-collabs/influencer-collab-actions";
import type { InfluencerCollabRow } from "@/lib/data/influencer-collabs";
import type { Member } from "@/components/sections/assignee-picker";

type SortKey = "influencerName" | "platform" | "closingDate" | "postDate" | "assigneeName";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; align: "left" | "right"; defaultDir: SortDir }[] = [
  { key: "influencerName", label: "Influencer", align: "left", defaultDir: "asc" },
  { key: "platform", label: "Platform", align: "left", defaultDir: "asc" },
  { key: "closingDate", label: "Closing date", align: "right", defaultDir: "desc" },
  { key: "postDate", label: "Post date", align: "right", defaultDir: "desc" },
  { key: "assigneeName", label: "Assignee", align: "left", defaultDir: "asc" },
];

// Not sortable - rows mix USD and INR, so a numeric sort across currencies
// would silently misrank (same reasoning as Earned Backlinks' Cost column).
const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", INR: "₹" };
function formatCost(c: Pick<InfluencerCollabRow, "isFree" | "amountPaid" | "currency">): string {
  if (c.isFree) return "Free";
  if (c.amountPaid == null) return "—";
  return `${CURRENCY_SYMBOL[c.currency] ?? ""}${c.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Nulls always sort last, regardless of direction - `dir` only flips the
// ordering between two real values.
function compareNullableStr(a: string | null, b: string | null, dir: number): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a.localeCompare(b) * dir;
}
export function InfluencerCollabsTable({ collabs, projectId, members, canManage }: {
  collabs: InfluencerCollabRow[];
  projectId: string;
  members: Member[];
  canManage: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("postDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const copy = [...collabs];
    const dir = sortDir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      let primary: number;
      switch (sortKey) {
        case "platform":
          primary = a.platform.localeCompare(b.platform) * dir;
          break;
        case "closingDate":
          primary = compareNullableStr(a.closingDate, b.closingDate, dir);
          break;
        case "assigneeName":
          primary = compareNullableStr(a.assigneeName, b.assigneeName, dir);
          break;
        case "influencerName":
          primary = a.influencerName.localeCompare(b.influencerName) * dir;
          break;
        default:
          primary = a.postDate.localeCompare(b.postDate) * dir;
      }
      if (primary !== 0) return primary;
      return a.postDate.localeCompare(b.postDate) || a.influencerName.localeCompare(b.influencerName);
    });
    return copy;
  }, [collabs, sortKey, sortDir]);

  const toggleSort = (col: (typeof COLUMNS)[number]) => {
    if (sortKey === col.key) { setSortDir((d) => (d === "asc" ? "desc" : "asc")); return; }
    setSortKey(col.key);
    setSortDir(col.defaultDir);
  };

  if (!collabs.length) {
    return (
      <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
        No influencer collabs logged yet for this range. Add one, or paste a batch, to get started.
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
            <th className="px-3 py-2.5 text-right font-semibold">Cost</th>
            <th className="px-3 py-2.5 text-left font-semibold">Links</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.id} className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30">
              <td className="max-w-[180px] truncate px-3 py-2.5 font-medium text-foreground" title={c.influencerName}>
                {c.influencerName}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">{c.platform}</td>
              <td className="px-3 py-2.5 text-right text-muted-foreground">{c.closingDate ?? "—"}</td>
              <td className="px-3 py-2.5 text-right text-muted-foreground">{c.postDate}</td>
              <td className="px-3 py-2.5">
                <InfluencerCollabActions projectId={projectId} collabId={c.id} assignedTo={c.assignedTo} members={members} canManage={canManage} />
              </td>
              <td className={`px-3 py-2.5 text-right font-mono text-[12.5px] tabular-nums ${c.isFree ? "text-success-strong font-semibold" : "text-foreground"}`}>
                {formatCost(c)}
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <a href={toExternalUrl(c.profileLink)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline hover:text-foreground" title="Open profile">
                    Profile <ExternalLink className="size-3" />
                  </a>
                  {c.postLink && (
                    <a href={toExternalUrl(c.postLink)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline hover:text-foreground" title="Open post">
                      Post <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
