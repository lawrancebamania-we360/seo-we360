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
import { MultiCombobox } from "@/components/ui/multi-combobox";
import { toExternalUrl } from "@/lib/url";
import { BacklinkDateFilter } from "@/components/sections/backlinks/backlink-date-filter";
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
  // A $0 typed into the amount means the same thing as ticking Free.
  if (b.isFree || b.amountPaid === 0) return "Free";
  if (b.amountPaid == null) return "—";
  return `${CURRENCY_SYMBOL[b.currency] ?? ""}${b.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Cost filter. Paid amounts mix USD + INR, so dollar buckets are evaluated on a
// USD-equivalent (INR converted at the same fixed rate the Executive dashboard
// uses) so "$50-150" means the same thing across both currencies.
type CostBucket = "free" | "paid" | "0-50" | "50-150" | "150+";
const COST_BUCKETS: { key: CostBucket; label: string }[] = [
  { key: "free", label: "Free" },
  { key: "paid", label: "Paid" },
  { key: "0-50", label: "$1–50" },
  { key: "50-150", label: "$50–150" },
  { key: "150+", label: "$150+" },
];
const USD_PER_INR = 0.012;
function usdAmount(b: EarnedBacklinkRow): number | null {
  if (b.amountPaid == null) return null;
  return b.currency === "INR" ? b.amountPaid * USD_PER_INR : b.amountPaid;
}
// A link with no positive amount counts as Free — either it's ticked Free, or a
// $0 / blank was typed into the amount instead of ticking Free. This keeps the
// invariant Free + Paid = every row (the gap people saw was $0 rows that were
// neither flagged Free nor had a positive amount).
function isEffectivelyFree(b: EarnedBacklinkRow): boolean {
  if (b.isFree) return true;
  const usd = usdAmount(b);
  return usd == null || usd <= 0;
}
function matchesCost(b: EarnedBacklinkRow, bucket: CostBucket): boolean {
  if (bucket === "free") return isEffectivelyFree(b);
  if (bucket === "paid") return !isEffectivelyFree(b);
  if (isEffectivelyFree(b)) return false;
  const usd = usdAmount(b) as number; // paid ⇒ non-null and > 0
  if (bucket === "0-50") return usd <= 50;
  if (bucket === "50-150") return usd > 50 && usd <= 150;
  return usd > 150; // "150+"
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
    b.givenUrl || b.givenAnchorText || b.givenAnchorTarget || b.givenDate || b.traffic);
}

function formatTraffic(b: EarnedBacklinkRow): string {
  return b.traffic ? b.traffic.sessions.toLocaleString() : "—";
}

export function EarnedBacklinksTable({ websites, projectId, members, canManage, exchangeReady, traffic, range, start, end }: {
  websites: EarnedBacklinkRow[];
  projectId: string;
  members: Member[];
  canManage: boolean;
  exchangeReady: boolean;
  // GA4 connection status for the Traffic column; null/undefined = status unknown.
  traffic?: { connected: boolean; reason?: string };
  // Date-range filter state (URL params), rendered alongside the cost/assignee
  // dropdowns so all three filters sit together on the left.
  range: string;
  start: string;
  end: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("acquiredDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  // Multi-select; empty = no filter (show all).
  const [costFilter, setCostFilter] = useState<CostBucket[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
  const toggleRow = (id: string) => setOpenRows((p) => ({ ...p, [id]: !p[id] }));

  // Assignees that actually have a backlink, for the assignee dropdown.
  const assigneeOptions = useMemo(() => {
    const ids = new Set(websites.map((b) => b.assignedTo).filter(Boolean) as string[]);
    return members.filter((m) => ids.has(m.id)).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [websites, members]);
  const hasUnassigned = useMemo(() => websites.some((b) => !b.assignedTo), [websites]);
  const costCounts = useMemo(() => {
    const out = {} as Record<CostBucket, number>;
    for (const { key } of COST_BUCKETS) out[key] = websites.filter((b) => matchesCost(b, key)).length;
    return out;
  }, [websites]);

  const columns = useMemo<Col[]>(
    () => (exchangeReady ? [WEBSITE_COL, TYPE_COL, ...REST_COLS] : [WEBSITE_COL, ...REST_COLS]),
    [exchangeReady],
  );
  // chevron + data columns + Cost + Traffic
  const totalCols = (exchangeReady ? 1 : 0) + columns.length + 2;

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

  const visible = useMemo(
    () =>
      sorted.filter((b) => {
        const costOk = costFilter.length === 0 || costFilter.some((bucket) => matchesCost(b, bucket));
        const assigneeOk =
          assigneeFilter.length === 0 ||
          assigneeFilter.some((a) => (a === "__none__" ? !b.assignedTo : b.assignedTo === a));
        return costOk && assigneeOk;
      }),
    [sorted, costFilter, assigneeFilter],
  );

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
      {traffic && !traffic.connected && (
        <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-[11.5px] text-muted-foreground">
          Traffic column unavailable — {traffic.reason ?? "GA4 not connected."} Each backlink&apos;s we360.ai target needs <span className="font-mono">utm_source</span>/<span className="font-mono">utm_campaign</span>/<span className="font-mono">utm_content</span> for referral traffic to show here.
        </p>
      )}
      {/* All three filters grouped on the left as labeled dropdowns. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <BacklinkDateFilter range={range} start={start} end={end} label="Date" />
        <LabeledFilter label="Cost">
          <MultiCombobox
            items={COST_BUCKETS.map((b) => ({ value: b.key, label: `${b.label} (${costCounts[b.key]})` }))}
            value={costFilter}
            onValueChange={(v) => setCostFilter(v as CostBucket[])}
            placeholder={`All (${websites.length})`}
            ariaLabel="Filter by cost"
            className="h-8 w-fit min-w-[7rem]"
          />
        </LabeledFilter>
        <LabeledFilter label="Assignee">
          <MultiCombobox
            items={[
              ...assigneeOptions.map((m) => ({ value: m.id, label: m.name ?? "Unnamed" })),
              ...(hasUnassigned ? [{ value: "__none__", label: "Unassigned" }] : []),
            ]}
            value={assigneeFilter}
            onValueChange={setAssigneeFilter}
            placeholder="All assignees"
            ariaLabel="Filter by assignee"
            className="h-8 w-fit min-w-[9rem]"
          />
        </LabeledFilter>
      </div>

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
              <th className="px-3 py-2.5 text-right font-semibold" title="Referral sessions GA4 attributes to this link's UTM-tagged we360.ai target">Traffic</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={totalCols} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No backlinks match these filters.
                </td>
              </tr>
            )}
            {visible.map((b) => {
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
                    <td className={`px-3 py-2.5 text-right align-top font-mono text-[12.5px] tabular-nums ${isEffectivelyFree(b) ? "text-success-strong font-semibold" : "text-muted-foreground"}`}>
                      {formatCost(b)}
                    </td>
                    <td
                      className="px-3 py-2.5 text-right align-top font-mono text-[12.5px] tabular-nums text-muted-foreground"
                      title={b.traffic ? `${b.traffic.sessions.toLocaleString()} sessions · ${b.traffic.users.toLocaleString()} users` : undefined}
                    >
                      {formatTraffic(b)}
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
  const hasGiven = !!(b.givenUrl || b.givenAnchorText || b.givenAnchorTarget || b.givenDate);
  return (
    <div className="ml-6 grid gap-3 rounded-lg border border-border bg-background p-3.5 sm:grid-cols-2">
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Link we got</div>
        <Detail label="Live URL" value={b.backlinkUrl} link wrap />
        <Detail label="Anchor text" value={b.anchorText} />
        <Detail label="Anchor target" value={b.anchorTarget} link />
        <Detail label="Spam" value={b.spamScore == null ? null : `${b.spamScore}%`} />
        <Detail label="Email" value={b.contactEmail} />
        <Detail
          label="Traffic"
          value={b.traffic ? `${b.traffic.sessions.toLocaleString()} sessions · ${b.traffic.users.toLocaleString()} users` : null}
        />
      </div>
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Link we gave back</div>
        {hasGiven ? (
          <>
            <Detail label="Our page" value={b.givenUrl} link />
            <Detail label="Anchor text" value={b.givenAnchorText} />
            <Detail label="Anchor target" value={b.givenAnchorTarget} link />
            {/* Their DR / spam describe the partner site — reuse the DR entered
                on the row and the single spam value, instead of asking for them
                a second time in the exchange form. */}
            <Detail label="Their DR" value={b.domainRating == null ? null : String(b.domainRating)} />
            <Detail label="Their spam" value={b.spamScore == null ? null : `${b.spamScore}%`} />
            <Detail label="Date gave" value={b.givenDate} />
          </>
        ) : (
          <div className="text-[12.5px] text-muted-foreground/70">No reciprocal link (not an exchange).</div>
        )}
      </div>
    </div>
  );
}

// A filter control with its label to the left, matching the date filter's style.
function LabeledFilter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Detail({ label, value, link, wrap }: { label: string; value: string | null; link?: boolean; wrap?: boolean }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-2 text-[12.5px]">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      {value ? (
        link ? (
          <a href={toExternalUrl(value)} target="_blank" rel="noopener noreferrer" className={`inline-flex min-w-0 items-start gap-1 text-foreground hover:underline ${wrap ? "break-all" : "truncate"}`} title={value}>
            <span className={wrap ? "break-all" : "truncate"}>{value}</span> <ExternalLink className="mt-0.5 size-3 shrink-0" />
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
