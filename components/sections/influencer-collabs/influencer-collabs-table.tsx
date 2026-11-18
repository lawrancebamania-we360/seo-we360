"use client";

// Influencer Collabs: flat sortable list - same shape as Earned Backlinks'
// table, with the same direction-invariant null-handling (a null must always
// sort last regardless of asc/desc - the bug fixed in Backlink Submissions
// earlier tonight must not be reintroduced here). Default sort: Post Date
// descending, per explicit instruction.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, ArrowDown, ArrowUp, ArrowUpDown, ThumbsUp, MessageCircle, Repeat2, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PostTrackingDialog, METRIC_DAYS } from "@/components/sections/influencer-collabs/post-tracking-dialog";
import { refreshInfluencerPosts } from "@/lib/actions/influencer-collabs";
import { Card } from "@/components/ui/card";
import { SearchBox, matchesQuery } from "@/components/ui/search-box";
import { toExternalUrl } from "@/lib/url";
import { InfluencerCollabActions } from "@/components/sections/influencer-collabs/influencer-collab-actions";
import type { InfluencerCollabRow } from "@/lib/data/influencer-collabs";
import type { InfluencerAttribution } from "@/lib/data/influencer-attribution";
import type { PostAttribution } from "@/lib/influencer/attribution";
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

function LinkCell({ href, label, title }: { href: string | null; label: string; title: string }) {
  if (!href) return <span className="text-muted-foreground">—</span>;
  return (
    <a href={toExternalUrl(href)} target="_blank" rel="noopener noreferrer" title={title}
      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline">
      {label} <ExternalLink className="size-3" />
    </a>
  );
}

// Nulls always sort last, regardless of direction - `dir` only flips the
// ordering between two real values.
function compareNullableStr(a: string | null, b: string | null, dir: number): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a.localeCompare(b) * dir;
}
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
  const [tracking, setTracking] = useState<InfluencerCollabRow | null>(null);

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

  const shown = sorted.filter((c) => matchesQuery(q, c.influencerName, c.platform, c.assigneeName));

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
            <th className="px-3 py-2.5 text-left font-semibold">Engagement</th>
            <th className="px-3 py-2.5 text-right font-semibold" title="Website visits in the first 30 days after the post">Visits · 30d</th>
            <th className="px-3 py-2.5 text-right font-semibold" title="Demo bookings in the first 30 days after the post">Demos · 30d</th>
            <th className="px-3 py-2.5 text-left font-semibold">Profile link</th>
            <th className="px-3 py-2.5 text-left font-semibold">Post link</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((c) => (
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
                <EngagementCell c={c} onOpen={() => setTracking(c)} />
              </td>
              <td className="px-3 py-2.5 text-right"><AttrCell c={c} attribution={attribution} kind="visits" /></td>
              <td className="px-3 py-2.5 text-right"><AttrCell c={c} attribution={attribution} kind="demos" /></td>
              <td className="px-3 py-2.5">
                <LinkCell href={c.profileLink} label="Profile" title="Open the influencer's profile" />
              </td>
              <td className="px-3 py-2.5">
                <LinkCell href={c.postLink} label="Post" title="Open the LinkedIn post" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
      )}
      {tracking && (
        <PostTrackingDialog
          collab={collabs.find((x) => x.id === tracking.id) ?? tracking}
          projectId={projectId}
          onClose={() => setTracking(null)}
        />
      )}
    </div>
  );
}

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

// Latest reactions / comments / reposts, with which day of the 15 it is. Opens
// the post's tracking (links + daily numbers, editable by anyone).
function EngagementCell({ c, onOpen }: { c: InfluencerCollabRow; onOpen: () => void }) {
  if (c.platform !== "LinkedIn") return <span className="text-muted-foreground">—</span>;
  const last = c.metrics[c.metrics.length - 1];
  const day = last ? Math.round((Date.parse(`${last.date}T00:00:00Z`) - Date.parse(`${c.postDate}T00:00:00Z`)) / 86_400_000) : null;
  return (
    <button type="button" onClick={onOpen} title="Open post tracking"
      className="group/eng -mx-1 rounded-md px-1 py-0.5 text-left hover:bg-muted/60">
      {last ? (
        <>
          <span className="flex items-center gap-2 font-mono text-[12.5px] tabular-nums text-foreground">
            <span className="inline-flex items-center gap-0.5"><ThumbsUp className="size-3 text-muted-foreground" />{last.reactions ?? "—"}</span>
            <span className="inline-flex items-center gap-0.5"><MessageCircle className="size-3 text-muted-foreground" />{last.comments ?? "—"}</span>
            <span className="inline-flex items-center gap-0.5"><Repeat2 className="size-3 text-muted-foreground" />{last.reposts ?? "—"}</span>
          </span>
          <span className="block text-[10.5px] text-muted-foreground">
            {day !== null && day <= METRIC_DAYS ? `day ${day} of ${METRIC_DAYS}` : "final"}{last.source === "manual" ? " · edited" : ""}
          </span>
        </>
      ) : c.scrapeError ? (
        <span className="inline-flex items-center gap-1 text-[12px] text-amber-700 dark:text-amber-400"><AlertTriangle className="size-3" /> Can't read · add by hand</span>
      ) : !c.postLink ? (
        <span className="text-[12px] text-muted-foreground group-hover/eng:text-foreground">Add post link</span>
      ) : c.postDate > new Date().toISOString().slice(0, 10) ? (
        <span className="text-[12px] text-muted-foreground">Not posted yet</span>
      ) : (
        <span className="text-[12px] text-muted-foreground group-hover/eng:text-foreground">Pending · add</span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// GA4 attribution cells
// ---------------------------------------------------------------------------

function explain(a: PostAttribution, kind: "visits" | "demos"): string {
  const what = kind === "visits" ? "visits" : "demo bookings";
  const lines = [`First 30 days, counted to ${a.windowEnd}.`];
  if (a.utmContent) lines.push(`Exact: ${what} through the UTM link (utm_content=${a.utmContent}).`);
  if (a.estPath) lines.push(`Estimate: LinkedIn ${what} landing on ${a.estPath} in this post's window, minus that page's usual LinkedIn traffic. A later post to the same page takes over from its post date.`);
  if (!a.utmContent && !a.estPath) lines.push("No we360.ai link found for this post yet — open Engagement to add one.");
  return lines.join("\n");
}

function AttrCell({ c, attribution, kind }: { c: InfluencerCollabRow; attribution: InfluencerAttribution | null; kind: "visits" | "demos" }) {
  if (c.platform !== "LinkedIn") return <span className="text-muted-foreground">—</span>;
  if (!attribution) return <span className="text-muted-foreground">…</span>;
  if (!attribution.ready) return <span className="text-muted-foreground" title={attribution.reason ?? "Google Analytics isn't reachable here."}>—</span>;
  const a = attribution.byPost[c.id];
  if (!a) return <span className="text-muted-foreground" title="Not posted yet">—</span>;
  const exact = kind === "visits" ? a.visitsExact : a.demosExact;
  const est = kind === "visits" ? a.visitsEst : a.demosEst;
  if (!a.utmContent && !a.estPath) return <span className="text-muted-foreground" title={explain(a, kind)}>?</span>;
  return (
    <span className="font-mono text-[12.5px] tabular-nums text-foreground" title={explain(a, kind)}>
      {a.utmContent ? exact.toLocaleString() : null}
      {a.estPath && (
        <span className="text-muted-foreground">{a.utmContent ? " +" : "≈"}{est.toLocaleString()}<span className="ml-0.5 text-[10px]">est.</span></span>
      )}
    </span>
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
      <span className="font-mono tabular-nums text-foreground">{t.visits.toLocaleString()}</span> visits ·
      <span className="font-mono tabular-nums text-foreground">{t.demos.toLocaleString()}</span> demos
      {(t.visitsEst > 0 || t.demosEst > 0) && <span>(incl. ≈{t.visitsEst.toLocaleString()} / ≈{t.demosEst.toLocaleString()} est.)</span>}
    </span>
  );
}
