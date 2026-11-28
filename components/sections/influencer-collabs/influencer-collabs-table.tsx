"use client";

// Influencer Collabs: the collab list. One compact row per collab - who
// (influencer + platform), when it went live, who owns it, what it cost, how
// the post is doing and what it drove - and an expandable detail panel for the
// rest: closing date, profile / post links, the we360.ai links found in the
// post, and how each visits / demos / deals number was counted. Edit and
// Delete sit right-most.
//
// Sorting keeps the direction-invariant null handling (a null always sorts
// last regardless of asc/desc - the bug fixed in Backlink Submissions must not
// be reintroduced here). Default sort: Post date descending, per explicit
// instruction. Fixed column widths, so nothing shifts when the GA4 numbers
// stream in.

import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ExternalLink, ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, ThumbsUp, MessageCircle, Repeat2, AlertTriangle, RefreshCw, Loader2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkline } from "@/components/ui/sparkline";
import { SearchBox, matchesQuery } from "@/components/ui/search-box";
import { toExternalUrl } from "@/lib/url";
import { refreshInfluencerPosts } from "@/lib/actions/influencer-collabs";
import { PostTrackingDialog, METRIC_DAYS } from "@/components/sections/influencer-collabs/post-tracking-dialog";
import { EditInfluencerCollabDialog } from "@/components/sections/influencer-collabs/edit-influencer-collab-dialog";
import { CollabAssignee, CollabRowActions } from "@/components/sections/influencer-collabs/influencer-collab-actions";
import type { InfluencerCollabRow } from "@/lib/data/influencer-collabs";
import type { InfluencerAttribution } from "@/lib/data/influencer-attribution";
import type { PostAttribution } from "@/lib/influencer/attribution";
import type { Member } from "@/components/sections/assignee-picker";

type SortKey = "influencerName" | "postDate" | "assigneeName";
type SortDir = "asc" | "desc";
const DEFAULT_DIR: Record<SortKey, SortDir> = { influencerName: "asc", postDate: "desc", assigneeName: "asc" };

// ---------------------------------------------------------------------------
// Formatting - fixed locales (not the viewer's), so the server render and the
// browser always produce the same text.
// ---------------------------------------------------------------------------

const COUNT = new Intl.NumberFormat("en-US");
const num = (v: number) => COUNT.format(v);
const DAY_SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const DAY_FULL = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
// Date-only values are read as UTC so no viewer's time zone shifts them a day.
const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** "Nov 18, 2026" */
function fullDay(iso: string): string {
  const d = asDate(iso);
  return Number.isNaN(d.getTime()) ? iso : DAY_FULL.format(d);
}
/** "Nov 18" this year, "Nov 18, 2025" otherwise. */
function shortDay(iso: string): string {
  const d = asDate(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.getUTCFullYear() === new Date().getUTCFullYear() ? DAY_SHORT.format(d) : DAY_FULL.format(d);
}
const dayOf = (postDate: string, date: string) => Math.round((asDate(date).getTime() - asDate(postDate).getTime()) / 86_400_000);
const todayUtc = () => new Date().toISOString().slice(0, 10);

// Not sortable - rows mix USD and INR, so a numeric sort across currencies
// would silently misrank (same reasoning as Earned Backlinks' Cost column).
const CURRENCY_SYMBOL: Record<string, string> = { USD: "$", INR: "₹" };
function formatCost(c: Pick<InfluencerCollabRow, "isFree" | "amountPaid" | "currency">): string {
  if (c.isFree) return "Free";
  if (c.amountPaid == null) return "—";
  const digits = Number.isInteger(c.amountPaid) ? 0 : 2;
  const locale = c.currency === "INR" ? "en-IN" : "en-US";
  return `${CURRENCY_SYMBOL[c.currency] ?? ""}${c.amountPaid.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

// Nulls always sort last, regardless of direction - `dir` only flips the
// ordering between two real values.
function compareNullableStr(a: string | null, b: string | null, dir: number): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a.localeCompare(b) * dir;
}

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B45E0]/60";
const ACCENT = "shadow-[inset_2px_0_0_#5B45E0] dark:shadow-[inset_2px_0_0_#7B62FF]";
const TH_NUM = "whitespace-nowrap px-3 py-2 text-right font-medium";

export function InfluencerCollabsTable({ collabs, projectId, members, canManage, attribution = null }: {
  collabs: InfluencerCollabRow[];
  projectId: string;
  members: Member[];
  canManage: boolean;
  /** GA4 visits / demos per post; null while it streams in. */
  attribution?: InfluencerAttribution | null;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("postDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [tracking, setTracking] = useState<InfluencerCollabRow | null>(null);
  const [editing, setEditing] = useState<InfluencerCollabRow | null>(null);

  const sorted = useMemo(() => {
    const copy = [...collabs];
    const dir = sortDir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      let primary: number;
      switch (sortKey) {
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
      // Ties: newest post first, then by name.
      return b.postDate.localeCompare(a.postDate) || a.influencerName.localeCompare(b.influencerName);
    });
    return copy;
  }, [collabs, sortKey, sortDir]);

  const sortBy = (key: SortKey) => {
    if (sortKey === key) { setSortDir((d) => (d === "asc" ? "desc" : "asc")); return; }
    setSortKey(key);
    setSortDir(DEFAULT_DIR[key]);
  };

  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Dialogs read the latest row after a refresh.
  const fresh = (row: InfluencerCollabRow) => collabs.find((x) => x.id === row.id) ?? row;

  const shown = sorted.filter((c) => matchesQuery(q, c.influencerName, c.platform, c.assigneeName));
  const columnCount = canManage ? 10 : 9;

  if (!collabs.length) {
    return (
      <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
        No influencer collabs logged yet for this range. Add one, or paste a batch, to get started.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <InfluencerTotal attribution={attribution} />
        <RefreshButton projectId={projectId} />
        <SearchBox value={q} onChange={setQ} placeholder="Search influencers, platform..." className="w-full sm:w-72" />
      </div>
      {shown.length === 0 ? (
        <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
          No collabs match &ldquo;{q}&rdquo;.
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className={cn("w-full table-fixed text-[13px]", canManage ? "min-w-[1100px]" : "min-w-[1024px]")}>
            <colgroup>
              <col className="w-9" />
              <col />
              <col className="w-[112px]" />
              <col className="w-[164px]" />
              <col className="w-[104px]" />
              <col className="w-[168px]" />
              <col className="w-[124px]" />
              <col className="w-[92px]" />
              <col className="w-[92px]" />
              {canManage && <col className="w-[76px]" />}
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="py-2"><span className="sr-only">Details</span></th>
                <SortHeader label="Influencer" k="influencerName" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} />
                <SortHeader label="Post date" k="postDate" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} />
                <SortHeader label="Assignee" k="assigneeName" sortKey={sortKey} sortDir={sortDir} onSort={sortBy} />
                <th scope="col" className={TH_NUM}>Cost</th>
                <th scope="col" className={TH_NUM}>Engagement</th>
                <th scope="col" className={TH_NUM} title="Website visits in the first 30 days after the post">Visits<ThirtyDays /></th>
                <th scope="col" className={TH_NUM} title="Demo bookings in the first 30 days after the post">Demos<ThirtyDays /></th>
                <th scope="col" className={TH_NUM} title="HubSpot deals created within 15 minutes of those demo bookings">Deals<ThirtyDays /></th>
                {canManage && <th scope="col" className="py-2 pl-1 pr-3"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody className="[&>tr:last-child]:border-b-0">
              {shown.map((c) => (
                <CollabRow
                  key={c.id}
                  c={c}
                  projectId={projectId}
                  members={members}
                  canManage={canManage}
                  attribution={attribution}
                  columnCount={columnCount}
                  open={expanded.has(c.id)}
                  onToggle={() => toggle(c.id)}
                  onTrack={() => setTracking(c)}
                  onEdit={() => setEditing(c)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tracking && (
        <PostTrackingDialog collab={fresh(tracking)} projectId={projectId} onClose={() => setTracking(null)} />
      )}
      {editing && (
        <EditInfluencerCollabDialog collab={fresh(editing)} projectId={projectId} members={members} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function ThirtyDays() {
  return <span className="ml-1 normal-case tracking-normal opacity-60">30d</span>;
}

function SortHeader({ label, k, sortKey, sortDir, onSort }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th scope="col" aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined} className="px-3 py-2 text-left font-medium">
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn("group/sort -mx-1 inline-flex items-center gap-1 whitespace-nowrap rounded px-1 uppercase tracking-wider transition-colors hover:text-foreground", FOCUS, active && "text-foreground")}
      >
        {label}
        {active ? (
          sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
        ) : (
          <ArrowUpDown className="size-3 opacity-0 transition-opacity group-hover/sort:opacity-50 group-focus-visible/sort:opacity-50" />
        )}
      </button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// One collab: the primary row + its detail panel
// ---------------------------------------------------------------------------

function CollabRow({ c, projectId, members, canManage, attribution, columnCount, open, onToggle, onTrack, onEdit }: {
  c: InfluencerCollabRow;
  projectId: string;
  members: Member[];
  canManage: boolean;
  attribution: InfluencerAttribution | null;
  columnCount: number;
  open: boolean;
  onToggle: () => void;
  onTrack: () => void;
  onEdit: () => void;
}) {
  const panelId = `collab-${c.id}-details`;

  // A click anywhere on the row's empty space expands it. Controls keep their
  // own clicks, and so do portalled popovers (their clicks bubble through React
  // but aren't inside the row in the DOM).
  const onRowClick = (e: MouseEvent<HTMLTableRowElement>) => {
    const target = e.target as Element;
    if (!e.currentTarget.contains(target)) return;
    if (target.closest("a, button, input, textarea, select, label, [role='button'], [role='combobox']")) return;
    if (window.getSelection()?.toString()) return; // selecting text, not toggling
    onToggle();
  };

  return (
    <>
      <tr
        onClick={onRowClick}
        className={cn("cursor-pointer border-b border-border/60 transition-colors", open ? "border-b-0 bg-muted/30" : "hover:bg-muted/25")}
      >
        <td className={cn("py-2 pl-2 pr-0", open && ACCENT)}>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            aria-label={`${open ? "Hide" : "Show"} details for ${c.influencerName}`}
            className={cn("grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", FOCUS)}
          >
            <ChevronRight className={cn("size-4 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-90")} />
          </button>
        </td>
        <td className="px-3 py-2">
          <div className="truncate font-medium text-foreground" title={c.influencerName}>{c.influencerName}</div>
          <div className="truncate text-[11.5px] leading-4 text-muted-foreground">{c.platform}</div>
        </td>
        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground" title={fullDay(c.postDate)}>
          {shortDay(c.postDate)}
        </td>
        <td className="px-3 py-2">
          <CollabAssignee projectId={projectId} collabId={c.id} assignedTo={c.assignedTo} members={members} canManage={canManage} />
        </td>
        <td className={cn(
          "whitespace-nowrap px-3 py-2 text-right font-mono text-[12.5px] tabular-nums",
          c.isFree ? "font-semibold text-success-strong" : c.amountPaid == null ? "text-muted-foreground" : "text-foreground",
        )}>
          {formatCost(c)}
        </td>
        <td className="px-3 py-2 text-right"><EngagementCell c={c} onOpen={onTrack} /></td>
        <td className="whitespace-nowrap px-3 py-2 text-right"><AttrCell c={c} attribution={attribution} kind="visits" /></td>
        <td className="whitespace-nowrap px-3 py-2 text-right"><AttrCell c={c} attribution={attribution} kind="demos" /></td>
        <td className="whitespace-nowrap px-3 py-2 text-right"><AttrCell c={c} attribution={attribution} kind="deals" /></td>
        {canManage && (
          <td className="py-2 pl-1 pr-3">
            <CollabRowActions projectId={projectId} collab={c} onEdit={onEdit} />
          </td>
        )}
      </tr>
      {open && (
        <tr id={panelId} className="border-b border-border/60 bg-muted/30">
          <td colSpan={columnCount} className={cn("pb-3 pl-8 pr-3 pt-0.5", ACCENT)}>
            <DetailPanel c={c} attribution={attribution} onTrack={onTrack} />
          </td>
        </tr>
      )}
    </>
  );
}

function DetailPanel({ c, attribution, onTrack }: { c: InfluencerCollabRow; attribution: InfluencerAttribution | null; onTrack: () => void }) {
  const linkedIn = c.platform === "LinkedIn";
  return (
    <div className="grid grid-cols-3 divide-x divide-border/60 rounded-lg border border-border/70 bg-background py-3 shadow-xs animate-in fade-in-0 slide-in-from-top-1 duration-150 motion-reduce:animate-none">
      <PanelSection title="Collab">
        <Facts>
          <Fact label="Closing date">{c.closingDate ? fullDay(c.closingDate) : <Muted>Not set</Muted>}</Fact>
          <Fact label="Post date">
            {fullDay(c.postDate)}{c.postDate > todayUtc() && <Muted> · not posted yet</Muted>}
          </Fact>
          <Fact label="Profile"><UrlLink href={c.profileLink} /></Fact>
          <Fact label="Post">{c.postLink ? <UrlLink href={c.postLink} /> : <Muted>Not added yet</Muted>}</Fact>
        </Facts>
      </PanelSection>
      {linkedIn ? (
        <>
          <PanelSection
            title="Post tracking"
            action={<Button size="xs" variant="outline" onClick={onTrack}>Open tracking</Button>}
          >
            <TrackingSummary c={c} />
          </PanelSection>
          <PanelSection title="Visits, demos, deals · first 30 days">
            <AttributionDetail c={c} attribution={attribution} />
          </PanelSection>
        </>
      ) : (
        <div className="col-span-2 flex items-center px-4 text-[12.5px] text-muted-foreground">
          Engagement, visits, demos and deals are tracked for LinkedIn posts only.
        </div>
      )}
    </div>
  );
}

function PanelSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 px-4">
      <div className="mb-2 flex min-h-6 items-center justify-between gap-2">
        <h4 className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

function Facts({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[108px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[12.5px]">{children}</dl>;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-[12.5px] leading-relaxed text-muted-foreground">{children}</p>;
}

function UrlLink({ href }: { href: string }) {
  const url = toExternalUrl(href);
  if (!url) return <span className="block truncate text-muted-foreground" title={href}>{href}</span>;
  const pretty = href.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={href}
      className="group/url inline-flex max-w-full items-center gap-1 rounded-sm text-foreground hover:text-[#5B45E0] hover:underline dark:hover:text-[#7B62FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B45E0]/60"
    >
      <span className="truncate">{pretty}</span>
      <ExternalLink className="size-3 shrink-0 text-muted-foreground group-hover/url:text-current" />
    </a>
  );
}

// The post's daily LinkedIn readings at a glance, plus the we360.ai links found
// in it. Editing lives in the tracking dialog.
function TrackingSummary({ c }: { c: InfluencerCollabRow }) {
  if (!c.trackingReady) return <Note>Post tracking needs migration 20261118000001 applied in Supabase first.</Note>;
  const last = c.metrics[c.metrics.length - 1];
  const reactions = c.metrics.flatMap((m) => (m.reactions == null ? [] : [m.reactions]));
  const day = last ? dayOf(c.postDate, last.date) : null;
  const found = (v: string | null) =>
    v ? <UrlLink href={v} /> : <Muted>{c.linksScrapedAt ? "None found" : "Not looked up yet"}</Muted>;

  return (
    <div className="space-y-3">
      {last ? (
        <div className="flex items-center gap-3">
          {reactions.length > 1 && (
            <span title="Reactions, day by day" className="shrink-0 text-[#5B45E0] dark:text-[#7B62FF]">
              <Sparkline data={reactions} width={84} height={28} strokeWidth={1.5} color="currentColor" />
            </span>
          )}
          <div className="min-w-0 text-[12.5px]">
            <div className="text-foreground">
              {day !== null && day <= METRIC_DAYS ? `Day ${day} of ${METRIC_DAYS}` : "Final reading"}
              <span className="text-muted-foreground"> · {c.metrics.length} reading{c.metrics.length === 1 ? "" : "s"}</span>
            </div>
            <div className="text-muted-foreground">
              Last read {shortDay(last.date)}{last.source === "manual" ? ", entered by hand" : ""}
            </div>
          </div>
        </div>
      ) : (
        <Note>{engagementStatus(c)}</Note>
      )}
      <Facts>
        <Fact label="Link in post">{found(c.postBodyLink)}</Fact>
        <Fact label="Link in comment">{found(c.commentLink)}</Fact>
      </Facts>
      {c.scrapeError && (
        <div className="flex gap-2 rounded-md border border-amber-300/60 bg-amber-500/10 px-2.5 py-1.5 text-[12px] text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{c.scrapeError}</span>
        </div>
      )}
    </div>
  );
}

function engagementStatus(c: InfluencerCollabRow): string {
  if (!c.postLink) return "No post link yet. Add it in tracking to start reading LinkedIn.";
  if (c.postDate > todayUtc()) return "Not posted yet. LinkedIn is read daily from the post date.";
  if (c.scrapeError) return "LinkedIn couldn't be read. Add the numbers by hand in tracking.";
  return `No readings yet. LinkedIn is read daily for the first ${METRIC_DAYS} days.`;
}

// How this post's visits / demos / deals were counted: the exact UTM key, and
// the estimate's landing page and window.
function AttributionDetail({ c, attribution }: { c: InfluencerCollabRow; attribution: InfluencerAttribution | null }) {
  if (!attribution) return <Note>Loading from Google Analytics…</Note>;
  if (!attribution.ready) return <Note>{attribution.reason ?? "Google Analytics isn't reachable here."}</Note>;
  const a = attribution.byPost[c.id];
  if (!a) return <Note>Not posted yet. Counting starts on the post date.</Note>;
  if (!a.utmContent && !a.estPath) return <Note>No we360.ai link found for this post yet. Add one in post tracking.</Note>;
  const deals = attribution.dealsReady;
  return (
    <div className="space-y-3">
      {a.utmContent && (
        <Method
          title="Exact"
          sub={a.matchedBy === "name" ? "UTM link matched by the influencer's name" : "through the UTM link"}
          range={`${shortDay(a.postDate)} → ${shortDay(a.exactEnd)}`}
          keyText={`utm_content=${a.utmContent}`}
          stats={[["visits", a.visitsExact], ["demos", a.demosExact], ["deals", deals ? a.dealsExact : null]]}
        />
      )}
      {a.estPath && (
        <Method
          title="Estimate"
          sub="LinkedIn traffic to the page"
          approx
          range={`${shortDay(a.postDate)} → ${shortDay(a.windowEnd)}`}
          keyText={`we360.ai${a.estPath}`}
          stats={[["visits", a.visitsEst], ["demos", a.demosEst], ["deals", deals ? a.dealsEst : null]]}
        />
      )}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {a.estPath && "Estimate: LinkedIn visits to that page in the window, minus its usual LinkedIn traffic. A later post to the same page takes over from its post date. "}
        {deals ? "Deals: a HubSpot deal created within 15 min of a demo booking." : "Deals need HubSpot, which isn't reachable here."}
      </p>
    </div>
  );
}

function Method({ title, sub, range, keyText, stats, approx = false }: {
  title: string; sub: string; range: string; keyText: string; stats: [string, number | null][]; approx?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <span className="min-w-0 truncate">
          <span className="font-medium text-foreground">{title}</span> <span className="text-muted-foreground">{sub}</span>
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{range}</span>
      </div>
      <div className="truncate font-mono text-[11px] text-muted-foreground" title={keyText}>{keyText}</div>
      <dl className="mt-1.5 flex gap-5">
        {stats.map(([label, v]) => (
          <div key={label} className="flex flex-col-reverse">
            <dt className="text-[10.5px] text-muted-foreground">{label}</dt>
            <dd className="font-mono text-[13px] font-medium tabular-nums text-foreground">
              {v == null ? <span className="text-muted-foreground">—</span> : `${approx ? "≈" : ""}${num(v)}`}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function RefreshButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await refreshInfluencerPosts({ project_id: projectId });
      if (!r.ok) { toast.error(r.error ?? "Refresh failed."); return; }
      toast.success(r.message ?? "Refreshed."); router.refresh();
    } catch { toast.error("Refresh failed."); }
    finally { setBusy(false); }
  };
  return (
    <Button size="sm" variant="outline" className="gap-1.5" onClick={run} disabled={busy}
      title="Read today's LinkedIn numbers now (runs daily on its own)">
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
      {busy ? "Reading LinkedIn…" : "Refresh now"}
    </Button>
  );
}

function InfluencerTotal({ attribution }: { attribution: InfluencerAttribution | null }) {
  if (!attribution) {
    return <span className="text-[12px] text-muted-foreground">Influencer total · loading…</span>;
  }
  if (!attribution.ready || !attribution.totals) {
    return (
      <span className="text-[12px] text-muted-foreground" title={attribution.reason ?? undefined}>
        Influencer total · {attribution.ready ? "no LinkedIn posts yet" : "needs Google Analytics"}
      </span>
    );
  }
  const t = attribution.totals;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2.5 py-1 text-[12px] text-muted-foreground"
      title={`Since ${t.from}: every visit / demo through an influencer UTM link (including ones that match no post) plus the estimated LinkedIn traffic from posts without one.`}
    >
      <span className="font-semibold text-foreground">Influencer total</span>
      <span className="font-mono tabular-nums text-foreground">{num(t.visits)}</span> visits ·
      <span className="font-mono tabular-nums text-foreground">{num(t.demos)}</span> demos
      {attribution.dealsReady && <> · <span className="font-mono tabular-nums text-foreground">{num(t.deals)}</span> deals</>}
      {(t.visitsEst > 0 || t.demosEst > 0) && <span>(incl. ≈{num(t.visitsEst)} visits / ≈{num(t.demosEst)} demos est.)</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Row cells
// ---------------------------------------------------------------------------

function Metric({ icon: Icon, value, label }: { icon: LucideIcon; value: number | null; label: string }) {
  return (
    <span className="inline-flex items-center gap-1" title={label}>
      <Icon className="size-3 text-muted-foreground" aria-hidden />
      {value == null ? "—" : num(value)}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

// Latest reactions / comments / reposts, with which day of the 15 it is. Opens
// the post's tracking (links + daily numbers, editable by anyone).
function EngagementCell({ c, onOpen }: { c: InfluencerCollabRow; onOpen: () => void }) {
  if (c.platform !== "LinkedIn") return <span className="text-muted-foreground">—</span>;
  const last = c.metrics[c.metrics.length - 1];
  const day = last ? dayOf(c.postDate, last.date) : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Open post tracking"
      className={cn("group/eng -mx-1.5 inline-flex max-w-[calc(100%+12px)] flex-col items-end rounded-md px-1.5 py-0.5 text-right transition-colors hover:bg-muted/70", FOCUS)}
    >
      {last ? (
        <>
          <span className="flex items-center gap-2.5 whitespace-nowrap font-mono text-[12.5px] tabular-nums text-foreground">
            <Metric icon={ThumbsUp} value={last.reactions} label="reactions" />
            <Metric icon={MessageCircle} value={last.comments} label="comments" />
            <Metric icon={Repeat2} value={last.reposts} label="reposts" />
          </span>
          <span className="text-[10.5px] leading-4 text-muted-foreground">
            {day !== null && day <= METRIC_DAYS ? `day ${day} of ${METRIC_DAYS}` : "final"}{last.source === "manual" ? " · edited" : ""}
          </span>
        </>
      ) : c.scrapeError ? (
        <>
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-3" /> Can&apos;t read
          </span>
          <span className="text-[10.5px] leading-4 text-muted-foreground group-hover/eng:text-foreground">add by hand</span>
        </>
      ) : !c.postLink ? (
        <span className="whitespace-nowrap text-[12px] text-muted-foreground group-hover/eng:text-foreground">Add post link</span>
      ) : c.postDate > todayUtc() ? (
        <span className="whitespace-nowrap text-[12px] text-muted-foreground">Not posted yet</span>
      ) : (
        <span className="whitespace-nowrap text-[12px] text-muted-foreground group-hover/eng:text-foreground">Pending · add</span>
      )}
    </button>
  );
}

type AttrKind = "visits" | "demos" | "deals";

function explain(a: PostAttribution, kind: AttrKind): string {
  const what = kind === "visits" ? "visits" : kind === "demos" ? "demo bookings" : "deals (a HubSpot deal created within 15 min of the booking)";
  const lines = [`First 30 days, counted to ${a.windowEnd}.`];
  if (a.utmContent) lines.push(`Exact: ${what} through the UTM link (utm_content=${a.utmContent})${a.matchedBy === "name" ? " - matched by the influencer's name, as no link was recorded for this post" : ""}.`);
  if (a.estPath) lines.push(`Estimate: LinkedIn ${what} landing on ${a.estPath} in this post's window, minus that page's usual LinkedIn traffic. A later post to the same page takes over from its post date.`);
  if (!a.utmContent && !a.estPath) lines.push("No we360.ai link found for this post yet — open Engagement to add one.");
  return lines.join("\n");
}

function AttrCell({ c, attribution, kind }: { c: InfluencerCollabRow; attribution: InfluencerAttribution | null; kind: AttrKind }) {
  if (c.platform !== "LinkedIn") return <span className="text-muted-foreground">—</span>;
  if (!attribution) return <span className="text-muted-foreground">…</span>;
  if (!attribution.ready) return <span className="text-muted-foreground" title={attribution.reason ?? "Google Analytics isn't reachable here."}>—</span>;
  const a = attribution.byPost[c.id];
  if (!a) return <span className="text-muted-foreground" title="Not posted yet">—</span>;
  if (kind === "deals" && !attribution.dealsReady) return <span className="text-muted-foreground" title="HubSpot isn't reachable, so deals can't be matched.">—</span>;
  const exact = kind === "visits" ? a.visitsExact : kind === "demos" ? a.demosExact : a.dealsExact;
  const est = kind === "visits" ? a.visitsEst : kind === "demos" ? a.demosEst : a.dealsEst;
  if (!a.utmContent && !a.estPath) return <span className="text-muted-foreground" title={explain(a, kind)}>?</span>;
  return (
    <span className="font-mono text-[12.5px] tabular-nums text-foreground" title={explain(a, kind)}>
      {a.utmContent ? num(exact) : null}
      {a.estPath && (
        <span className="text-muted-foreground">{a.utmContent ? " +" : "≈"}{num(est)}<span className="ml-0.5 font-sans text-[10px]">est.</span></span>
      )}
    </span>
  );
}
