import type { Skill, Finding } from "./types";

// Sitemap skill — domain-level check. Only fires on the homepage URL so it
// runs once per crawl and doesn't repeat on every page.
export const sitemapSkill: Skill = {
  name: "sitemap",
  description: "Sitemap presence, validity, and structure",
  pillars: ["SEO"],
  run(ctx) {
    const findings: Finding[] = [];
    const urlPath = (() => { try { return new URL(ctx.url).pathname; } catch { return ctx.url; } })();
    if (urlPath !== "/") return findings;

    // The orchestrator injects cached sitemap status via response headers
    const status = ctx.responseHeaders["x-w360-sitemap-status"];
    const urlCount = parseInt(ctx.responseHeaders["x-w360-sitemap-url-count"] ?? "0", 10);

    if (status === "missing") {
      findings.push({
        skill: "sitemap",
        check: "sitemap_presence",
        status: "missing",
        pillar: "SEO",
        priority: "high",
        message: "No sitemap found at /sitemap.xml or /sitemap_index.xml",
        impl: "Generate a sitemap. For WordPress, install Rank Math or Yoast. For Next.js, use next-sitemap.",
      });
    } else if (status === "invalid") {
      findings.push({
        skill: "sitemap",
        check: "sitemap_validity",
        status: "fail",
        pillar: "SEO",
        priority: "high",
        message: "Sitemap file exists but XML is invalid or contains no URLs",
        impl: "Fix sitemap formatting — ensure <urlset> or <sitemapindex> with valid <loc> entries.",
      });
    } else if (status === "ok") {
      if (urlCount === 0) {
        findings.push({
          skill: "sitemap",
          check: "sitemap_empty",
          status: "fail",
          pillar: "SEO",
          priority: "high",
          message: "Sitemap is present but contains 0 URLs",
          impl: "Regenerate the sitemap with all public content pages included.",
        });
      } else if (urlCount > 50000) {
        findings.push({
          skill: "sitemap",
          check: "sitemap_size",
          status: "warn",
          pillar: "SEO",
          priority: "medium",
          message: `Sitemap has ${urlCount} URLs — over Google's 50k-per-file recommendation`,
          impl: "Split into multiple sitemap files referenced from a sitemap index.",
        });
      }
    }

    // robots.txt referencing the sitemap
    const robotsHasSitemap = ctx.responseHeaders["x-w360-robots-has-sitemap"] === "yes";
    if (status === "ok" && !robotsHasSitemap) {
      findings.push({
        skill: "sitemap",
        check: "sitemap_in_robots",
        status: "warn",
        pillar: "SEO",
        priority: "low",
        message: "Sitemap exists but is not declared in robots.txt",
        impl: `Add "Sitemap: https://${ctx.project.domain}/sitemap.xml" to your robots.txt file.`,
      });
    }

    return findings;
  },
};
