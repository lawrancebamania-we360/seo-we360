// Content distribution: fetch and parse a platform's public feed into a flat
// list of posts. Handles RSS 2.0 (WordPress/Medium/Substack/Tumblr), the dev.to
// JSON API, and Blogger's JSON feed. No XML dependency - these feeds are
// well-formed and we only need link + title + date, so a small tolerant parser
// is enough (and never throws: a bad feed yields an empty list).

import type { FeedParser, Platform } from "@/lib/content-distribution/platforms";

export interface DetectedPost {
  url: string;
  title: string;
  publishedDate: string | null; // YYYY-MM-DD
}

const UA = "Mozilla/5.0 (compatible; We360ContentBot/1.0; +https://we360.ai)";

// Drop feed/tracking params so the stored URL is the canonical page and dedup
// matches a hand-logged version of the same post.
function cleanPostUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) {
      if (/^(source|ref|trk|trackingId|fbclid|gclid)$/i.test(k) || /^utm_/i.test(k)) u.searchParams.delete(k);
    }
    u.hash = "";
    return u.toString().replace(/\?$/, "");
  } catch { return url; }
}

function toDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#8217;/g, "’").replace(/&#8211;/g, "–")
    .trim();
}

function pick(block: string, tag: string): string | undefined {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? m[1] : undefined;
}

// RSS 2.0: each <item> has a text <link>, a <title>, and a <pubDate>.
function parseRss(xml: string): DetectedPost[] {
  const out: DetectedPost[] = [];
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  for (const it of items) {
    const link = decode(pick(it, "link") ?? "");
    if (!/^https?:\/\//i.test(link)) continue;
    out.push({ url: link, title: decode(pick(it, "title") ?? "") || link, publishedDate: toDate(pick(it, "pubDate") ?? pick(it, "dc:date") ?? null) });
  }
  return out;
}

function parseDevto(json: string): DetectedPost[] {
  try {
    const arr = JSON.parse(json) as Array<{ url?: string; canonical_url?: string; title?: string; published_at?: string }>;
    return (Array.isArray(arr) ? arr : []).filter((a) => a.url || a.canonical_url).map((a) => ({
      url: (a.url || a.canonical_url)!, title: a.title ?? "", publishedDate: toDate(a.published_at),
    }));
  } catch { return []; }
}

function parseBlogger(json: string): DetectedPost[] {
  try {
    const feed = (JSON.parse(json) as { feed?: { entry?: Array<{ link?: Array<{ rel: string; href: string }>; title?: { $t?: string }; published?: { $t?: string } }> } }).feed;
    return (feed?.entry ?? []).map((e) => {
      const alt = e.link?.find((l) => l.rel === "alternate")?.href;
      return alt ? { url: alt, title: e.title?.$t ?? "", publishedDate: toDate(e.published?.$t) } : null;
    }).filter((x): x is DetectedPost => !!x);
  } catch { return []; }
}

function parse(parser: FeedParser, body: string): DetectedPost[] {
  if (parser === "devto") return parseDevto(body);
  if (parser === "blogger") return parseBlogger(body);
  return parseRss(body);
}

/** Fetch + parse one platform's feed. Never throws; returns [] on any error. */
export async function fetchPlatformPosts(platform: Platform, timeoutMs = 15000): Promise<DetectedPost[]> {
  try {
    const res = await fetch(platform.feedUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": UA, "accept": "application/json, application/rss+xml, application/xml, text/xml, */*" },
    });
    if (!res.ok) return [];
    const body = await res.text();
    // Keep only posts with a usable URL (newest first, as feeds already come),
    // and strip tracking params so the stored link is canonical.
    return parse(platform.parser, body)
      .filter((p) => /^https?:\/\//i.test(p.url))
      .map((p) => ({ ...p, url: cleanPostUrl(p.url) }));
  } catch {
    return [];
  }
}
