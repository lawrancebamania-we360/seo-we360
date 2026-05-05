import type { Skill, Finding } from "./types";

// Programmatic SEO skill — detects template-generated pages that are at risk of
// thin-content / index-bloat penalties.
export const programmaticSkill: Skill = {
  name: "programmatic",
  description: "Detect programmatic / template pages at risk of thin content",
  pillars: ["SEO"],
  run(ctx) {
    const findings: Finding[] = [];
    const { $, url } = ctx;
    const path = (() => { try { return new URL(url).pathname; } catch { return url; } })();

    // Heuristic: URL path depth + slug patterns commonly used for programmatic pages
    const segments = path.split("/").filter(Boolean);
    const hasTemplatedPath =
      segments.length >= 2 &&
      (
        /^(locations?|cities?|states?|categories?|tags?|products?|services?|listings?|profiles?)$/i.test(segments[0]) ||
        /^(near-me|in-[a-z-]+|for-[a-z-]+)$/i.test(segments[segments.length - 1])
      );

    if (!hasTemplatedPath) return findings;

    // Count word volume in main content
    const mainText = (
      $("main").text() ||
      $("article").text() ||
      $(".entry-content").text() ||
      $(".post-content").text() ||
      $("body").text()
    ).replace(/\s+/g, " ").trim();
    const wordCount = mainText.split(/\s+/).filter(Boolean).length;

    // Detect repeated-template signals:
    //  - Very short content (< 300 words) on a templated URL pattern
    //  - No unique H1 (identical to title or generic)
    const title = $("head > title").text().trim();
    const h1 = $("h1").first().text().trim();
    const genericH1 = h1 === title || /^(home|untitled|welcome)$/i.test(h1);

    if (wordCount < 300) {
      findings.push({
        skill: "programmatic",
        check: "thin_programmatic_page",
        status: "fail",
        pillar: "SEO",
        priority: "high",
        message: `Programmatic page has only ${wordCount} words — high risk of thin-content penalty`,
        impl:
          "Either (a) expand to 400+ unique words per page via per-location data, FAQ, testimonials; " +
          "or (b) de-index low-value pages with noindex + remove from sitemap.",
        details: { word_count: wordCount, path },
      });
    }

    if (genericH1) {
      findings.push({
        skill: "programmatic",
        check: "generic_h1_programmatic",
        status: "warn",
        pillar: "SEO",
        priority: "medium",
        message: "Programmatic page has a generic H1 (same as title or 'home')",
        impl: "Customize the H1 per page — include the specific location / category / product name.",
      });
    }

    // Self-referencing canonical check — programmatic pages sometimes leak canonicals to the parent
    const canonical = $("link[rel='canonical']").attr("href");
    if (canonical) {
      try {
        const canonPath = new URL(canonical, url).pathname.replace(/\/$/, "");
        const thisPath = path.replace(/\/$/, "");
        if (canonPath !== thisPath && segments.length > 1) {
          findings.push({
            skill: "programmatic",
            check: "programmatic_canonical_leak",
            status: "fail",
            pillar: "SEO",
            priority: "high",
            message: `Canonical leaks to a different URL (${canonPath}) — page won't get credit for its content`,
            impl: "Self-canonical every programmatic page. Only use cross-canonical when pages are genuine duplicates.",
          });
        }
      } catch { /* ignore */ }
    }

    return findings;
  },
};
