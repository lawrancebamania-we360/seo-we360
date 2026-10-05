// Canonical host/domain normalizer - single source for host/path helpers used by
// competitor-matching and domain-ownership logic (AI-citation, analytics rows).
//
// Default cleanHost behavior:
//   - strip a leading http:// or https://
//   - strip a trailing slash
//   - strip a leading www.
// It does NOT lowercase by default, and does NOT strip a path beyond the single
// trailing slash. Opt into those via options where a call site needs them.

export interface CleanHostOptions {
  /** Lowercase the result. Default false. */
  lowercase?: boolean;
  /** Strip a leading "www." Default true. */
  stripWww?: boolean;
}

/**
 * Normalize a domain or URL to a bare host.
 *
 * `cleanHost("https://www.Example.com/")` → `"Example.com"`
 * `cleanHost("https://www.Example.com/", { lowercase: true })` → `"example.com"`
 *
 * Note: this only strips a SINGLE trailing slash, not a full path.
 */
export function cleanHost(input: string, opts: CleanHostOptions = {}): string {
  const { lowercase = false, stripWww = true } = opts;
  let h = input.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (stripWww) h = h.replace(/^www\./, "");
  if (lowercase) h = h.toLowerCase();
  return h;
}

/**
 * Reduce a full URL OR a bare domain to its bare host. Unlike cleanHost (which
 * only strips a single trailing slash), this parses a real URL and keeps just
 * the hostname - dropping the path, query, and fragment - then lowercases and
 * strips www. So "https://hubstaff.com/blog/x?y=1" and "hubstaff.com/blog/x"
 * both → "hubstaff.com". Returns "" for empty input.
 *
 * Use this (NOT cleanHost) whenever the input may be a full URL and you compare
 * or match on the host - e.g. "does this cited page belong to a competitor's
 * domain".
 */
export function hostFromUrl(input: string | null | undefined): string {
  if (!input) return "";
  let raw = input.trim();
  try {
    if (/^https?:\/\//i.test(raw)) raw = new URL(raw).hostname;
  } catch { /* not a parseable URL - fall through and strip the path below */ }
  raw = raw.replace(/[/?#].*$/, ""); // drop any path/query left on scheme-less inputs
  return cleanHost(raw, { lowercase: true, stripWww: true });
}

/**
 * Get the path part of a full URL, safely. Many UI rows display just the path
 * (e.g. "/blog/post") instead of the whole URL. A malformed or relative `url`
 * makes `new URL()` throw, which would crash the row - so this catches that and
 * returns `fallback` (the raw url by default; pass "/" or a label where a list
 * wants one).
 *
 * `pathFromUrl("https://x.com/blog/a?b=1")` → `"/blog/a"`
 * `pathFromUrl("not a url", "/")` → `"/"`
 */
export function pathFromUrl(url: string | null | undefined, fallback = url ?? ""): string {
  if (!url) return fallback;
  try {
    return new URL(url).pathname || url;
  } catch {
    return fallback;
  }
}

/**
 * Turn a stored, user-typed or third-party URL into an href that really leaves
 * the app. A scheme-less value like "linkedin.com/in/x" is, to a browser, a
 * RELATIVE path - it opens "<our-site>/dashboard/linkedin.com/in/x" - so it
 * gets https:// prepended. Returns undefined (render as plain text, not a link)
 * for empty input, a non-web scheme (javascript:, data:, ...), or anything
 * without a real dotted host (e.g. a bare slug like "my-post").
 *
 * `toExternalUrl("linkedin.com/in/x")` → `"https://linkedin.com/in/x"`
 * `toExternalUrl("https://a.com/b")` → `"https://a.com/b"` (unchanged)
 * `toExternalUrl("javascript:alert(1)")` → `undefined`
 */
export function toExternalUrl(raw: string | null | undefined): string | undefined {
  const s = raw?.trim();
  if (!s) return undefined;
  let candidate: string;
  if (/^https?:\/\//i.test(s)) candidate = s;
  else if (s.startsWith("//")) candidate = `https:${s}`;
  else if (/^(javascript|data|vbscript|file|blob|about):/i.test(s)) return undefined;
  else candidate = `https://${s.replace(/^\/+/, "")}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "https:" && u.protocol !== "http:") return undefined;
    if (!u.hostname.includes(".")) return undefined;
    return candidate;
  } catch {
    return undefined;
  }
}

/** For saving a user-typed link: the absolute URL when it parses, else the trimmed input as typed; null when empty. */
export function normalizeStoredUrl(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  return toExternalUrl(t) ?? t;
}

/** Both spellings of a stored link (as typed + normalized), for duplicate checks against rows saved before normalization existed. */
export function urlVariants(raw: string): string[] {
  return [...new Set([raw, normalizeStoredUrl(raw) ?? raw])];
}

/**
 * Real URL for a planned post's stored slug. A full URL or "host/path" is used
 * as-is; a bare slug ("my-post") or a site path ("/blog/my-post") is resolved on
 * the project's own domain, bare slugs under /blog/. Without this a bare slug
 * became "https://my-post" - a made-up host.
 */
export function liveUrlFromSlug(slugOrUrl: string | null | undefined, siteDomain: string | null | undefined): string | undefined {
  const s = slugOrUrl?.trim();
  if (!s) return undefined;
  const direct = toExternalUrl(s);
  if (direct) return direct;
  const domain = siteDomain?.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!domain) return undefined;
  const path = s.startsWith("/") ? s : s.includes("/") ? `/${s}` : `/blog/${s}`;
  return `https://${domain}${path}${path.endsWith("/") ? "" : "/"}`;
}

// --- Sitemap matching -------------------------------------------------------
// A planned post is stored as a bare slug ("my-post"), a host-and-path
// ("we360.ai/blog/my-post") or a full URL, while the sitemap holds full URLs
// ("https://www.we360.ai/blog/my-post/"). Comparing those as whole strings
// never matches a bare slug, so everything is reduced to a host-less,
// lowercase, slash-trimmed PATH ("blog/my-post") before comparing.

/** Path key of a full sitemap URL: "https://www.x.com/Blog/A/?q=1" → "blog/a". "" for the homepage. */
export function sitemapPathKey(url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url.replace(/^https?:\/\/[^/]+/i, "").replace(/[?#].*$/, "");
  }
  return path.toLowerCase().replace(/^\/+|\/+$/g, "");
}

/**
 * Path keys a planned post's stored slug could be live under, best first. A
 * bare slug lives under /blog/ on this site (and, failing that, at the root).
 */
export function slugPathKeys(slugOrUrl: string): string[] {
  const raw = slugOrUrl.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[?#].*$/, "");
  if (!raw) return [];
  const first = raw.split("/")[0];
  const hostLike = raw.includes("/") && !raw.startsWith("/") && first.includes(".");
  const path = (hostLike ? raw.slice(first.length) : raw).replace(/^\/+|\/+$/g, "");
  if (!path) return [];
  const bare = !hostLike && !raw.startsWith("/") && !path.includes("/");
  return bare ? [`blog/${path}`, path] : [path];
}

export function buildSitemapIndex(urls: string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const u of urls) {
    const key = sitemapPathKey(u);
    if (key && !index.has(key)) index.set(key, u);
  }
  return index;
}

/** The live sitemap URL for a stored slug / host-path / URL, or null if it isn't on the sitemap. */
export function resolveSitemapUrl(index: Map<string, string>, slugOrUrl: string): string | null {
  for (const key of slugPathKeys(slugOrUrl)) {
    const hit = index.get(key);
    if (hit) return hit;
  }
  return null;
}

// Hosts that are never a real PRODUCT competitor even if they outrank a brand in
// SERPs: social / UGC, app stores, review aggregators, reference / medical sites,
// search engines, generic marketplaces, dev hubs. Used so competitor
// auto-discovery (and the AI-citation generator) never treats instagram.com or a
// wikipedia page as a rival.
const NON_COMPETITOR_HOSTS = new Set<string>([
  // social / UGC
  "instagram.com", "facebook.com", "twitter.com", "x.com", "linkedin.com",
  "youtube.com", "tiktok.com", "pinterest.com", "reddit.com", "quora.com",
  "medium.com", "substack.com", "tumblr.com", "threads.net",
  // app stores / platforms
  "play.google.com", "apps.apple.com", "chrome.google.com", "apps.microsoft.com",
  "microsoft.com", "apple.com",
  // reference / encyclopedia / medical
  "wikipedia.org", "wikihow.com", "webmd.com", "healthline.com", "mayoclinic.org",
  "medlineplus.gov", "who.int",
  // review aggregators / directories
  "g2.com", "capterra.com", "getapp.com", "softwareadvice.com", "trustpilot.com",
  "producthunt.com", "crunchbase.com", "glassdoor.com", "indeed.com", "yelp.com",
  "clutch.co", "trustradius.com",
  // search / marketplaces
  "google.com", "bing.com", "yahoo.com", "duckduckgo.com",
  "amazon.com", "amazon.in", "flipkart.com", "ebay.com",
  // dev / docs
  "github.com", "gitlab.com", "stackoverflow.com", "npmjs.com",
  // link shorteners / CDNs
  "t.co", "fb.me", "lnkd.in", "bit.ly", "goo.gl", "ow.ly", "buff.ly", "tinyurl.com", "rebrand.ly",
  "fbcdn.net", "cdninstagram.com", "akamaihd.net", "cloudfront.net",
]);

// A registrable apex on a ccTLD usually has a two-label public suffix ("co.uk",
// "com.au", "com.ar"). Recognize the shape generically: a short generic
// second-level label followed by a 2-letter country code.
const SECOND_LEVEL_LABELS = new Set([
  "com", "co", "net", "org", "gov", "edu", "ac", "or", "ne", "go", "mil", "biz", "info",
]);
function hasTwoPartSuffix(labels: string[]): boolean {
  if (labels.length < 3) return false;
  const tld = labels[labels.length - 1];
  const sld = labels[labels.length - 2];
  return /^[a-z]{2}$/.test(tld) && SECOND_LEVEL_LABELS.has(sld);
}

/**
 * True when `host` is not a plausible product competitor: a social / app-store /
 * reference / review / marketplace site, a .gov/.edu/.mil site, or a DEEP
 * subdomain (product brands live on their apex domain, not a platform subdomain).
 * Used by competitor auto-discovery and the AI-citation generator so a brand is
 * never compared against instagram.com or a wikipedia page.
 */
export function isJunkCompetitorHost(input: string): boolean {
  const h = cleanHost(input, { lowercase: true }).replace(/\/.*$/, "").replace(/^www\./, "");
  if (!h || !h.includes(".")) return true; // not a real host
  for (const bad of NON_COMPETITOR_HOSTS) {
    if (h === bad || h.endsWith("." + bad)) return true; // blocklist (exact or subdomain of)
  }
  if (/\.(gov|edu|mil)(\.[a-z]{2})?$/.test(h)) return true; // government / education
  // Deep subdomain => more labels than the registrable apex => not the brand.
  const labels = h.split(".");
  const apexLabels = hasTwoPartSuffix(labels) ? 3 : 2;
  return labels.length > apexLabels;
}
