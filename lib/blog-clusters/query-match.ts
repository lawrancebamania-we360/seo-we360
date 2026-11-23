// Blog Clusters - GSC queries: pure matching / allocation logic (no I/O), so it
// is unit-testable and shared by the refresh job, the actions and the UI.

import {
  ANCHOR_SPLIT, NEW_POST_MIN_IMPRESSIONS, UPDATE_EXISTING_MAX_POSITION,
  type AnchorPick, type AnchorPlan, type AnchorType, type PostGscQuery, type QueryAction, type QueryUsage,
} from "@/lib/types/cluster-gsc";

// ---------------------------------------------------------------------------
// Keywords
// ---------------------------------------------------------------------------

export function normalizeKeyword(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Unique, normalized cluster keywords worth matching on (3+ chars). Longest first. */
export function clusterKeywords(raw: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const k of raw) {
    const n = normalizeKeyword(k);
    if (n.length >= 3) set.add(n);
  }
  return [...set].sort((a, b) => b.length - a.length);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * GSC `includingRegex` expressions (RE2) that match any of the keywords as whole
 * words, chunked so no single expression gets too long for the API.
 */
export function keywordRegexChunks(keywords: string[], maxLen = 1500): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let len = 0;
  for (const k of keywords) {
    const part = escapeRegex(k).replace(/ /g, "\\s+");
    if (current.length && len + part.length + 1 > maxLen) {
      chunks.push(`\\b(?:${current.join("|")})\\b`);
      current = [];
      len = 0;
    }
    current.push(part);
    len += part.length + 1;
  }
  if (current.length) chunks.push(`\\b(?:${current.join("|")})\\b`);
  return chunks;
}

/** The longest cluster keyword the query contains as whole words, else null. */
export function matchedKeyword(query: string, keywords: string[]): string | null {
  const q = ` ${normalizeKeyword(query).replace(/[^a-z0-9 ]+/g, " ")} `;
  for (const k of keywords) { // keywords are longest-first
    const kk = normalizeKeyword(k).replace(/[^a-z0-9 ]+/g, " ").trim();
    if (kk && q.includes(` ${kk} `)) return k;
  }
  return null;
}

// ---------------------------------------------------------------------------
// GSC rows -> one row per query
// ---------------------------------------------------------------------------

export interface GscQueryPageRow { query: string; page: string; clicks: number; impressions: number; position: number }

export interface AggregatedQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;           // impression-weighted across pages
  rankingPage: string | null; // the page with the most impressions
  rankingPagePosition: number | null;
}

export function aggregateQueryRows(rows: GscQueryPageRow[]): AggregatedQuery[] {
  const byQuery = new Map<string, { clicks: number; impressions: number; posWeighted: number; best: GscQueryPageRow | null }>();
  for (const r of rows) {
    const key = normalizeKeyword(r.query);
    if (!key) continue;
    const a = byQuery.get(key) ?? { clicks: 0, impressions: 0, posWeighted: 0, best: null };
    a.clicks += r.clicks;
    a.impressions += r.impressions;
    a.posWeighted += r.position * r.impressions;
    if (!a.best || r.impressions > a.best.impressions) a.best = r;
    byQuery.set(key, a);
  }
  return [...byQuery.entries()].map(([query, a]) => ({
    query,
    clicks: a.clicks,
    impressions: a.impressions,
    ctr: a.impressions ? a.clicks / a.impressions : 0,
    position: a.impressions ? Math.round((a.posWeighted / a.impressions) * 10) / 10 : 0,
    rankingPage: a.best?.page ?? null,
    rankingPagePosition: a.best ? Math.round(a.best.position * 10) / 10 : null,
  }));
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/** The last path segment of a URL, "host/path" or bare slug, lowercased. */
export function lastSegment(urlOrSlug: string | null | undefined): string | null {
  if (!urlOrSlug) return null;
  let path = urlOrSlug.trim();
  try { path = new URL(path.includes("://") ? path : `https://x/${path.replace(/^\/+/, "")}`).pathname; } catch { /* keep raw */ }
  const seg = path.split(/[?#]/)[0].split("/").filter(Boolean).pop();
  return seg ? seg.toLowerCase() : null;
}

export function samePage(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = lastSegment(a);
  const y = lastSegment(b);
  return !!x && x === y;
}

export function slugify(s: string): string {
  return normalizeKeyword(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

/** "employee productivity roi" -> "Employee Productivity ROI"-ish title for a new post. */
export function titleFromQuery(q: string): string {
  const small = new Set(["a", "an", "and", "the", "of", "for", "to", "in", "on", "vs", "or", "with"]);
  const acronyms = new Set(["roi", "kpi", "kpis", "hr", "ai", "saas", "ems", "okr", "okrs", "crm", "b2b"]);
  return normalizeKeyword(q).split(" ").map((w, i) => {
    if (acronyms.has(w)) return w.toUpperCase();
    if (i > 0 && small.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(" ");
}

export function isQuestion(q: string): boolean {
  return /^(how|what|why|when|which|who|where|is|are|can|does|do|should)\b/.test(normalizeKeyword(q)) || q.trim().endsWith("?");
}

// ---------------------------------------------------------------------------
// Assignment rules (run after Claude, so they always win) + keyword fallback
// ---------------------------------------------------------------------------

export interface PostRef {
  id: string;
  title: string;
  primary: string | null;
  supporting: string[];
  /** Live URL or planned slug - used to recognise "this query already ranks on this post". */
  pages: Array<string | null>;
}

export interface HubRef { slug: string | null; keyword: string | null }

export interface Assignment {
  action: QueryAction;
  itemId: string | null;
  usage: QueryUsage | null;
  anchors: string[];
  reason: string;
}

/**
 * Hard rules on where a query must go, from the page it already ranks on:
 * a cluster post -> that post; the hub -> the hub; another we360 page in the
 * top 20 -> update that page. Returns null when no rule applies.
 */
export function ruleAssignment(
  q: { rankingPage: string | null; rankingPagePosition: number | null },
  posts: PostRef[], hub: HubRef,
): Pick<Assignment, "action" | "itemId" | "reason"> | null {
  if (!q.rankingPage) return null;
  const post = posts.find((p) => p.pages.some((pg) => samePage(pg, q.rankingPage)));
  if (post) return { action: "assign", itemId: post.id, reason: `Already ranks on this post (#${q.rankingPagePosition ?? "?"}).` };
  if (hub.slug && samePage(hub.slug, q.rankingPage)) return { action: "hub", itemId: null, reason: `Already ranks on the hub page (#${q.rankingPagePosition ?? "?"}).` };
  if ((q.rankingPagePosition ?? 999) <= UPDATE_EXISTING_MAX_POSITION) {
    return { action: "update_existing", itemId: null, reason: `Ranks #${q.rankingPagePosition} on an existing page - update that page instead of competing with it.` };
  }
  return null;
}

const STOP = new Set(["a", "an", "and", "the", "of", "for", "to", "in", "on", "vs", "or", "with", "how", "what", "is", "are", "best", "your", "my", "do", "does"]);
function tokens(s: string | null | undefined): Set<string> {
  return new Set(normalizeKeyword(s).replace(/[^a-z0-9 ]+/g, " ").split(" ").filter((t) => t.length > 1 && !STOP.has(t)));
}

/** Share of the query's meaningful words found in the post's keywords (0..1). */
export function overlapScore(query: string, post: PostRef): number {
  const q = tokens(query);
  if (!q.size) return 0;
  const p = new Set<string>();
  for (const k of [post.primary, post.title, ...post.supporting]) for (const t of tokens(k)) p.add(t);
  let hit = 0;
  for (const t of q) if (p.has(t)) hit++;
  return hit / q.size;
}

/** Keyword-overlap assignment, used when Claude is unavailable. */
export function keywordAssignment(q: { query: string; impressions: number }, posts: PostRef[], hub: HubRef): Assignment {
  let best: PostRef | null = null;
  let bestScore = 0;
  for (const p of posts) {
    const s = overlapScore(q.query, p);
    if (s > bestScore) { best = p; bestScore = s; }
  }
  const usage: QueryUsage = isQuestion(q.query) ? "faq" : "body";
  if (best && bestScore >= 0.6) {
    return { action: "assign", itemId: best.id, usage, anchors: [q.query], reason: `Keyword match with "${best.title}" (${Math.round(bestScore * 100)}% of words).` };
  }
  const hubScore = hub.keyword ? overlapScore(q.query, { id: "", title: hub.keyword, primary: hub.keyword, supporting: [], pages: [] }) : 0;
  if (hubScore >= 0.6) return { action: "hub", itemId: null, usage, anchors: [q.query], reason: "Matches the hub page's keyword." };
  if (q.impressions >= NEW_POST_MIN_IMPRESSIONS) return { action: "new_post", itemId: null, usage: null, anchors: [], reason: "High impressions and no post covers it well." };
  return { action: "unassigned", itemId: null, usage: null, anchors: [], reason: "No close match - pick a post by hand." };
}

// ---------------------------------------------------------------------------
// Anchor plan (the agreed split)
// ---------------------------------------------------------------------------

/** Spread type counts over n slots as evenly as possible, e.g. 7 x {0.3,0.4,0.3}. */
export function splitTypes(n: number, split: { exact: number; gsc: number; natural: number }): AnchorType[] {
  if (n <= 0) return [];
  const exact = Math.round(n * split.exact);
  const gsc = Math.min(n - exact, Math.round(n * split.gsc));
  const natural = n - exact - gsc;
  const counts: Record<AnchorType, number> = { exact, gsc, natural };
  const order: AnchorType[] = [];
  // Interleave by largest remaining share so the same type isn't bunched up.
  const left = { ...counts };
  for (let i = 0; i < n; i++) {
    const next = (Object.keys(left) as AnchorType[])
      .filter((t) => left[t] > 0)
      .sort((a, b) => left[b] / counts[b] - left[a] / counts[a] || left[b] - left[a])[0];
    order.push(next);
    left[next]--;
  }
  return order;
}

export interface AnchorPostInput {
  id: string;
  title: string;
  primary: string | null;
  isHub: boolean;
  /** Accepted queries for this post, highest impressions first. */
  queries: PostGscQuery[];
  /** Accepted anchor variants for this post (from its queries). */
  variants: string[];
  naturalToHub: string | null;
  naturalFromHub: string | null;
}

/**
 * Builds every post's anchor plan from the agreed split:
 *  - post -> hub: 30% exact hub keyword, 40% GSC queries matched to the hub, 30% natural
 *  - hub -> post: 20% exact post keyword, 30% one of the post's GSC queries, 50% natural
 * A type with nothing to fill it falls back to natural wording.
 */
export function allocateAnchors(posts: AnchorPostInput[], hub: { keyword: string | null; title: string }, hubQueries: string[]): Map<string, AnchorPlan> {
  const out = new Map<string, AnchorPlan>();
  const spokes = posts.filter((p) => !p.isHub);
  const toTypes = splitTypes(spokes.length, ANCHOR_SPLIT.toHub);
  const fromTypes = splitTypes(spokes.length, ANCHOR_SPLIT.fromHub);
  const hubKeyword = hub.keyword || hub.title;
  let hubQueryIdx = 0;

  spokes.forEach((p, i) => {
    const naturalTo = p.naturalToHub || `our complete guide to ${hubKeyword}`;
    const naturalFrom = p.naturalFromHub || p.title;

    let toHub: AnchorPick;
    if (toTypes[i] === "exact" && hubKeyword) toHub = { type: "exact", text: hubKeyword };
    else if (toTypes[i] === "gsc" && hubQueries.length) toHub = { type: "gsc", text: hubQueries[hubQueryIdx++ % hubQueries.length] };
    else toHub = { type: "natural", text: naturalTo };

    let fromHub: AnchorPick;
    if (fromTypes[i] === "exact" && p.primary) fromHub = { type: "exact", text: p.primary };
    else if (fromTypes[i] === "gsc" && p.queries.length) fromHub = { type: "gsc", text: p.variants[0] || p.queries[0].query };
    else fromHub = { type: "natural", text: naturalFrom };

    out.set(p.id, {
      toHub, fromHub,
      variants: p.variants.slice(0, 3),
      naturalToHub: p.naturalToHub, naturalFromHub: p.naturalFromHub,
    });
  });
  for (const p of posts.filter((x) => x.isHub)) {
    out.set(p.id, { toHub: null, fromHub: null, variants: p.variants.slice(0, 3), naturalToHub: p.naturalToHub, naturalFromHub: p.naturalFromHub });
  }
  return out;
}

/**
 * Anchors a post must NOT use for its own inbound links: every other post's
 * primary keyword and approved variants (reserved for those posts).
 */
export function reservedAnchors(postId: string, all: Array<{ id: string; primary: string | null; variants: string[] }>): string[] {
  const set = new Set<string>();
  for (const p of all) {
    if (p.id === postId) continue;
    if (p.primary) set.add(normalizeKeyword(p.primary));
    for (const v of p.variants) set.add(normalizeKeyword(v));
  }
  return [...set].filter(Boolean);
}
