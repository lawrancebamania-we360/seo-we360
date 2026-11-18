// Influencer posts on LinkedIn: scrape a post's public engagement (reactions,
// comments, reposts) and - once per post - the we360.ai links in the post body
// and in the influencer's own comment.
//
// Scraper: Apify actor supreme_coder/linkedin-post (no cookies / no LinkedIn
// login, ~$0.002 per post). Verified 2026-11-18 against a real collab post:
//   - deepScrape:true is required for counts (numLikes / numComments /
//     numShares) and `text`; numComments>0 additionally returns `comments`
//     ({ text, fromPostAuthor, ... }), so links are found with comments ON and
//     the daily metric runs use numComments:0.
//   - Posts that aren't public (connections-only / removed) come back with
//     metadata only and no counts - LinkedIn's own embed page 404s for them
//     too - so they're reported as "not public", to be filled in by hand.
// LinkedIn rewrites links in posts/comments to lnkd.in short links; those are
// resolved through LinkedIn's interstitial page to the real we360.ai URL.

const ACTOR = "supreme_coder~linkedin-post";

/** The numeric activity id in a LinkedIn post URL (feed/update/urn:li:activity:N or /posts/...-activity-N-xxxx). */
export function activityIdOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/(?:activity|ugcPost|share)[:-](\d{15,25})/i);
  return m ? m[1] : null;
}

/** A LinkedIn URL that points at ONE post - not a profile or an activity feed. */
export function isLinkedInPostUrl(url: string | null | undefined): boolean {
  return !!url && /linkedin\.com\//i.test(url) && !!activityIdOf(url);
}

export interface ScrapedPost {
  activityId: string;
  ok: boolean;                 // counts came back (the post is public)
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
  text: string | null;
  authorComments: string[];    // the post author's own comments (only when comments were requested)
  error: string | null;
}

type ActorItem = {
  inputUrl?: string; urn?: string; text?: string;
  numLikes?: number; numComments?: number; numShares?: number;
  comments?: { text?: string; fromPostAuthor?: boolean }[];
  error?: unknown;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

/**
 * Scrape a batch of LinkedIn post URLs in one actor run. `withComments` also
 * fetches comments (for the one-time link lookup). Returns one entry per input
 * post, keyed by activity id - including a failed entry for any post the actor
 * didn't return data for.
 */
export async function scrapeLinkedInPosts(token: string, urls: string[], withComments: boolean): Promise<Map<string, ScrapedPost>> {
  const out = new Map<string, ScrapedPost>();
  const ids = urls.map(activityIdOf).filter((x): x is string => !!x);
  const fail = (id: string, error: string): ScrapedPost => ({
    activityId: id, ok: false, reactions: null, comments: null, reposts: null, text: null, authorComments: [], error,
  });
  if (!ids.length) return out;

  let items: ActorItem[] = [];
  try {
    const res = await fetch(`https://api.apify.com/v2/acts/${ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=240`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ urls, limitPerSource: 1, deepScrape: true, numComments: withComments ? 50 : 0, numLikes: 0 }),
      signal: AbortSignal.timeout(260_000),
    });
    if (!res.ok) {
      const msg = `Scraper failed (HTTP ${res.status})`;
      for (const id of ids) out.set(id, fail(id, msg));
      return out;
    }
    const body = await res.json();
    items = Array.isArray(body) ? (body as ActorItem[]) : [];
  } catch (e) {
    const msg = `Scraper failed: ${e instanceof Error ? e.message : String(e)}`;
    for (const id of ids) out.set(id, fail(id, msg));
    return out;
  }

  for (const it of items) {
    const id = activityIdOf(it.urn) ?? activityIdOf(it.inputUrl);
    if (!id) continue;
    const reactions = num(it.numLikes), comments = num(it.numComments), reposts = num(it.numShares);
    const ok = reactions !== null || comments !== null || reposts !== null;
    out.set(id, {
      activityId: id, ok, reactions, comments, reposts,
      text: typeof it.text === "string" ? it.text : null,
      authorComments: (it.comments ?? []).filter((c) => c?.fromPostAuthor && typeof c.text === "string").map((c) => c.text as string),
      error: ok ? null : "The post isn't public (or was removed), so LinkedIn won't show its numbers — enter them by hand.",
    });
  }
  for (const id of ids) if (!out.has(id)) out.set(id, fail(id, "The scraper returned nothing for this post — check the post link, or enter numbers by hand."));
  return out;
}

// ---------------------------------------------------------------------------
// Link extraction (run once per post)
// ---------------------------------------------------------------------------

const URL_RE = /https?:\/\/[^\s<>"')\]]+|\blnkd\.in\/[A-Za-z0-9_-]+/gi;

const isWe360 = (u: string) => /^https?:\/\/([a-z0-9-]+\.)*we360\.ai(\/|$|\?)/i.test(u);
const hasUtm = (u: string) => /[?&]utm_[a-z]+=/i.test(u);
const clean = (u: string) => u.replace(/&amp;/g, "&").replace(/[.,;:!]+$/, "");

/** Follow a lnkd.in short link to its real destination (LinkedIn serves an interstitial page). */
async function resolveLnkd(u: string): Promise<string | null> {
  const url = u.startsWith("http") ? u : `https://${u}`;
  try {
    const res = await fetch(url, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15_000) });
    const loc = res.headers.get("location");
    if (loc && !/lnkd\.in|linkedin\.com/i.test(loc)) return clean(loc);
    const html = await res.text();
    const a = html.match(/data-tracking-control-name="external_url_click"[^>]*href="([^"]+)"/) ?? html.match(/href="([^"]+)"[^>]*data-tracking-control-name="external_url_click"/);
    return a ? clean(a[1]) : null;
  } catch {
    return null;
  }
}

/** Every we360.ai URL in a piece of text, lnkd.in links resolved. A UTM-tagged one first. */
async function we360Links(text: string | null): Promise<string[]> {
  if (!text) return [];
  const found: string[] = [];
  for (const raw of text.match(URL_RE) ?? []) {
    const u = clean(raw);
    const real = /lnkd\.in\//i.test(u) ? await resolveLnkd(u) : u;
    if (real && isWe360(real) && !found.includes(real)) found.push(real);
  }
  return found.sort((a, b) => Number(hasUtm(b)) - Number(hasUtm(a)));
}

/** The we360.ai link in the post body and in the influencer's own comment (UTM-tagged preferred). */
export async function extractPostLinks(post: ScrapedPost): Promise<{ postBodyLink: string | null; commentLink: string | null }> {
  const body = await we360Links(post.text);
  let comment: string[] = [];
  for (const c of post.authorComments) comment = [...comment, ...(await we360Links(c))];
  comment.sort((a, b) => Number(hasUtm(b)) - Number(hasUtm(a)));
  return { postBodyLink: body[0] ?? null, commentLink: comment[0] ?? null };
}
