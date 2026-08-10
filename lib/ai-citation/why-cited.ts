// AI Citation - "why do THEY get cited" competitor diff engine.
//
// For a competitor that out-cites the project in AI answers, this fetches the
// competitor's CITED pages (the exact pages AI quoted, from ai_citation_sources)
// and the project's own cited pages, runs the page-level AI-citability battery on
// both (ai_citability + aeo - pure HTML parsing, NO LLM / Apify spend), and diffs
// them: which citability factors the competitor's pages HAVE that the project's
// comparable pages LACK. That gap list is the "they do X, you don't" answer +
// deep-links to fix it.
//
// HEURISTIC (documented honestly in the UI): the skills emit a finding only for a
// PROBLEM, so a check that is absent from a page's findings = the page passes it.
// A factor is a gap when at least one audited competitor page passes it AND none
// of the project's audited pages do. Bounded for Vercel's 60s ceiling: we cap the
// pages fetched and audit them in parallel.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPage, buildContext } from "@/lib/seo-skills/fetch";
import { aiCitabilitySkill } from "@/lib/seo-skills/ai-citability";
import { aeoSkill } from "@/lib/seo-skills/aeo";
import { isArticleLike } from "@/lib/seo-skills/path-classifier";

// How many pages we fetch per side. Competitor side is the signal; the project
// side is the baseline. Total <= 7 fetches, all parallel, each capped at 8s.
const MAX_COMPETITOR_PAGES = 4;
const MAX_PROJECT_PAGES = 3;
const FETCH_TIMEOUT_MS = 8000;

// The citability factors we diff on, each mapped to the skill:check ids that, when
// flagged, mean the page LACKS that factor. Labels + fixes are buyer-friendly.
interface FactorDef { key: string; label: string; fix: string; checks: string[] }
const FACTORS: FactorDef[] = [
  { key: "author", label: "A named author with credentials", fix: "Add Person/author schema and a visible byline with credentials.", checks: ["ai_citability:author_schema", "ai_citability:expertise_signals"] },
  { key: "org", label: "Organization schema (a clear publisher)", fix: "Add Organization JSON-LD with name, logo, and social links.", checks: ["ai_citability:organization_schema"] },
  { key: "freshness", label: "Fresh, clearly-dated content", fix: "Expose a dateModified and refresh stale pages so AI trusts them.", checks: ["ai_citability:last_updated_date", "ai_citability:content_age"] },
  { key: "tldr", label: "A direct answer up top (TL;DR)", fix: "Open each page with a 2-3 sentence self-contained answer.", checks: ["ai_citability:first_150_extractable", "aeo:opening_answer"] },
  { key: "definition", label: "Plain \"X is Y\" definitions", fix: "Add one definitional sentence early that states plainly what the topic is.", checks: ["ai_citability:definition_pattern"] },
  { key: "sourced_stats", label: "Stats backed by sources", fix: "Link every statistic to its source so AI can verify it.", checks: ["ai_citability:sourced_stats"] },
  { key: "faq", label: "FAQ / HowTo schema", fix: "Wrap Q&A sections in FAQPage or HowTo JSON-LD.", checks: ["aeo:faqpage_schema"] },
  { key: "structure", label: "Scannable lists and tables", fix: "Add lists or a comparison table - snippets are pulled from these.", checks: ["aeo:scannable_structure"] },
  { key: "questions", label: "Question-style headings", fix: "Phrase 2-3 H2s as the questions buyers actually ask.", checks: ["aeo:question_headings"] },
];

export interface CitationGap { key: string; label: string; fix: string; examples: string[] }
export interface WhyCitedResult {
  ok: boolean;
  error?: string;
  competitorName?: string;
  /** Competitor cited pages we successfully audited. */
  pagesAudited?: number;
  /** Project pages used as the baseline. */
  yourPagesAudited?: number;
  /** Factors the competitor's pages have that yours lack - the answer. */
  gaps?: CitationGap[];
  /** Citability factors you BOTH already cover (reassurance). */
  shared?: string[];
  /** True when we have no usable competitor cited-page URLs to audit yet. */
  noData?: boolean;
  /** True when the competitor's cited pages aren't article-like, so a page-factor
   *  diff would not be meaningful (their edge is citation frequency, not setup). */
  notComparable?: boolean;
}

interface AuditProject { id: string; name: string; domain: string; industry: string | null }
interface CompetitorRow { id: string; name: string; url: string }
type PageAudit = { url: string; flagged: Set<string>; ok: boolean; article: boolean };

const clean = (u: string | null | undefined): string =>
  (u || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

// Fetch one page and collect the set of FLAGGED "skill:check" ids (problems).
// Network/parse failures degrade to ok:false so one bad page never breaks the diff.
async function auditPage(url: string, project: AuditProject): Promise<PageAudit> {
  try {
    const page = await fetchPage(url, FETCH_TIMEOUT_MS);
    if (!page.html || page.statusCode >= 400) return { url, flagged: new Set(), ok: false, article: false };
    const ctx = buildContext(url, page, project);
    const findings = [...aiCitabilitySkill.run(ctx), ...aeoSkill.run(ctx)];
    const flagged = new Set(findings.filter((f) => f.status !== "ok").map((f) => `${f.skill}:${f.check}`));
    return { url, flagged, ok: true, article: isArticleLike(ctx.url, page.$) };
  } catch {
    return { url, flagged: new Set(), ok: false, article: false };
  }
}

// A page HAS a factor when NONE of the factor's checks are flagged on it.
const pageHasFactor = (audit: PageAudit, f: FactorDef): boolean => f.checks.every((c) => !audit.flagged.has(c));

export async function explainWhyCompetitorCited(
  admin: SupabaseClient,
  project: AuditProject,
  competitorId: string | null,
  competitorName: string | undefined,
): Promise<WhyCitedResult> {
  // 1. Resolve the competitor row (by id, else by name) for the friendly label +
  //    its domain (the fallback when source rows never got a competitor_id).
  let comp: CompetitorRow | null = null;
  if (competitorId) {
    const { data } = await admin.from("competitors").select("id, name, url").eq("id", competitorId).maybeSingle();
    comp = (data as CompetitorRow | null) ?? null;
  }
  if (!comp && competitorName) {
    const { data } = await admin.from("competitors").select("id, name, url").eq("project_id", project.id).ilike("name", competitorName).maybeSingle();
    comp = (data as CompetitorRow | null) ?? null;
  }
  const label = comp?.name || competitorName || "This competitor";

  // 2. The competitor's cited pages: rows tagged with their competitor_id, else a
  //    domain match (older runs may not have set competitor_id). Need a real URL to
  //    fetch - domain-only citations can't be audited page-by-page.
  let compRows: Array<{ url: string | null; domain: string | null }> = [];
  if (comp?.id) {
    const { data } = await admin.from("ai_citation_sources").select("url, domain").eq("project_id", project.id).eq("competitor_id", comp.id).limit(60);
    compRows = (data as typeof compRows) ?? [];
  }
  if (compRows.length === 0 && comp?.url) {
    const compDomain = clean(comp.url);
    if (compDomain) {
      const { data } = await admin.from("ai_citation_sources").select("url, domain").eq("project_id", project.id).ilike("domain", `%${compDomain}%`).limit(60);
      compRows = (data as typeof compRows) ?? [];
    }
  }
  const compUrls = dedupeUrls(compRows.map((r) => r.url)).slice(0, MAX_COMPETITOR_PAGES);
  if (compUrls.length === 0) return { ok: true, noData: true, competitorName: label };

  // 3. The project's own cited pages as the baseline. None yet (the usual case for
  //    an under-cited brand) -> audit the homepage so the diff still has a "yours".
  const { data: mineRows } = await admin.from("ai_citation_sources").select("url").eq("project_id", project.id).eq("is_project", true).limit(60);
  let myUrls = dedupeUrls(((mineRows as Array<{ url: string | null }>) ?? []).map((r) => r.url)).slice(0, MAX_PROJECT_PAGES);
  if (myUrls.length === 0 && project.domain) myUrls = [`https://${clean(project.domain)}`];

  // 4. Audit both sides in parallel (bounded count keeps us inside 60s).
  const [compAudits, myAudits] = await Promise.all([
    Promise.all(compUrls.map((u) => auditPage(u, project))),
    Promise.all(myUrls.map((u) => auditPage(u, project))),
  ]);
  // The citability checks only FIRE on article-like pages, so "absent finding =
  // page passes" is only sound for article-like pages. Comparing a homepage or
  // landing page would credit it with every article factor it was never evaluated
  // for and fabricate gaps - so we diff ARTICLE-LIKE pages only. If the competitor
  // has no article-like cited pages, a page-factor diff is not meaningful (their
  // edge is being cited more often, not page setup) - say so honestly.
  const compAuditedAny = compAudits.filter((a) => a.ok).length;
  if (compAuditedAny === 0) return { ok: true, noData: true, competitorName: label };
  const compOk = compAudits.filter((a) => a.ok && a.article);
  const myOk = myAudits.filter((a) => a.ok && a.article);
  if (compOk.length === 0) return { ok: true, notComparable: true, competitorName: label, pagesAudited: compAuditedAny };

  // 5. Diff: a gap = at least one competitor page HAS the factor AND none of yours
  //    do. Shared = factors you both cover. Examples = the competitor pages that
  //    show the factor (so the user can see how they do it).
  const gaps: CitationGap[] = [];
  const shared: string[] = [];
  for (const f of FACTORS) {
    const compPagesWith = compOk.filter((a) => pageHasFactor(a, f));
    const youHaveIt = myOk.length > 0 && myOk.some((a) => pageHasFactor(a, f));
    if (compPagesWith.length > 0 && !youHaveIt) {
      gaps.push({ key: f.key, label: f.label, fix: f.fix, examples: compPagesWith.slice(0, 2).map((a) => a.url) });
    } else if (compPagesWith.length > 0 && youHaveIt) {
      shared.push(f.label);
    }
  }

  return { ok: true, competitorName: label, pagesAudited: compOk.length, yourPagesAudited: myOk.length, gaps, shared };
}

// Dedupe + keep only fetchable http(s) URLs, in first-seen order.
function dedupeUrls(urls: Array<string | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of urls) {
    if (!u || !/^https?:\/\//i.test(u)) continue;
    const k = u.split("#")[0];
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}
