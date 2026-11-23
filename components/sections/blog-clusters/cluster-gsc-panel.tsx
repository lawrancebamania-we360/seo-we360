"use client";

// Blog Clusters - GSC queries section on the cluster page (GC-2..GC-14): the hub
// page, Refresh / Apply all / Download, the queries table and the new-post
// suggestions table.
//
// The table shows full text and scrolls sideways inside its own box, with the
// header pinned to the top and the Search term column pinned to the left. Rows
// are read-only; a row opens into a card (data, page, what's wrong, what to do
// with Claude's drafts, why this page, estimated benefit). Edit opens a form in
// the same place. Approve and Reject (single and bulk) confirm in a modal that
// says, in plain words, what will happen.

import { Fragment, useCallback, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Check, CheckCheck, ChevronRight, Copy, Download, ExternalLink, Info,
  Loader2, Pencil, Plus, RefreshCw, RotateCcw, Search, SearchX, Sparkles, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toExternalUrl } from "@/lib/url";
import {
  applyAllClusterSuggestions, createPostFromGscQuery, refreshClusterGsc, setClusterHub, updateClusterGscQuery,
} from "@/lib/actions/cluster-gsc";
import {
  DIAGNOSIS_EXPLAIN, DIAGNOSIS_LABEL, LOOKBACK_DAYS, META_MAX, MIN_IMPRESSIONS, NEW_POST_MIN_IMPRESSIONS, TITLE_MAX,
  UPDATE_EXISTING_MAX_POSITION, USE_OPTION_HINT, USE_OPTION_LABEL, USE_OPTIONS,
  type AssignedBy, type ClusterGscData, type ClusterGscQuery, type QueryAction, type QueryDiagnosis, type QueryDrafts,
  type QueryStatus, type QueryUsage, type QueryUseOption,
} from "@/lib/types/cluster-gsc";
import { snippetProblems, suggestedUseOptions, usagesFromLegacy } from "@/lib/blog-clusters/query-insights";
import { InfoTip } from "./info-tip";
import { ConfirmDialog } from "./confirm-dialog";

type UpdateInput = Parameters<typeof updateClusterGscQuery>[0];
/** `usages` / `drafts` are being added to the action's input (GC-8/GC-10). */
type Patch = Omit<UpdateInput, "project_id" | "id"> & { usages?: QueryUseOption[]; drafts?: QueryDrafts };
type Post = { id: string; title: string };
type Hub = ClusterGscData["hub"];
type Filter = "all" | "review" | "accepted" | "needs_post" | "update_existing" | "ignored";
type SortKey = "query" | "impressions" | "clicks" | "position" | "gain";
type Sort = { key: SortKey; dir: "asc" | "desc" };

function saveQuery(input: { project_id: string; id: string } & Patch) {
  return updateClusterGscQuery(input as UpdateInput);
}

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

const DIAGNOSIS_TONE: Record<QueryDiagnosis, string> = {
  snippet: "border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/15 dark:text-warning-300",
  performing: "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/15 dark:text-success-300",
  striking: "border-info-200 bg-info-50 text-info-700 dark:border-info-500/30 dark:bg-info-500/15 dark:text-info-300",
  weak: "border-error-200 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/15 dark:text-error-300",
};

/** How each option reads inside a sentence. */
const USE_AS: Record<QueryUseOption, string> = {
  title_meta: "by rewriting its title and meta description",
  template: "with a template or tool",
  h2: "as a section heading",
  faq: "as an FAQ question",
  paragraph: "as a mention in a paragraph",
  link_text: "as link text",
};

const STATUS_LABEL: Record<QueryStatus, string> = { suggested: "To review", accepted: "Approved", rejected: "Rejected" };
const STATUS_TONE: Record<QueryStatus, string> = {
  suggested: "border-border bg-background text-foreground",
  accepted: "border-success-200 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/15 dark:text-success-300",
  rejected: "border-border bg-muted/60 text-muted-foreground",
};
const STATUS_DOT: Record<QueryStatus, string> = { suggested: "bg-info-500", accepted: "bg-success-500", rejected: "bg-muted-foreground/50" };

const SUGGESTED_BY: Record<AssignedBy, string> = {
  ai: "Claude (AI)",
  rule: "an automatic rule (based on the page it already ranks on)",
  keyword: "keyword matching (Claude was unavailable)",
  manual: "you or a teammate (kept on refresh)",
};

const APPROVE_TIP = "Approving locks in this decision: the search term and Claude's wording are added to the brief of the page in Where (for Improve existing, it becomes a to-do for that page). You'll see exactly what happens before it's saved.";
const REJECT_TIP = "Rejecting means this search term won't be added anywhere and won't come back as a suggestion. You can restore it from the Skipped filter.";

/** Actions whose query is actually written somewhere, so "How to use" applies. */
const USED = new Set<QueryAction>(["assign", "hub", "update_existing"]);

const NUM = new Intl.NumberFormat("en-US");
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

const ROW_TINT = "bg-[color-mix(in_oklab,var(--muted)_70%,var(--background))]";
const TH = "sticky top-0 z-20 bg-[color-mix(in_oklab,var(--muted)_40%,var(--background))] px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-wider whitespace-nowrap text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]";
const TD = "px-4 py-3 align-top";
/** The pinned left column (header and cells): opaque background + a soft edge shadow. */
const PIN = "sticky shadow-[inset_-1px_0_0_var(--border),8px_0_10px_-8px_rgb(0_0_0/0.18)]";
/** Same, for header cells (keeps the header's bottom rule). */
const PIN_TH = "sticky shadow-[inset_-1px_0_0_var(--border),inset_0_-1px_0_var(--border),8px_0_10px_-8px_rgb(0_0_0/0.18)]";
const SELECT = "h-8 w-full rounded-md border border-border bg-background px-2 text-[12.5px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B45E0]/40 disabled:opacity-60";
const CHIP_ON = "border-[#5B45E0]/40 bg-[#5B45E0]/10 text-[#5B45E0] dark:text-[#7B62FF]";
const CHIP_OFF = "border-border text-muted-foreground hover:bg-muted hover:text-foreground";
const SECTION_LABEL = "text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground";

// ------------------------------------------------------------------- helpers

function pathOf(url: string | null): string {
  if (!url) return "—";
  try {
    const u = new URL(url);
    const p = u.pathname.replace(/\/+$/, "");
    return (p || "/") + u.search;
  } catch { return url; }
}

/** The page's name: its live <title> when we have it, else our title, else the path. */
function pageTitleOf(row: Pick<ClusterGscQuery, "rankingPage" | "rankingPageInfo">): string {
  const info = row.rankingPageInfo;
  if (info?.liveTitle) return info.liveTitle;
  if (info?.source === "homepage") return info.title || "Homepage";
  return info?.title || pathOf(row.rankingPage);
}

/** True when the name shown is only a guess from the URL. */
function titleIsGuess(row: Pick<ClusterGscQuery, "rankingPageInfo">): boolean {
  return !row.rankingPageInfo?.liveTitle && row.rankingPageInfo?.source === "url";
}

/** Where the ranking page sits in Google for this query (falls back to the query's average). */
function rankOf(row: Pick<ClusterGscQuery, "rankingPagePosition" | "position">): number {
  return row.rankingPagePosition ?? Math.round(row.position);
}

function hubNameOf(hub: Hub): string {
  return hub.title || hub.slug || "the hub page";
}

/** How to use the term. Falls back to the legacy single usage, then to the rule-based suggestion. */
function usesOf(row: ClusterGscQuery): { options: QueryUseOption[]; inferred: boolean } {
  if (!USED.has(row.action)) return { options: [], inferred: false };
  if (row.usages.length) return { options: row.usages, inferred: false };
  const legacy = usagesFromLegacy(row.usage);
  if (legacy.length) return { options: legacy, inferred: false };
  const guess = suggestedUseOptions(row, row.action);
  return { options: guess.length ? guess : ["paragraph"], inferred: true };
}

/** The legacy single usage that matches a set of options (older readers still use it). */
function legacyUsage(options: QueryUseOption[]): QueryUsage {
  if (options.includes("h2")) return "h2";
  if (options.includes("faq")) return "faq";
  return "body";
}

function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function posTone(p: number): string {
  if (p <= 3) return "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300";
  if (p <= 10) return "bg-info-50 text-info-700 dark:bg-info-500/15 dark:text-info-300";
  if (p <= 20) return "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300";
  return "bg-muted text-muted-foreground";
}

function sortRows(rows: ClusterGscQuery[], sort: Sort): ClusterGscQuery[] {
  const m = sort.dir === "asc" ? 1 : -1;
  const val = (x: ClusterGscQuery) => (sort.key === "gain" ? x.gain?.clicks ?? 0 : sort.key === "query" ? 0 : x[sort.key]);
  return [...rows].sort((a, b) => {
    if (sort.key === "query") return a.query.localeCompare(b.query) * m;
    return (val(a) - val(b)) * m || b.impressions - a.impressions;
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
const ellipsize = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

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
  const how = joinWords(usesOf(row).options.filter((o) => o !== "link_text").map((o) => USE_AS[o]));
  const post = row.itemId ? postTitle.get(row.itemId) : undefined;

  if (row.action === "assign") {
    if (!post) return <>Pick which post in this cluster should use <Quote>{row.query}</Quote> (click Edit).</>;
    return <>Add <Quote>{row.query}</Quote> to the post <Quote>{post}</Quote>{how && ` ${how}`}.</>;
  }
  if (row.action === "hub") return <>Add <Quote>{row.query}</Quote> to the hub page <Quote>{hubNameOf(hub)}</Quote>{how && ` ${how}`}.</>;
  if (row.action === "update_existing") return <>Improve our existing page <Quote>{pageTitleOf(row)}</Quote> for <Quote>{row.query}</Quote>{how && ` ${how}`}.</>;
  if (row.action === "ignore") return <>Skip <Quote>{row.query}</Quote>: it isn&apos;t relevant to this cluster. Nothing gets added anywhere.</>;
  if (row.action === "new_post") return <>Write a new post for <Quote>{row.query}</Quote>.</>;
  return <>Nobody has decided what to do with <Quote>{row.query}</Quote> yet. Click Edit to choose.</>;
}

/** Plain words: why this page and not a new one. */
function whyThisPage(row: ClusterGscQuery, post: string | undefined): string {
  if (row.action === "update_existing") return `We already show up #${rankOf(row)} on Google for this search with "${pageTitleOf(row)}". Improving that page is faster than starting a new one, and it stops two of our pages competing for the same search.`;
  if (row.action === "assign") return post ? `"${post}" is the post in this cluster that's closest to this search, so adding it there makes that post more complete instead of creating a thin new page.` : "It fits one of this cluster's posts; pick which one.";
  if (row.action === "hub") return "It's a broad search that sums up the whole topic, which is what the hub page is for.";
  if (row.action === "ignore") return "It doesn't match what this cluster is about, so it would pull the pages off-topic.";
  return "No decision yet.";
}

/** One line per chosen option, saying what gets added (with the draft when we have one). */
function OptionLines({ row, options }: { row: ClusterGscQuery; options: QueryUseOption[] }) {
  const d = row.drafts;
  const bad = snippetProblems(d);
  return (
    <ul className="list-disc space-y-1 pl-5 text-foreground">
      {options.map((o) => (
        <li key={o}>
          <b>{USE_OPTION_LABEL[o]}</b>
          {o === "title_meta" && (d?.title || d?.meta
            ? <>: title <Quote>{d?.title ?? "—"}</Quote>{bad.title && <OverNote />}, description <Quote>{d?.meta ?? "—"}</Quote>{bad.meta && <OverNote />}</>
            : <span className="text-muted-foreground"> (no draft yet)</span>)}
          {o === "template" && (d?.template ? <>: {d.template}</> : <span className="text-muted-foreground"> (no draft yet)</span>)}
          {o === "h2" && (d?.h2 ? <>: <Quote>{d.h2}</Quote></> : <span className="text-muted-foreground"> (no draft yet)</span>)}
          {o === "faq" && (d?.faqQuestion ? <>: <Quote>{d.faqQuestion}</Quote></> : <span className="text-muted-foreground"> (no draft yet)</span>)}
          {o === "paragraph" && (d?.paragraph ? <>: <Quote>{d.paragraph}</Quote></> : <span className="text-muted-foreground"> (no draft yet)</span>)}
          {o === "link_text" && (row.anchors.length ? <>: {row.anchors.map((a, i) => <Fragment key={a}>{i > 0 && ", "}<Quote>{a}</Quote></Fragment>)}</> : <span className="text-muted-foreground"> (uses the search term itself)</span>)}
        </li>
      ))}
    </ul>
  );
}

function OverNote() {
  return <span className="ml-1 text-error-700 dark:text-error-300">(too long for phones)</span>;
}

/** Plain-words explanation of what approving this one query does. */
function approveText(row: ClusterGscQuery, postTitle: Map<string, string>, hub: Hub) {
  const post = row.itemId ? postTitle.get(row.itemId) : undefined;
  const { options } = usesOf(row);
  const lines = options.length ? <OptionLines row={row} options={options} /> : null;

  if (row.action === "assign") {
    return {
      summary: <>We&apos;ll add <Quote>{row.query}</Quote> to the brief of <Quote>{post ?? "the chosen post"}</Quote>. Writers will see it in Copy details and in the export.</>,
      details: lines && <><p>The brief will ask for:</p>{lines}</>,
    };
  }
  if (row.action === "hub") {
    return {
      summary: <>We&apos;ll add <Quote>{row.query}</Quote> to the plan for the hub page <Quote>{hubNameOf(hub)}</Quote>. Posts in this cluster will use <Quote>{row.anchors[0] || row.query}</Quote> as link text when they link up to it.</>,
      details: lines && <><p>The hub page plan will ask for:</p>{lines}</>,
    };
  }
  if (row.action === "update_existing") {
    return {
      summary: <>We&apos;ll mark <Quote>{row.query}</Quote> as approved for <Quote>{pageTitleOf(row)}</Quote>. Nothing in this cluster&apos;s posts changes: it&apos;s a to-do for that page.</>,
      details: <>{row.rankingPage && <PageFacts row={row} />}{lines && <><p>The to-do:</p>{lines}</>}</>,
    };
  }
  if (row.action === "ignore") {
    return { summary: <>We&apos;ll confirm that <Quote>{row.query}</Quote> is skipped. Nothing gets added anywhere.</>, details: null };
  }
  return { summary: <>We&apos;ll mark <Quote>{row.query}</Quote> as approved.</>, details: null };
}

// ------------------------------------------------------------- page naming

/** Link to the page a query ranks on, named by its title. Wraps; never truncates. */
function PageLink({ row, className }: { row: Pick<ClusterGscQuery, "rankingPage" | "rankingPageInfo">; className?: string }) {
  if (!row.rankingPage) return <span className="text-muted-foreground">—</span>;
  return (
    <a href={toExternalUrl(row.rankingPage) ?? row.rankingPage} target="_blank" rel="noopener noreferrer" title={row.rankingPage}
      className={cn("break-words hover:underline", className ?? "text-foreground")}>
      {pageTitleOf(row)}
      <ExternalLink className="ml-1 inline size-3 align-[-1px] opacity-60" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/** Page title + link, keyword, cluster and URL - for modals. */
function PageFacts({ row }: { row: ClusterGscQuery }) {
  const info = row.rankingPageInfo;
  if (!row.rankingPage) return null;
  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-md border border-border bg-muted/30 px-2.5 py-2 text-[12px]">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
        <PageLink row={row} className="font-medium text-foreground" />
        {titleIsGuess(row) && <span className="text-muted-foreground">(title from URL)</span>}
        <span className="text-muted-foreground">· shows up #{rankOf(row)} on Google</span>
      </div>
      {(info?.primaryKeyword || info?.clusterName) && (
        <div className="mt-0.5 text-muted-foreground">
          {info?.primaryKeyword && <>Keyword: <span className="text-foreground">{info.primaryKeyword}</span></>}
          {info?.primaryKeyword && info?.clusterName && " · "}
          {info?.clusterName && <>Cluster: <span className="text-foreground">{info.clusterName}</span></>}
        </div>
      )}
      <div className="mt-0.5 break-all text-[11px] text-muted-foreground">{row.rankingPage}</div>
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
  // The visible width of the scroll box: the open-row card is pinned to it.
  const [boxRef, boxWidth] = useWidth();

  const colCount = 12 + (canManage ? 2 : 0);

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
        const r = await saveQuery({ project_id: projectId, id: x.id, status }).catch(() => ({ ok: false }));
        if (!r.ok) failed++;
      }
      const done = rows.length - failed;
      if (failed) toast.error(`${verb} ${done}, ${failed} failed - try again.`);
      else toast.success(`${verb} ${plural(done, "search", "searches")}.`);
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

  const totals = shown.reduce((t, x) => ({ impressions: t.impressions + x.impressions, clicks: t.clicks + x.clicks, gain: t.gain + (x.status !== "rejected" ? x.gain?.clicks ?? 0 : 0) }), { impressions: 0, clicks: 0, gain: 0 });
  const allShownSelected = shown.length > 0 && shownSelected === shown.length;
  const onSort = (k: SortKey) => setSort((s) => nextSort(s, k));
  const pinLeft = canManage ? "left-12" : "left-0";

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
                  Pulls the last {LOOKBACK_DAYS} days of Google searches for this cluster&apos;s keywords (anything we showed up for {MIN_IMPRESSIONS}+ times), then Claude suggests what to do with each one and drafts the wording. Rows a person edited stay as they are. Can take a minute.
                </InfoTip>
              </span>
              <span className="inline-flex items-center gap-1">
                <Button size="sm" variant="brand" className="gap-1.5" onClick={applyAll} disabled={!!busy || toApply === 0}>
                  {busy === "apply" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCheck className="size-3.5" />}
                  Apply all suggestions{toApply ? ` (${toApply})` : ""}
                </Button>
                <InfoTip label="About Apply all suggestions" side="bottom">
                  Approves every row that is still <b>To review</b> and has a decision (add to a post, hub page or improve an existing page), and adds them, with Claude&apos;s wording and link text, to each page&apos;s brief. Rejected and skipped rows are left alone.
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
            {totals.gain > 0 && <> · <span className="text-foreground">≈ +{COMPACT.format(totals.gain)} clicks possible</span> (estimate)</>}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- table */}
      <div className="relative">
        {busy === "refresh" && (
          <div className="absolute inset-0 z-40 flex items-start justify-center rounded-xl bg-background/60 pt-16 backdrop-blur-[1px]" role="status">
            <span className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-[12.5px] text-foreground shadow-sm">
              <Loader2 className="size-3.5 animate-spin text-[#5B45E0]" /> Pulling searches from Search Console. This can take a minute.
            </span>
          </div>
        )}
        <div ref={boxRef} className="max-h-[65vh] overflow-auto overscroll-x-contain rounded-xl border border-border">
          <table className="w-max min-w-full border-separate border-spacing-0 text-[12.5px]">
            <caption className="sr-only">Google searches for this cluster. Scroll sideways for more columns. Select a search to see details and drafts.</caption>
            <thead>
              <tr>
                {canManage && (
                  <th scope="col" className={cn(TH, "left-0 z-30 w-12 min-w-12 px-0 pl-4")}>
                    <Checkbox aria-label={allShownSelected ? "Deselect all rows in view" : "Select all rows in view"}
                      checked={allShownSelected} indeterminate={shownSelected > 0 && !allShownSelected}
                      disabled={!shown.length} onCheckedChange={(c) => toggleShown(!!c)} />
                  </th>
                )}
                <SortTh label="Search term" k="query" sort={sort} onSort={onSort} className={cn(PIN_TH, pinLeft, "z-30")}
                  info="What people typed into Google. Click a row to see what's wrong, what to do and Claude's ready-to-use wording." />
                <SortTh label="Impressions" k="impressions" sort={sort} onSort={onSort} align="right"
                  info={<>How many times we showed up in Google for this search (last {LOOKBACK_DAYS} days).</>} />
                <SortTh label="Clicks" k="clicks" sort={sort} onSort={onSort} align="right"
                  info="How many people clicked through to us from Google, and the click rate (the share of people who saw us and clicked)." />
                <SortTh label="Rank" k="position" sort={sort} onSort={onSort} align="right"
                  info={<>Our average spot in Google for this search (1 = top of the page). <Tone c="text-success-700 dark:text-success-300">Top 3</Tone>, <Tone c="text-info-700 dark:text-info-300">first page</Tone>, <Tone c="text-warning-700 dark:text-warning-300">second page</Tone>, grey after that.</>} />
                <Th info={<DiagnosisLegend />}>What&apos;s wrong</Th>
                <SortTh label="Est. gain" k="gain" sort={sort} onSort={onSort} align="right"
                  info="An estimate of extra clicks over 90 days: for first-page searches, by getting a normal click rate at the current rank; otherwise, if the page climbed to #5. Rough guide, not a promise." />
                <Th info={<>The we360.ai page Google shows for this search, with its full address and spot (#). If it&apos;s outside this cluster and in the top {UPDATE_EXISTING_MAX_POSITION}, we suggest <b>Improve existing page</b>.</>}>Our page</Th>
                <Th info={<ActionLegend />}>What to do</Th>
                <Th info="Which page gets it: a post in this cluster, the hub page, or the existing page that already shows up for it.">Where</Th>
                <Th info={<UseLegend />}>How to use</Th>
                <Th info="Other wordings our posts and hub can use when they link to this page, so the links don't all use the exact same words (that looks unnatural to Google).">Link text</Th>
                <Th info={<StatusLegend />}>Status</Th>
                {canManage && <Th className="pr-5">Review</Th>}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="p-0">
                    <div className="sticky left-0 px-4 py-12" style={Number.isFinite(boxWidth) ? { width: boxWidth } : undefined}>
                      <EmptyState
                        icon={queries.length ? SearchX : Search}
                        title={queries.length ? "Nothing matches these filters" : "No Search Console searches yet"}
                        body={queries.length ? "Try another filter or search word." : `Refresh to pull searches we showed up for ${MIN_IMPRESSIONS}+ times for this cluster's keywords.`}
                        action={queries.length
                          ? <Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>
                          : canManage && <Button size="sm" variant="brand" className="gap-1.5" onClick={refresh} disabled={!!busy}><RefreshCw className="size-3.5" /> Refresh GSC queries</Button>}
                      />
                    </div>
                  </td>
                </tr>
              )}
              {shown.map((row) => (
                <QueryRow key={row.id} row={row} projectId={projectId} posts={posts} postTitle={postTitle} hub={data.hub}
                  canManage={canManage} colCount={colCount} cardWidth={boxWidth} pinLeft={pinLeft} locked={bulkPending}
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
          <p>{plural(plan.reject.filter((x) => x.status === "accepted").length, "of them is", "of them are")} approved right now; rejecting takes {plan.reject.filter((x) => x.status === "accepted").length === 1 ? "it" : "them"} back out of the briefs.</p>
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
  const longSnippets = rows.filter((x) => { const p = snippetProblems(x.drafts); return p.title || p.meta; }).length;

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
      {rows.length > 0 && <p>Each one carries its chosen uses and Claude&apos;s drafts (title, description, heading, FAQ...). Writers see them in Copy details and in the export.</p>}
      {longSnippets > 0 && <p className="text-error-700 dark:text-error-300">{plural(longSnippets, "draft title or description is", "draft titles or descriptions are")} too long for phones. You can fix them with Edit first.</p>}
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
      <span className="inline-flex items-center gap-1">
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

function Pill({ tone, children, title, className }: { tone: string; children: ReactNode; title?: string; className?: string }) {
  return (
    <span title={title} className={cn("inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-medium whitespace-nowrap", tone, className)}>
      {children}
    </span>
  );
}

function ActionPill({ action, className }: { action: QueryAction; className?: string }) {
  return <Pill tone={ACTION_TONE[action]} title={ACTION_FULL[action]} className={className}>{ACTION_SHORT[action]}</Pill>;
}

function DiagnosisPill({ diagnosis }: { diagnosis: QueryDiagnosis }) {
  return <Pill tone={DIAGNOSIS_TONE[diagnosis]} title={DIAGNOSIS_EXPLAIN[diagnosis]}>{DIAGNOSIS_LABEL[diagnosis]}</Pill>;
}

function StatusPill({ status }: { status: QueryStatus }) {
  return (
    <Pill tone={STATUS_TONE[status]}>
      <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} aria-hidden />
      {STATUS_LABEL[status]}
    </Pill>
  );
}

/** A "How to use" chip that explains itself on hover or tap. */
function UseChip({ option, inferred }: { option: QueryUseOption; inferred?: boolean }) {
  return (
    <Popover>
      <PopoverTrigger openOnHover delay={150} closeDelay={80}
        render={
          <button type="button" aria-label={`${USE_OPTION_LABEL[option]}: what this means`}
            className={cn("inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11.5px] font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B45E0]/40",
              option === "title_meta" ? "border-warning-200 bg-warning-50 text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/15 dark:text-warning-300"
                : "border-border bg-background text-foreground hover:border-[#5B45E0]/40",
              inferred && "border-dashed italic")} />
        }
      >
        {USE_OPTION_LABEL[option]}
        <Info className="size-3 opacity-50" aria-hidden />
      </PopoverTrigger>
      <PopoverContent side="top" className="w-auto max-w-72 p-3 text-[12px] leading-relaxed">
        <p><b>{USE_OPTION_LABEL[option]}</b>: {USE_OPTION_HINT[option]}</p>
        {inferred && <p className="text-muted-foreground">Not chosen yet: this is the default suggestion.</p>}
      </PopoverContent>
    </Popover>
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

function DiagnosisLegend() {
  return (
    <div className="space-y-1.5">
      {(Object.keys(DIAGNOSIS_LABEL) as QueryDiagnosis[]).map((d) => <p key={d}><b>{DIAGNOSIS_LABEL[d]}</b>: {DIAGNOSIS_EXPLAIN[d]}</p>)}
    </div>
  );
}

function UseLegend() {
  return (
    <div className="space-y-1.5">
      <p>How to work the search term into the page. There can be more than one.</p>
      {USE_OPTIONS.map((o) => <p key={o}><b>{USE_OPTION_LABEL[o]}</b>: {USE_OPTION_HINT[o]}</p>)}
    </div>
  );
}

function StatusLegend() {
  return (
    <div className="space-y-1">
      <p><b>To review</b>: suggested by Claude or a rule; nobody has approved it yet.</p>
      <p><b>Approved</b>: added to the page&apos;s brief (or a to-do for an existing page).</p>
      <p><b>Rejected</b>: won&apos;t be used and won&apos;t come back. Restore it from the Skipped filter.</p>
    </div>
  );
}

/** A labelled row button; stays hoverable when blocked so its tooltip can say why. */
function RowButton({ label, icon, onClick, blockedReason, tone, active }: {
  label: string; icon: ReactNode; onClick: () => void; blockedReason?: string | null; tone: "approve" | "reject" | "neutral"; active?: boolean;
}) {
  const blocked = !!blockedReason;
  return (
    <button type="button" aria-disabled={blocked || undefined} title={blockedReason ?? undefined}
      onClick={() => { if (!blocked) onClick(); }}
      className={cn("inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-[12px] font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B45E0]/40 [&_svg]:size-3.5",
        blocked ? "cursor-not-allowed border-border text-muted-foreground opacity-50"
          : tone === "approve" ? "border-success-300 bg-success-50 text-success-700 hover:bg-success-100 dark:border-success-500/40 dark:bg-success-500/15 dark:text-success-300"
          : tone === "reject" ? "border-border bg-background text-error-strong hover:border-error-300 hover:bg-error-50 dark:hover:bg-error-500/15"
          : cn("border-border bg-background text-foreground hover:border-[#5B45E0]/40 hover:text-[#5B45E0] dark:hover:text-[#7B62FF]", active && CHIP_ON))}>
      {icon}{label}
    </button>
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

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      toast.success("Copied.");
      setTimeout(() => setDone(false), 1500);
    } catch { toast.error("Couldn't copy - select the text instead."); }
  };
  return (
    <Button type="button" size="xs" variant="outline" className="shrink-0 gap-1" onClick={copy} aria-label={`${label}: ${text.slice(0, 60)}`}>
      {done ? <Check /> : <Copy />} {done ? "Copied" : label}
    </Button>
  );
}

function Counter({ n, max }: { n: number; max: number }) {
  const over = n > max;
  return (
    <span className={cn("inline-flex items-center gap-1 font-mono text-[11px] tabular-nums", over ? "font-semibold text-error-700 dark:text-error-300" : "text-muted-foreground")}>
      {over && <AlertTriangle className="size-3" aria-hidden />}{n}/{max}
      {over && <span className="font-sans font-normal">too long for phones</span>}
    </span>
  );
}

/** Roughly how the result looks on a phone's Google page, cut where a phone cuts it. */
function SerpPreview({ title, meta, url }: { title: string; meta: string; url: string | null }) {
  let host = "we360.ai";
  let crumbs = "";
  try {
    if (url) {
      const u = new URL(url);
      host = u.hostname.replace(/^www\./, "");
      crumbs = u.pathname.split("/").filter(Boolean).join(" › ");
    }
  } catch { /* keep defaults */ }
  return (
    <figure className="w-full max-w-[360px] rounded-xl border border-border bg-white p-3 font-sans shadow-sm dark:bg-white" aria-label="Mobile Google result preview">
      <div className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-full bg-[#F1F3F4] text-[10px] font-bold text-[#5B45E0]">W</span>
        <div className="min-w-0 leading-tight">
          <div className="text-[12px] text-[#202124]">We360.ai</div>
          <div className="truncate text-[11px] text-[#4d5156]">{host}{crumbs && ` › ${crumbs}`}</div>
        </div>
      </div>
      <div className="mt-1.5 text-[16px] leading-snug text-[#1a0dab]">{title ? ellipsize(title, TITLE_MAX) : <span className="italic text-[#70757a]">No title draft</span>}</div>
      <p className="mt-1 text-[12.5px] leading-snug text-[#4d5156]">{meta ? ellipsize(meta, META_MAX) : <span className="italic text-[#70757a]">No description draft</span>}</p>
      <figcaption className="mt-2 text-[10px] text-[#70757a]">Phone preview (approximate)</figcaption>
    </figure>
  );
}

// ------------------------------------------------------------------ the row

function QueryRow({ row, projectId, posts, postTitle, hub, canManage, colCount, cardWidth, pinLeft, locked, selected, onSelect }: {
  row: ClusterGscQuery;
  projectId: string;
  posts: Post[];
  postTitle: Map<string, string>;
  hub: Hub;
  canManage: boolean;
  colCount: number;
  cardWidth: number;
  pinLeft: string;
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
  const uses = usesOf(row);
  const blocked = approveBlock(row);
  const lockReason = locked ? "Busy..." : null;
  const tinted = open || selected;

  const commit = (patch: Patch, onDone?: () => void) => start(async () => {
    const r = await saveQuery({ project_id: projectId, id: row.id, ...patch })
      .catch(() => ({ ok: false, error: "Could not save - try again." }));
    if (!r.ok) { toast.error(r.error ?? "Could not save."); return; }
    start(() => { onDone?.(); router.refresh(); });
  });

  const startEdit = () => { setOpen(true); setEditing(true); };
  const approve = approveText(row, postTitle, hub);

  const where = (() => {
    if (row.action === "assign") {
      const title = row.itemId ? postTitle.get(row.itemId) : null;
      if (title) return <span className="text-foreground">{title}</span>;
      return (
        <button type="button" onClick={canManage ? startEdit : undefined} disabled={!canManage}
          className="inline-flex items-center gap-1 rounded text-warning-700 enabled:hover:underline dark:text-warning-300">
          <AlertTriangle className="size-3" aria-hidden /> Pick a post
        </button>
      );
    }
    if (row.action === "hub") return <span className="text-foreground">Hub page: {hubNameOf(hub)}</span>;
    if (row.action === "update_existing") return row.rankingPage ? <PageLink row={row} /> : <span className="text-muted-foreground">Its current page</span>;
    return <span className="text-muted-foreground">—</span>;
  })();

  return (
    <Fragment>
      <tr className={cn("group/row transition-colors", tinted ? ROW_TINT : "hover:bg-[color-mix(in_oklab,var(--muted)_70%,var(--background))]",
        row.status === "rejected" && "text-muted-foreground", busy && "opacity-70",
        "[&>td]:border-b [&>td]:border-border/60")}>
        {canManage && (
          <td className={cn(TD, PIN, "left-0 z-10 w-12 min-w-12 px-0 pl-4 shadow-none", tinted ? ROW_TINT : "bg-background group-hover/row:bg-[color-mix(in_oklab,var(--muted)_70%,var(--background))]")}>
            <div className="pt-0.5"><Checkbox checked={selected} onCheckedChange={(c) => onSelect(!!c)} aria-label={`Select "${row.query}"`} /></div>
          </td>
        )}
        <td className={cn(TD, PIN, pinLeft, "z-10", tinted ? ROW_TINT : "bg-background group-hover/row:bg-[color-mix(in_oklab,var(--muted)_70%,var(--background))]")}>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={detailId}
            title={open ? "Hide details" : "Show what to do"}
            className="group/q flex w-[280px] items-start gap-1.5 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B45E0]/40">
            <ChevronRight className={cn("mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform duration-150", open && "rotate-90")} aria-hidden />
            <span className={cn("break-words font-medium leading-snug text-foreground group-hover/q:text-[#5B45E0] dark:group-hover/q:text-[#7B62FF]",
              row.status === "rejected" && "text-muted-foreground line-through decoration-muted-foreground/50")}>{row.query}</span>
          </button>
        </td>
        <td className={cn(TD, "text-right font-mono tabular-nums whitespace-nowrap")}>{NUM.format(row.impressions)}</td>
        <td className={cn(TD, "text-right font-mono tabular-nums whitespace-nowrap")}>
          {NUM.format(row.clicks)}
          <span className="ml-1.5 text-[11px] text-muted-foreground">{(row.ctr * 100).toFixed(1)}%</span>
        </td>
        <td className={cn(TD, "text-right")}>
          <span className={cn("inline-flex h-6 min-w-10 items-center justify-center rounded-md px-1.5 font-mono text-[11.5px] tabular-nums", posTone(row.position))}>
            {row.position.toFixed(1)}
          </span>
        </td>
        <td className={TD}><DiagnosisPill diagnosis={row.diagnosis} /></td>
        <td className={cn(TD, "text-right whitespace-nowrap")}>
          {row.gain ? (
            <span className="inline-flex items-center gap-1">
              <span className="font-medium text-foreground">≈ +{NUM.format(row.gain.clicks)}</span>
              <span className="text-[11px] text-muted-foreground">clicks</span>
              <InfoTip label="About this estimate">
                Estimated extra clicks in {LOOKBACK_DAYS} days {row.gain.basis === "now" ? "at the current rank, by getting a normal click rate (better title and description)." : "if it reaches #5 on Google."} A rough guide, not a promise.
              </InfoTip>
            </span>
          ) : <span className="text-muted-foreground">—</span>}
        </td>
        <td className={TD}>
          {row.rankingPage ? (
            <div className="w-[260px] space-y-0.5">
              <div className="flex items-start gap-1.5">
                <PageLink row={row} className="leading-snug text-foreground" />
                {row.rankingPagePosition != null && <span className="mt-px shrink-0 rounded bg-muted px-1 font-mono text-[10.5px] tabular-nums text-muted-foreground">#{row.rankingPagePosition}</span>}
              </div>
              <div className="break-all font-mono text-[11px] text-muted-foreground">{pathOf(row.rankingPage)}</div>
              {titleIsGuess(row) && <div className="text-[10.5px] text-muted-foreground">(title from URL)</div>}
            </div>
          ) : <span className="text-muted-foreground">—</span>}
        </td>
        <td className={TD}><ActionPill action={row.action} /></td>
        <td className={TD}><div className="w-[200px] break-words leading-snug">{where}</div></td>
        <td className={TD}>
          {uses.options.length ? (
            <div className="flex w-[230px] flex-wrap gap-1.5">
              {uses.options.map((o) => <UseChip key={o} option={o} inferred={uses.inferred} />)}
            </div>
          ) : <span className="text-muted-foreground">—</span>}
        </td>
        <td className={TD}>
          {(row.action === "assign" || row.action === "hub") && row.anchors.length ? (
            <div className="flex w-[220px] flex-wrap gap-1">
              {row.anchors.map((a) => <span key={a} className="rounded-md border border-border bg-background px-1.5 py-0.5 text-[11.5px] leading-snug">{a}</span>)}
            </div>
          ) : <span className="text-muted-foreground">—</span>}
        </td>
        <td className={TD}><StatusPill status={row.status} /></td>
        {canManage && (
          <td className={cn(TD, "pr-5")}>
            <div className="flex items-center gap-1.5">
              {pending ? (
                <span className="inline-flex h-7 items-center gap-1.5 text-[12px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Saving...</span>
              ) : (
                <>
                  {row.status === "rejected" && (
                    <RowButton label="Restore" icon={<RotateCcw aria-hidden />} tone="neutral" blockedReason={lockReason}
                      onClick={() => commit({ status: "suggested" })} />
                  )}
                  {row.status !== "accepted" && (
                    <span className="inline-flex items-center gap-0.5">
                      <RowButton label="Approve" icon={<Check aria-hidden />} tone="approve" blockedReason={lockReason ?? blocked} onClick={() => setConfirm("approve")} />
                      <InfoTip label="What approving does">{APPROVE_TIP}</InfoTip>
                    </span>
                  )}
                  {row.status !== "rejected" && (
                    <span className="inline-flex items-center gap-0.5">
                      <RowButton label="Reject" icon={<X aria-hidden />} tone="reject" blockedReason={lockReason} onClick={() => setConfirm("reject")} />
                      <InfoTip label="What rejecting does">{REJECT_TIP}</InfoTip>
                    </span>
                  )}
                  <RowButton label="Edit" icon={<Pencil aria-hidden />} tone="neutral" active={editing} blockedReason={lockReason} onClick={startEdit} />
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
              <p>Not right? Cancel and use Edit to change it first.</p>
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
        <tr id={detailId}>
          <td colSpan={colCount} className="border-b border-border/60 bg-muted/20 p-0">
            {/* Pinned to the visible width, so the card never needs sideways scrolling. */}
            <div className="sticky left-0 p-4" style={Number.isFinite(cardWidth) ? { width: cardWidth } : undefined}>
              {editing ? (
                <QueryEditor row={row} posts={posts} hub={hub} saving={pending}
                  onCancel={() => setEditing(false)}
                  onSave={(patch) => commit(patch, () => setEditing(false))} />
              ) : (
                <QueryCard row={row} postTitle={postTitle} hub={hub} />
              )}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

// ------------------------------------------------------------ the open card

function CardSection({ n, title, children, className }: { n: number; title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 space-y-2", className)}>
      <h4 className={cn(SECTION_LABEL, "flex items-center gap-1.5")}>
        <span className="flex size-4 items-center justify-center rounded-full bg-muted text-[9.5px] text-muted-foreground">{n}</span>{title}
      </h4>
      {children}
    </section>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-mono text-[14px] font-semibold tabular-nums text-foreground">{children}</div>
    </div>
  );
}

/** The open row: data, page, what's wrong, what to do (with drafts), why this page, benefit. */
function QueryCard({ row, postTitle, hub }: { row: ClusterGscQuery; postTitle: Map<string, string>; hub: Hub }) {
  const info = row.rankingPageInfo;
  const post = row.itemId ? postTitle.get(row.itemId) : undefined;
  const { options, inferred } = usesOf(row);
  const h1Differs = !!info?.liveH1 && info.liveH1.trim().toLowerCase() !== pageTitleOf(row).trim().toLowerCase();

  return (
    <div className="space-y-5 rounded-xl border border-border bg-background p-5 shadow-sm">
      <div className="grid gap-5 lg:grid-cols-3">
        <CardSection n={1} title="Search term">
          <p className="break-words text-[15px] font-semibold leading-snug text-foreground">{row.query}</p>
          <div className="grid grid-cols-4 gap-3">
            <Stat label="Impressions">{NUM.format(row.impressions)}</Stat>
            <Stat label="Google rank">{row.position.toFixed(1)}</Stat>
            <Stat label="Clicks">{NUM.format(row.clicks)}</Stat>
            <Stat label="Click rate">{(row.ctr * 100).toFixed(1)}%</Stat>
          </div>
        </CardSection>

        <CardSection n={2} title="Our page in Google">
          {row.rankingPage ? (
            <div className="space-y-1 text-[12.5px]">
              <div className="flex flex-wrap items-baseline gap-x-1.5">
                <PageLink row={row} className="font-medium text-foreground" />
                <span className="text-muted-foreground">#{rankOf(row)}</span>
                {titleIsGuess(row) && <span className="text-muted-foreground">(title from URL)</span>}
              </div>
              {h1Differs && <div className="text-muted-foreground">Heading on the page (H1): <span className="text-foreground">{info?.liveH1}</span></div>}
              <div className="break-all font-mono text-[11.5px] text-muted-foreground">{row.rankingPage}</div>
              {(info?.clusterName || info?.primaryKeyword) && (
                <div className="text-muted-foreground">
                  {info?.clusterName && <>Cluster: <span className="text-foreground">{info.clusterName}</span></>}
                  {info?.clusterName && info?.primaryKeyword && " · "}
                  {info?.primaryKeyword && <>Keyword: <span className="text-foreground">{info.primaryKeyword}</span></>}
                </div>
              )}
              {!info?.liveTitle && <div className="text-[11px] text-muted-foreground">The live title and heading are checked at the next refresh.</div>}
            </div>
          ) : <p className="text-[12.5px] text-muted-foreground">None of our pages shows up for this search yet.</p>}
        </CardSection>

        <CardSection n={3} title="What's wrong">
          <DiagnosisPill diagnosis={row.diagnosis} />
          <p className="text-[12.5px] leading-relaxed text-foreground">{DIAGNOSIS_EXPLAIN[row.diagnosis]}</p>
        </CardSection>
      </div>

      <CardSection n={4} title="What to do" className="border-t border-border pt-5">
        <div className="flex items-start gap-2">
          <ActionPill action={row.action} className="shrink-0" />
          <p className="pt-0.5 text-[13px] leading-relaxed text-muted-foreground"><WhatToDo row={row} postTitle={postTitle} hub={hub} /></p>
        </div>
        {options.length > 0 && (
          <>
            {inferred && <p className="text-[11.5px] text-muted-foreground">Nobody has chosen how to use it yet; these are the default suggestions.</p>}
            {!row.drafts && (
              <p className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-[12px] text-muted-foreground">
                <Sparkles className="size-3.5 text-[#5B45E0]" aria-hidden /> Claude&apos;s ready-to-use wording appears after the next refresh. You can also write it yourself with Edit.
              </p>
            )}
            <ol className="space-y-3">
              {options.map((o, i) => <DraftStep key={o} n={i + 1} option={o} row={row} />)}
            </ol>
          </>
        )}
      </CardSection>

      <div className="grid gap-5 border-t border-border pt-5 lg:grid-cols-2">
        <CardSection n={5} title={row.action === "update_existing" ? "Why this page (not a new one)" : "Why here"}>
          <p className="text-[12.5px] leading-relaxed text-foreground">{whyThisPage(row, post)}</p>
          {row.reason && <p className="text-[12px] leading-relaxed text-muted-foreground">Claude&apos;s note: {row.reason}</p>}
          <p className="text-[11.5px] text-muted-foreground">
            {row.matchedKeyword && <>Found through the keyword <span className="text-foreground">{row.matchedKeyword}</span>. </>}
            {row.assignedBy && <>Suggested by {SUGGESTED_BY[row.assignedBy]}.</>}
          </p>
        </CardSection>
        <CardSection n={6} title="Estimated benefit">
          {row.gain ? (
            <p className="text-[12.5px] leading-relaxed text-foreground">
              <span className="text-[15px] font-semibold">≈ +{NUM.format(row.gain.clicks)} clicks</span> in {LOOKBACK_DAYS} days{" "}
              <span className="text-muted-foreground">
                {row.gain.basis === "now" ? "at the current rank, if the click rate becomes normal for that spot." : "if the page climbs to #5 on Google."} This is an estimate, not a promise.
              </span>
            </p>
          ) : <p className="text-[12.5px] text-muted-foreground">No clear extra clicks to estimate: it&apos;s already doing about as well as its rank allows.</p>}
        </CardSection>
      </div>
    </div>
  );
}

function DraftText({ text, children }: { text: string | null | undefined; children?: ReactNode }) {
  if (!text) return <p className="text-[12px] italic text-muted-foreground">No draft yet - write your own, or add it with Edit.</p>;
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="min-w-0 break-words text-[13px] leading-relaxed text-foreground">{children ?? text}</div>
      <CopyButton text={text} />
    </div>
  );
}

/** One numbered "what to do" item with Claude's draft. */
function DraftStep({ n, option, row }: { n: number; option: QueryUseOption; row: ClusterGscQuery }) {
  const d = row.drafts;
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#5B45E0]/10 text-[11px] font-semibold text-[#5B45E0] dark:text-[#7B62FF]">{n}</span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
          {USE_OPTION_LABEL[option]}
          <InfoTip label={`About ${USE_OPTION_LABEL[option]}`}>{USE_OPTION_HINT[option]}</InfoTip>
        </div>
        {option === "title_meta" && (
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">New page title <Counter n={d?.title?.length ?? 0} max={TITLE_MAX} /></div>
                <DraftText text={d?.title} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">New meta description <Counter n={d?.meta?.length ?? 0} max={META_MAX} /></div>
                <DraftText text={d?.meta} />
              </div>
            </div>
            {(d?.title || d?.meta) && <SerpPreview title={d?.title ?? ""} meta={d?.meta ?? ""} url={row.rankingPage} />}
          </div>
        )}
        {option === "template" && <DraftText text={d?.template}><span className="whitespace-pre-line">{d?.template}</span></DraftText>}
        {option === "h2" && <DraftText text={d?.h2}><span className="font-semibold">{d?.h2}</span></DraftText>}
        {option === "faq" && (
          d?.faqQuestion ? (
            <div className="space-y-1.5">
              <DraftText text={d.faqQuestion}><span className="font-semibold">Q: {d.faqQuestion}</span></DraftText>
              <DraftText text={d.faqAnswer}><span>A: {d.faqAnswer}</span></DraftText>
            </div>
          ) : <DraftText text={null} />
        )}
        {option === "paragraph" && <DraftText text={d?.paragraph} />}
        {option === "link_text" && (
          row.anchors.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {row.anchors.map((a) => <span key={a} className="rounded-md border border-border bg-muted/20 px-2 py-1 text-[12.5px] text-foreground">{a}</span>)}
              <CopyButton text={row.anchors.join("\n")} label="Copy all" />
            </div>
          ) : <p className="text-[12px] text-muted-foreground">Links can use the search term itself. Add other wordings with Edit.</p>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------- the editor

type DraftForm = Required<{ [K in keyof QueryDrafts]: string }>;

function QueryEditor({ row, posts, hub, saving, onCancel, onSave }: {
  row: ClusterGscQuery; posts: Post[]; hub: Hub; saving: boolean;
  onCancel: () => void; onSave: (patch: Patch) => void;
}) {
  const initialUses = usesOf(row).options;
  const [action, setAction] = useState<QueryAction>(row.action);
  const [itemId, setItemId] = useState(row.itemId ?? "");
  const [uses, setUses] = useState<QueryUseOption[]>(initialUses);
  const [anchors, setAnchors] = useState(row.anchors.join("; "));
  const [draft, setDraft] = useState<DraftForm>({
    title: row.drafts?.title ?? "", meta: row.drafts?.meta ?? "", h2: row.drafts?.h2 ?? "",
    faqQuestion: row.drafts?.faqQuestion ?? "", faqAnswer: row.drafts?.faqAnswer ?? "",
    paragraph: row.drafts?.paragraph ?? "", template: row.drafts?.template ?? "",
  });

  const usesPost = action === "assign";
  const usesOptions = USED.has(action);
  const usesAnchors = action === "assign" || action === "hub" || uses.includes("link_text");
  const parsed = parseAnchors(anchors);
  const missingPost = usesPost && !itemId;
  const missingUse = usesOptions && uses.length === 0;
  const fieldId = (f: string) => `gsc-edit-${row.id}-${f}`;
  const set = (k: keyof DraftForm) => (e: { target: { value: string } }) => setDraft((p) => ({ ...p, [k]: e.target.value }));
  const has = (o: QueryUseOption) => usesOptions && uses.includes(o);

  const changeAction = (a: QueryAction) => {
    setAction(a);
    // Moving a row into use with nothing chosen: start from the suggested options.
    if (USED.has(a) && uses.length === 0) setUses(suggestedUseOptions(row, a));
  };
  const toggleUse = (o: QueryUseOption) => setUses((prev) => (prev.includes(o) ? prev.filter((x) => x !== o) : USE_OPTIONS.filter((x) => x === o || prev.includes(x))));

  const submit = () => {
    if (missingPost || missingUse || saving) return;
    const patch: Patch = { action };
    if (usesPost) patch.item_id = itemId;
    if (usesOptions) {
      patch.usages = uses;
      patch.usage = legacyUsage(uses);
      const clean = (s: string) => s.trim() || null;
      patch.drafts = {
        title: clean(draft.title), meta: clean(draft.meta), h2: clean(draft.h2),
        faqQuestion: clean(draft.faqQuestion), faqAnswer: clean(draft.faqAnswer),
        paragraph: clean(draft.paragraph), template: clean(draft.template),
      };
    }
    if (usesAnchors) patch.anchors = parsed.slice(0, 5);
    onSave(patch);
  };

  const label = "flex items-center gap-1 text-[11.5px] font-semibold text-muted-foreground";

  return (
    <form className="space-y-5 rounded-xl border border-[#5B45E0]/30 bg-background p-5 shadow-sm" aria-label={`Edit "${row.query}"`}
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onCancel(); } }}>
      <div className="space-y-0.5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#5B45E0] dark:text-[#7B62FF]">Editing</div>
        <div className="break-words text-[15px] font-semibold text-foreground">{row.query}</div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor={fieldId("action")} className={label}>What to do <InfoTip label="About What to do"><ActionLegend /></InfoTip></label>
          <select id={fieldId("action")} className={SELECT} value={action} autoFocus disabled={saving}
            onChange={(e) => changeAction(e.target.value as QueryAction)}>
            {ACTION_ORDER.map((a) => <option key={a} value={a}>{ACTION_FULL[a]}</option>)}
          </select>
          <p className="text-[11.5px] leading-snug text-muted-foreground">{ACTION_HELP[action]}</p>
        </div>

        <div className="space-y-1">
          <label htmlFor={usesPost ? fieldId("post") : undefined} className={label}>{usesPost ? "Which post" : "Where"}</label>
          {usesPost ? (
            <>
              <select id={fieldId("post")} className={cn(SELECT, missingPost && "border-warning-400")} value={itemId} disabled={saving}
                onChange={(e) => setItemId(e.target.value)} aria-invalid={missingPost || undefined}>
                <option value="">Pick a post...</option>
                {posts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              {missingPost && <p className="text-[11.5px] text-warning-700 dark:text-warning-300">Choose which post should use this search.</p>}
            </>
          ) : (
            <div className="min-h-8 pt-1.5 text-[12.5px] text-foreground">
              {action === "hub" ? <>Hub page: {hubNameOf(hub)}</>
                : action === "update_existing" ? (row.rankingPage ? <><PageLink row={row} /> <span className="text-muted-foreground">#{rankOf(row)}</span></> : "The page it already shows up on")
                : <span className="text-muted-foreground">—</span>}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor={usesAnchors ? fieldId("anchors") : undefined} className={label}>
            Link text <InfoTip label="About link text">Other wordings our posts and hub can use when they link to this page, so the links don&apos;t all use the exact same words. Separate with semicolons, up to 5.</InfoTip>
          </label>
          {usesAnchors ? (
            <>
              <Input id={fieldId("anchors")} value={anchors} disabled={saving} onChange={(e) => setAnchors(e.target.value)}
                placeholder="wording 1; wording 2" className="h-8 text-[12.5px]" aria-describedby={fieldId("anchors-hint")} />
              <p id={fieldId("anchors-hint")} className={cn("text-[11.5px] text-muted-foreground", parsed.length > 5 && "text-warning-700 dark:text-warning-300")}>
                {parsed.length > 5 ? `Only the first 5 of ${parsed.length} will be kept.` : `${parsed.length} of 5 · separate with ;`}
              </p>
            </>
          ) : <div className="pt-1.5 text-[12px] text-muted-foreground">Only for posts, the hub page, or when Link text is chosen below.</div>}
        </div>
      </div>

      <div className="space-y-2">
        <div id={fieldId("uses")} className={label}>How to use <span className="font-normal">(pick one or more)</span> <InfoTip label="About How to use"><UseLegend /></InfoTip></div>
        {usesOptions ? (
          <>
            <div role="group" aria-labelledby={fieldId("uses")} className="flex flex-wrap gap-1.5">
              {USE_OPTIONS.map((o) => {
                const on = uses.includes(o);
                return (
                  <button key={o} type="button" aria-pressed={on} disabled={saving} onClick={() => toggleUse(o)} title={USE_OPTION_HINT[o]}
                    className={cn("inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B45E0]/40",
                      on ? CHIP_ON : CHIP_OFF)}>
                    {on ? <Check className="size-3.5" aria-hidden /> : <Plus className="size-3.5 opacity-60" aria-hidden />}
                    {USE_OPTION_LABEL[o]}
                  </button>
                );
              })}
            </div>
            {missingUse && <p className="text-[11.5px] text-warning-700 dark:text-warning-300">Pick at least one way to use this search.</p>}
          </>
        ) : <p className="text-[12px] text-muted-foreground">Not needed: this search won&apos;t be added to a page.</p>}
      </div>

      {usesOptions && uses.some((o) => o !== "link_text") && (
        <div className="space-y-4 border-t border-border pt-4">
          <div className={label}>Wording <span className="font-normal">(Claude&apos;s drafts; change anything)</span></div>
          {has("title_meta") && (
            <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between"><label htmlFor={fieldId("title")} className={label}>Page title</label><Counter n={draft.title.length} max={TITLE_MAX} /></div>
                  <Input id={fieldId("title")} value={draft.title} onChange={set("title")} disabled={saving} aria-invalid={draft.title.length > TITLE_MAX || undefined} className="h-8 text-[12.5px]" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between"><label htmlFor={fieldId("meta")} className={label}>Meta description</label><Counter n={draft.meta.length} max={META_MAX} /></div>
                  <Textarea id={fieldId("meta")} value={draft.meta} onChange={set("meta")} disabled={saving} rows={2} aria-invalid={draft.meta.length > META_MAX || undefined} className="text-[12.5px]" />
                </div>
              </div>
              <SerpPreview title={draft.title} meta={draft.meta} url={row.rankingPage} />
            </div>
          )}
          {has("h2") && (
            <div className="space-y-1">
              <label htmlFor={fieldId("h2")} className={label}>Section heading</label>
              <Input id={fieldId("h2")} value={draft.h2} onChange={set("h2")} disabled={saving} className="h-8 text-[12.5px]" />
            </div>
          )}
          {has("faq") && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label htmlFor={fieldId("faqq")} className={label}>FAQ question</label>
                <Input id={fieldId("faqq")} value={draft.faqQuestion} onChange={set("faqQuestion")} disabled={saving} className="h-8 text-[12.5px]" />
              </div>
              <div className="space-y-1">
                <label htmlFor={fieldId("faqa")} className={label}>FAQ answer</label>
                <Textarea id={fieldId("faqa")} value={draft.faqAnswer} onChange={set("faqAnswer")} disabled={saving} rows={3} className="text-[12.5px]" />
              </div>
            </div>
          )}
          {has("paragraph") && (
            <div className="space-y-1">
              <label htmlFor={fieldId("para")} className={label}>Sentence for a paragraph</label>
              <Textarea id={fieldId("para")} value={draft.paragraph} onChange={set("paragraph")} disabled={saving} rows={2} className="text-[12.5px]" />
            </div>
          )}
          {has("template") && (
            <div className="space-y-1">
              <label htmlFor={fieldId("tpl")} className={label}>What the template / tool should include</label>
              <Textarea id={fieldId("tpl")} value={draft.template} onChange={set("template")} disabled={saving} rows={3} className="text-[12.5px]" />
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button type="submit" size="sm" variant="brand" className="gap-1.5" disabled={saving || missingPost || missingUse}>
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <span className="text-[11.5px] text-muted-foreground">Your change is kept when the list is refreshed. {row.status === "accepted" && "It stays approved and the brief updates."}</span>
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
  const colCount = 6 + (canManage ? 1 : 0);

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
        <table className="w-max min-w-full border-separate border-spacing-0 text-[12.5px]">
          <caption className="sr-only">New page suggestions</caption>
          <thead>
            <tr>
              <SortTh label="Search term" k="query" sort={sort} onSort={onSort} className={cn(PIN_TH, "left-0 z-30")} />
              <SortTh label="Impressions" k="impressions" sort={sort} onSort={onSort} align="right"
                info={<>How many times we showed up in Google for this search (last {LOOKBACK_DAYS} days).</>} />
              <SortTh label="Rank" k="position" sort={sort} onSort={onSort} align="right" info="Our average spot in Google for this search (1 = top of the page)." />
              <SortTh label="Est. gain" k="gain" sort={sort} onSort={onSort} align="right" info="Estimated extra clicks over 90 days if a page for it reached #5. A rough guide, not a promise." />
              <Th info="The we360.ai page Google shows for this search today, if any.">Our page</Th>
              <Th info="Why Claude thinks this deserves its own page.">Why</Th>
              {canManage && <th scope="col" className={cn(TH, "pr-5")}><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={colCount} className="px-4 py-8">
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
      const r = await saveQuery({ project_id: projectId, id: row.id, status });
      if (!r.ok) { toast.error(r.error ?? "Could not save."); return; }
      start(() => router.refresh());
    } catch { toast.error("Could not save - try again."); }
    finally { setBusy(null); }
  };

  return (
    <tr className={cn("group/row hover:bg-[color-mix(in_oklab,var(--muted)_70%,var(--background))] [&>td]:border-b [&>td]:border-border/60", isDismissed && "text-muted-foreground")}>
      <td className={cn(TD, PIN, "left-0 z-10 bg-background group-hover/row:bg-[color-mix(in_oklab,var(--muted)_70%,var(--background))]")}>
        <div className={cn("w-[260px] break-words font-medium leading-snug text-foreground", isDismissed && "text-muted-foreground line-through")}>{row.query}</div>
      </td>
      <td className={cn(TD, "text-right font-mono tabular-nums")}>{NUM.format(row.impressions)}</td>
      <td className={cn(TD, "text-right")}>
        <span className={cn("inline-flex h-6 min-w-10 items-center justify-center rounded-md px-1.5 font-mono text-[11.5px] tabular-nums", posTone(row.position))}>{row.position.toFixed(1)}</span>
      </td>
      <td className={cn(TD, "text-right whitespace-nowrap")}>
        {row.gain ? <span className="font-medium text-foreground">≈ +{NUM.format(row.gain.clicks)} <span className="text-[11px] font-normal text-muted-foreground">clicks</span></span> : <span className="text-muted-foreground">—</span>}
      </td>
      <td className={TD}>
        {row.rankingPage ? (
          <div className="w-[240px] space-y-0.5">
            <div className="flex items-start gap-1.5"><PageLink row={row} className="leading-snug text-foreground" />{row.rankingPagePosition != null && <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">#{row.rankingPagePosition}</span>}</div>
            <div className="break-all font-mono text-[11px] text-muted-foreground">{pathOf(row.rankingPage)}</div>
          </div>
        ) : <span className="text-muted-foreground">—</span>}
      </td>
      <td className={TD}><div className="w-[320px] leading-relaxed text-muted-foreground">{row.reason ?? "—"}</div></td>
      {canManage && (
        <td className={cn(TD, "pr-5")}>
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
