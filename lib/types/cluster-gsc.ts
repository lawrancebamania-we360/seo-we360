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

// ---- GC-8..GC-11: how to use a search term, what's wrong, drafts, estimated gain ----

/** The ways a search term can be used on a page (more than one allowed). */
export type QueryUseOption = "title_meta" | "template" | "h2" | "faq" | "paragraph" | "link_text";
export const USE_OPTIONS: QueryUseOption[] = ["title_meta", "template", "h2", "faq", "paragraph", "link_text"];
export const USE_OPTION_LABEL: Record<QueryUseOption, string> = {
  title_meta: "Fix title & meta",
  template: "Template / tool",
  h2: "Section heading",
  faq: "FAQ question",
  paragraph: "Mention in a paragraph",
  link_text: "Link text",
};
/** When each option is the right one - plain words for tooltips. */
export const USE_OPTION_HINT: Record<QueryUseOption, string> = {
  title_meta: "We already show on page 1 but people rarely click. Rewrite the page title and meta description (what Google shows) so they match this search.",
  template: "People searching this want something to download or use - a template, example, checklist or calculator. Add one to the page.",
  h2: "A distinct sub-topic: give it its own section with a heading.",
  faq: "A question people ask: add it to the page's FAQ with a short, direct answer.",
  paragraph: "A close variant of what the page covers: mention it naturally in an existing paragraph.",
  link_text: "Other pages should link to this page using these words.",
};

/** Mobile-first snippet limits (what fits on a phone's Google result). */
export const TITLE_MAX = 60;
export const META_MAX = 120;

/** Claude's ready-to-use wording for each chosen option. */
export interface QueryDrafts {
  title?: string | null;
  meta?: string | null;
  h2?: string | null;
  faqQuestion?: string | null;
  faqAnswer?: string | null;
  paragraph?: string | null;
  /** What the template / tool should contain. */
  template?: string | null;
  /** GC-17: what our page already has for this search (so we don't suggest it again). */
  alreadyOnPage?: string | null;
  /** GC-17: why Google's top 3 rank for this search, in one or two plain sentences. */
  whyTheyRank?: string | null;
  /** GC-17: false when the suggested title drops the page's main keyword (flagged, not suggested). */
  titleKeepsPrimary?: boolean | null;
}

// ---- GC-15 / GC-16: our page and Google's top 3 ----

/** A quick read of a page: what's on it, for planning changes. */
export interface PageScan {
  title: string | null;
  meta: string | null;
  h1: string | null;
  /** H2 / H3 headings in page order (capped). */
  headings: { level: 2 | 3; text: string }[];
  /** FAQ questions found (FAQPage schema or question headings). */
  faqs: string[];
  wordCount: number;
  /** Has a downloadable/usable template, sheet, calculator or tool. */
  hasTemplate: boolean;
}

/** Our target page's scan, as stored (GC-15). */
export interface TargetPageScan extends PageScan {
  url: string;
  ok: boolean;
  at: string;
}

export interface SerpTopResult {
  position: number;
  url: string;
  title: string;
  description: string | null;
  /** Quick scan of the result page; null when it couldn't be read (some sites block it). */
  scan: PageScan | null;
}

/** Google's results for one search term (GC-16). */
export interface QuerySerp {
  country: "us";
  device: "mobile";
  at: string;
  /** Top 3 organic results (our own site excluded). */
  top: SerpTopResult[];
  /** Where we rank in these results, if at all. */
  ourPosition: number | null;
  /** "People also ask" questions - good FAQ material. */
  paa: string[];
}

/** What's wrong, from rank and clicks. */
export type QueryDiagnosis = "snippet" | "performing" | "striking" | "weak";
export const DIAGNOSIS_LABEL: Record<QueryDiagnosis, string> = {
  snippet: "Seen but not clicked",
  performing: "Already working",
  striking: "Close to page 1",
  weak: "Not ranking well",
};
export const DIAGNOSIS_EXPLAIN: Record<QueryDiagnosis, string> = {
  snippet: "We show on Google's first page, but people rarely click. Usually the title/description doesn't match the search, or the page doesn't offer what they want.",
  performing: "We rank on page 1 and get a normal share of clicks. Protect it - don't change much.",
  striking: "We rank 11-20, just off page 1. Strengthening the content for this search can push it onto page 1.",
  weak: "We rank below 20. The page doesn't really cover this search yet - it needs proper coverage.",
};

/** Estimated extra clicks over the 90-day window. */
export interface ClickGain {
  clicks: number;
  /** "now" = by fixing the click rate at the current rank; "rank5" = if it climbs to #5. */
  basis: "now" | "rank5";
}

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
  /** The page's real <title> and first <h1>, fetched from the live page at refresh (null until then). */
  liveTitle: string | null;
  liveH1: string | null;
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
  /** Legacy single usage (kept for older rows); `usages` is the source of truth. */
  usage: QueryUsage | null;
  /** How to use the search term - one or more options (GC-8). */
  usages: QueryUseOption[];
  /** Claude's ready-to-use wording per option (GC-10); null until drafted. */
  drafts: QueryDrafts | null;
  /** What's wrong, from rank and clicks (GC-9). */
  diagnosis: QueryDiagnosis;
  /** Estimated extra clicks over 90 days (GC-11); null when there's nothing to gain. */
  gain: ClickGain | null;
  /** The page this term's changes go on (live URL); null for a planned post with no page yet (GC-17). */
  targetUrl: string | null;
  /** Our target page as last read (GC-15); null until scanned. */
  targetScan: TargetPageScan | null;
  /** Google's top 3, US mobile (GC-16); null until checked. */
  serp: QuerySerp | null;
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
  /** Legacy single usage; prefer `usages`. */
  usage: QueryUsage;
  impressions: number;
  position: number;
  /** How to use it (GC-8) and Claude's wording (GC-10) - present on posts applied after GC-8. */
  usages?: QueryUseOption[];
  drafts?: QueryDrafts | null;
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
