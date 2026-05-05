import type { Skill, Finding, AuditContext } from "./types";

export const technicalSkill: Skill = {
  name: "technical",
  description: "On-page technical signals: title, meta, H1, canonical, robots, hreflang, status",
  pillars: ["SEO"],
  run(ctx) {
    const findings: Finding[] = [];
    const { $, url, statusCode } = ctx;

    // Status code
    if (statusCode >= 400) {
      findings.push({
        skill: "technical",
        check: "http_status",
        status: "fail",
        pillar: "SEO",
        priority: "critical",
        message: `Page returns HTTP ${statusCode}`,
        impl: "Fix or redirect this URL. Broken pages hurt crawl budget and rankings.",
      });
      return findings; // downstream checks meaningless on a broken page
    }

    // Title
    const title = $("head > title").first().text().trim();
    if (!title) {
      findings.push({
        skill: "technical",
        check: "title",
        status: "missing",
        pillar: "SEO",
        priority: "critical",
        message: "Page has no <title> tag",
        impl: "Add a 50–60 character title with the primary keyword near the start.",
      });
    } else if (title.length < 30) {
      findings.push({
        skill: "technical",
        check: "title",
        status: "warn",
        pillar: "SEO",
        priority: "medium",
        message: `Title is too short (${title.length} chars)`,
        impl: "Expand the title to 50–60 characters for better SERP coverage.",
        details: { title, length: title.length },
      });
    } else if (title.length > 70) {
      findings.push({
        skill: "technical",
        check: "title",
        status: "warn",
        pillar: "SEO",
        priority: "low",
        message: `Title is too long (${title.length} chars) — will truncate in SERPs`,
        impl: "Tighten the title to under 60 characters.",
        details: { title, length: title.length },
      });
    } else if (/untitled|coming soon|placeholder|lorem/i.test(title)) {
      findings.push({
        skill: "technical",
        check: "title",
        status: "fail",
        pillar: "SEO",
        priority: "high",
        message: `Title contains placeholder text: "${title}"`,
        impl: "Replace with a production title that targets the intended keyword.",
      });
    }

    // Meta description
    const meta = $("meta[name='description']").attr("content")?.trim();
    if (!meta) {
      findings.push({
        skill: "technical",
        check: "meta_description",
        status: "missing",
        pillar: "SEO",
        priority: "high",
        message: "Meta description missing",
        impl: "Write a 150–160 character meta description that includes the primary keyword and a clear CTA.",
      });
    } else if (meta.length < 120 || meta.length > 170) {
      findings.push({
        skill: "technical",
        check: "meta_description",
        status: "warn",
        pillar: "SEO",
        priority: "medium",
        message: `Meta description length is ${meta.length} chars (ideal 150–160)`,
        impl: "Rewrite to 150–160 characters. Google truncates longer ones in SERPs.",
        details: { length: meta.length },
      });
    }

    // H1
    const h1s = $("h1");
    if (h1s.length === 0) {
      findings.push({
        skill: "technical",
        check: "h1",
        status: "missing",
        pillar: "SEO",
        priority: "high",
        message: "Page has no H1",
        impl: "Add a single, keyword-relevant H1 as the first visible heading.",
      });
    } else if (h1s.length > 1) {
      findings.push({
        skill: "technical",
        check: "h1",
        status: "warn",
        pillar: "SEO",
        priority: "medium",
        message: `Page has ${h1s.length} H1s (should be exactly one)`,
        impl: "Demote extra H1s to H2/H3 so the page hierarchy is clear.",
        details: { count: h1s.length },
      });
    }

    // Canonical
    const canonical = $("link[rel='canonical']").attr("href");
    if (!canonical) {
      findings.push({
        skill: "technical",
        check: "canonical",
        status: "missing",
        pillar: "SEO",
        priority: "high",
        message: "No canonical tag",
        impl: "Add <link rel='canonical' href='{self-url}'> in <head> to prevent duplicate-content issues.",
      });
    } else {
      try {
        const canonUrl = new URL(canonical, url);
        const selfUrl = new URL(url);
        // if canonical points to homepage but this isn't homepage, flag
        if (canonUrl.pathname === "/" && selfUrl.pathname !== "/") {
          findings.push({
            skill: "technical",
            check: "canonical",
            status: "fail",
            pillar: "SEO",
            priority: "critical",
            message: `Canonical points to homepage from an inner page: ${canonUrl.href}`,
            impl: "Self-canonical this page — the canonical should equal this URL.",
            details: { canonical: canonUrl.href, url },
          });
        }
      } catch {
        findings.push({
          skill: "technical",
          check: "canonical",
          status: "warn",
          pillar: "SEO",
          priority: "medium",
          message: `Canonical URL is malformed: ${canonical}`,
          impl: "Use an absolute URL in the canonical tag.",
        });
      }
    }

    // Robots meta
    const robots = $("meta[name='robots']").attr("content")?.toLowerCase() ?? "";
    if (robots.includes("noindex")) {
      findings.push({
        skill: "technical",
        check: "robots",
        status: "fail",
        pillar: "SEO",
        priority: "critical",
        message: "Page has noindex directive — won't rank at all",
        impl: "Remove noindex if this page should rank. If it shouldn't, confirm it's excluded from sitemaps too.",
        details: { robots },
      });
    }

    // Open Graph
    const ogTitle = $("meta[property='og:title']").attr("content");
    const ogImage = $("meta[property='og:image']").attr("content");
    const ogDesc = $("meta[property='og:description']").attr("content");
    if (!ogTitle || !ogImage) {
      findings.push({
        skill: "technical",
        check: "og_tags",
        status: ogTitle || ogDesc ? "warn" : "missing",
        pillar: "SEO",
        priority: "medium",
        message: "Missing core Open Graph tags (og:title, og:image)",
        impl: "Add og:title, og:description, and og:image — shows on social shares and sometimes SERPs.",
      });
    }

    // Viewport
    const viewport = $("meta[name='viewport']").attr("content");
    if (!viewport) {
      findings.push({
        skill: "technical",
        check: "viewport",
        status: "missing",
        pillar: "SXO",
        priority: "high",
        message: "No viewport meta — mobile rendering will break",
        impl: `Add <meta name="viewport" content="width=device-width, initial-scale=1">`,
      });
    }

    return findings;
  },
};
