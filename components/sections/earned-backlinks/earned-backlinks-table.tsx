"use client";

// Earned Backlinks: flat sortable list - adapted from Backlink Submissions'
// BacklinkWebsiteTable, with the SAME direction-vs-null-sentinel fix applied
// from the start (see compareNullable's comment there for the bug that was
// fixed tonight: a null's sort-last guarantee must never be flipped by the
// direction multiplier meant only for real-value comparisons).
//
// When the exchange migration (20261029000001) is applied, rows gain a Type
// column and a chevron that expands to the full link-exchange record (anchor
// text/target + spam for the link we got, and the reciprocal link we gave).

import { Fragment, useMemo, useState } from "react";
import { ExternalLink, ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { toExternalUrl } from "@/lib/url";
import { EarnedBacklinkActions } from "@/components/sections/earned-backlinks/earned-backlink-actions";
import type { EarnedBacklinkRow } from "@/lib/data/earned-backlinks";
import type { Member } from "@/components/sections/assignee-picker";

type SortKey = "website" | "linkType" | "acquiredDate" | "domainRating" | "backlinkUrl" | "assigneeName";
type SortDir = "asc" | "desc";

type Col = { key: SortKey; label: string; align: "left" | "right"; defaultDir: SortDir };
const WEBSITE_COL: Col = { key: "website", label: "Website", align: "left", defaultDir: "asc" };
const TYPE_COL: Col = { key: "linkType", label: "Type", align: "left", defaultDir: "asc" };
const REST_COLS: Col[] = [
  { key: "acquiredDate", label: "Date", align: "right", defaultDir: "desc" },
  { key: "domainRating", label: "DR", align: "right", defaultDir: "desc" },
  { key: "backlinkUrl", label: "Link", align: "left", defaultDir: "asc" },
  { key: "assigneeName", label: "Assignee", align: "left", defaultDir: "asc" },
];

// Not sortable - rows mix USD and INR, so a numeric sort across currencies
// would silently misrank ("₹5,000" vs "$500" isn't a meaningful ordering
// without a conversion rate this app doesn't have).
const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", INR: "₹" };
function formatCost(b: Pick<EarnedBacklinkRow, "isFree" | "amountPaid" | "currency">): string {
  if (b.isFree) return "Free";
  if (b.amountPaid == null) return "—";
  return `${CURRENCY_SYMBOL[b.currency] ?? ""}${b.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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

function rowHasDetail(b: EarnedBacklinkRow): boolean {
  return !!(b.anchorText || b.anchorTarget || b.spamScore != null || b.contactEmail ||
    b.givenUrl || b.givenAnchorText || b.givenAnchorTarget || b.givenDomainRating != null || b.givenSpamScore != null || b.givenDate);
}

export function EarnedBacklinksTable({ websites, projectId, members, canManage, exchangeReady }: {
  websites: EarnedBacklinkRow[];
  projectId: string;
  members: Member[];
  canManage: boolean;
  exchangeReady: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("acquiredDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const toggleRow = (id: string) => setOpenRows((p) => ({ ...p, [id]: !p[id] }));

  const columns = useMemo<Col[]>(
    () => (exchangeReady ? [WEBSITE_COL, TYPE_COL, ...REST_COLS] : [WEBSITE_COL, ...REST_COLS]),
    [exchangeReady],
  );
  // chevron + data columns + Cost
  const totalCols = (exchangeReady ? 1 : 0) + columns.length + 1;

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
        case "linkType":
          primary = compareNullableStr(a.linkType, b.linkType, dir);
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

  const toggleSort = (col: Col) => {
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
    <div className="space-y-2">
      {!exchangeReady && (
        <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-[11.5px] text-muted-foreground">
          Apply migration <span className="font-mono">20261029000001</span> in Supabase to capture link-exchange details — type, spam score, anchor text/target, contact email, and the reciprocal link you gave back.
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              {exchangeReady && <th className="w-8 px-2 py-2.5" aria-hidden />}
              {columns.map((col) => (
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
            </tr>
          </thead>
          <tbody>
            {sorted.map((b) => {
              const canExpand = exchangeReady && rowHasDetail(b);
              const open = !!openRows[b.id];
              return (
                <Fragment key={b.id}>
                  <tr className="border-b border-border/60 transition-colors hover:bg-muted/30">
                    {exchangeReady && (
                      <td className="px-2 py-2.5 align-top">
                        {canExpand ? (
                          <button type="button" onClick={() => toggleRow(b.id)} aria-expanded={open}
                            title={open ? "Hide details" : "Show link-exchange details"}
                            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                          </button>
                        ) : <span className="inline-block size-3.5" />}
                      </td>
                    )}
                    <td className="max-w-[200px] truncate px-3 py-2.5 align-top font-medium text-foreground" title={b.website}>
                      {b.website}
                    </td>
                    {exchangeReady && (
                      <td className="px-3 py-2.5 align-top text-[12.5px] text-muted-foreground">{b.linkType || "—"}</td>
                    )}
                    <td className="px-3 py-2.5 text-right align-top text-muted-foreground">{b.acquiredDate}</td>
                    <td className="px-3 py-2.5 text-right align-top font-mono text-[12.5px] tabular-nums text-foreground">
                      {b.domainRating ?? "—"}
                    </td>
                    <td className="max-w-[260px] truncate px-3 py-2.5 align-top text-muted-foreground">
                      <a
                        href={toExternalUrl(b.backlinkUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 hover:underline hover:text-foreground"
                        title={b.backlinkUrl}
                      >
                        {b.backlinkUrl} <ExternalLink className="size-3 shrink-0" />
                      </a>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <EarnedBacklinkActions projectId={projectId} backlink={b} members={members} canManage={canManage} exchangeReady={exchangeReady} />
                    </td>
                    <td className={`px-3 py-2.5 text-right align-top font-mono text-[12.5px] tabular-nums ${b.isFree ? "text-success-strong font-semibold" : "text-muted-foreground"}`}>
                      {formatCost(b)}
                    </td>
                  </tr>
                  {canExpand && open && (
                    <tr className="border-b border-border/60 bg-muted/20">
                      <td colSpan={totalCols} className="px-3 pb-3.5 pt-0">
                        <RowDetail b={b} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowDetail({ b }: { b: EarnedBacklinkRow }) {
  const hasGiven = !!(b.givenUrl || b.givenAnchorText || b.givenAnchorTarget || b.givenDomainRating != null || b.givenSpamScore != null || b.givenDate);
  return (
    <div className="ml-6 grid gap-3 rounded-lg border border-border bg-background p-3.5 sm:grid-cols-2">
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Link we got</div>
        <Detail label="Anchor text" value={b.anchorText} />
        <Detail label="Anchor target" value={b.anchorTarget} link />
        <Detail label="Spam" value={b.spamScore == null ? null : `${b.spamScore}%`} />
        <Detail label="Email" value={b.contactEmail} />
      </div>
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Link we gave back</div>
        {hasGiven ? (
          <>
            <Detail label="Our page" value={b.givenUrl} link />
            <Detail label="Anchor text" value={b.givenAnchorText} />
            <Detail label="Anchor target" value={b.givenAnchorTarget} link />
            <Detail label="Their DR" value={b.givenDomainRating == null ? null : String(b.givenDomainRating)} />
            <Detail label="Their spam" value={b.givenSpamScore == null ? null : `${b.givenSpamScore}%`} />
            <Detail label="Date gave" value={b.givenDate} />
          </>
        ) : (
          <div className="text-[12.5px] text-muted-foreground/70">No reciprocal link (not an exchange).</div>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value, link }: { label: string; value: string | null; link?: boolean }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-2 text-[12.5px]">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      {value ? (
        link ? (
          <a href={toExternalUrl(value)} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 truncate text-foreground hover:underline" title={value}>
            <span className="truncate">{value}</span> <ExternalLink className="size-3 shrink-0" />
          </a>
        ) : (
          <span className="min-w-0 break-words text-foreground">{value}</span>
        )
      ) : (
        <span className="text-muted-foreground/60">—</span>
      )}
    </div>
  );
}
