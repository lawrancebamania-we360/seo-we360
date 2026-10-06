// Citation sources: the ONE place that decides what counts as "a citation" and
// which site/link it belongs to. The table and the graph on the Citation sources
// tab are both derived from the array buildCitationRows returns, so their
// numbers cannot drift apart: every site total is the sum of its link counts,
// and the sum of all site totals equals the number of table rows.
//
// Pure + client-safe (imports only @/lib/url and types).

import { hostFromUrl, toExternalUrl } from "@/lib/url";
import type { AiEngine } from "@/lib/ai-citation/types";

/** One ai_citation_sources row joined to its answer (run) and prompt, un-normalised. */
export interface RawCitation {
  id: string;
  runId: string;
  domain: string | null;
  url: string | null;
  title: string | null;
  isProject: boolean;
  competitorName: string | null;
  promptText: string;
  engine: AiEngine;
  /** The ANSWER's date (ai_citation_runs.created_at), not the source row's. */
  createdAt: string;
}

/** One table row: one link cited in one answer. */
export interface CitationRow {
  id: string;
  runId: string;
  /** Lowercase host without www. Subdomains are kept (resources.rework.com is its own site). */
  site: string;
  /** Identity of the link: host + path + remaining query. Same page = same key. */
  linkKey: string;
  /** Clean, absolute, tracking-free URL: safe to open. */
  url: string;
  title: string | null;
  promptText: string;
  engine: AiEngine;
  createdAt: string;
  isProject: boolean;
  competitorName: string | null;
}

export interface SiteLink {
  linkKey: string;
  url: string;
  label: string;
  count: number;
}

export interface SiteGroup {
  site: string;
  /** Number of citations (table rows) for this site. Always the sum of links[].count. */
  total: number;
  isProject: boolean;
  competitorName: string | null;
  links: SiteLink[];
}

// ChatGPT appends ?utm_source=openai to every link it cites. Treated as noise:
// it must not split one page into several "different" links, and it must not
// reach the href we open (team clicks would register as fake "openai" sessions
// in the site's own analytics).
const TRACKING_PARAM = /^(utm_.+|fbclid|gclid|ref|srsltid)$/i;

/** Site (host) a citation belongs to, from its stored domain or else its URL. "" if neither has a host. */
export function citationSite(domain: string | null | undefined, url: string | null | undefined): string {
  return hostFromUrl(domain) || hostFromUrl(url);
}

/** Absolute URL safe to open, minus tracking params and fragment. undefined when there is no usable link. */
export function citationUrl(raw: string | null | undefined): string | undefined {
  const href = toExternalUrl(raw);
  if (!href) return undefined;
  try {
    const u = new URL(href);
    let changed = false;
    for (const k of [...u.searchParams.keys()]) {
      if (TRACKING_PARAM.test(k)) { u.searchParams.delete(k); changed = true; }
    }
    if (u.hash) { u.hash = ""; changed = true; }
    return changed ? u.toString() : href;
  } catch {
    return undefined;
  }
}

/** Identity of a link, ignoring scheme, www, a trailing slash, and the order of remaining query params. */
export function citationLinkKey(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const path = u.pathname.replace(/\/+$/, "");
    const query = [...u.searchParams.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    return `${host}${path}${query ? `?${query}` : ""}`;
  } catch {
    return url.toLowerCase();
  }
}

/** Short human label for a link: its page title when stored, else a readable host + path. */
export function citationLabel(url: string, title: string | null | undefined, max = 90): string {
  const t = title?.trim();
  let label = t;
  if (!label) {
    try {
      const u = new URL(url);
      label = `${u.hostname.replace(/^www\./i, "")}${u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "")}`;
    } catch {
      label = url;
    }
  }
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

export interface BuiltCitations {
  rows: CitationRow[];
  /** Rows dropped because they have no host or no openable link (e.g. Google AI Overview redirect stubs). */
  skipped: number;
}

/**
 * Raw source rows -> table rows. Drops rows with no site or no usable link, and
 * de-duplicates the same link repeated inside ONE answer (the same link cited
 * by different answers stays as separate rows, by design).
 */
export function buildCitationRows(raw: RawCitation[]): BuiltCitations {
  const seen = new Set<string>();
  const rows: CitationRow[] = [];
  let skipped = 0;
  for (const r of raw) {
    const url = citationUrl(r.url);
    const site = citationSite(r.domain, r.url);
    if (!url || !site) { skipped++; continue; }
    const linkKey = citationLinkKey(url);
    const dedupeKey = `${r.runId}|${linkKey}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    rows.push({
      id: r.id, runId: r.runId, site, linkKey, url,
      title: r.title?.trim() || null,
      promptText: r.promptText, engine: r.engine, createdAt: r.createdAt,
      isProject: r.isProject, competitorName: r.competitorName,
    });
  }
  return { rows, skipped };
}

/** Rows -> sites, each with its distinct links and per-link counts. Biggest first. */
export function groupCitationsBySite(rows: CitationRow[]): SiteGroup[] {
  const sites = new Map<string, {
    isProject: boolean;
    competitorName: string | null;
    links: Map<string, { url: string; title: string | null; count: number }>;
  }>();
  for (const r of rows) {
    const s = sites.get(r.site) ?? { isProject: false, competitorName: null, links: new Map() };
    if (r.isProject) s.isProject = true;
    if (r.competitorName && !s.competitorName) s.competitorName = r.competitorName;
    const l = s.links.get(r.linkKey) ?? { url: r.url, title: null, count: 0 };
    l.count++;
    if (!l.title && r.title) l.title = r.title;
    s.links.set(r.linkKey, l);
    sites.set(r.site, s);
  }
  return [...sites.entries()]
    .map(([site, s]) => {
      const links: SiteLink[] = [...s.links.entries()]
        .map(([linkKey, l]) => ({ linkKey, url: l.url, label: citationLabel(l.url, l.title), count: l.count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
      return {
        site,
        total: links.reduce((sum, l) => sum + l.count, 0),
        isProject: s.isProject,
        competitorName: s.competitorName,
        links,
      };
    })
    .sort((a, b) => b.total - a.total || a.site.localeCompare(b.site));
}
