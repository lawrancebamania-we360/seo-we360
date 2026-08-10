// Tenant-agnostic URL path classification for the SEO audit skills. Classifies by
// generic URL semantics + structure, so it works for ANY project with zero
// per-client config.

import type { CheerioAPI } from "cheerio";

const pathOfSafe = (url: string): string => { try { return new URL(url).pathname; } catch { return url; } };

/**
 * Homepage, including /index.html-style variants.
 */
export function isHomepage(url: string): boolean {
  const p = pathOfSafe(url);
  return p === "/" || /^\/(index\.(html?|php|aspx?))?$/i.test(p);
}

// A collection segment FOLLOWED BY a post slug (blog/<slug>, insights/<slug>).
// Requiring the trailing slug means bare /blog, /insights, /news INDEX pages are
// NOT treated as articles. Segment-anchored so "/unposted" / "/bloginfo" never match.
const ARTICLE_PATH =
  /(^|\/)(blog|blogs|news|article|articles|post|posts|guide|guides|insight|insights|resource|resources|stories|story|kb|knowledge-?bases?|learn|press|case-stud(?:y|ies)|tutorial|tutorials|how-to)\/[^/]+/i;

/**
 * URL-ONLY article/blog detection (no DOM). Homepage is never an article.
 */
export function isArticlePath(url: string): boolean {
  if (isHomepage(url)) return false;
  return ARTICLE_PATH.test(pathOfSafe(url));
}

/**
 * True for article/blog-like pages. Combines a PATH signal (collection + slug)
 * with on-page CONTENT signals (Article JSON-LD incl. array @type, og:type=article,
 * an article:published_time meta) so a post on a non-obvious path is still
 * detected and a bare listing/substring path is not falsely flagged. A HOMEPAGE
 * is never an article.
 */
export function isArticleLike(url: string, $: CheerioAPI): boolean {
  if (isHomepage(url)) return false;
  if (ARTICLE_PATH.test(pathOfSafe(url))) return true;
  const ld = $("script[type='application/ld+json']").text();
  if (/"@type"\s*:\s*(?:\[\s*)?"(Article|BlogPosting|NewsArticle|TechArticle|Report)"/i.test(ld)) return true;
  if (($("meta[property='og:type']").attr("content") ?? "").toLowerCase() === "article") return true;
  if ($("meta[property='article:published_time'], meta[name='article:published_time']").length > 0) return true;
  return false;
}

/** First path segment that conventionally denotes a location / place listing. */
const LOCATION_SEGMENT =
  /^(locations?|cities?|states?|areas?|regions?|branches?|stores?|outlets?|centres?|centers?|clinics?)$/i;

/**
 * True for pages that should receive LocalBusiness / NAP checks: the homepage,
 * contact / visit / directions pages, store locators, and structured location URLs.
 */
export function isLocationLikePath(path: string): boolean {
  if (path === "/") return true;
  if (/\/(locations?|contact|visit|directions|store-?locator|find-us|near(-me)?)\b/i.test(path)) return true;
  const segments = path.split("/").filter(Boolean);
  if (segments.length >= 1 && LOCATION_SEGMENT.test(segments[0])) return true;
  if (segments.length >= 1 && /^(near-me|in-[a-z-]{2,})$/i.test(segments[segments.length - 1])) return true;
  return false;
}
