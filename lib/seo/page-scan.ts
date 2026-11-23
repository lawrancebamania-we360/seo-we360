// GC-15 / GC-16: a quick read of a page - what's on it - so suggestions are
// based on what the page (ours, or a top-3 result) actually has. Server only.
// Results are cached per project + URL in seo_page_scans.

import { load } from "cheerio";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PageScan } from "@/lib/types/cluster-gsc";

const UA = "Mozilla/5.0 (compatible; We360-SEO-Dashboard/1.0; +https://www.we360.ai)";
const MAX_HEADINGS = 40;
const TEMPLATE_WORDS = /\b(template|templates|download|spreadsheet|excel|google sheets?|xlsx|pdf|checklist|calculator|generator|free tool)\b/i;
const FILE_LINK = /\.(xlsx?|csv|docx?|pdf|pptx?)(\?|#|$)|docs\.google\.com\/(spreadsheets|document)/i;

const clean = (s: string | undefined | null, max = 300) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

/** Parse a page's HTML into a PageScan. Pure. */
export function parsePage(html: string): PageScan {
  const $ = load(html);
  // FAQ questions from FAQPage schema, before scripts are removed.
  const faqs: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const walk = (n: unknown): void => {
        if (!n || typeof n !== "object") return;
        if (Array.isArray(n)) { n.forEach(walk); return; }
        const o = n as Record<string, unknown>;
        if (o["@type"] === "Question" && typeof o.name === "string") faqs.push(o.name);
        Object.values(o).forEach(walk);
      };
      walk(JSON.parse($(el).text()));
    } catch { /* bad JSON-LD */ }
  });

  const title = clean($("title").first().text());
  const meta = clean($('meta[name="description"]').attr("content") ?? $('meta[property="og:description"]').attr("content"), 400);
  // The H1 often sits in the page <header>, so read it before stripping chrome.
  const h1 = clean($("h1").first().text());
  $("script, style, noscript, svg, nav, footer, header, form, iframe").remove();

  const headings: PageScan["headings"] = [];
  $("h2, h3").each((_, el) => {
    if (headings.length >= MAX_HEADINGS) return;
    const text = clean($(el).text(), 160);
    if (text) headings.push({ level: el.tagName.toLowerCase() === "h2" ? 2 : 3, text });
  });
  // Question-style headings count as FAQs when there's no schema.
  if (!faqs.length) for (const h of headings) if (/\?$/.test(h.text)) faqs.push(h.text);

  const root = $("main").length ? $("main") : $("article").length ? $("article") : $("body");
  const text = root.text().replace(/\s+/g, " ").trim();
  const wordCount = text ? text.split(" ").length : 0;

  let hasTemplate = false;
  $("a[href]").each((_, el) => {
    if (hasTemplate) return;
    const href = $(el).attr("href") ?? "";
    const label = $(el).text();
    if (FILE_LINK.test(href) || (TEMPLATE_WORDS.test(label) && /download|get|copy|use|free/i.test(label))) hasTemplate = true;
  });
  if (!hasTemplate) hasTemplate = headings.some((h) => TEMPLATE_WORDS.test(h.text)) && /download|copy|free/i.test(text.slice(0, 20000));

  return { title, meta, h1, headings, faqs: [...new Set(faqs)].slice(0, 20).map((q) => q.slice(0, 200)), wordCount, hasTemplate };
}

/** Fetch and parse one page; null when it can't be read (blocked, not HTML, timeout). */
export async function scanPage(url: string, timeoutMs = 10_000): Promise<PageScan | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    const html = (await res.text()).slice(0, 1_500_000);
    return parsePage(html);
  } catch {
    return null;
  }
}

export interface StoredScan { url: string; ok: boolean; scan: PageScan | null; at: string }

/**
 * Scans for these URLs - from the cache when fresher than maxAgeMs, else
 * fetched (6 at a time) and saved. Stops fetching at `deadline` (epoch ms);
 * URLs not reached are simply missing from the result.
 */
export async function getPageScans(
  db: SupabaseClient, projectId: string, urls: string[],
  opts: { maxAgeMs: number; deadline: number },
): Promise<Map<string, StoredScan>> {
  const out = new Map<string, StoredScan>();
  const unique = [...new Set(urls.filter(Boolean))];
  if (!unique.length) return out;

  for (let i = 0; i < unique.length; i += 100) {
    const { data } = await db.from("seo_page_scans").select("url, ok, scan, fetched_at")
      .eq("project_id", projectId).in("url", unique.slice(i, i + 100));
    for (const r of (data ?? []) as Array<{ url: string; ok: boolean; scan: PageScan | null; fetched_at: string }>) {
      if (Date.now() - Date.parse(r.fetched_at) < opts.maxAgeMs) out.set(r.url, { url: r.url, ok: r.ok, scan: r.scan, at: r.fetched_at });
    }
  }

  const queue = unique.filter((u) => !out.has(u));
  const fresh: StoredScan[] = [];
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, async () => {
    for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
      if (Date.now() > opts.deadline) return;
      const scan = await scanPage(url);
      const s: StoredScan = { url, ok: !!scan, scan, at: new Date().toISOString() };
      out.set(url, s);
      fresh.push(s);
    }
  }));
  for (let i = 0; i < fresh.length; i += 100) {
    await db.from("seo_page_scans").upsert(
      fresh.slice(i, i + 100).map((s) => ({ project_id: projectId, url: s.url, ok: s.ok, scan: s.scan, fetched_at: s.at })),
      { onConflict: "project_id,url" },
    );
  }
  return out;
}
