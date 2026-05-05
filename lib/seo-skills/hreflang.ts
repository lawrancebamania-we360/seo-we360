import type { Skill, Finding } from "./types";

// Hreflang skill — only activated when project.supports_multi_language is true.
// Checks that every page has proper alternate language tags.
export const hreflangSkill: Skill = {
  name: "hreflang",
  description: "hreflang tags for multilingual sites — required when supports_multi_language",
  pillars: ["SEO"],
  run(ctx) {
    const findings: Finding[] = [];
    // This skill is opted-in at orchestrator level based on project.supports_multi_language
    // — if it's running, we can assume the flag is on.

    const $ = ctx.$;
    const hreflangLinks = $("link[rel='alternate'][hreflang]").toArray();

    if (hreflangLinks.length === 0) {
      findings.push({
        skill: "hreflang",
        check: "hreflang_presence",
        status: "missing",
        pillar: "SEO",
        priority: "high",
        message: "Multi-language site has no hreflang tags on this page",
        impl: `Add <link rel="alternate" hreflang="en" href="..." /> for each language + a hreflang="x-default" for the canonical locale.`,
      });
      return findings;
    }

    // Collect hreflang codes
    const codes = hreflangLinks
      .map((el) => ($(el).attr("hreflang") ?? "").toLowerCase().trim())
      .filter((c) => c.length > 0);

    // Validate code format (language or language-region — ISO 639-1 + ISO 3166-1)
    const invalidCodes = codes.filter((c) => {
      if (c === "x-default") return false;
      return !/^[a-z]{2}(-[a-z]{2,3})?$/.test(c);
    });

    if (invalidCodes.length > 0) {
      findings.push({
        skill: "hreflang",
        check: "hreflang_invalid_code",
        status: "fail",
        pillar: "SEO",
        priority: "high",
        message: `Invalid hreflang code(s): ${invalidCodes.slice(0, 3).join(", ")}`,
        impl: "Use ISO 639-1 language codes (en, fr, de) optionally with ISO 3166-1 region (en-US, en-GB). Or x-default.",
        details: { invalid: invalidCodes },
      });
    }

    // Check for x-default
    if (!codes.includes("x-default")) {
      findings.push({
        skill: "hreflang",
        check: "hreflang_x_default",
        status: "warn",
        pillar: "SEO",
        priority: "medium",
        message: "No hreflang=\"x-default\" declared",
        impl: 'Add <link rel="alternate" hreflang="x-default" href="..." /> pointing to your fallback locale.',
      });
    }

    // Each page should self-reference in its hreflang set
    const selfUrl = ctx.url.replace(/\/$/, "");
    const selfReferenced = hreflangLinks.some((el) => {
      const href = $(el).attr("href") ?? "";
      try {
        return new URL(href, ctx.url).href.replace(/\/$/, "") === selfUrl;
      } catch {
        return false;
      }
    });
    if (!selfReferenced) {
      findings.push({
        skill: "hreflang",
        check: "hreflang_self_ref",
        status: "warn",
        pillar: "SEO",
        priority: "medium",
        message: "This page is not listed in its own hreflang alternates",
        impl: "Every page must reference itself in its hreflang block — otherwise Google treats the set as malformed.",
      });
    }

    return findings;
  },
};
