// Input hygiene for AI-citation prompt generation. A project's competitors and
// keywords can be polluted by upstream auto-discovery (SERP scraping saving
// instagram.com / a wikipedia page as a "competitor") or by stale templated
// keywords ("Mental Health goodlives", "SaaS we360"). Garbage in -> the
// generator would emit nonsense like "Brand vs instagram.com". These helpers
// strip the junk BEFORE grounding the generator, so a project with bad data
// degrades to "infer the real category players" rather than producing garbage.

import { cleanHost, isJunkCompetitorHost } from "@/lib/url";

export interface CompetitorRowLike {
  name?: string | null;
  url?: string | null;
  [k: string]: unknown;
}

/**
 * Keep only rows that look like real product competitors. Drops social /
 * app-store / reference / review / marketplace domains and deep subdomains
 * (see isJunkCompetitorHost). The host is read from `url`, falling back to
 * `name` when it is itself a bare domain (auto-discovered rows set name=host).
 */
export function cleanCompetitorRows<T extends CompetitorRowLike>(rows: T[]): T[] {
  return (rows ?? []).filter((r) => {
    const name = (r.name ?? "").trim();
    // A real brand NAME (has a space, or no dot) is the signal - keep it regardless
    // of a mis-scraped url (auto-discovery often stores a g2 / app-subdomain link,
    // which would otherwise drop a perfectly real competitor like "Asana").
    const nameIsBareHost = name.includes(".") && !name.includes(" ");
    if (name && !nameIsBareHost) return true;
    // Otherwise (bare-domain name, or no name) judge by the host.
    const host = (nameIsBareHost ? name : (r.url ?? "")).trim();
    if (!host) return true;
    return !isJunkCompetitorHost(host);
  });
}

/** Filter a plain list of competitor names, treating each as a possible host. */
export function cleanCompetitorNameList(names: string[]): string[] {
  return cleanCompetitorNames((names ?? []).map((n) => ({ name: n })));
}

/** Real-competitor NAMES for the generator. Bare-domain names are tidied to the apex host. */
export function cleanCompetitorNames(rows: CompetitorRowLike[]): string[] {
  return cleanCompetitorRows(rows)
    .map((r) => {
      const name = (r.name ?? "").trim();
      // If the "name" is actually a bare domain, show the apex host (no www / no path).
      if (name.includes(".") && !name.includes(" ")) return cleanHost(name, { lowercase: true });
      return name;
    })
    .filter(Boolean);
}

/**
 * Drop junk keywords before they ground the generator:
 *  - exact duplicates (case-insensitive),
 *  - doubled-string corruption ("okr tracking...okr tracking..."),
 *  - the "{industry} {brand}" concatenation template ("mental health goodlives",
 *    "saas we360") and its question variants,
 *  - blank / overlong.
 * Keeps real keywords (capped at 40).
 */
export function cleanKeywords(keywords: string[], opts: { brand: string; industry: string }): string[] {
  const brand = (opts.brand || "").trim().toLowerCase();
  const industry = (opts.industry || "").trim().toLowerCase();
  // "mental health goodlives" / "saas we360" - the awkward industry+brand glue.
  const needle = industry && brand ? `${industry} ${brand}` : null;
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Whole-phrase (word-bounded) match, so a short needle does not match inside an
  // unrelated word (brand "hr" must not hit "split hr software").
  const needleRe = needle ? new RegExp(`(^|\\s)${escapeRe(needle)}(\\s|$)`) : null;
  const isQuestion = (s: string) => /\?$/.test(s) || /^(how|what|is|are|why|where|can|do|does|which|should|when|who)\b/.test(s);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of keywords ?? []) {
    const k = (raw || "").trim();
    if (k.length < 2 || k.length > 120) continue;
    const lk = k.toLowerCase();
    if (seen.has(lk)) continue;
    // doubled-string corruption: only LONG multi-word repeats (real corruption like
    // "okr tracking ...okr tracking ..."), never an innocent single reduplicated
    // word ("couscous", "beriberi", "murmur").
    if (lk.length % 2 === 0) {
      const half = lk.slice(0, lk.length / 2);
      if (half.length >= 10 && half.includes(" ") && half === lk.slice(lk.length / 2)) continue;
    }
    // "{industry} {brand}" template junk: drop only the bare needle or a
    // brand-stuffed QUESTION, never a commercial category term that merely contains
    // the phrase ("email marketing tools", "best saas we360 pricing"). Collapse
    // whitespace first so a double-space / NBSP / tab scrape artifact
    // ("mental health  goodlives") still matches the single-space needle.
    const lkNorm = lk.replace(/\s+/g, " ");
    if (needleRe && needleRe.test(lkNorm) && (lkNorm === needle || isQuestion(lkNorm))) continue;
    seen.add(lk);
    out.push(k);
    if (out.length >= 40) break;
  }
  return out;
}
