"use client";

// Blog Clusters - GSC queries section on the cluster page (GC-2..GC-6): the hub
// page, Refresh / Apply all / Download, the queries table (where each query
// goes, how to use it, link text) and the new-post suggestions table.
//
// Rows are read-only; Edit opens a form in the row's detail panel. Approve and
// Reject (single and bulk) confirm in a modal that says, in plain words, what
// will happen. Columns are shown or hidden from the table's own width (not the
// viewport), so the table never scrolls sideways on a desktop and the detail
// row's colSpan stays exact.

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
  LOOKBACK_DAYS, MIN_IMPRESSIONS, NEW_POST_MIN_IMPRESSIONS, UPDATE_EXISTING_MAX_POSITION,
  type AssignedBy, type ClusterGscData, type ClusterGscQuery, type QueryAction, type QueryStatus, type QueryUsage,
} from "@/lib/types/cluster-gsc";
import { InfoTip } from "./info-tip";
import { ConfirmDialog } from "./confirm-dialog";

type Patch = Omit<Parameters<typeof updateClusterGscQuery>[0], "project_id" | "id">;
type Post = { id: string; title: string };
type Hub = ClusterGscData["hub"];
type Filter = "all" | "review" | "accepted" | "needs_post" | "update_existing" | "ignored";
type SortKey = "query" | "impressions" | "clicks" | "position";
type Sort = { key: SortKey; dir: "asc" | "desc" };
type Cols = { clicks: boolean; useAs: boolean; ranks: boolean; anchors: boolean };

// ---------------------------------------------------------------- vocabulary
// Plain words: short labels in the table, fuller wording in tips and details.

const ACTION_SHORT: Record<QueryAction, string> = {
  unassigned: "Not decided",
  assign: "Add to a post",
  hub: "Hub page",
  update_existing: "Improve existing",
  new_post: "New post",
  ignore: "Skip",
};

const ACTION_FULL: Record<QueryAction, string> = {
  unassigned: "Not decided yet",
  assign: "Add to a post",
  hub: "Add to the hub page",
  update_existing: "Improve existing page",
  new_post: "Write a new post",
  ignore: "Skip",
};

const ACTION_HELP: Record<QueryAction, string> = {
  unassigned: "Nobody has decided what to do with this search yet. Click Edit to choose.",
  assign: "Add this search to one of this cluster's posts.",
  hub: "A broad search that belongs on the cluster's main (hub) page, not in a single post.",
  update_existing: `We already show up in Google's top ${UPDATE_EXISTING_MAX_POSITION} for this search with a page outside this cluster. Improve that page instead of writing a new one, so two of our pages don't compete for the same search.`,
  new_post: `Searched ${NEW_POST_MIN_IMPRESSIONS}+ times and none of our posts covers it. Listed under New page suggestions.`,
  ignore: "Not relevant to this cluster. Nothing gets added anywhere.",
};

const ACTION_TONE: Record<QueryAction, string> = {
  assign: "border-[#5B45E0]/30 bg-[#5B45E0]/10 text-[#5B45E0] dark:text-[#9C88FF]",
  hub: "border-info-200 bg-info-50 text-info-700 dark:border-info-500/30 dark:bg-info-500/15 dark:text-info-300",
  update_existing: "border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/15 dark:text-warning-300",
  new_post: "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/15 dark:text-success-300",
  ignore: "border-border bg-muted/60 text-muted-foreground",
  unassigned: "border-dashed border-border text-muted-foreground",
};

/** Edit-form order: the common choices first. */
const ACTION_ORDER: QueryAction[] = ["assign", "hub", "update_existing", "ignore", "new_post", "unassigned"];

const USAGE_SHORT: Record<QueryUsage, string> = { h2: "Heading", faq: "FAQ", body: "Paragraph" };
const USAGE_FULL: Record<QueryUsage, string> = { h2: "Section heading", faq: "FAQ question", body: "Mention in a paragraph" };
const USAGE_AS: Record<QueryUsage, string> = { h2: "as a section heading", faq: "as an FAQ question", body: "as a mention in a paragraph" };

const STATUS_LABEL: Record<QueryStatus, string> = { suggested: "To review", accepted: "Approved", rejected: "Rejected" };
const STATUS_TONE: Record<QueryStatus, string> = {
  suggested: "border-border bg-background text-foreground",
  accepted: "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/15 dark:text-success-300",
  rejected: "border-border bg-muted/60 text-muted-foreground",
};
const STATUS_DOT: Record<QueryStatus, string> = { suggested: "bg-info-500", accepted: "bg-success-500", rejected: "bg-muted-foreground/50" };

const SOURCE: Record<AssignedBy, { short: string; label: string; Icon: typeof Sparkles }> = {
  ai: { short: "Claude (AI)", label: "Suggested by Claude (AI).", Icon: Sparkles },
  rule: { short: "Automatic rule", label: "Routed automatically from the page it already ranks on in Google (open the row for the exact reason).", Icon: GitBranch },
  keyword: { short: "Keyword match", label: "Matched by keyword rules (Claude was unavailable at refresh).", Icon: Hash },
  manual: { short: "A person", label: "Edited by a person. Refreshes won't overwrite it.", Icon: UserRound },
};

/** Actions whose query is actually written somewhere, so "Add as" applies. */
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

/** The name of the page a query already ranks on: its title when we know it, else the path. */
function pageTitleOf(row: Pick<ClusterGscQuery, "rankingPage" | "rankingPageInfo">): string {
  const info = row.rankingPageInfo;
  if (info?.source === "homepage") return info.title || "Homepage";
  return info?.title || pathOf(row.rankingPage);
}

/** Where the ranking page sits in Google for this query (falls back to the query's average). */
function rankOf(row: Pick<ClusterGscQuery, "rankingPagePosition" | "position">): number {
  return row.rankingPagePosition ?? Math.round(row.position);
}

function hubNameOf(hub: Hub): string {
  return hub.title || hub.slug || "the hub page";
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
  // Text and rank read best ascending first; volumes descending.
  return { key, dir: key === "query" || key === "position" ? "asc" : "desc" };
}

function parseAnchors(s: string): string[] {
  return s.split(/[;,\n]/).map((x) => x.trim().slice(0, 120)).filter(Boolean);
}

/** Why a row can't be approved yet, or null when it can. */
function approveBlock(row: Pick<ClusterGscQuery, "action" | "itemId">): string | null {
  if (row.action === "unassigned") return "Decide what to do first (Edit).";
  if (row.action === "assign" && !row.itemId) return "Pick a post first (Edit).";
  return null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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

// ------------------------------------------------------------ plain sentences

function Quote({ children }: { children: ReactNode }) {
  return <span className="font-medium text-foreground">&ldquo;{children}&rdquo;</span>;
}

/** One plain sentence: what to do with this query. */
function WhatToDo({ row, postTitle, hub }: { row: ClusterGscQuery; postTitle: Map<string, string>; hub: Hub }) {
  const use = usageOf(row);
  const as = use ? USAGE_AS[use.usage] : "";
  const post = row.itemId ? postTitle.get(row.itemId) : undefined;
  const rank = rankOf(row);
  const ranksOnPost = !!post && row.rankingPageInfo?.source === "cluster" && row.rankingPageInfo.title === post;

  if (row.action === "assign") {
    if (!post) return <>Pick which post in this cluster should use <Quote>{row.query}</Quote> (click Edit).</>;
    return (
      <>
        Add <Quote>{row.query}</Quote> to <Quote>{post}</Quote> {as}.
        {row.rankingPage && (ranksOnPost
          ? <> That post already shows up <b>#{rank}</b> on Google for it.</>
          : <> Right now Google shows our page <Quote>{pageTitleOf(row)}</Quote> at <b>#{rank}</b> for it.</>)}
      </>
    );
  }
  if (row.action === "hub") {
    return <>Add <Quote>{row.query}</Quote> to the hub page <Quote>{hubNameOf(hub)}</Quote> {as}. Posts in this cluster will also use it as link text when they link up to the hub.</>;
  }
  if (row.action === "update_existing") {
    return (
      <>
        Improve our existing page <Quote>{pageTitleOf(row)}</Quote> with <Quote>{row.query}</Quote> (add it {as}).
        {" "}It already shows up <b>#{rank}</b> on Google, so we improve it instead of writing a new page that would compete with it.
      </>
    );
  }
  if (row.action === "ignore") return <>Skip <Quote>{row.query}</Quote>: it isn&apos;t relevant to this cluster. Nothing gets added anywhere.</>;
  if (row.action === "new_post") return <>Write a new post for <Quote>{row.query}</Quote>.</>;
  return <>Nobody has decided what to do with <Quote>{row.query}</Quote> yet. Click Edit to choose.</>;
}

/** Plain-words explanation of what approving this one query does. */
function approveText({ row, postTitle, hub }: { row: ClusterGscQuery; postTitle: Map<string, string>; hub: Hub }) {
  const use = usageOf(row);
  const as = use ? USAGE_AS[use.usage] : "";
  const post = row.itemId ? postTitle.get(row.itemId) : undefined;

  if (row.action === "assign") {
    return {
      summary: <>We&apos;ll add <Quote>{row.query}</Quote> to the brief of <Quote>{post ?? "the chosen post"}</Quote> {as}. Writers will see it in Copy details and in the export.</>,
      details: row.anchors.length
        ? <p>Other posts and the hub will be able to link to this post using: <AnchorList anchors={row.anchors} /></p>
        : null,
    };
  }
  if (row.action === "hub") {
    return {
      summary: <>We&apos;ll add <Quote>{row.query}</Quote> to the plan for the hub page <Quote>{hubNameOf(hub)}</Quote> {as}.</>,
      details: <p>Posts in this cluster will use <Quote>{row.anchors[0] || row.query}</Quote> as link text when they link up to the hub page.</p>,
    };
  }
  if (row.action === "update_existing") {
    return {
      summary: <>We&apos;ll mark <Quote>{row.query}</Quote> as approved for <Quote>{pageTitleOf(row)}</Quote>. Nothing in this cluster&apos;s posts changes: it&apos;s a to-do to add it to that page {as}.</>,
      details: row.rankingPage ? <PageFacts row={row} /> : null,
    };
  }
  if (row.action === "ignore") {
    return { summary: <>We&apos;ll confirm that <Quote>{row.query}</Quote> is skipped. Nothing gets added anywhere.</>, details: null };
  }
  return { summary: <>We&apos;ll mark <Quote>{row.query}</Quote> as approved.</>, details: null };
}

function AnchorList({ anchors }: { anchors: string[] }) {
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {anchors.map((a) => <span key={a} className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11.5px] text-foreground">{a}</span>)}
    </span>
  );
}

// ------------------------------------------------------------- page naming

/** Link to the page a query ranks on, named by its title. */
function PageLink({ row, className }: { row: Pick<ClusterGscQuery, "rankingPage" | "rankingPageInfo">; className?: string }) {
  if (!row.rankingPage) return <span className="text-muted-foreground">—</span>;
  const info = row.rankingPageInfo;
  const name = pageTitleOf(row);
  const tip = [
    info?.source === "url" ? `${name} (title from URL)` : name,
    info?.primaryKeyword && `Keyword: ${info.primaryKeyword}`,
    info?.clusterName && `Cluster: ${info.clusterName}`,
    row.rankingPage,
  ].filter(Boolean).join("\n");
  return (
    <a href={toExternalUrl(row.rankingPage) ?? row.rankingPage} target="_blank" rel="noopener noreferrer" title={tip}
      className={cn("inline-flex min-w-0 max-w-full items-center gap-1 hover:underline", className ?? "text-muted-foreground hover:text-foreground")}>
      <span className="truncate">{name}</span>
      <ExternalLink className="size-3 shrink-0 opacity-70" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/** Page title + link, keyword, cluster and URL - for details and modals. */
function PageFacts({ row }: { row: ClusterGscQuery }) {
  const info = row.rankingPageInfo;
  if (!row.rankingPage) return null;
  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-md border border-border bg-muted/30 px-2.5 py-2 text-[12px]">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
        <PageLink row={row} className="font-medium text-foreground" />
        {info?.source === "url" && <span className="text-muted-foreground">(title from URL)</span>}
        <span className="text-muted-foreground">· shows up #{rankOf(row)} on Google</span>
      </div>
      {(info?.primaryKeyword || info?.clusterName) && (
        <div className="mt-0.5 text-muted-foreground">
          {info?.primaryKeyword && <>Keyword: <span className="text-foreground">{info.primaryKeyword}</span></>}
          {info?.primaryKeyword && info?.clusterName && " · "}
          {info?.clusterName && <>Cluster: <span className="text-foreground">{info.clusterName}</span></>}
        </div>
      )}
      <div className="mt-0.5 truncate text-[11px] text-muted-foreground" title={row.rankingPage}>{row.rankingPage}</div>
    </div>
  );
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
  const [bulkConfirm, setBulkConfirm] = useState<null | "accepted" | "rejected">(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [postFilter, setPostFilter] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "impressions", dir: "desc" });
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [tableRef, width] = useWidth();

  // Fixed columns total ~930px without Link text; Query keeps the rest and stays the widest column.
  const cols: Cols = { clicks: width >= 990, useAs: width >= 990, ranks: width >= 1120, anchors: width >= 1340 };
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

  // What a bulk action would touch, and what it would skip (and why).
  const plan = {
    approve: selectedRows.filter((x) => x.status !== "accepted" && approveBlock(x) === null),
    reject: selectedRows.filter((x) => x.status !== "rejected"),
    restore: selectedRows.filter((x) => x.status === "rejected"),
  };

  const runBulk = (rows: ClusterGscQuery[], status: QueryStatus, verb: string) => {
    if (!rows.length) return;
    startBulk(async () => {
      let failed = 0;
      // One at a time: each update rebuilds the cluster's post plans on the server.
      for (const x of rows) {
        const r = await updateClusterGscQuery({ project_id: projectId, id: x.id, status }).catch(() => ({ ok: false }));
        if (!r.ok) failed++;
      }
      const done = rows.length - failed;
      if (failed) toast.error(`${verb} ${done}, ${failed} failed - try again.`);
      else toast.success(`${verb} ${plural(done, "query", "queries")}.`);
      startBulk(() => { setBulkConfirm(null); setSelected(new Set()); router.refresh(); });
    });
  };

  const refresh = async () => {
    setBusy("refresh");
    try {
      const r = await refreshClusterGsc({ project_id: projectId, cluster_id: clusterId });
      if (!r.ok) { toast.error(r.error ?? "Refresh failed."); return; }
      toast.success(`${r.fetched} searches with ${MIN_IMPRESSIONS}+ impressions (${r.added} new) · ${r.assigned} sorted · from ${r.rawRows ?? 0} Search Console rows`);
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
      toast.success(`Approved ${r.accepted} suggestions and updated ${r.posts} post briefs.`);
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
            Searches where we360.ai already shows up in Google (last {LOOKBACK_DAYS} days, seen {MIN_IMPRESSIONS}+ times) that match this cluster&apos;s keywords, and what to do with each one.
          </p>
          <HubEditor projectId={projectId} clusterId={clusterId} hub={data.hub} canManage={canManage} />
          <p className="text-[11.5px] text-muted-foreground">
            {data.refresh
              ? <>Last refreshed {formatDistanceToNow(new Date(data.refresh.at), { addSuffix: true })} · {NUM.format(data.refresh.fetched)} searches
                  {data.refresh.keywords != null && ` (checked ${data.refresh.keywords} keywords, ${NUM.format(data.refresh.rawRows ?? 0)} Search Console rows)`}
                  {data.refresh.ai === "ok" && " · sorted by Claude"}
                  {data.refresh.ai === "fallback" && <span className="text-warning-strong"> · sorted by keyword matching (Claude unavailable: {data.refresh.aiError ?? "unknown"})</span>}</>
              : "Not refreshed yet. Click Refresh to pull searches from Search Console."}
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
                  Pulls the last {LOOKBACK_DAYS} days of Google searches for this cluster&apos;s keywords (anything we showed up for {MIN_IMPRESSIONS}+ times), then Claude suggests what to do with each one. Rows a person edited stay as they are. Can take a minute.
                </InfoTip>
              </span>
              <span className="inline-flex items-center gap-1">
                <Button size="sm" variant="brand" className="gap-1.5" onClick={applyAll} disabled={!!busy || toApply === 0}>
                  {busy === "apply" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-3.5" />}
                  Apply all suggestions{toApply ? ` (${toApply})` : ""}
                </Button>
                <InfoTip label="About Apply all suggestions" side="bottom">
                  Approves every row that is still <b>To review</b> and has a decision (add to a post, hub page or improve an existing page), and adds them, with their link text, to each post&apos;s brief. Rejected and skipped rows are left alone.
                </InfoTip>
              </span>
            </>
          )}
        </div>
      </div>

      {/* ----------------------------------------------------------- toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter searches">
          {([
            ["all", "All"], ["review", "To review"], ["accepted", "Approved"], ["needs_post", "Needs a post"],
            ["update_existing", "Improve existing page"], ["ignored", "Skipped"],
          ] as [Filter, string][]).filter(([k]) => k !== "needs_post" || counts.needs_post > 0 || filter === k).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
              title={k === "ignored" ? "Rows marked Skip and rows that were rejected. Rejected rows can be restored here." : undefined}
              className={cn("inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                filter === k ? CHIP_ON : CHIP_OFF,
                k === "needs_post" && filter !== k && "border-warning-300 text-warning-700 dark:text-warning-300")}>
              {k === "needs_post" && <AlertTriangle className="size-3" aria-hidden />}
              {label} <span className="tabular-nums opacity-70">{counts[k]}</span>
            </button>
          ))}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <select value={postFilter} onChange={(e) => setPostFilter(e.target.value)} aria-label="Filter by post"
            className={cn(SELECT, "w-full sm:w-52", postFilter && "border-[#5B45E0]/40 text-[#5B45E0] dark:text-[#7B62FF]")}>
            <option value="">All posts</option>
            <option value="hub">Hub page ({queries.filter((x) => x.action === "hub").length})</option>
            {posts.map((p) => <option key={p.id} value={p.id}>{p.title} ({queries.filter((x) => x.itemId === p.id).length})</option>)}
          </select>
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..." aria-label="Search the list" className="h-8 pl-8 text-[12.5px]" />
          </div>
        </div>
      </div>

      {/* ------------------------------------------------- legend / summary */}
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11.5px] text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-medium text-foreground">What to do:</span>
          {(["assign", "hub", "update_existing", "ignore"] as QueryAction[]).map((a) => (
            <span key={a} className="inline-flex items-center gap-1">
              <ActionPill action={a} />
              <InfoTip label={`What ${ACTION_FULL[a]} means`}>
                <b>{ACTION_FULL[a]}</b>: {ACTION_HELP[a]}
              </InfoTip>
            </span>
          ))}
        </div>
        {selectedRows.length > 0 && canManage ? (
          <div className="flex items-center gap-1.5 rounded-md border border-[#5B45E0]/30 bg-[#5B45E0]/5 py-0.5 pl-2.5 pr-1 text-foreground" role="region" aria-label="Bulk actions">
            <span className="mr-1 text-[12px] font-medium tabular-nums">{selectedRows.length} selected</span>
            <Button size="xs" variant="ghost" className="gap-1 text-success-700 hover:bg-success-50 hover:text-success-700 dark:text-success-300" onClick={() => setBulkConfirm("accepted")} disabled={bulkPending}>
              <Check /> Approve
            </Button>
            <Button size="xs" variant="ghost" className="gap-1 text-error-strong hover:bg-error-50 hover:text-error-strong" onClick={() => setBulkConfirm("rejected")} disabled={bulkPending}>
              <X /> Reject
            </Button>
            {plan.restore.length > 0 && (
              <Button size="xs" variant="ghost" className="gap-1" onClick={() => runBulk(plan.restore, "suggested", "Restored")} disabled={bulkPending}>
                {bulkPending && !bulkConfirm ? <Loader2 className="animate-spin" /> : <RotateCcw />} Restore {plan.restore.length}
              </Button>
            )}
            <Button size="xs" variant="ghost" onClick={() => setSelected(new Set())} disabled={bulkPending}>Clear</Button>
          </div>
        ) : (
          <div className="tabular-nums" aria-live="polite">
            {filtered ? <>Showing <b className="font-semibold text-foreground">{shown.length}</b> of {queries.length}</> : <><b className="font-semibold text-foreground">{queries.length}</b> searches</>}
            {" · "}{COMPACT.format(totals.impressions)} impressions · {COMPACT.format(totals.clicks)} clicks
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- table */}
      <div className="relative">
        {busy === "refresh" && (
          <div className="absolute inset-0 z-20 flex items-start justify-center rounded-xl bg-background/60 pt-16 backdrop-blur-[1px]" role="status">
            <span className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-[12.5px] text-foreground shadow-sm">
              <Loader2 className="size-3.5 animate-spin text-[#5B45E0]" /> Pulling searches from Search Console. This can take a minute.
            </span>
          </div>
        )}
        <div ref={tableRef} className="max-h-[60vh] overflow-auto rounded-xl border border-border">
          <table className="w-full min-w-[760px] table-fixed text-[12.5px]">
            <caption className="sr-only">Google searches for this cluster. Select a search to see details.</caption>
            <thead>
              <tr>
                {canManage && (
                  <th scope="col" className={cn(TH, "w-9 pl-3 pr-1")}>
                    <Checkbox aria-label={allShownSelected ? "Deselect all rows in view" : "Select all rows in view"}
                      checked={allShownSelected} indeterminate={shownSelected > 0 && !allShownSelected}
                      disabled={!shown.length} onCheckedChange={(c) => toggleShown(!!c)} />
                  </th>
                )}
                <SortTh label="Search term" k="query" sort={sort} onSort={onSort} className={canManage ? "pl-1" : "pl-3"}
                  info="What people typed into Google. Click a row to see what to do with it." />
                <SortTh label="Impr." k="impressions" sort={sort} onSort={onSort} align="right" className="w-[80px]"
                  info={<><b>Impressions</b>: how many times we showed up in Google for this search (last {LOOKBACK_DAYS} days).</>} />
                {cols.clicks && (
                  <SortTh label="Clicks" k="clicks" sort={sort} onSort={onSort} align="right" className="w-[86px]"
                    info="How many people clicked through to us from Google, and the click rate (the share of people who saw us and clicked)." />
                )}
                <SortTh label="Rank" k="position" sort={sort} onSort={onSort} align="right" className="w-[76px]"
                  info={<>Our average spot in Google for this search (1 = top of the page). <Tone c="text-success-700 dark:text-success-300">Top 3</Tone>, <Tone c="text-info-700 dark:text-info-300">first page</Tone>, <Tone c="text-warning-700 dark:text-warning-300">second page</Tone>, grey after that.</>} />
                {cols.ranks && (
                  <Th className="w-[114px]" info={<>The we360.ai page Google shows for this search, and its spot (#). If it&apos;s outside this cluster and in the top {UPDATE_EXISTING_MAX_POSITION}, we suggest <b>Improve existing page</b>.</>}>Our page</Th>
                )}
                <Th className="w-[130px]" info={<ActionLegend />}>What to do</Th>
                <Th className="w-[134px]" info={<>Which page gets it: a post in this cluster, the hub page, or the existing page that already shows up for it.</>}>Where</Th>
                {cols.useAs && (
                  <Th className="w-[84px]" info={<UsageLegend />}>Add as</Th>
                )}
                {cols.anchors && (
                  <Th className="w-[150px]" info="Other wordings our posts and hub can use when they link to this post, so the links don't all use the exact same words (that looks unnatural to Google).">Link text</Th>
                )}
                <Th className="w-[100px]" info={<StatusLegend />}>Status</Th>
                {canManage && (
                  <Th className="w-[92px] pr-3 text-right" info={<><b>Approve</b> (✓) adds the search to the page&apos;s brief; you&apos;ll see exactly what happens before it&apos;s saved. <b>Reject</b> (✕) means it won&apos;t be used. <b>Edit</b> changes what to do with it.</>}>Review</Th>
                )}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="px-3 py-12">
                    <EmptyState
                      icon={queries.length ? SearchX : Search}
                      title={queries.length ? "Nothing matches these filters" : "No Search Console searches yet"}
                      body={queries.length ? "Try another filter or search word." : `Refresh to pull searches we showed up for ${MIN_IMPRESSIONS}+ times for this cluster's keywords.`}
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

      <BulkApproveDialog open={bulkConfirm === "accepted"} selected={selectedRows} rows={plan.approve} pending={bulkPending}
        onOpenChange={(o) => { if (!o) setBulkConfirm(null); }} onConfirm={() => runBulk(plan.approve, "accepted", "Approved")} />
      <ConfirmDialog
        open={bulkConfirm === "rejected"}
        onOpenChange={(o) => { if (!o) setBulkConfirm(null); }}
        title={`Reject ${plural(plan.reject.length, "search", "searches")}?`}
        summary={<>These searches won&apos;t be added anywhere and won&apos;t come back as suggestions. You can restore them from the <b>Skipped</b> filter.</>}
        confirmLabel="Reject"
        tone="danger"
        pending={bulkPending}
        confirmDisabled={!plan.reject.length}
        onConfirm={() => runBulk(plan.reject, "rejected", "Rejected")}
      >
        {plan.reject.some((x) => x.status === "accepted") && (
          <p>{plural(plan.reject.filter((x) => x.status === "accepted").length, "of them is", "of them are")} approved right now; rejecting takes {plan.reject.filter((x) => x.status === "accepted").length === 1 ? "it" : "them"} back out of the post briefs.</p>
        )}
        {selectedRows.length > plan.reject.length && <p>{plural(selectedRows.length - plan.reject.length, "selected search is", "selected searches are")} already rejected and will be left as is.</p>}
        {!plan.reject.length && <p>Everything you selected is already rejected.</p>}
      </ConfirmDialog>

      <NewPostSuggestions rows={data.queries.filter((x) => x.action === "new_post")} projectId={projectId} canManage={canManage} />
    </section>
  );
}

function BulkApproveDialog({ open, selected, rows, pending, onOpenChange, onConfirm }: {
  open: boolean; selected: ClusterGscQuery[]; rows: ClusterGscQuery[]; pending: boolean;
  onOpenChange: (open: boolean) => void; onConfirm: () => void;
}) {
  const by = (a: QueryAction) => rows.filter((x) => x.action === a);
  const toPosts = by("assign");
  const postCount = new Set(toPosts.map((x) => x.itemId)).size;
  const rest = selected.filter((x) => !rows.includes(x));
  const already = rest.filter((x) => x.status === "accepted").length;
  const needPost = rest.filter((x) => x.status !== "accepted" && x.action === "assign" && !x.itemId).length;
  const undecided = rest.filter((x) => x.status !== "accepted" && x.action === "unassigned").length;

  const lines: ReactNode[] = [];
  if (toPosts.length) lines.push(<>{plural(toPosts.length, "search", "searches")} added to the briefs of {plural(postCount, "post")}</>);
  if (by("hub").length) lines.push(<>{plural(by("hub").length, "search", "searches")} added to the hub page&apos;s plan</>);
  if (by("update_existing").length) lines.push(<>{plural(by("update_existing").length, "to-do", "to-dos")} to improve existing pages (nothing in this cluster&apos;s posts changes)</>);
  if (by("ignore").length) lines.push(<>{plural(by("ignore").length, "search", "searches")} confirmed as skipped (nothing added)</>);

  return (
    <ConfirmDialog open={open} onOpenChange={onOpenChange} pending={pending} onConfirm={onConfirm} confirmDisabled={!rows.length}
      title={rows.length ? `Approve ${plural(rows.length, "search", "searches")}?` : "Nothing to approve"}
      summary={rows.length ? "Here's what will happen:" : "None of the selected searches can be approved yet."}
      confirmLabel="Approve">
      {lines.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-foreground">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      )}
      {rest.length > 0 && (
        <p>
          Skipped: {[
            already && `${already} already approved`,
            needPost && `${needPost} still need a post picked (Edit)`,
            undecided && `${undecided} have no decision yet (Edit)`,
          ].filter(Boolean).join(", ")}.
        </p>
      )}
      {toPosts.length > 0 && <p>Writers will see the added searches in Copy details and in the export.</p>}
    </ConfirmDialog>
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
    <span title={ACTION_FULL[action]} className={cn("inline-flex h-5 max-w-full items-center rounded-full border px-2 text-[11px] font-medium whitespace-nowrap", ACTION_TONE[action], className)}>
      <span className="truncate">{ACTION_SHORT[action]}</span>
    </span>
  );
}

function ActionLegend() {
  return (
    <div className="space-y-1.5">
      {(["assign", "hub", "update_existing", "ignore"] as QueryAction[]).map((a) => (
        <p key={a}><b>{ACTION_FULL[a]}</b>: {ACTION_HELP[a]}</p>
      ))}
    </div>
  );
}

function UsageLegend() {
  return (
    <div className="space-y-1">
      <p>How the search gets worked into the page:</p>
      {(Object.keys(USAGE_FULL) as QueryUsage[]).map((u) => <p key={u}><b>{USAGE_SHORT[u]}</b>: {USAGE_FULL[u].toLowerCase()}.</p>)}
      <p className="text-muted-foreground">In italics when nobody has chosen yet: questions default to FAQ, everything else to Paragraph.</p>
    </div>
  );
}

function StatusLegend() {
  return (
    <div className="space-y-1">
      <p><b>To review</b>: suggested by Claude or a rule; nobody has approved it yet.</p>
      <p><b>Approved</b>: added to the page&apos;s brief (or a to-do for an existing page).</p>
      <p><b>Rejected</b>: won&apos;t be used and won&apos;t come back. Restore it from the Skipped filter.</p>
      <p className="text-muted-foreground">The small icon shows who decided: Claude, an automatic rule, keyword matching, or a person.</p>
    </div>
  );
}

function StatusPill({ status, assignedBy }: { status: QueryStatus; assignedBy: AssignedBy | null }) {
  const src = assignedBy ? SOURCE[assignedBy] : null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-flex h-5 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap", STATUS_TONE[status])}>
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

// ------------------------------------------------------------------ the row

function QueryRow({ row, projectId, posts, postTitle, hub, canManage, cols, colCount, locked, selected, onSelect }: {
  row: ClusterGscQuery;
  projectId: string;
  posts: Post[];
  postTitle: Map<string, string>;
  hub: Hub;
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
  const [confirm, setConfirm] = useState<null | "approve" | "reject">(null);
  const [pending, start] = useTransition();
  const busy = pending || locked;
  const detailId = `gsc-q-${row.id}`;
  const use = usageOf(row);
  const hasAnchors = row.action === "assign" || row.action === "hub";
  const blocked = approveBlock(row);
  const lockReason = locked ? "Busy..." : null;

  const commit = (patch: Patch, onDone?: () => void) => start(async () => {
    const r = await updateClusterGscQuery({ project_id: projectId, id: row.id, ...patch })
      .catch(() => ({ ok: false, error: "Could not save - try again." }));
    if (!r.ok) { toast.error(r.error ?? "Could not save."); return; }
    start(() => { onDone?.(); router.refresh(); });
  });

  const startEdit = () => { setOpen(true); setEditing(true); };
  const approve = approveText({ row, postTitle, hub });

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
    if (row.action === "update_existing") return row.rankingPage ? <PageLink row={row} className="text-foreground" /> : <span className="text-muted-foreground">Its current page</span>;
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
              <span>{row.query}<span className="mt-1 block opacity-75">Click to see what to do with it.</span></span>
            </TooltipContent>
          </Tooltip>
        </td>
        <td className={cn(TD, "text-right font-mono tabular-nums")}>{NUM.format(row.impressions)}</td>
        {cols.clicks && (
          <td className={cn(TD, "text-right font-mono tabular-nums")} title={`${(row.ctr * 100).toFixed(1)}% click rate`}>
            {NUM.format(row.clicks)}
            <span className="ml-1 text-[10.5px] text-muted-foreground">{(row.ctr * 100).toFixed(1)}%</span>
          </td>
        )}
        <td className={cn(TD, "text-right")}>
          <span className={cn("inline-flex h-5 min-w-9 items-center justify-center rounded-md px-1.5 font-mono text-[11.5px] tabular-nums", posTone(row.position))}
            title={`Average Google rank ${row.position.toFixed(1)}`}>
            {row.position.toFixed(1)}
          </span>
        </td>
        {cols.ranks && (
          <td className={TD}>
            {row.rankingPage ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <PageLink row={row} />
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
                title={use.inferred ? `Not chosen yet: defaults to ${USAGE_FULL[use.usage]}` : USAGE_FULL[use.usage]}>
                {USAGE_SHORT[use.usage]}
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
                  {row.status === "rejected" && (
                    <IconAction label="Restore to To review" disabledReason={lockReason}
                      onClick={() => commit({ status: "suggested" })} className="hover:bg-muted hover:text-foreground">
                      <RotateCcw className="size-3.5" aria-hidden />
                    </IconAction>
                  )}
                  {row.status !== "accepted" && (
                    <IconAction label={row.status === "rejected" ? "Restore and approve" : "Approve"} disabledReason={lockReason ?? blocked}
                      onClick={() => setConfirm("approve")} className="hover:bg-success-50 hover:text-success-700 dark:hover:bg-success-500/15 dark:hover:text-success-300">
                      <Check className="size-3.5" aria-hidden />
                    </IconAction>
                  )}
                  {row.status !== "rejected" && (
                    <IconAction label="Reject" disabledReason={lockReason}
                      onClick={() => setConfirm("reject")} className="hover:bg-error-50 hover:text-error-strong dark:hover:bg-error-500/15">
                      <X className="size-3.5" aria-hidden />
                    </IconAction>
                  )}
                  <IconAction label={editing ? "Editing below" : "Edit"} disabledReason={lockReason}
                    onClick={startEdit} className={cn("hover:bg-[#5B45E0]/10 hover:text-[#5B45E0] dark:hover:text-[#7B62FF]", editing && "bg-[#5B45E0]/10 text-[#5B45E0]")}>
                    <Pencil className="size-3.5" aria-hidden />
                  </IconAction>
                </>
              )}
            </div>
            <ConfirmDialog
              open={confirm === "approve"}
              onOpenChange={(o) => { if (!o) setConfirm(null); }}
              title={row.status === "rejected" ? "Restore and approve this search?" : "Approve this search?"}
              summary={approve.summary}
              confirmLabel="Approve"
              pending={pending}
              onConfirm={() => commit({ status: "accepted" }, () => setConfirm(null))}
            >
              {approve.details}
              <p>Not right? Cancel and use Edit to change what to do with it first.</p>
            </ConfirmDialog>
            <ConfirmDialog
              open={confirm === "reject"}
              onOpenChange={(o) => { if (!o) setConfirm(null); }}
              title="Reject this search?"
              summary={<><Quote>{row.query}</Quote> won&apos;t be added anywhere and won&apos;t come back as a suggestion. You can restore it from the <b>Skipped</b> filter.</>}
              confirmLabel="Reject"
              tone="danger"
              pending={pending}
              onConfirm={() => commit({ status: "rejected" }, () => setConfirm(null))}
            >
              {row.status === "accepted" && <p>It&apos;s approved right now, so rejecting also takes it back out of the brief.</p>}
            </ConfirmDialog>
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

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </div>
  );
}

/** The expanded row: one plain sentence of what to do, then compact facts. */
function QueryDetail({ row, postTitle, hub }: { row: ClusterGscQuery; postTitle: Map<string, string>; hub: Hub }) {
  const src = row.assignedBy ? SOURCE[row.assignedBy] : null;
  const info = row.rankingPageInfo;
  return (
    <div className="max-w-5xl space-y-2">
      <div className="flex items-start gap-2">
        <ActionPill action={row.action} className="mt-0.5 shrink-0" />
        <p className="text-[13px] leading-relaxed text-muted-foreground"><WhatToDo row={row} postTitle={postTitle} hub={hub} /></p>
      </div>
      {row.reason && <p className="text-[12px] text-muted-foreground"><span className="font-medium text-foreground">Why: </span>{row.reason}</p>}
      <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
        <Fact label="Impressions"><span className="font-mono tabular-nums">{NUM.format(row.impressions)}</span></Fact>
        <Fact label="Clicks"><span className="font-mono tabular-nums">{NUM.format(row.clicks)}</span> <span className="text-muted-foreground">({(row.ctr * 100).toFixed(1)}% click rate)</span></Fact>
        <Fact label="Google rank"><span className="font-mono tabular-nums">{row.position.toFixed(1)}</span></Fact>
        {row.rankingPage && (
          <Fact label="Shows up on">
            <span className="inline-flex min-w-0 max-w-[28rem] flex-wrap items-baseline gap-x-1">
              <PageLink row={row} className="text-foreground" />
              <span className="text-muted-foreground">#{rankOf(row)}</span>
              {info?.source === "url" && <span className="text-muted-foreground">(title from URL)</span>}
              {info?.clusterName && <span className="text-muted-foreground">· {info.clusterName} cluster</span>}
            </span>
          </Fact>
        )}
        {row.matchedKeyword && <Fact label="Found through keyword">{row.matchedKeyword}</Fact>}
        {src && <Fact label="Decided by">{src.short}</Fact>}
      </dl>
      {(row.action === "assign" || row.action === "hub") && row.anchors.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          <span className="text-muted-foreground">Link text:</span>
          {row.anchors.map((a) => <span key={a} className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11.5px]">{a}</span>)}
        </div>
      )}
    </div>
  );
}

function QueryEditor({ row, posts, hub, saving, onCancel, onSave }: {
  row: ClusterGscQuery; posts: Post[]; hub: Hub; saving: boolean;
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[190px_minmax(200px,1fr)_auto_minmax(220px,1.2fr)]">
        <div className="space-y-1">
          <label htmlFor={fieldId("action")} className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            What to do <InfoTip label="About What to do"><ActionLegend /></InfoTip>
          </label>
          <select id={fieldId("action")} className={SELECT} value={action} autoFocus disabled={saving}
            onChange={(e) => setAction(e.target.value as QueryAction)}>
            {ACTION_ORDER.map((a) => <option key={a} value={a}>{ACTION_FULL[a]}</option>)}
          </select>
          <p className="text-[11px] leading-snug text-muted-foreground">{ACTION_HELP[action]}</p>
        </div>

        <div className="space-y-1">
          <label htmlFor={usesPost ? fieldId("post") : undefined} className="block text-[11px] font-semibold text-muted-foreground">{usesPost ? "Which post" : "Where"}</label>
          {usesPost ? (
            <>
              <select id={fieldId("post")} className={cn(SELECT, missingPost && "border-warning-400")} value={itemId} disabled={saving}
                onChange={(e) => setItemId(e.target.value)} aria-invalid={missingPost || undefined}>
                <option value="">Pick a post...</option>
                {posts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              {missingPost && <p className="text-[11px] text-warning-700 dark:text-warning-300">Choose which post should use this search.</p>}
            </>
          ) : (
            <div className="flex min-h-8 items-center text-[12.5px] text-foreground">
              {action === "hub" ? <>Hub page{hub.slug && <span className="ml-1 truncate text-muted-foreground">· {hub.slug}</span>}</>
                : action === "update_existing" ? (row.rankingPage
                  ? <span className="flex min-w-0 flex-wrap items-baseline gap-x-1"><PageLink row={row} className="text-foreground" /><span className="text-muted-foreground">#{rankOf(row)}</span></span>
                  : "The page it already shows up on")
                : <span className="text-muted-foreground">—</span>}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <span id={fieldId("usage")} className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            Add as <InfoTip label="About Add as"><UsageLegend /></InfoTip>
          </span>
          {usesUsage ? (
            <div role="radiogroup" aria-labelledby={fieldId("usage")} className="inline-flex h-8 rounded-md border border-border bg-background p-0.5">
              {(Object.keys(USAGE_FULL) as QueryUsage[]).map((u) => (
                <button key={u} type="button" role="radio" aria-checked={usage === u} disabled={saving} onClick={() => setUsage(u)}
                  title={USAGE_FULL[u]}
                  className={cn("whitespace-nowrap rounded px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B45E0]/40",
                    usage === u ? "bg-[#5B45E0]/10 text-[#5B45E0] dark:text-[#7B62FF]" : "text-muted-foreground hover:text-foreground")}>
                  {u === "body" ? "Paragraph" : USAGE_FULL[u]}
                </button>
              ))}
            </div>
          ) : <div className="flex h-8 items-center text-muted-foreground">—</div>}
        </div>

        <div className="space-y-1">
          <label htmlFor={usesAnchors ? fieldId("anchors") : undefined} className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            Link text <InfoTip label="About link text">Other wordings our posts and hub can use when they link to this post, so the links don&apos;t all use the exact same words. Separate with semicolons, up to 5.</InfoTip>
          </label>
          {usesAnchors ? (
            <>
              <Input id={fieldId("anchors")} value={anchors} disabled={saving} onChange={(e) => setAnchors(e.target.value)}
                placeholder="wording 1; wording 2" className="h-8 text-[12.5px]" aria-describedby={fieldId("anchors-hint")} />
              <p id={fieldId("anchors-hint")} className={cn("text-[11px] text-muted-foreground", parsed.length > 5 && "text-warning-700 dark:text-warning-300")}>
                {parsed.length > 5 ? `Only the first 5 of ${parsed.length} will be kept.` : `${parsed.length} of 5 · separate with ;`}
              </p>
            </>
          ) : <div className="flex h-8 items-center text-[12px] text-muted-foreground">Only for posts and the hub page.</div>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="brand" className="gap-1.5" disabled={saving || missingPost}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <span className="text-[11px] text-muted-foreground">Your change is kept when the list is refreshed. {row.status === "accepted" && "It stays approved and the brief updates."}</span>
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
              Searches we showed up for {NEW_POST_MIN_IMPRESSIONS}+ times that none of this cluster&apos;s posts covers. <b>Add to cluster</b> creates a planned post for it. <b>Dismiss</b> hides it; you can bring it back with Show dismissed.
            </InfoTip>
          </h3>
          <p className="text-[12px] text-muted-foreground">
            Searches seen {NEW_POST_MIN_IMPRESSIONS}+ times that no post in this cluster covers well. Add one to the cluster in a click, then fill its details with Add details on the post.
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
              <SortTh label="Search term" k="query" sort={sort} onSort={onSort} className="w-[30%] pl-3" />
              <SortTh label="Impr." k="impressions" sort={sort} onSort={onSort} align="right" className="w-[80px]"
                info={<><b>Impressions</b>: how many times we showed up in Google for this search (last {LOOKBACK_DAYS} days).</>} />
              <SortTh label="Rank" k="position" sort={sort} onSort={onSort} align="right" className="w-[76px]"
                info="Our average spot in Google for this search (1 = top of the page)." />
              <Th info="Why Claude thinks this deserves its own page, and which of our pages shows up for it today.">Why</Th>
              {canManage && <th scope="col" className={cn(TH, "w-[210px] pr-3")}><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={colCount} className="px-3 py-8">
                <EmptyState icon={Plus} title="No new-page suggestions right now" body={`Searches seen ${NEW_POST_MIN_IMPRESSIONS}+ times that no post covers will show up here after a refresh.`} />
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
              <PageLink row={row} />
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
  projectId: string; clusterId: string; hub: Hub; canManage: boolean;
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
      The cluster&apos;s main page. Broad searches go here (<b>Add to the hub page</b>), and every post in the cluster links up to it. The hub keyword is the main search it should show up for.
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
