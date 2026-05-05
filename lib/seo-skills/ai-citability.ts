import type { CheerioAPI } from "cheerio";
import type { Skill, Finding } from "./types";

// AI Citability — page-level scorer for whether ChatGPT / Perplexity / Google
// AI Overviews will cite this page when answering a user question.
// Complementary to aio.ts (which is site-level: llms.txt, robots.txt, bot access).
//
// 5 dimensions (from the GEO / optimize-for-ai skills literature):
//   1. Extractability    — core answer in first 150 words + bounded paragraphs
//   2. Quotability       — "X is Y" definitions + sourced stats
//   3. Authority         — author schema + credential signals + expert quotes
//   4. Freshness         — last-updated within ~18 months
//   5. Entity clarity    — Organization schema + consistent brand

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function mainText($: CheerioAPI): string {
  const selectors = ["main", "article", "[role='main']", ".post-content", ".entry-content", "#content"];
  for (const sel of selectors) {
    const el = $(sel).first();
    if (el.length) return el.text().replace(/\s+/g, " ").trim();
  }
  return $("body").text().replace(/\s+/g, " ").trim();
}

// Parse any ISO-ish date out of meta / time / schema JSON. Returns null if nothing found.
function findLastUpdated($: CheerioAPI, ldJson: string): Date | null {
  const candidates: string[] = [];

  // Common meta tags
  $("meta[property='article:modified_time'], meta[property='og:updated_time'], meta[name='last-modified']")
    .each((_, el) => {
      const c = $(el).attr("content");
      if (c) candidates.push(c);
    });

  // <time datetime="...">
  $("time[datetime]").each((_, el) => {
    const c = $(el).attr("datetime");
    if (c) candidates.push(c);
  });

  // dateModified / datePublished inside JSON-LD
  const modMatch = ldJson.match(/"dateModified"\s*:\s*"([^"]+)"/i);
  if (modMatch?.[1]) candidates.push(modMatch[1]);
  const pubMatch = ldJson.match(/"datePublished"\s*:\s*"([^"]+)"/i);
  if (pubMatch?.[1]) candidates.push(pubMatch[1]);

  for (const c of candidates) {
    const d = new Date(c);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

export const aiCitabilitySkill: Skill = {
  name: "ai_citability",
  description: "Per-page AI citation score: extractability, quotability, authority, freshness, entity clarity.",
  pillars: ["AIO"],
  run(ctx) {
    const findings: Finding[] = [];
    const { $, url } = ctx;
    const path = new URL(url).pathname;
    const isArticle = /\/blog|\/news|\/article|\/post|\/guide/.test(path);
    const isHomepage = path === "/";
    // Entity-clarity checks run on homepage too; the other four target article pages.
    const body = mainText($);
    const bodyWords = wordCount(body);

    const ldJson = $("script[type='application/ld+json']").map((_, el) => $(el).text()).get().join(" ");

    // ====================================================================
    // 1. EXTRACTABILITY — core answer in first 150 words + bounded paragraphs
    // ====================================================================
    if (isArticle) {
      // "Core answer in first 150 words" heuristic: first paragraph should be
      // meaty (>= 25 words) and the first 150 words should contain at least
      // one complete sentence with the primary noun from the title.
      const first150 = body.split(/\s+/).slice(0, 150).join(" ");
      if (wordCount(first150) < 100 && bodyWords >= 150) {
        findings.push({
          skill: "ai_citability", check: "first_150_extractable", status: "warn",
          pillar: "AIO", priority: "medium",
          message: "First 150 words don't contain a clear, self-contained answer",
          impl: "Lead with a 2–3 sentence summary that stands alone. AI engines extract from here first — bury the lead and you lose the citation.",
        });
      }

      // Paragraph bounding: too-long paragraphs make extraction noisy
      const paragraphs = $("main p, article p, .post-content p, .entry-content p").map((_, el) => $(el).text().trim()).get();
      const longParas = paragraphs.filter((p) => wordCount(p) > 120);
      if (paragraphs.length >= 3 && longParas.length / paragraphs.length > 0.4) {
        findings.push({
          skill: "ai_citability", check: "paragraph_bounds", status: "warn",
          pillar: "AIO", priority: "low",
          message: `${longParas.length} of ${paragraphs.length} paragraphs are over 120 words`,
          impl: "Cap paragraphs at ~80 words. AI engines prefer bounded, self-contained blocks that can be quoted verbatim.",
          details: { long_paragraph_count: longParas.length, total_paragraphs: paragraphs.length },
        });
      }
    }

    // ====================================================================
    // 2. QUOTABILITY — "X is Y" definitions + sourced statistics
    // ====================================================================
    if (isArticle && bodyWords >= 200) {
      // Definition pattern: "<Noun> is a/the/an ..." within the first 400 words
      const opening = body.slice(0, 3000);
      const hasDefinition = /\b(is|are|means|refers to|consists of)\b\s+(a|an|the)\b/i.test(opening);
      if (!hasDefinition) {
        findings.push({
          skill: "ai_citability", check: "definition_pattern", status: "warn",
          pillar: "AIO", priority: "medium",
          message: "No clear 'X is Y' definition near the top",
          impl: "Include one definitional sentence early (e.g. 'Tandem skydiving is a jump where…'). AI summarizers pattern-match these when building answers.",
        });
      }

      // Sourced stats: numbers near citation markers (links + parenthetical source refs)
      const numberMatches = body.match(/\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\s*(?:%|percent|years?|people|customers?|hours?|\$)/gi) ?? [];
      const externalLinks = $("main a[href^='http'], article a[href^='http']").length;
      if (numberMatches.length >= 2 && externalLinks < 2) {
        findings.push({
          skill: "ai_citability", check: "sourced_stats", status: "warn",
          pillar: "AIO", priority: "medium",
          message: `Page cites ${numberMatches.length} stats but has ${externalLinks} external sources`,
          impl: "Every stat needs a link to its source. AI systems prefer pages where numbers are verifiable — unsourced claims get skipped.",
          details: { stat_mentions: numberMatches.length, external_links: externalLinks },
        });
      }
    }

    // ====================================================================
    // 3. AUTHORITY — author schema + expert signals
    // ====================================================================
    if (isArticle) {
      const hasAuthorSchema = /"@type"\s*:\s*"Person"/i.test(ldJson) || /"author"\s*:\s*\{/i.test(ldJson);
      const hasCredentials = /\b(PhD|MD|CFA|certified|licensed|expert|\d+\+?\s*years?\s+of\s+experience)\b/i.test(body);

      if (!hasAuthorSchema) {
        findings.push({
          skill: "ai_citability", check: "author_schema", status: "missing",
          pillar: "AIO", priority: "medium",
          message: "No Person / author schema on the page",
          impl: "Add Person JSON-LD for the author with their name, URL, and sameAs links to LinkedIn / Wikipedia. AI engines weight authored content higher.",
        });
      }
      if (!hasCredentials && bodyWords >= 500) {
        findings.push({
          skill: "ai_citability", check: "expertise_signals", status: "warn",
          pillar: "AIO", priority: "low",
          message: "No visible credentials or experience markers",
          impl: "Mention specific credentials (certifications, years of experience, affiliations) in the byline or author box. AI systems use these as trust signals.",
        });
      }
    }

    // ====================================================================
    // 4. FRESHNESS — last-updated within 18 months
    // ====================================================================
    if (isArticle) {
      const lastUpdated = findLastUpdated($, ldJson);
      if (!lastUpdated) {
        findings.push({
          skill: "ai_citability", check: "last_updated_date", status: "missing",
          pillar: "AIO", priority: "medium",
          message: "No machine-readable last-updated date",
          impl: "Expose dateModified in JSON-LD and a visible 'Last updated' line. AI summaries bias toward recently-dated content when the query is time-sensitive.",
        });
      } else {
        const ageMs = Date.now() - lastUpdated.getTime();
        const ageMonths = ageMs / (1000 * 60 * 60 * 24 * 30);
        if (ageMonths > 18) {
          findings.push({
            skill: "ai_citability", check: "content_age", status: "warn",
            pillar: "AIO", priority: "medium",
            message: `Content last updated ${Math.round(ageMonths)} months ago`,
            impl: "Refresh with current-year examples, updated stats, and any new developments. Bump dateModified in schema. AI engines penalize stale content in fast-moving topics.",
            details: { age_months: Math.round(ageMonths), last_updated: lastUpdated.toISOString() },
          });
        }
      }
    }

    // ====================================================================
    // 5. ENTITY CLARITY — Organization schema + consistent brand
    // ====================================================================
    if (isHomepage || isArticle) {
      const hasOrgSchema = /"@type"\s*:\s*"Organization"/i.test(ldJson);
      if (!hasOrgSchema) {
        findings.push({
          skill: "ai_citability", check: "organization_schema", status: "missing",
          pillar: "AIO", priority: isHomepage ? "high" : "low",
          message: "No Organization schema — AI systems can't identify the publisher",
          impl: "Add Organization JSON-LD in the site footer with name, url, logo, sameAs (social profiles, Wikipedia). Lets AI systems link citations to a trusted entity.",
        });
      }
    }

    return findings;
  },
};
