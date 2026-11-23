// Blog Clusters - GSC queries (GC-1..GC-7). Pure, client-safe types: client
// components import from here, never from the server-only data/actions modules.

export type QueryAction = "unassigned" | "assign" | "hub" | "update_existing" | "new_post" | "ignore";
export type QueryUsage = "h2" | "faq" | "body";
export type QueryStatus = "suggested" | "accepted" | "rejected";
export type AssignedBy = "ai" | "rule" | "keyword" | "manual";

export const QUERY_ACTION_LABEL: Record<QueryAction, string> = {
  unassigned: "Unassigned",
  assign: "Use in a post",
  hub: "Use on hub page",
  update_existing: "Update existing page",
  new_post: "New post",
  ignore: "Ignore",
};

export const QUERY_USAGE_LABEL: Record<QueryUsage, string> = { h2: "H2", faq: "FAQ", body: "Body" };

/** Thresholds agreed with the PM. */
export const MIN_IMPRESSIONS = 50;        // last 90 days, to be fetched at all
export const NEW_POST_MIN_IMPRESSIONS = 200; // to be suggested as a new post
export const LOOKBACK_DAYS = 90;
export const UPDATE_EXISTING_MAX_POSITION = 20; // ranks top 20 on another page -> update that page

/** What we know about the page a query already ranks on (so "update existing page" names it). */
export interface RankingPageInfo {
  /** The page's title - from our cluster posts / published tasks, else made readable from the URL. */
  title: string;
  /** Its primary keyword, when it's one of our planned/published pages. */
  primaryKeyword: string | null;
  /** Which cluster it belongs to, when it's a cluster post. */
  clusterName: string | null;
  /** cluster = a Blog Clusters post; task = a published Sprint task; homepage; url = title guessed from the URL. */
  source: "cluster" | "task" | "homepage" | "url";
}

export interface ClusterGscQuery {
  id: string;
  query: string;
  /** Title / keyword of the page in rankingPage (null when there is no ranking page). */
  rankingPageInfo: RankingPageInfo | null;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  rankingPage: string | null;
  rankingPagePosition: number | null;
  matchedKeyword: string | null;
  action: QueryAction;
  itemId: string | null;
  usage: QueryUsage | null;
  anchors: string[];
  reason: string | null;
  status: QueryStatus;
  assignedBy: AssignedBy | null;
  fetchedAt: string;
}

export interface ClusterGscRefreshInfo {
  at: string;
  fetched: number;
  added: number;
  /** "ok" = Claude assigned the new queries; "fallback" = keyword matching was used instead. */
  ai: "ok" | "fallback" | "skipped";
  aiError?: string | null;
  /** Query+page rows Search Console returned before the whole-word filter and 50-impression threshold. */
  rawRows?: number;
  /** How many cluster keywords were searched. */
  keywords?: number;
}

export interface ClusterHub {
  title: string;
  slug: string | null;
  keyword: string | null;
}

export interface ClusterGscData {
  /** False until migration 20261123000001 is applied. */
  ready: boolean;
  hub: ClusterHub;
  refresh: ClusterGscRefreshInfo | null;
  queries: ClusterGscQuery[];
}

/** One query a post should cover, as written into the post by "Apply all". */
export interface PostGscQuery {
  query: string;
  usage: QueryUsage;
  impressions: number;
  position: number;
}

export type AnchorType = "exact" | "gsc" | "natural";

export interface AnchorPick {
  type: AnchorType;
  text: string;
}

/** A post's anchor-text plan (topic_cluster_items.anchor_plan). */
export interface AnchorPlan {
  /** The anchor this post uses when it links to the hub page. */
  toHub?: AnchorPick | null;
  /** The anchor the hub page uses when it links to this post. */
  fromHub?: AnchorPick | null;
  /** Approved GSC-based anchor variants for links into this post. */
  variants?: string[];
  /** Natural, descriptive phrasings Claude wrote for this post (used for the "natural" share of the split). */
  naturalToHub?: string | null;
  naturalFromHub?: string | null;
}

/** The agreed anchor-text split (share of links of each type). */
export const ANCHOR_SPLIT = {
  toHub: { exact: 0.3, gsc: 0.4, natural: 0.3 },
  fromHub: { exact: 0.2, gsc: 0.3, natural: 0.5 },
} as const;
