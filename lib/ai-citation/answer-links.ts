// Cited links per answer: raw ai_citation_sources rows -> the compact, de-duplicated,
// openable link list shown under each answer card on the Sample answers tab.
//
// Uses the SAME rules as the Citation sources tab (citation-aggregate.ts), so a
// link that is a citation there is a link here: tracking params stripped, rows with
// no host or no openable URL dropped, and the same page cited twice inside ONE
// answer shown once.
//
// Pure + client-safe (no I/O).

import { citationLabel, citationLinkKey, citationSite, citationUrl } from "@/lib/ai-citation/citation-aggregate";

/** One link an answer cited, ready to render. */
export interface AnswerLink {
  /** Absolute, tracking-free URL: safe to open in a new tab. */
  url: string;
  /** Readable label: the page title when stored, else host + path. */
  label: string;
  /** Lowercase host without www. */
  site: string;
  /** True when the link points at the project's own site. */
  isProject: boolean;
}

/** One ai_citation_sources row, as read from the database. */
export interface RawAnswerSource {
  runId: string;
  domain: string | null;
  url: string | null;
  title: string | null;
  isProject: boolean;
}

/**
 * Group source rows by answer (run). Per answer: links with no usable url or site
 * are dropped, the same link (host + path + query, ignoring www / trailing slash)
 * is kept once, the project's own site comes first, then the rest by site and label
 * so the order never depends on how the database happened to return the rows.
 * Answers with no usable link are simply absent from the map.
 */
export function buildAnswerLinks(raw: RawAnswerSource[]): Map<string, AnswerLink[]> {
  type Draft = { url: string; title: string | null; site: string; isProject: boolean };
  const perRun = new Map<string, Map<string, Draft>>();

  for (const r of raw) {
    const url = citationUrl(r.url);
    const site = citationSite(r.domain, r.url);
    if (!url || !site) continue;
    const linkKey = citationLinkKey(url);
    const links = perRun.get(r.runId) ?? new Map<string, Draft>();
    const existing = links.get(linkKey);
    if (existing) {
      // Same page cited twice in one answer: keep one row, but never lose the
      // "this is our own site" flag or a title that only one of the rows had.
      if (r.isProject) existing.isProject = true;
      if (!existing.title && r.title?.trim()) existing.title = r.title.trim();
    } else {
      links.set(linkKey, { url, title: r.title?.trim() || null, site, isProject: r.isProject });
    }
    perRun.set(r.runId, links);
  }

  const out = new Map<string, AnswerLink[]>();
  for (const [runId, links] of perRun) {
    const list: AnswerLink[] = [...links.values()].map((d) => ({
      url: d.url,
      label: citationLabel(d.url, d.title),
      site: d.site,
      isProject: d.isProject,
    }));
    list.sort((a, b) =>
      Number(b.isProject) - Number(a.isProject)
      || a.site.localeCompare(b.site)
      || a.label.localeCompare(b.label)
      || a.url.localeCompare(b.url));
    out.set(runId, list);
  }
  return out;
}
