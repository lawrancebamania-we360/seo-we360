"use client";

// Blog Clusters - GSC queries section on the cluster page (GC-2..GC-6): the hub
// page, Refresh / Apply all / Download, the queries table (where each query
// goes, how to use it, anchor variants) and the new-post suggestions table.
//
// Rows are read-only; Edit opens a form in the row's detail panel. Columns are
// shown or hidden from the table's own width (not the viewport), so the table
// never scrolls sideways on a desktop and the detail row's colSpan stays exact.

import { Fragment, useCallback, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Check, CheckCheck, ChevronRight, Download, ExternalLink, GitBranch,
  Hash, Loader2, Pencil, Plus, RefreshCw, RotateCcw, Search, SearchX, Sparkles, UserRound, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toExternalUrl } from "@/lib/url";
import {
  applyAllClusterSuggestions, createPostFromGscQuery, refreshClusterGsc, setClusterHub, updateClusterGscQuery,
} from "@/lib/actions/cluster-gsc";
import {
  LOOKBACK_DAYS, MIN_IMPRESSIONS, NEW_POST_MIN_IMPRESSIONS, QUERY_ACTION_LABEL, QUERY_USAGE_LABEL, UPDATE_EXISTING_MAX_POSITION,
  type AssignedBy, type ClusterGscData, type ClusterGscQuery, type QueryAction, type QueryStatus, type QueryUsage,
} from "@/lib/types/cluster-gsc";
import { InfoTip } from "./info-tip";

type Patch = Omit<Parameters<typeof updateClusterGscQuery>[0], "project_id" | "id">;
type Post = { id: string; title: string };
type Filter = "all" | "review" | "accepted" | "needs_post" | "update_existing" | "ignored";
type SortKey = "query" | "impressions" | "clicks" | "position";
type Sort = { key: SortKey; dir: "asc" | "desc" };
type Cols = { clicks: boolean; useAs: boolean; ranks: boolean; anchors: boolean };

// ---------------------------------------------------------------- vocabulary

const ACTION_SHORT: Record<QueryAction, string> = {
  unassigned: "Unassigned",
  assign: "Use in post",
  hub: "Hub page",
  update_existing: "Update existing",
  new_post: "New post",
  ignore: "Ignore",
};

const ACTION_HELP: Record<QueryAction, string> = {
  unassigned: "Not routed yet. Edit the row to choose where it goes.",
  assign: "Work this query into one of this cluster's posts (the post shown in Target) as an H2, an FAQ question or a body mention.",
  hub: "A broad head term. It belongs on the cluster's hub (pillar) page, not in a single post.",
  update_existing: `It already ranks in Google's top ${UPDATE_EXISTING_MAX_POSITION} on another we360.ai page outside this cluster. Improve that page with it instead of writing a new, competing page (avoids cannibalisation).`,
  new_post: `${NEW_POST_MIN_IMPRESSIONS}+ impressions and no post covers it. Listed under New page suggestions.`,
  ignore: "Off-topic or the wrong intent for this cluster. Nothing is written anywhere.",
};

const ACTION_TONE: Record<QueryAction, string> = {
  assign: "border-[#5B45E0]/30 bg-[#5B45E0]/10 text-[#5B45E0] dark:text-[#9C88FF]",
  hub: "border-info-200 bg-info-50 text-info-700 dark:border-info-500/30 dark:bg-info-500/15 dark:text-info-300",
  update_existing: "border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/15 dark:text-warning-300",
  new_post: "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/15 dark:text-success-300",
  ignore: "border-border bg-muted/60 text-muted-foreground",
  unassigned: "border-dashed border-border text-muted-foreground",
};

const USAGE_HELP: Record<QueryUsage, string> = {
  h2: "its own section heading",
  faq: "a question in the FAQ block",
  body: "a natural mention in a paragraph",
};

const STATUS_LABEL: Record<QueryStatus, string> = { suggested: "Suggested", accepted: "Approved", rejected: "Rejected" };
const STATUS_TONE: Record<QueryStatus, string> = {
  suggested: "border-border bg-background text-foreground",
  accepted: "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/15 dark:text-success-300",
  rejected: "border-border bg-muted/60 text-muted-foreground",
};
const STATUS_DOT: Record<QueryStatus, string> = { suggested: "bg-info-500", accepted: "bg-success-500", rejected: "bg-muted-foreground/50" };

const SOURCE: Record<AssignedBy, { label: string; Icon: typeof Sparkles }> = {
  ai: { label: "Suggested by Claude (AI).", Icon: Sparkles },
  rule: { label: `Routed by rule: it already ranks top ${UPDATE_EXISTING_MAX_POSITION} on another we360.ai page.`, Icon: GitBranch },
  keyword: { label: "Matched by keyword rules (Claude was unavailable at refresh).", Icon: Hash },
  manual: { label: "Edited by a person. Refreshes won't overwrite it.", Icon: UserRound },
};

/** Actions whose query is actually written somewhere, so "Use as" applies. */
const USED = new Set<QueryAction>(["assign", "hub", "update_existing"]);
const QUESTION = /^(what|how|why|when|where|which|who|whom|whose|is|are|am|can|could|do|does|did|should|will|would|was|were|has|have|may)\b/i;

const NUM = new Intl.NumberFormat("en-US");
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

const TH = "sticky top-0 z-10 bg-[color-mix(in_oklab,var(--muted)_40%,var(--background))] px-2 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]";
const TD = "px-2 py-1.5 align-middle";
const SELECT = "h-8 w-full rounded-md border border-border bg-background px-2 text-[12.5px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B45E0]/40 disabled:opacity-60";
const CHIP_ON = "border-[#5B45E0]/40 bg-[#5B45E0]/10 text-[#5B45E0] dark:text-[#7B62FF]";
const CHIP_OFF = "border-border text-muted-foreground hover:bg-muted hover:text-foreground";

// ------------------------------------------------------------------- helpers

function pathOf(url: string | null): string {
  if (!url) return "—";
  try {
    const p = new URL(url).pathname.replace(/\/+$/, "");
    return p || "/";
  } catch { return url; }
}

function inferUsage(query: string): QueryUsage {
  const q = query.trim();
  return q.endsWith("?") || QUESTION.test(q) ? "faq" : "body";
}

/** How the query is used on the page. Falls back to a guess when the backend left it empty. */
function usageOf(row: Pick<ClusterGscQuery, "action" | "usage" | "query">): { usage: QueryUsage; inferred: boolean } | null {
  if (!USED.has(row.action)) return null;
  return row.usage ? { usage: row.usage, inferred: false } : { usage: inferUsage(row.query), inferred: true };
}

function posTone(p: number): string {
  if (p <= 3) return "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300";
  if (p <= 10) return "bg-info-50 text-info-700 dark:bg-info-500/15 dark:text-info-300";
  if (p <= 20) return "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300";
  return "bg-muted text-muted-foreground";
}

function sortRows(rows: ClusterGscQuery[], sort: Sort): ClusterGscQuery[] {
  const m = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sort.key === "query") return a.query.localeCompare(b.query) * m;
    return (a[sort.key] - b[sort.key]) * m || b.impressions - a.impressions;
  });
}

function nextSort(cur: Sort, key: SortKey): Sort {
  if (cur.key === key) return { key, dir: cur.dir === "asc" ? "desc" : "asc" };
  // Text and position read best ascending first; volumes descending.
  return { key, dir: key === "query" || key === "position" ? "asc" : "desc" };
}

function parseAnchors(s: string): string[] {
  return s.split(/[;,\n]/).map((x) => x.trim().slice(0, 120)).filter(Boolean);
}

/** Tracks an element's width (React 19 ref callbacks may return a cleanup). */
function useWidth() {
  const [width, setWidth] = useState(Number.POSITIVE_INFINITY);
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

// --------------------------------------------------------------------- panel

export function ClusterGscPanel({ projectId, clusterId, data, posts, canManage }: {
  projectId: string;
  clusterId: string;
  data: ClusterGscData;
  posts: Post[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "refresh" | "apply">(null);
  const [bulkPending, startBulk] = useTransition();
  const [filter, setFilter] = useState<Filter>("all");
  const [postFilter, setPostFilter] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "impressions", dir: "desc" });
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [tableRef, width] = useWidth();

  const cols: Cols = { clicks: width >= 940, useAs: width >= 940, ranks: width >= 1080, anchors: width >= 1220 };
  const colCount = 6 + (canManage ? 2 : 0) + Object.values(cols).filter(Boolean).length;

  const queries = useMemo(() => data.queries.filter((x) => x.action !== "new_post"), [data.queries]);
  const postTitle = useMemo(() => new Map(posts.map((p) => [p.id, p.title])), [posts]);
  const toApply = queries.filter((x) => x.status === "suggested" && USED.has(x.action)).length;

  const matches = (x: ClusterGscQuery, f: Filter) => {
    if (f === "review") return x.status === "suggested";
    if (f === "accepted") return x.status === "accepted";
    if (f === "needs_post") return x.action === "assign" && !x.itemId && x.status !== "rejected";
    if (f === "update_existing") return x.action === "update_existing";
    if (f === "ignored") return x.action === "ignore" || x.status === "rejected";
    return true;
  };

  const needle = q.trim().toLowerCase();
  const shown = sortRows(queries.filter((x) => {
    if (needle && !x.query.toLowerCase().includes(needle)) return false;
    if (postFilter === "hub" && x.action !== "hub") return false;
    if (postFilter && postFilter !== "hub" && x.itemId !== postFilter) return false;
    return matches(x, filter);
  }), sort);

  const counts = Object.fromEntries(
    (["all", "review", "accepted", "needs_post", "update_existing", "ignored"] as Filter[]).map((f) => [f, queries.filter((x) => matches(x, f)).length]),
  ) as Record<Filter, number>;

  const filtered = filter !== "all" || !!postFilter || !!needle;
  const clearFilters = () => { setFilter("all"); setPostFilter(""); setQ(""); };

  // Selection is kept by id; the header checkbox works on the rows in view.
  const selectedRows = queries.filter((x) => selected.has(x.id));
  const shownSelected = shown.filter((x) => selected.has(x.id)).length;
  const toggleOne = (id: string, on: boolean) => setSelected((prev) => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });
  const toggleShown = (on: boolean) => setSelected((prev) => {
    const next = new Set(prev);
    for (const x of shown) { if (on) next.add(x.id); else next.delete(x.id); }
    return next;
  });

  const bulk = (status: "accepted" | "rejected") => {
    const eligible = status === "accepted"
      ? selectedRows.filter((x) => x.status !== "accepted" && approveBlock(x) === null)
      : selectedRows.filter((x) => x.status !== "rejected");
    const skipped = selectedRows.length - eligible.length;
    if (!eligible.length) { toast.info(status === "accepted" ? "Nothing to approve: the selected rows are already approved or need a post first." : "The selected rows are already rejected."); return; }
    startBulk(async () => {
      let failed = 0;
      // One at a time: each update rebuilds the cluster's post plans on the server.
      for (const x of eligible) {
        const r = await updateClusterGscQuery({ project_id: projectId, id: x.id, status }).catch(() => ({ ok: false }));
        if (!r.ok) failed++;
      }
      const done = eligible.length - failed;
      const verb = status === "accepted" ? "Approved" : "Rejected";
      if (failed) toast.error(`${verb} ${done}, ${failed} failed - try again.`);
      else toast.success(`${verb} ${done} ${done === 1 ? "query" : "queries"}${skipped ? ` (${skipped} skipped)` : ""}.`);
      startBulk(() => { setSelected(new Set()); router.refresh(); });
    });
  };

  const refresh = async () => {
    setBusy("refresh");
    try {
      const r = await refreshClusterGsc({ project_id: projectId, cluster_id: clusterId });
      if (!r.ok) { toast.error(r.error ?? "Refresh failed."); return; }
      toast.success(`${r.fetched} queries with ${MIN_IMPRESSIONS}+ impressions (${r.added} new) · ${r.assigned} assigned · from ${r.rawRows ?? 0} Search Console rows`);
      if (r.ai === "fallback") toast.warning(`Claude wasn't available, so keyword matching was used: ${r.aiError ?? "unknown error"}`);
      router.refresh();
    } catch { toast.error("Refresh failed - try again."); }
    finally { setBusy(null); }
  };

  const applyAll = async () => {
    setBusy("apply");
    try {
      const r = await applyAllClusterSuggestions({ project_id: projectId, cluster_id: clusterId });
      if (!r.ok) { toast.error(r.error ?? "Could not apply."); return; }
      toast.success(`Applied ${r.accepted} suggestions to ${r.posts} posts.`);
      router.refresh();
    } catch { toast.error("Could not apply - try again."); }
    finally { setBusy(null); }
  };

  if (!data.ready) {
    return (
      <section className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-[13px] text-muted-foreground">
        <div className="font-semibold text-foreground">Search Console queries</div>
        Apply migration <span className="font-mono">20261123000001_cluster_gsc_queries</span> in Supabase to pull GSC queries for this cluster.
      </section>
    );
  }

  const totals = shown.reduce((t, x) => ({ impressions: t.impressions + x.impressions, clicks: t.clicks + x.clicks }), { impressions: 0, clicks: 0 });
  const allShownSelected = shown.length > 0 && shownSelected === shown.length;
  const onSort = (k: SortKey) => setSort((s) => nextSort(s, k));

  return (
    <section className="space-y-4" aria-labelledby="gsc-queries-title">
      {/* ------------------------------------------------------------ header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="gsc-queries-title" className="font-heading text-[17px] font-bold text-foreground">Search Console queries</h2>
          <p className="max-w-2xl text-[12.5px] text-muted-foreground">
            Queries we360.ai already gets impressions for (last {LOOKBACK_DAYS} days, {MIN_IMPRESSIONS}+ impressions) that match this cluster&apos;s keywords, and where each should go.
          </p>
          <HubEditor projectId={projectId} clusterId={clusterId} hub={data.hub} canManage={canManage} />
          <p className="text-[11.5px] text-muted-foreground">
            {data.refresh
              ? <>Last refreshed {formatDistanceToNow(new Date(data.refresh.at), { addSuffix: true })} · {NUM.format(data.refresh.fetched)} queries
                  {data.refresh.keywords != null && ` (searched ${data.refresh.keywords} keywords, ${NUM.format(data.refresh.rawRows ?? 0)} Search Console rows)`}
                  {data.refresh.ai === "ok" && " · assigned by Claude"}
                  {data.refresh.ai === "fallback" && <span className="text-warning-strong"> · keyword matching (Claude unavailable: {data.refresh.aiError ?? "unknown"})</span>}</>
              : "Not refreshed yet. Click Refresh to pull queries from Search Console."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!data.queries.length}
            onClick={() => { window.location.href = `/api/blog-clusters/${clusterId}/gsc-queries/export`; }}>
            <Download className="size-3.5" /> Download
          </Button>
          {canManage && (
            <>
              <span className="inline-flex items-center gap-1">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={refresh} disabled={!!busy}>
                  {busy === "refresh" ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  {busy === "refresh" ? "Refreshing..." : "Refresh GSC queries"}
                </Button>
                <InfoTip label="About Refresh GSC queries" side="bottom">
                  Pulls the last {LOOKBACK_DAYS} days from Search Console for this cluster&apos;s keywords (queries with {MIN_IMPRESSIONS}+ impressions), then Claude suggests where each one goes. Rows a person edited are kept as they are. Can take a minute.
                </InfoTip>
              </span>
              <span className="inline-flex items-center gap-1">
                <Button size="sm" variant="brand" className="gap-1.5" onClick={applyAll} disabled={!!busy || toApply === 0}>
                  {busy === "apply" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-3.5" />}
                  Apply all suggestions{toApply ? ` (${toApply})` : ""}
                </Button>
                <InfoTip label="About Apply all suggestions" side="bottom">
                  Approves every <b>Suggested</b> query routed to a post, the hub page or an existing page, and writes them (with their anchor variants) into each post&apos;s brief. Rejected and ignored queries are skipped.
                </InfoTip>
              </span>
            </>
          )}
        </div>
      </div>

      {/* ----------------------------------------------------------- toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter queries">
          {([
            ["all", "All"], ["review", "To review"], ["accepted", "Approved"], ["needs_post", "Needs a post"],
            ["update_existing", "Update existing page"], ["ignored", "Ignored"],
          ] as [Filter, string][]).filter(([k]) => k !== "needs_post" || counts.needs_post > 0 || filter === k).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
              className={cn("inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                filter === k ? CHIP_ON : CHIP_OFF,
                k === "needs_post" && filter !== k && "border-warning-300 text-warning-700 dark:text-warning-300")}>
              {k === "needs_post" && <AlertTriangle className="size-3" aria-hidden />}
              {label} <span className="tabular-nums opacity-70">{counts[k]}</span>
            </button>
          ))}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <select value={postFilter} onChange={(e) => setPostFilter(e.target.value)} aria-label="Filter by target post"
            className={cn(SELECT, "w-full sm:w-52", postFilter && "border-[#5B45E0]/40 text-[#5B45E0] dark:text-[#7B62FF]")}>
            <option value="">All posts</option>
            <option value="hub">Hub page ({queries.filter((x) => x.action === "hub").length})</option>
            {posts.map((p) => <option key={p.id} value={p.id}>{p.title} ({queries.filter((x) => x.itemId === p.id).length})</option>)}
          </select>
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search queries..." aria-label="Search queries" className="h-8 pl-8 text-[12.5px]" />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------- legend / summary */}
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11.5px] text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-medium text-foreground">Action key:</span>
          {(["assign", "hub", "update_existing", "ignore"] as QueryAction[]).map((a) => (
            <span key={a} className="inline-flex items-center gap-1">
              <ActionPill action={a} />
              <InfoTip label={`What ${QUERY_ACTION_LABEL[a]} means`}>
                <b>{QUERY_ACTION_LABEL[a]}</b>: {ACTION_HELP[a]}
              </InfoTip>
            </span>
          ))}
        </div>
        {selectedRows.length > 0 && canManage ? (
          <div className="flex items-center gap-2 rounded-md border border-[#5B45E0]/30 bg-[#5B45E0]/5 py-0.5 pl-2.5 pr-1 text-foreground" role="region" aria-label="Bulk actions">
            <span className="text-[12px] font-medium tabular-nums">{selectedRows.length} selected</span>
            <Button size="xs" variant="ghost" className="gap-1 text-success-700 hover:bg-success-50 hover:text-success-700 dark:text-success-300" onClick={() => bulk("accepted")} disabled={bulkPending}>
              {bulkPending ? <Loader2 className="animate-spin" /> : <Check />} Approve
            </Button>
            <Button size="xs" variant="ghost" className="gap-1 text-error-strong hover:bg-error-50 hover:text-error-strong" onClick={() => bulk("rejected")} disabled={bulkPending}>
              <X /> Reject
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setSelected(new Set())} disabled={bulkPending}>Clear</Button>
          </div>
        ) : (
          <div className="tabular-nums" aria-live="polite">
            {filtered ? <>Showing <b className="font-semibold text-foreground">{shown.length}</b> of {queries.length}</> : <><b className="font-semibold text-foreground">{queries.length}</b> queries</>}
            {" · "}{COMPACT.format(totals.impressions)} impressions · {COMPACT.format(totals.clicks)} clicks
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- table */}
      <div className="relative">
        {busy === "refresh" && (
          <div className="absolute inset-0 z-20 flex items-start justify-center rounded-xl bg-background/60 pt-16 backdrop-blur-[1px]" role="status">
            <span className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-[12.5px] text-foreground shadow-sm">
              <Loader2 className="size-3.5 animate-spin text-[#5B45E0]" /> Pulling queries from Search Console. This can take a minute.
            </span>
          </div>
        )}
        <div ref={tableRef} className="max-h-[60vh] overflow-auto rounded-xl border border-border">
          <table className="w-full min-w-[760px] table-fixed text-[12.5px]">
            <caption className="sr-only">Search Console queries for this cluster. Select a query to see details.</caption>
            <thead>
              <tr>
                {canManage && (
                  <th scope="col" className={cn(TH, "w-9 pl-3 pr-1")}>
                    <Checkbox aria-label={allShownSelected ? "Deselect all rows in view" : "Select all rows in view"}
                      checked={allShownSelected} indeterminate={shownSelected > 0 && !allShownSelected}
                      disabled={!shown.length} onCheckedChange={(c) => toggleShown(!!c)} />
                  </th>
                )}
                <SortTh label="Query" k="query" sort={sort} onSort={onSort} className={canManage ? "pl-1" : "pl-3"} />
                <SortTh label="Impr." k="impressions" sort={sort} onSort={onSort} align="right" className="w-[72px]" />
                {cols.clicks && (
                  <SortTh label="Clicks" k="clicks" sort={sort} onSort={onSort} align="right" className="w-[92px]"
                    info="Clicks in the last 90 days, with click-through rate (clicks ÷ impressions)." />
                )}
                <SortTh label="Pos." k="position" sort={sort} onSort={onSort} align="right" className="w-[76px]"
                  info={<>Average Google position over the last {LOOKBACK_DAYS} days. <Tone c="text-success-700 dark:text-success-300">Top 3</Tone>, <Tone c="text-info-700 dark:text-info-300">page 1</Tone>, <Tone c="text-warning-700 dark:text-warning-300">page 2</Tone>, grey beyond.</>} />
                {cols.ranks && (
                  <Th className="w-[150px]" info={<>The we360.ai page Google shows for this query, and its position there (#). If that page is outside this cluster and in the top {UPDATE_EXISTING_MAX_POSITION}, the query is routed to <b>Update existing page</b>.</>}>Ranks on</Th>
                )}
                <Th className="w-[134px]" info={<ActionLegend />}>Action</Th>
                <Th className="w-[170px]" info={<>Where the query goes: the cluster post (<b>Use in a post</b>), the hub page, or the page it already ranks on (<b>Update existing page</b>).</>}>Target</Th>
                {cols.useAs && (
                  <Th className="w-[84px]" info={<UsageLegend />}>Use as</Th>
                )}
                {cols.anchors && (
                  <Th className="w-[150px]" info="Alternative link texts other posts and the hub can use when linking to this post, so we don't repeat the exact keyword every time (keeps anchor text natural and avoids over-optimisation).">Anchors</Th>
                )}
                <Th className="w-[118px]" info={<StatusLegend />}>Status</Th>
                {canManage && (
                  <Th className="w-[100px] pr-3 text-right" info={<><b>Approve</b> locks in the suggestion and adds the query (and its anchor variants) to the target post&apos;s brief. <b>Reject</b> skips it. <b>Edit</b> changes the action, post, Use as or anchors.</>}>Review</Th>
                )}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="px-3 py-12">
                    <EmptyState
                      icon={queries.length ? SearchX : Search}
                      title={queries.length ? "No queries match these filters" : "No Search Console queries yet"}
                      body={queries.length ? "Try another filter or search term." : `Refresh to pull queries with ${MIN_IMPRESSIONS}+ impressions for this cluster's keywords.`}
                      action={queries.length
                        ? <Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>
                        : canManage && <Button size="sm" variant="brand" className="gap-1.5" onClick={refresh} disabled={!!busy}><RefreshCw className="size-3.5" /> Refresh GSC queries</Button>}
                    />
                  </td>
                </tr>
              )}
              {shown.map((row) => (
                <QueryRow key={row.id} row={row} projectId={projectId} posts={posts} postTitle={postTitle} hub={data.hub}
                  canManage={canManage} cols={cols} colCount={colCount} locked={bulkPending}
                  selected={selected.has(row.id)} onSelect={(on) => toggleOne(row.id, on)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <NewPostSuggestions rows={data.queries.filter((x) => x.action === "new_post")} projectId={projectId} canManage={canManage} />
    </section>
  );
}

// ------------------------------------------------------------- table pieces

function Tone({ c, children }: { c: string; children: ReactNode }) {
  return <span className={cn("font-medium", c)}>{children}</span>;
}

function Th({ children, info, className }: { children: ReactNode; info?: ReactNode; className?: string }) {
  return (
    <th scope="col" className={cn(TH, className)}>
      <span className={cn("inline-flex items-center gap-1", className?.includes("text-right") && "flex-row-reverse")}>
        {children}
        {info && <InfoTip label={`About the ${typeof children === "string" ? children : ""} column`}>{info}</InfoTip>}
      </span>
    </th>
  );
}

function SortTh({ label, k, sort, onSort, align, className, info }: {
  label: string; k: SortKey; sort: Sort; onSort: (k: SortKey) => void; align?: "right"; className?: string; info?: ReactNode;
}) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn(TH, align === "right" && "text-right", className)}>
      <span className={cn("inline-flex items-center gap-1", align === "right" && "flex-row-reverse")}>
        <button type="button" onClick={() => onSort(k)}
          className={cn("inline-flex items-center gap-1 rounded uppercase hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B45E0]/40",
            align === "right" && "flex-row-reverse", active && "text-foreground")}>
          {label}
          <Icon className={cn("size-3", !active && "opacity-40")} aria-hidden />
        </button>
        {info && <InfoTip label={`About the ${label} column`}>{info}</InfoTip>}
      </span>
    </th>
  );
}

function ActionPill({ action, className }: { action: QueryAction; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 max-w-full items-center rounded-full border px-2 text-[11px] font-medium whitespace-nowrap", ACTION_TONE[action], className)}>
      <span className="truncate">{ACTION_SHORT[action]}</span>
    </span>
  );
}

function ActionLegend() {
  return (
    <div className="space-y-1.5">
      {(["assign", "hub", "update_existing", "ignore"] as QueryAction[]).map((a) => (
        <p key={a}><b>{QUERY_ACTION_LABEL[a]}</b>: {ACTION_HELP[a]}</p>
      ))}
    </div>
  );
}

function UsageLegend() {
  return (
    <div className="space-y-1">
      <p>How to work the query into the page:</p>
      {(Object.keys(QUERY_USAGE_LABEL) as QueryUsage[]).map((u) => <p key={u}><b>{QUERY_USAGE_LABEL[u]}</b>: {USAGE_HELP[u]}.</p>)}
      <p className="text-muted-foreground">Shown in italics when not set yet: questions default to FAQ, everything else to Body.</p>
    </div>
  );
}

function StatusLegend() {
  return (
    <div className="space-y-1">
      <p><b>Suggested</b>: routed by Claude or a rule, not approved yet.</p>
      <p><b>Approved</b>: locked in and written into the post&apos;s brief.</p>
      <p><b>Rejected</b>: skipped.</p>
      <p className="text-muted-foreground">The small icon says who routed it: Claude, a rule (it already ranks elsewhere), keyword matching, or a person.</p>
    </div>
  );
}

function StatusPill({ status, assignedBy }: { status: QueryStatus; assignedBy: AssignedBy | null }) {
  const src = assignedBy ? SOURCE[assignedBy] : null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-flex h-5 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium", STATUS_TONE[status])}>
        <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} aria-hidden />
        {STATUS_LABEL[status]}
      </span>
      {src && (
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex text-muted-foreground" />}>
            <src.Icon className="size-3.5" aria-hidden />
            <span className="sr-only">{src.label}</span>
          </TooltipTrigger>
          <TooltipContent>{src.label}</TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}

function PageLink({ url, className }: { url: string; className?: string }) {
  return (
    <a href={toExternalUrl(url) ?? url} target="_blank" rel="noopener noreferrer" title={url}
      className={cn("inline-flex min-w-0 max-w-full items-center gap-1 text-muted-foreground hover:text-foreground hover:underline", className)}>
      <span className="truncate">{pathOf(url)}</span>
      <ExternalLink className="size-3 shrink-0" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

function IconAction({ label, onClick, disabledReason, className, children }: {
  label: string; onClick: () => void; disabledReason?: string | null; className?: string; children: ReactNode;
}) {
  const disabled = !!disabledReason;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button type="button" aria-label={label} aria-disabled={disabled || undefined}
            onClick={() => { if (!disabled) onClick(); }}
            className={cn("inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B45E0]/40",
              disabled ? "cursor-not-allowed opacity-40" : className)} />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{disabledReason ?? label}</TooltipContent>
    </Tooltip>
  );
}

function EmptyState({ icon: Icon, title, body, action }: { icon: typeof Search; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 text-center">
      <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground"><Icon className="size-4" aria-hidden /></span>
      <div className="text-[13px] font-semibold text-foreground">{title}</div>
      <p className="text-[12px] text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

/** Why a row can't be approved yet, or null when it can. */
function approveBlock(row: Pick<ClusterGscQuery, "action" | "itemId">): string | null {
  if (row.action === "unassigned") return "Choose an action first (Edit).";
  if (row.action === "assign" && !row.itemId) return "Pick a post first (Edit).";
  return null;
}

// ------------------------------------------------------------------ the row

function QueryRow({ row, projectId, posts, postTitle, hub, canManage, cols, colCount, locked, selected, onSelect }: {
  row: ClusterGscQuery;
  projectId: string;
  posts: Post[];
  postTitle: Map<string, string>;
  hub: ClusterGscData["hub"];
  canManage: boolean;
  cols: Cols;
  colCount: number;
  locked: boolean;
  selected: boolean;
  onSelect: (on: boolean) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const busy = pending || locked;
  const detailId = `gsc-q-${row.id}`;
  const use = usageOf(row);
  const hasAnchors = row.action === "assign" || row.action === "hub";
  const blocked = approveBlock(row);

  const commit = (patch: Patch, onDone?: () => void) => start(async () => {
    const r = await updateClusterGscQuery({ project_id: projectId, id: row.id, ...patch })
      .catch(() => ({ ok: false, error: "Could not save - try again." }));
    if (!r.ok) { toast.error(r.error ?? "Could not save."); return; }
    start(() => { onDone?.(); router.refresh(); });
  });

  const startEdit = () => { setOpen(true); setEditing(true); };

  const target = (() => {
    if (row.action === "assign") {
      const title = row.itemId ? postTitle.get(row.itemId) : null;
      if (title) return <span className="block truncate text-foreground" title={title}>{title}</span>;
      return (
        <button type="button" onClick={canManage ? startEdit : undefined} disabled={!canManage}
          className="inline-flex items-center gap-1 rounded text-warning-700 enabled:hover:underline dark:text-warning-300">
          <AlertTriangle className="size-3" aria-hidden /> Pick a post
        </button>
      );
    }
    if (row.action === "hub") return <span className="block truncate text-foreground" title={hub.slug ?? undefined}>Hub page</span>;
    if (row.action === "update_existing") return row.rankingPage ? <PageLink url={row.rankingPage} className="text-foreground" /> : <span className="text-muted-foreground">Ranking page</span>;
    return <span className="text-muted-foreground">—</span>;
  })();

  return (
    <Fragment>
      <tr className={cn("h-10 border-b border-border/60 transition-colors hover:bg-muted/30",
        (open || selected) && "bg-muted/30", row.status === "rejected" && "text-muted-foreground [&_.row-q]:line-through [&_.row-q]:decoration-muted-foreground/50",
        busy && "opacity-70")}>
        {canManage && (
          <td className={cn(TD, "pl-3 pr-1")}>
            <Checkbox checked={selected} onCheckedChange={(c) => onSelect(!!c)} aria-label={`Select "${row.query}"`} />
          </td>
        )}
        <td className={cn(TD, canManage ? "pl-1" : "pl-3")}>
          <Tooltip>
            <TooltipTrigger
              render={
                <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={detailId}
                  className="group/q flex w-full min-w-0 items-center gap-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B45E0]/40" />
              }
            >
              <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform duration-150", open && "rotate-90")} aria-hidden />
              <span className="row-q truncate font-medium text-foreground group-hover/q:text-[#5B45E0] dark:group-hover/q:text-[#7B62FF]">{row.query}</span>
            </TooltipTrigger>
            <TooltipContent side="top" align="start" className="max-w-sm">
              <span>{row.query}{row.reason && <span className="mt-1 block opacity-75">{row.reason}</span>}</span>
            </TooltipContent>
          </Tooltip>
        </td>
        <td className={cn(TD, "text-right font-mono tabular-nums")}>{NUM.format(row.impressions)}</td>
        {cols.clicks && (
          <td className={cn(TD, "text-right font-mono tabular-nums")}>
            {NUM.format(row.clicks)}
            <span className="ml-1 text-[10.5px] text-muted-foreground">{(row.ctr * 100).toFixed(1)}%</span>
          </td>
        )}
        <td className={cn(TD, "text-right")}>
          <span className={cn("inline-flex h-5 min-w-9 items-center justify-center rounded-md px-1.5 font-mono text-[11.5px] tabular-nums", posTone(row.position))}>
            {row.position.toFixed(1)}
          </span>
        </td>
        {cols.ranks && (
          <td className={TD}>
            {row.rankingPage ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <PageLink url={row.rankingPage} />
                {row.rankingPagePosition != null && <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground">#{row.rankingPagePosition}</span>}
              </span>
            ) : <span className="text-muted-foreground">—</span>}
          </td>
        )}
        <td className={TD}><ActionPill action={row.action} /></td>
        <td className={TD}>{target}</td>
        {cols.useAs && (
          <td className={TD}>
            {use ? (
              <span className={cn("text-foreground", use.inferred && "italic text-muted-foreground")}
                title={use.inferred ? `Not set yet: defaults to ${QUERY_USAGE_LABEL[use.usage]}` : USAGE_HELP[use.usage]}>
                {QUERY_USAGE_LABEL[use.usage]}
              </span>
            ) : <span className="text-muted-foreground">—</span>}
          </td>
        )}
        {cols.anchors && (
          <td className={TD}>
            {hasAnchors && row.anchors.length ? (
              <span className="flex min-w-0 items-center gap-1" title={row.anchors.join("\n")}>
                <span className="truncate text-foreground">{row.anchors[0]}</span>
                {row.anchors.length > 1 && <span className="shrink-0 rounded bg-muted px-1 text-[10.5px] text-muted-foreground">+{row.anchors.length - 1}</span>}
              </span>
            ) : <span className="text-muted-foreground">—</span>}
          </td>
        )}
        <td className={TD}><StatusPill status={row.status} assignedBy={row.assignedBy} /></td>
        {canManage && (
          <td className={cn(TD, "pr-3")}>
            <div className="flex items-center justify-end gap-0.5">
              {pending ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin text-muted-foreground" aria-label="Saving" />
              ) : (
                <>
                  {row.status !== "accepted" && (
                    <IconAction label={row.status === "rejected" ? "Restore and approve" : "Approve"} disabledReason={locked ? "Busy..." : blocked}
                      onClick={() => commit({ status: "accepted" })} className="hover:bg-success-50 hover:text-success-700 dark:hover:bg-success-500/15 dark:hover:text-success-300">
                      <Check className="size-3.5" aria-hidden />
                    </IconAction>
                  )}
                  {row.status !== "rejected" && (
                    <IconAction label="Reject" disabledReason={locked ? "Busy..." : null}
                      onClick={() => commit({ status: "rejected" })} className="hover:bg-error-50 hover:text-error-strong dark:hover:bg-error-500/15">
                      <X className="size-3.5" aria-hidden />
                    </IconAction>
                  )}
                  <IconAction label={editing ? "Editing below" : "Edit"} disabledReason={locked ? "Busy..." : null}
                    onClick={startEdit} className={cn("hover:bg-[#5B45E0]/10 hover:text-[#5B45E0] dark:hover:text-[#7B62FF]", editing && "bg-[#5B45E0]/10 text-[#5B45E0]")}>
                    <Pencil className="size-3.5" aria-hidden />
                  </IconAction>
                </>
              )}
            </div>
          </td>
        )}
      </tr>
      {open && (
        <tr id={detailId} className="border-b border-border/60 bg-muted/20">
          <td colSpan={colCount} className="px-3 py-3 sm:pl-10">
            {editing ? (
              <QueryEditor row={row} posts={posts} hub={hub} saving={pending}
                onCancel={() => setEditing(false)}
                onSave={(patch) => commit(patch, () => setEditing(false))} />
            ) : (
              <QueryDetail row={row} postTitle={postTitle} hub={hub} />
            )}
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function DetailItem({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "sm:col-span-2 lg:col-span-3")}>
      <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-[12.5px] text-foreground">{children}</dd>
    </div>
  );
}

function QueryDetail({ row, postTitle, hub }: { row: ClusterGscQuery; postTitle: Map<string, string>; hub: ClusterGscData["hub"] }) {
  const use = usageOf(row);
  const src = row.assignedBy ? SOURCE[row.assignedBy] : null;
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      <DetailItem label="Query" wide>{row.query}</DetailItem>
      {row.reason && <DetailItem label="Why this action" wide><span className="text-muted-foreground">{row.reason}</span></DetailItem>}
      <DetailItem label="Action">
        <span className="flex flex-wrap items-center gap-1.5"><ActionPill action={row.action} /><span className="text-[11.5px] text-muted-foreground">{ACTION_HELP[row.action]}</span></span>
      </DetailItem>
      <DetailItem label="Target">
        {row.action === "assign" ? (row.itemId ? postTitle.get(row.itemId) ?? "Unknown post" : <span className="text-warning-700 dark:text-warning-300">No post chosen yet</span>)
          : row.action === "hub" ? <>Hub page{hub.slug && <span className="text-muted-foreground"> · {hub.slug}</span>}</>
          : row.action === "update_existing" && row.rankingPage ? <PageLink url={row.rankingPage} className="text-foreground" />
          : "—"}
      </DetailItem>
      <DetailItem label="Use as">
        {use ? <>{QUERY_USAGE_LABEL[use.usage]} <span className="text-muted-foreground">- {USAGE_HELP[use.usage]}{use.inferred && " (default, not set yet)"}</span></> : "—"}
      </DetailItem>
      <DetailItem label="Performance">
        <span className="font-mono tabular-nums">{NUM.format(row.impressions)}</span> impr. · <span className="font-mono tabular-nums">{NUM.format(row.clicks)}</span> clicks · {(row.ctr * 100).toFixed(1)}% CTR · pos. {row.position.toFixed(1)}
      </DetailItem>
      <DetailItem label="Ranks on">
        {row.rankingPage ? <span className="flex min-w-0 items-center gap-1.5"><PageLink url={row.rankingPage} />{row.rankingPagePosition != null && <span className="text-muted-foreground">#{row.rankingPagePosition}</span>}</span> : "—"}
      </DetailItem>
      <DetailItem label="Matched keyword">{row.matchedKeyword ?? "—"}</DetailItem>
      {(row.action === "assign" || row.action === "hub") && (
        <DetailItem label="Anchor variants" wide>
          {row.anchors.length ? (
            <span className="flex flex-wrap gap-1">
              {row.anchors.map((a) => <span key={a} className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11.5px]">{a}</span>)}
            </span>
          ) : <span className="text-muted-foreground">None yet</span>}
        </DetailItem>
      )}
      <DetailItem label="Status">
        <span className="flex flex-wrap items-center gap-1.5"><StatusPill status={row.status} assignedBy={null} />{src && <span className="text-[11.5px] text-muted-foreground">{src.label}</span>}</span>
      </DetailItem>
    </dl>
  );
}

function QueryEditor({ row, posts, hub, saving, onCancel, onSave }: {
  row: ClusterGscQuery; posts: Post[]; hub: ClusterGscData["hub"]; saving: boolean;
  onCancel: () => void; onSave: (patch: Patch) => void;
}) {
  const [action, setAction] = useState<QueryAction>(row.action);
  const [itemId, setItemId] = useState(row.itemId ?? "");
  const [usage, setUsage] = useState<QueryUsage>(row.usage ?? inferUsage(row.query));
  const [anchors, setAnchors] = useState(row.anchors.join("; "));

  const usesPost = action === "assign";
  const usesUsage = USED.has(action);
  const usesAnchors = action === "assign" || action === "hub";
  const parsed = parseAnchors(anchors);
  const missingPost = usesPost && !itemId;
  const fieldId = (f: string) => `gsc-edit-${row.id}-${f}`;

  const submit = () => {
    if (missingPost || saving) return;
    const patch: Patch = { action };
    if (usesPost) patch.item_id = itemId;
    if (usesUsage) patch.usage = usage;
    if (usesAnchors) patch.anchors = parsed.slice(0, 5);
    onSave(patch);
  };

  return (
    <form className="space-y-3" aria-label={`Edit "${row.query}"`}
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onCancel(); } }}>
      <div className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
        <span className="font-semibold text-foreground">{row.query}</span>
        {row.reason && <span className="text-[11.5px] text-muted-foreground">{row.reason}</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[180px_minmax(200px,1fr)_auto_minmax(220px,1.2fr)]">
        <div className="space-y-1">
          <label htmlFor={fieldId("action")} className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            Action <InfoTip label="About Action"><ActionLegend /></InfoTip>
          </label>
          <select id={fieldId("action")} className={SELECT} value={action} autoFocus disabled={saving}
            onChange={(e) => setAction(e.target.value as QueryAction)}>
            {(Object.keys(QUERY_ACTION_LABEL) as QueryAction[]).map((a) => <option key={a} value={a}>{QUERY_ACTION_LABEL[a]}</option>)}
          </select>
          <p className="text-[11px] leading-snug text-muted-foreground">{ACTION_HELP[action]}</p>
        </div>

        <div className="space-y-1">
          <label htmlFor={usesPost ? fieldId("post") : undefined} className="block text-[11px] font-semibold text-muted-foreground">Target</label>
          {usesPost ? (
            <>
              <select id={fieldId("post")} className={cn(SELECT, missingPost && "border-warning-400")} value={itemId} disabled={saving}
                onChange={(e) => setItemId(e.target.value)} aria-invalid={missingPost || undefined}>
                <option value="">Pick a post...</option>
                {posts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              {missingPost && <p className="text-[11px] text-warning-700 dark:text-warning-300">Choose which post should use this query.</p>}
            </>
          ) : (
            <div className="flex h-8 items-center text-[12.5px] text-foreground">
              {action === "hub" ? <>Hub page{hub.slug && <span className="ml-1 truncate text-muted-foreground">· {hub.slug}</span>}</>
                : action === "update_existing" ? (row.rankingPage ? <PageLink url={row.rankingPage} className="text-foreground" /> : "The page it ranks on")
                : <span className="text-muted-foreground">—</span>}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <span id={fieldId("usage")} className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            Use as <InfoTip label="About Use as"><UsageLegend /></InfoTip>
          </span>
          {usesUsage ? (
            <div role="radiogroup" aria-labelledby={fieldId("usage")} className="inline-flex h-8 rounded-md border border-border bg-background p-0.5">
              {(Object.keys(QUERY_USAGE_LABEL) as QueryUsage[]).map((u) => (
                <button key={u} type="button" role="radio" aria-checked={usage === u} disabled={saving} onClick={() => setUsage(u)}
                  title={USAGE_HELP[u]}
                  className={cn("rounded px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B45E0]/40",
                    usage === u ? "bg-[#5B45E0]/10 text-[#5B45E0] dark:text-[#7B62FF]" : "text-muted-foreground hover:text-foreground")}>
                  {QUERY_USAGE_LABEL[u]}
                </button>
              ))}
            </div>
          ) : <div className="flex h-8 items-center text-muted-foreground">—</div>}
        </div>

        <div className="space-y-1">
          <label htmlFor={usesAnchors ? fieldId("anchors") : undefined} className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            Anchor variants <InfoTip label="About anchor variants">Alternative link texts other posts and the hub can use when linking to this post, so we don&apos;t always repeat the exact keyword. Separate with semicolons, up to 5.</InfoTip>
          </label>
          {usesAnchors ? (
            <>
              <Input id={fieldId("anchors")} value={anchors} disabled={saving} onChange={(e) => setAnchors(e.target.value)}
                placeholder="variant 1; variant 2" className="h-8 text-[12.5px]" aria-describedby={fieldId("anchors-hint")} />
              <p id={fieldId("anchors-hint")} className={cn("text-[11px] text-muted-foreground", parsed.length > 5 && "text-warning-700 dark:text-warning-300")}>
                {parsed.length > 5 ? `Only the first 5 of ${parsed.length} will be kept.` : `${parsed.length} of 5 · separate with ;`}
              </p>
            </>
          ) : <div className="flex h-8 items-center text-[12px] text-muted-foreground">Only for posts and the hub page.</div>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" variant="brand" className="gap-1.5" disabled={saving || missingPost}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <span className="text-[11px] text-muted-foreground">Saving marks the row as edited by a person, so refreshes keep it. {row.status === "accepted" && "It stays approved and the post brief updates."}</span>
      </div>
    </form>
  );
}

// ------------------------------------------------------ new-page suggestions

function NewPostSuggestions({ rows, projectId, canManage }: { rows: ClusterGscQuery[]; projectId: string; canManage: boolean }) {
  const [sort, setSort] = useState<Sort>({ key: "impressions", dir: "desc" });
  const [showDismissed, setShowDismissed] = useState(false);
  const active = rows.filter((x) => x.status !== "rejected");
  const dismissed = rows.length - active.length;
  const shown = sortRows(showDismissed ? rows : active, sort);
  const onSort = (k: SortKey) => setSort((s) => nextSort(s, k));
  const colCount = 4 + (canManage ? 1 : 0);

  return (
    <div className="space-y-2 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-0.5">
          <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-foreground">
            New page suggestions
            <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground">{active.length}</span>
            <InfoTip label="About new page suggestions">
              Queries with {NEW_POST_MIN_IMPRESSIONS}+ impressions that no post in this cluster covers. <b>Add to cluster</b> creates a planned post for it (approved, used in the body, with the query as its first anchor). <b>Dismiss</b> hides it; you can restore it later.
            </InfoTip>
          </h3>
          <p className="text-[12px] text-muted-foreground">
            Queries with {NEW_POST_MIN_IMPRESSIONS}+ impressions that no post in this cluster covers well. Add one to the cluster in a click, then fill its details with Add details on the post.
          </p>
        </div>
        {dismissed > 0 && (
          <button type="button" onClick={() => setShowDismissed((s) => !s)} aria-pressed={showDismissed}
            className={cn("rounded-md border px-2.5 py-1 text-xs font-medium transition-colors", showDismissed ? CHIP_ON : CHIP_OFF)}>
            {showDismissed ? "Hide dismissed" : `Show dismissed (${dismissed})`}
          </button>
        )}
      </div>
      <div className="max-h-[50vh] overflow-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] table-fixed text-[12.5px]">
          <caption className="sr-only">New page suggestions</caption>
          <thead>
            <tr>
              <SortTh label="Query" k="query" sort={sort} onSort={onSort} className="w-[30%] pl-3" />
              <SortTh label="Impr." k="impressions" sort={sort} onSort={onSort} align="right" className="w-[80px]" />
              <SortTh label="Pos." k="position" sort={sort} onSort={onSort} align="right" className="w-[76px]" />
              <Th info="Why Claude thinks this deserves its own page, and where it ranks today.">Why</Th>
              {canManage && <th scope="col" className={cn(TH, "w-[210px] pr-3")}><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={colCount} className="px-3 py-8">
                <EmptyState icon={Plus} title="No new-page suggestions right now" body={`Queries with ${NEW_POST_MIN_IMPRESSIONS}+ impressions that no post covers will show up here after a refresh.`} />
              </td></tr>
            )}
            {shown.map((row) => <NewPostRow key={row.id} row={row} projectId={projectId} canManage={canManage} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NewPostRow({ row, projectId, canManage }: { row: ClusterGscQuery; projectId: string; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "add" | "status">(null);
  const [, start] = useTransition();
  const isDismissed = row.status === "rejected";

  const add = async () => {
    setBusy("add");
    try {
      const r = await createPostFromGscQuery({ project_id: projectId, query_id: row.id });
      if (!r.ok) { toast.error(r.error ?? "Could not add the post."); return; }
      toast.success(`Added "${row.query}" to the cluster - fill its details with Add details.`);
      start(() => router.refresh());
    } catch { toast.error("Could not add the post."); }
    finally { setBusy(null); }
  };

  const setStatus = async (status: "rejected" | "suggested") => {
    setBusy("status");
    try {
      const r = await updateClusterGscQuery({ project_id: projectId, id: row.id, status });
      if (!r.ok) { toast.error(r.error ?? "Could not save."); return; }
      start(() => router.refresh());
    } catch { toast.error("Could not save - try again."); }
    finally { setBusy(null); }
  };

  return (
    <tr className={cn("h-10 border-b border-border/60 hover:bg-muted/30", isDismissed && "text-muted-foreground")}>
      <td className={cn(TD, "pl-3")}>
        <span className={cn("block truncate font-medium text-foreground", isDismissed && "text-muted-foreground line-through")} title={row.query}>{row.query}</span>
      </td>
      <td className={cn(TD, "text-right font-mono tabular-nums")}>{NUM.format(row.impressions)}</td>
      <td className={cn(TD, "text-right")}>
        <span className={cn("inline-flex h-5 min-w-9 items-center justify-center rounded-md px-1.5 font-mono text-[11.5px] tabular-nums", posTone(row.position))}>{row.position.toFixed(1)}</span>
      </td>
      <td className={TD}>
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-muted-foreground" title={row.reason ?? undefined}>{row.reason ?? "—"}</span>
          {row.rankingPage && (
            <span className="hidden max-w-[40%] shrink-0 items-center gap-1 text-[11px] lg:inline-flex">
              <PageLink url={row.rankingPage} />
              {row.rankingPagePosition != null && <span className="font-mono text-muted-foreground">#{row.rankingPagePosition}</span>}
            </span>
          )}
        </span>
      </td>
      {canManage && (
        <td className={cn(TD, "pr-3")}>
          <div className="flex justify-end gap-1.5">
            {isDismissed ? (
              <Button size="sm" variant="ghost" className="gap-1" onClick={() => setStatus("suggested")} disabled={!!busy}>
                {busy === "status" ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />} Restore
              </Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={() => setStatus("rejected")} disabled={!!busy}>
                  {busy === "status" && <Loader2 className="size-3 animate-spin" />} Dismiss
                </Button>
                <Button size="sm" variant="brand" className="gap-1" onClick={add} disabled={!!busy}>
                  {busy === "add" ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />} Add to cluster
                </Button>
              </>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}

// ------------------------------------------------------------------ hub page

function HubEditor({ projectId, clusterId, hub, canManage }: {
  projectId: string; clusterId: string; hub: ClusterGscData["hub"]; canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [slug, setSlug] = useState(hub.slug ?? "");
  const [keyword, setKeyword] = useState(hub.keyword ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const r = await setClusterHub({ project_id: projectId, cluster_id: clusterId, hub_slug: slug.trim() || null, hub_keyword: keyword.trim() || null });
      if (!r.ok) { toast.error(r.error ?? "Could not save the hub page."); return; }
      toast.success("Hub page saved.");
      setEditing(false);
      router.refresh();
    } catch { toast.error("Could not save the hub page."); }
    finally { setSaving(false); }
  };

  const help = (
    <InfoTip label="About the hub page">
      The cluster&apos;s pillar page. Broad head-term queries are routed here (<b>Use on hub page</b>), and every post in the cluster links up to it. The hub keyword is the head term it should rank for.
    </InfoTip>
  );

  if (editing) {
    return (
      <form className="flex flex-wrap items-center gap-2 pt-1" onSubmit={(e) => { e.preventDefault(); void save(); }}
        onKeyDown={(e) => { if (e.key === "Escape") setEditing(false); }}>
        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-foreground">Hub page {help}</span>
        <Input value={slug} onChange={(e) => setSlug(e.target.value)} aria-label="Hub page URL or slug" placeholder="URL or slug, e.g. we360.ai/employee-monitoring-software" className="h-7 w-72 text-[12px]" />
        <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} aria-label="Hub keyword" placeholder="Hub keyword" className="h-7 w-48 text-[12px]" />
        <Button type="submit" size="sm" variant="brand" className="h-7 text-[12px]" disabled={saving}>
          {saving && <Loader2 className="size-3 animate-spin" />} Save
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-[12px]" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
      </form>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[12px]">
      <span className="inline-flex items-center gap-1 font-medium text-foreground">Hub page {help}:</span>
      <span className={cn(hub.slug || hub.title ? "text-foreground" : "text-muted-foreground")}>{hub.slug || hub.title || "not set"}</span>
      <span className="text-muted-foreground">· keyword:</span>
      <span className={cn(hub.keyword ? "text-foreground" : "text-muted-foreground")}>{hub.keyword || "not set"}</span>
      {canManage && (
        <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 rounded px-1 text-[#5B45E0] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B45E0]/40 dark:text-[#7B62FF]">
          <Pencil className="size-3" aria-hidden /> Edit
        </button>
      )}
    </div>
  );
}
