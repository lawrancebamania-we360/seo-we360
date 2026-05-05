import type { Skill, Finding } from "./types";

// AIO = AI/LLM Optimization — llms.txt, crawler access, structured knowledge
export const aioSkill: Skill = {
  name: "aio",
  description: "AI crawler accessibility: llms.txt, GPTBot/ClaudeBot/PerplexityBot in robots.txt",
  pillars: ["AIO"],
  run(ctx) {
    const findings: Finding[] = [];
    const { $, url, responseHeaders } = ctx;

    // Only check llms.txt + robots on homepage to avoid duplicate findings
    const isHomepage = new URL(url).pathname === "/";
    if (!isHomepage) return findings;

    // llms.txt — we can't fetch it from here (no side effects), but we can hint
    // Note: the orchestrator fetches /llms.txt separately and feeds result in responseHeaders meta
    if (responseHeaders["x-w360-llmstxt"] !== "present") {
      findings.push({
        skill: "aio",
        check: "llms_txt",
        status: "missing",
        pillar: "AIO",
        priority: "medium",
        message: "No /llms.txt file found",
        impl: "Create /llms.txt listing your site's canonical content for LLMs. See llmstxt.org.",
      });
    }

    // AI bot access (from robots.txt — fed via responseHeaders)
    const botsBlocked: string[] = JSON.parse(responseHeaders["x-w360-bots-blocked"] ?? "[]");
    if (botsBlocked.length > 0) {
      findings.push({
        skill: "aio",
        check: "ai_crawler_access",
        status: "warn",
        pillar: "AIO",
        priority: "medium",
        message: `AI crawlers blocked by robots.txt: ${botsBlocked.join(", ")}`,
        impl: "Unless this is intentional, allow GPTBot, ClaudeBot, PerplexityBot, Google-Extended — lets AI engines cite your content.",
        details: { blocked: botsBlocked },
      });
    }

    // FAQ schema presence drives AI citability — checked in schema skill
    // Article schema with speakable — optional boost
    const speakable = $("script[type='application/ld+json']").text().includes('"speakable"');
    if (!speakable) {
      findings.push({
        skill: "aio",
        check: "speakable_schema",
        status: "missing",
        pillar: "AIO",
        priority: "low",
        message: "No speakable schema on content pages",
        impl: "Add speakable property to Article schema for voice/AI summary eligibility.",
      });
    }

    return findings;
  },
};
