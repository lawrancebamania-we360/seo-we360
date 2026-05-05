import type { Skill, Finding } from "./types";

// GEO = Generative Engine Optimization: entity coverage, citability, answer-ready structure
export const geoSkill: Skill = {
  name: "geo",
  description: "Generative Engine Optimization — entity coverage, citability, TL;DR presence",
  pillars: ["GEO", "AIO"],
  run(ctx) {
    const findings: Finding[] = [];
    const { $, url } = ctx;
    const isArticle = /\/blog|\/news|\/article|\/post/.test(new URL(url).pathname);

    // TL;DR or summary at top — boosts AI citability
    const firstParas = $("main p, article p, .post-content p, .entry-content p").slice(0, 3).text();
    const firstHeadings = $("h2, h3").slice(0, 3).text().toLowerCase();
    const hasTldr = /tl;?dr|summary|at a glance|key takeaways/i.test(firstHeadings) ||
                    (firstParas.length > 0 && firstParas.length < 500 && /^[A-Z].*\./.test(firstParas.trim()));

    if (isArticle && !hasTldr) {
      findings.push({
        skill: "geo",
        check: "tldr_summary",
        status: "missing",
        pillar: "GEO",
        priority: "medium",
        message: "No TL;DR / Key Takeaways section near top",
        impl: "Add a 2–4 sentence summary or 'Key Takeaways' box near the top — AI engines prefer citable, concise leads.",
      });
    }

    // Named entity density — rough proxy: capitalized multi-word phrases
    const text = $("main, article").first().text() || $("body").text();
    const entityMatches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g) ?? [];
    const uniqueEntities = new Set(entityMatches);
    if (isArticle && uniqueEntities.size < 5) {
      findings.push({
        skill: "geo",
        check: "entity_coverage",
        status: "warn",
        pillar: "GEO",
        priority: "low",
        message: `Sparse named-entity coverage (${uniqueEntities.size} unique entities)`,
        impl: "Mention relevant places, brands, people, certifications — helps AI understand the topic's entity graph.",
      });
    }

    // Author bio / E-E-A-T link
    const hasAuthorBio = $("[class*='author'], [class*='byline']").text().length > 50;
    if (isArticle && !hasAuthorBio) {
      findings.push({
        skill: "geo",
        check: "author_bio",
        status: "warn",
        pillar: "GEO",
        priority: "medium",
        message: "No author bio / credential block on article",
        impl: "Add an author bio with credentials — AI engines use authorship signals for citation trust.",
      });
    }

    return findings;
  },
};
