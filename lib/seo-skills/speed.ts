import type { Skill, Finding } from "./types";

// Static speed hints (no Lighthouse here — that's in the PageSpeed cron phase).
// We check things like: inline scripts, render-blocking resources, page weight.
export const speedSkill: Skill = {
  name: "speed",
  description: "Static performance hints: page weight, render-blocking resources, preload hints",
  pillars: ["SXO"],
  run(ctx) {
    const findings: Finding[] = [];
    const { $, contentBytes, fetchMs } = ctx;

    // Total HTML size
    if (contentBytes > 500_000) {
      findings.push({
        skill: "speed",
        check: "html_weight",
        status: contentBytes > 1_000_000 ? "fail" : "warn",
        pillar: "SXO",
        priority: "medium",
        message: `HTML alone is ${(contentBytes / 1024).toFixed(0)} KB — heavy for mobile`,
        impl: "Reduce inline CSS/JS, lazy-load components, trim DOM size below 1500 nodes.",
        details: { bytes: contentBytes },
      });
    }

    // Fetch time
    if (fetchMs > 2000) {
      findings.push({
        skill: "speed",
        check: "ttfb",
        status: fetchMs > 3000 ? "fail" : "warn",
        pillar: "SXO",
        priority: "high",
        message: `Server responded in ${fetchMs}ms — TTFB too slow`,
        impl: "Move to a faster host, enable edge caching, reduce server-side work on page load.",
        details: { fetch_ms: fetchMs },
      });
    }

    // Render-blocking scripts in <head>
    const blockingScripts = $("head script[src]:not([async]):not([defer])").length;
    if (blockingScripts > 2) {
      findings.push({
        skill: "speed",
        check: "render_blocking_js",
        status: "warn",
        pillar: "SXO",
        priority: "medium",
        message: `${blockingScripts} render-blocking scripts in <head>`,
        impl: "Add defer or async to non-critical scripts — they delay first paint.",
      });
    }

    // Preconnect hints
    const hasPreconnect = $("link[rel='preconnect']").length > 0;
    if (!hasPreconnect) {
      findings.push({
        skill: "speed",
        check: "preconnect",
        status: "warn",
        pillar: "SXO",
        priority: "low",
        message: "No preconnect hints — third-party fonts/scripts load slower",
        impl: "Add <link rel='preconnect'> for fonts.googleapis.com, analytics, CDNs.",
      });
    }

    return findings;
  },
};
