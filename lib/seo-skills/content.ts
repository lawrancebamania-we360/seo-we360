import type { Skill, Finding } from "./types";

export const contentSkill: Skill = {
  name: "content",
  description: "Content quality + E-E-A-T signals: word count, readability, author, date, citations",
  pillars: ["SEO", "GEO"],
  run(ctx) {
    const findings: Finding[] = [];
    const { $, url } = ctx;
    const path = new URL(url).pathname;
    const isArticle = /\/blog|\/news|\/article|\/post/.test(path);

    // Extract main content (fallback to body)
    const mainSelectors = ["main", "article", "[role='main']", ".post-content", ".entry-content", "#content"];
    let mainText = $("body").text();
    for (const sel of mainSelectors) {
      const found = $(sel).first();
      if (found.length) { mainText = found.text(); break; }
    }

    const text = mainText.replace(/\s+/g, " ").trim();
    const words = text.split(/\s+/).filter(Boolean).length;

    if (isArticle && words < 400) {
      findings.push({
        skill: "content",
        check: "thin_content",
        status: "fail",
        pillar: "SEO",
        priority: "high",
        message: `Article has only ${words} words — thin content risk`,
        impl: "Expand to 1200+ words for low-competition keywords, 1800+ for medium, 2500+ for high.",
        details: { word_count: words },
      });
    }

    // Author / E-E-A-T
    const hasAuthor = $("meta[name='author'], [rel='author'], .author, .byline").length > 0 ||
                      /\bby\s+[A-Z][a-z]+\s+[A-Z][a-z]+/.test(text.slice(0, 600));
    if (isArticle && !hasAuthor) {
      findings.push({
        skill: "content",
        check: "author_byline",
        status: "missing",
        pillar: "GEO",
        priority: "medium",
        message: "Article has no visible author byline",
        impl: "Add an author byline + link to an About Author page — critical for E-E-A-T.",
      });
    }

    // Published date
    const hasDate = $("time[datetime], meta[property='article:published_time']").length > 0;
    if (isArticle && !hasDate) {
      findings.push({
        skill: "content",
        check: "published_date",
        status: "missing",
        pillar: "GEO",
        priority: "medium",
        message: "Article has no machine-readable published date",
        impl: "Add <time datetime='YYYY-MM-DD'> or meta[article:published_time] — boosts freshness signals.",
      });
    }

    // External citations
    const domain = new URL(url).hostname.replace(/^www\./, "");
    const externalLinks = $("a[href^='http']").filter((_, el) => {
      const href = $(el).attr("href") ?? "";
      try { return !new URL(href).hostname.includes(domain); } catch { return false; }
    }).length;

    if (isArticle && externalLinks < 2) {
      findings.push({
        skill: "content",
        check: "citations",
        status: "warn",
        pillar: "GEO",
        priority: "low",
        message: `Only ${externalLinks} external citation${externalLinks === 1 ? "" : "s"}`,
        impl: "Cite 2–3 authoritative external sources (Wikipedia, official sites, research) — lifts E-E-A-T + AI trust.",
      });
    }

    // Heading hierarchy
    const h2Count = $("h2").length;
    if (isArticle && h2Count < 3) {
      findings.push({
        skill: "content",
        check: "heading_structure",
        status: "warn",
        pillar: "SEO",
        priority: "medium",
        message: `Only ${h2Count} H2 sections — page lacks scannable structure`,
        impl: "Break the article into 4+ clear H2 sections, each covering a distinct subtopic.",
      });
    }

    return findings;
  },
};
