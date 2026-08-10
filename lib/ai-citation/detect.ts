// AI Citation - detection logic. PURE (no DB, no network), so it is unit-tested
// in scripts/test-ai-citation.ts. Given one AI answer + its cited sources, work
// out: is the project MENTIONED (named in the text), is it CITED (one of the
// cited sources is the project's own domain), at what POSITION (rank of its
// first mention vs competitors), and the same for each competitor (share-of-voice).
// See PLAN-ai-citation.md.

import { hostFromUrl } from "@/lib/url";
import type { EngineCitation } from "./types";

export interface CompetitorInput {
  id?: string;
  name: string;
  domain?: string;
}

export interface DetectInput {
  answerText: string;
  sources: EngineCitation[];
  projectDomain: string;
  /** Names/aliases that count as "the project brand" (e.g. ["We360", "we360.ai"]). */
  brandAliases: string[];
  competitors: CompetitorInput[];
}

export interface BrandHit {
  mentioned: boolean;
  cited: boolean;
  /** 1-based rank of this brand's first mention among all brands named in the answer; null if not named. */
  position: number | null;
}

export interface DetectResult {
  project: BrandHit;
  competitors: Array<{ id?: string; name: string; hit: BrandHit }>;
  /** The cited sources that belong to the project's own domain. */
  projectSources: EngineCitation[];
}

// Accept a bare domain OR a full url, reduced to a bare host. Delegates to the
// shared hostFromUrl so this detect (read) path and the run/store path can never
// diverge again - they did, and the store path's path-bearing host silently left
// every cited source untagged.
function host(d?: string): string {
  return hostFromUrl(d);
}

function citationHost(c: EngineCitation): string {
  return c.domain ? host(c.domain) : host(c.url);
}

// A source host belongs to a brand host if they match or one is a subdomain of
// the other (blog.we360.ai counts as we360.ai).
function ownedBy(srcHost: string, brandHost: string): boolean {
  if (!srcHost || !brandHost) return false;
  return srcHost === brandHost || srcHost.endsWith("." + brandHost) || brandHost.endsWith("." + srcHost);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Whole-word-ish match so "we360" does not match inside "awe360x", and a
// dotted brand ("we360.ai") matches literally.
function isMentioned(text: string, aliases: string[]): boolean {
  const t = text.toLowerCase();
  return aliases.some((a) => {
    const n = a.trim().toLowerCase();
    if (!n) return false;
    return new RegExp(`(^|[^a-z0-9])${escapeRe(n)}([^a-z0-9]|$)`, "i").test(t);
  });
}

// Index of the earliest alias occurrence in the text, or -1. Uses the SAME
// word-boundary match as isMentioned so a brand never gets a position (rank)
// while reading as not-mentioned (e.g. "Apple" must not match inside "Snapple").
function firstIndex(text: string, aliases: string[]): number {
  const t = text.toLowerCase();
  let min = -1;
  for (const a of aliases) {
    const n = a.trim().toLowerCase();
    if (!n) continue;
    const m = new RegExp(`(^|[^a-z0-9])${escapeRe(n)}([^a-z0-9]|$)`, "i").exec(t);
    if (m) {
      const idx = m.index + (m[1] ? m[1].length : 0); // skip the leading boundary char
      if (min < 0 || idx < min) min = idx;
    }
  }
  return min;
}

export function detectInAnswer(input: DetectInput): DetectResult {
  const brandHost = host(input.projectDomain);
  const srcHosts = input.sources.map(citationHost);
  const projectSources = input.sources.filter((_, i) => ownedBy(srcHosts[i], brandHost));

  // Rank every brand that is named, by where it first appears, to derive position.
  const ranked = [
    { key: "__project__", idx: firstIndex(input.answerText, input.brandAliases) },
    ...input.competitors.map((c) => ({ key: c.name, idx: firstIndex(input.answerText, [c.name]) })),
  ]
    .filter((b) => b.idx >= 0)
    .sort((a, b) => a.idx - b.idx);

  const projRank = ranked.findIndex((b) => b.key === "__project__");

  const project: BrandHit = {
    mentioned: isMentioned(input.answerText, input.brandAliases),
    cited: projectSources.length > 0,
    position: projRank >= 0 ? projRank + 1 : null,
  };

  const competitors = input.competitors.map((c) => {
    const cHost = host(c.domain);
    const cited = cHost ? srcHosts.some((sh) => ownedBy(sh, cHost)) : false;
    const r = ranked.findIndex((b) => b.key === c.name);
    return {
      id: c.id,
      name: c.name,
      hit: {
        mentioned: isMentioned(input.answerText, [c.name]),
        cited,
        position: r >= 0 ? r + 1 : null,
      } as BrandHit,
    };
  });

  return { project, competitors, projectSources };
}
