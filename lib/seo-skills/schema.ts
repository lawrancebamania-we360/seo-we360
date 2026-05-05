import type { Skill, Finding } from "./types";

interface JsonLdNode {
  "@type"?: string | string[];
  "@context"?: string;
  [k: string]: unknown;
}

function parseJsonLd($: import("cheerio").CheerioAPI): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  $("script[type='application/ld+json']").each((_, el) => {
    const raw = $(el).text().trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) nodes.push(...parsed);
      else if (parsed["@graph"]) nodes.push(...(parsed["@graph"] as JsonLdNode[]));
      else nodes.push(parsed);
    } catch {
      // invalid JSON — log later
    }
  });
  return nodes;
}

function typesOf(node: JsonLdNode): string[] {
  const t = node["@type"];
  if (!t) return [];
  return Array.isArray(t) ? t : [t];
}

export const schemaSkill: Skill = {
  name: "schema",
  description: "JSON-LD structured data: Article, FAQPage, Organization, LocalBusiness, Product, etc.",
  pillars: ["AEO", "GEO", "AIO"],
  run(ctx) {
    const findings: Finding[] = [];
    const { $, url } = ctx;
    const nodes = parseJsonLd($);
    const allTypes = new Set(nodes.flatMap(typesOf));

    // Presence
    if (nodes.length === 0) {
      findings.push({
        skill: "schema",
        check: "jsonld_presence",
        status: "missing",
        pillar: "GEO",
        priority: "high",
        message: "No JSON-LD structured data found",
        impl: "Add appropriate Schema.org JSON-LD — at minimum Organization (homepage) and Article/Product (content pages).",
      });
    }

    // Invalid JSON
    const raw = $("script[type='application/ld+json']").toArray();
    for (const el of raw) {
      const text = $(el).text().trim();
      if (!text) continue;
      try { JSON.parse(text); } catch {
        findings.push({
          skill: "schema",
          check: "jsonld_invalid",
          status: "fail",
          pillar: "GEO",
          priority: "high",
          message: "One of the JSON-LD blocks has invalid JSON",
          impl: "Validate the JSON-LD on schema.org validator. Common cause: unescaped quotes.",
        });
        break;
      }
    }

    // Detect article pages and check for Article schema
    const isLikelyArticle = /\/blog|\/news|\/article|\/post/.test(new URL(url).pathname);
    if (isLikelyArticle && !allTypes.has("Article") && !allTypes.has("BlogPosting") && !allTypes.has("NewsArticle")) {
      findings.push({
        skill: "schema",
        check: "article_schema",
        status: "missing",
        pillar: "AEO",
        priority: "high",
        message: "Article page missing Article / BlogPosting schema",
        impl: "Add Article schema with headline, datePublished, author, image — boosts AI citability + rich results.",
      });
    }

    // FAQ detection
    const hasFaqText = $("body").text().toLowerCase().includes("frequently asked") ||
                       $("h1,h2,h3").filter((_, el) => /faq|frequently asked/i.test($(el).text())).length > 0;
    if (hasFaqText && !allTypes.has("FAQPage")) {
      findings.push({
        skill: "schema",
        check: "faq_schema",
        status: "missing",
        pillar: "AEO",
        priority: "high",
        message: "Page has an FAQ section but no FAQPage schema",
        impl: "Wrap each Q&A as FAQPage JSON-LD — unlocks rich snippets and AI answer eligibility.",
      });
    }

    // Organization schema on homepage
    const isHomepage = new URL(url).pathname === "/";
    if (isHomepage && !allTypes.has("Organization") && !allTypes.has("LocalBusiness")) {
      findings.push({
        skill: "schema",
        check: "organization_schema",
        status: "missing",
        pillar: "GEO",
        priority: "medium",
        message: "Homepage has no Organization schema",
        impl: "Add Organization JSON-LD with name, url, logo, sameAs[] (social profiles), contactPoint.",
      });
    }

    // Breadcrumb
    if (!isHomepage && !allTypes.has("BreadcrumbList")) {
      findings.push({
        skill: "schema",
        check: "breadcrumb_schema",
        status: "missing",
        pillar: "SEO",
        priority: "low",
        message: "No BreadcrumbList schema",
        impl: "Add BreadcrumbList JSON-LD — helps Google render breadcrumb paths in SERPs.",
      });
    }

    if (nodes.length > 0 && findings.length === 0) {
      findings.push({
        skill: "schema",
        check: "jsonld_presence",
        status: "ok",
        pillar: "GEO",
        priority: "low",
        message: `Structured data present: ${Array.from(allTypes).join(", ")}`,
        impl: "",
      });
    }

    return findings;
  },
};
