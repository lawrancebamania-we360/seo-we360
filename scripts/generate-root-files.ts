#!/usr/bin/env tsx
// Generates the three root meta-files for the Astro rebuild:
//   public/robots.txt            — production version (we360.ai)
//   public/robots.staging.txt    — staging version (we360ai.org) — dev renames
//   public/.well-known/security.txt
//   public/llms.txt              — top pages by GSC clicks from url_metrics
//
// llms.txt page list is data-driven: pulls 90d GSC metrics for every tracked
// URL, ranks by clicks then impressions, keeps the top performers per
// section (core pages / solutions / features / comparisons / blog).
//
// Run: npx tsx --env-file=.env.local scripts/generate-root-files.ts

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { writeFileSync, mkdirSync } from "node:fs";

config({ path: ".env.local" });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!.trim());
const PID = "11111111-1111-4111-8111-000000000001";
const HOST = "https://www.we360.ai";

// ---------------------------------------------------------------- robots.txt

const ROBOTS_PROD = `# robots.txt — we360.ai (production)
# Search engines + AI crawlers welcome. Junk paths blocked.

User-agent: *
Allow: /

# --- AI crawlers (explicit allow so silence is never read as restriction) ---
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: CCBot
Allow: /

# --- Junk paths: never index these ---
User-agent: *
Disallow: /api/
Disallow: /dashboard/
Disallow: /*?page=
Disallow: /*?ref=
Disallow: /*?utm_

Sitemap: ${HOST}/sitemap.xml
`;

const ROBOTS_STAGING = `# robots.txt — we360ai.org (STAGING — full lockdown)
# This file is ONE of FOUR layers keeping staging out of Google:
#   1. HTTP basic-auth (the real wall)
#   2. X-Robots-Tag: noindex, nofollow header on every response
#   3. <meta name="robots" content="noindex,nofollow"> on every page
#   4. This file
# If this file ever ships to we360.ai production, organic traffic dies.
# CI guard must block "Disallow: /" on the production branch.

User-agent: *
Disallow: /
`;

// ----------------------------------------------------------- security.txt

function securityTxt(): string {
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  // RFC 9116: Expires is required, max 1 year out recommended.
  return `# security.txt — we360.ai (RFC 9116)
Contact: mailto:product@we360.ai
Expires: ${expires.toISOString().slice(0, 19)}.000Z
Preferred-Languages: en
Canonical: ${HOST}/.well-known/security.txt
`;
}

// ---------------------------------------------------------------- llms.txt

interface UrlRow { url: string; gsc_clicks: number; gsc_impressions: number }

async function topUrls(): Promise<UrlRow[]> {
  const { data, error } = await admin
    .from("url_metrics_latest")
    .select("url, gsc_clicks, gsc_impressions")
    .eq("project_id", PID)
    .eq("period", "90d");
  if (error) throw error;
  const rows = ((data ?? []) as UrlRow[])
    .map((r) => ({ ...r, url: r.url.replace(/^https?:\/\/(www\.)?we360\.ai/, "").replace(/\/$/, "") || "/" }))
    .filter((r) => r.url && !r.url.startsWith("/blog-old") && !r.url.includes("?"))
    .sort((a, b) => (b.gsc_clicks - a.gsc_clicks) || (b.gsc_impressions - a.gsc_impressions));
  // Dedupe: url_metrics tracks www + non-www + trailing-slash variants of the
  // same page as separate rows. After normalization they collapse — keep the
  // best-performing row per path (list is already sorted desc).
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}

// llms.txt = homepage + BoFu pages ONLY (per marketing decision 2026-06-02).
// Every page hand-listed with a 1-line description an AI engine can quote.
// Blog content intentionally excluded — AI engines find articles through the
// sitemap; llms.txt is for the pages that convert.

const SECTIONS: Array<[string, Array<[string, string]>]> = [
  ["Core", [
    ["/", "We360.ai homepage — workforce analytics software for productivity tracking, ROI measurement, and burnout prevention. ₹399/user/month, 120K+ users, 10K+ companies, 21+ countries."],
    ["/pricing", "Plans and pricing — starts at ₹399 per user/month, free trial, no credit card required."],
    ["/demo", "Book a guided demo of We360.ai."],
    ["/security", "Data security, privacy, and compliance practices."],
  ]],
  ["Solutions", [
    ["/solutions/employee-monitoring", "Employee monitoring — activity tracking, screenshots, productivity scoring."],
    ["/solutions/workforce-analytics", "Workforce analytics — utilization, capacity, and performance insights."],
    ["/solutions/time-tracker", "Time tracking — automated, no manual timers."],
    ["/solutions/employee-tracking", "Employee tracking for in-office, remote, and hybrid teams."],
    ["/solutions/field-tracking", "Field-force tracking — location-aware productivity for field teams."],
    ["/solutions/wfh-monitoring", "Work-from-home monitoring for distributed teams."],
    ["/solutions/operations-it", "Workforce analytics for Operations and IT teams."],
    ["/solutions/finance", "Workforce analytics for Finance teams — audit-ready visibility for CFOs."],
  ]],
  ["Features", [
    ["/features/productivity-tracking", "Productivity tracking — app/website usage, focus time, trends."],
    ["/features/application-and-website-usage", "Application and website usage tracking."],
    ["/features/attendance-insights", "Attendance insights — automated presence and shift analytics."],
    ["/features/employee-dashboard", "Employee dashboard — self-serve productivity view for every employee."],
    ["/features/screenshots", "Periodic screenshots with privacy controls."],
    ["/features/screen-recording", "Screen recording for compliance-sensitive workflows."],
    ["/features/livestream", "Live screen view for real-time support and training."],
    ["/features/timesheet", "Automated timesheets generated from real activity data."],
    ["/features/reports", "Reports — scheduled and on-demand workforce reporting."],
    ["/features/wellness", "Wellness — workload balance and burnout-risk signals."],
    ["/features/cost-intelligence", "Cost intelligence — productivity cost and hidden-capacity analysis."],
    ["/features/agentic-ai", "Agentic AI — AI assistant for workforce insights."],
    ["/features/ai-tools-usage-tracking", "AI tools usage tracking — ChatGPT, Copilot, Gemini, Claude adoption and ROI."],
    ["/features/ai-optimization-spend", "AI spend optimization — find unused AI licenses and recover waste."],
    ["/features/employee-retention-risk-analysis", "AI-powered retention risk and attrition prediction."],
    ["/features/executive-insights", "Executive insights — hidden capacity and financial-loss analysis for leadership."],
    ["/features/attrition-risk", "Attrition-risk signals from work-pattern analysis."],
    ["/features/activity-tracking", "Activity tracking — keyboard, mouse, and idle-time signals."],
  ]],
  ["Compare We360.ai", [
    ["/alternative/hubstaff", "We360.ai as a Hubstaff alternative — features, pricing, and fit."],
    ["/alternative/activtrak", "We360.ai as an ActivTrak alternative."],
    ["/alternative/timedoctor", "We360.ai as a Time Doctor alternative."],
    ["/alternative/desktime", "We360.ai as a DeskTime alternative."],
    ["/alternative/insightful", "We360.ai as an Insightful alternative."],
    ["/alternative/timechamp-alternative", "We360.ai as a TimeChamp alternative."],
  ]],
];

function slugToTitle(url: string): string {
  const last = url.split("/").filter(Boolean).pop() ?? "";
  return last.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---- Blog meta-description scraper (cached) -----------------------------
// Fetches each live blog page once and extracts <meta name="description">
// (og:description fallback). Results cached in scripts/.cache-blog-meta.json
// so re-runs are instant; delete the cache to force a re-scrape (e.g. after
// the Astro relaunch rewrites descriptions).

import { existsSync, readFileSync as readFs } from "node:fs";
const CACHE_PATH = "scripts/.cache-blog-meta.json";

function extractDescription(html: string): string | null {
  const patterns = [
    /<meta\s+name=["']description["']\s+content=["']([^"']{20,})["']/i,
    /<meta\s+content=["']([^"']{20,})["']\s+name=["']description["']/i,
    /<meta\s+property=["']og:description["']\s+content=["']([^"']{20,})["']/i,
    /<meta\s+content=["']([^"']{20,})["']\s+property=["']og:description["']/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) {
      return m[1]
        .replace(/&amp;/g, "&").replace(/&#0?39;|&#x27;|&apos;/gi, "'").replace(/&quot;|&#x22;/gi, '"')
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x[0-9a-f]+;|&#\d+;/gi, "")
        .replace(/\s+/g, " ").trim().slice(0, 200);
    }
  }
  return null;
}

async function blogDescriptions(paths: string[]): Promise<Map<string, string>> {
  const cache: Record<string, string | null> = existsSync(CACHE_PATH)
    ? JSON.parse(readFs(CACHE_PATH, "utf8"))
    : {};

  const todo = paths.filter((p) => !(p in cache));
  if (todo.length > 0) {
    console.log(`  scraping meta descriptions for ${todo.length} blog pages (cached: ${paths.length - todo.length})...`);
    const CONCURRENCY = 8;
    let done = 0;
    for (let i = 0; i < todo.length; i += CONCURRENCY) {
      const batch = todo.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (p) => {
        try {
          const res = await fetch(`https://we360.ai${p}`, {
            redirect: "follow",
            signal: AbortSignal.timeout(15_000),
            headers: { "user-agent": "Mozilla/5.0 (llms-txt-generator; we360 internal)" },
          });
          cache[p] = res.ok ? extractDescription(await res.text()) : null;
        } catch {
          cache[p] = null;
        }
      }));
      done += batch.length;
      if (done % 80 < CONCURRENCY) console.log(`    ${done}/${todo.length}`);
    }
    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 1));
  }

  const out = new Map<string, string>();
  for (const p of paths) {
    const d = cache[p];
    if (d) out.set(p, d);
  }
  return out;
}

async function llmsTxt(): Promise<string> {
  // Verify every listed URL is actually GSC-tracked (= exists). Warn on misses
  // so we never ship a dead link to AI engines.
  const all = await topUrls();
  const tracked = new Set(all.map((r) => r.url));
  const lines: string[] = [
    "# We360.ai",
    "",
    "> Workforce analytics software for productivity tracking, ROI measurement, and attrition prevention. India-first, used by 120K+ employees across 10K+ companies in 21+ countries. Pricing starts at ₹399 per user/month.",
    "",
  ];
  for (const [section, pages] of SECTIONS) {
    lines.push(`## ${section}`, "");
    for (const [u, d] of pages) {
      if (u !== "/" && !tracked.has(u)) {
        console.warn(`  ⚠  not GSC-tracked (check it's live): ${u}`);
      }
      lines.push(`- [${u === "/" ? "Homepage" : slugToTitle(u)}](${HOST}${u}): ${d}`);
    }
    lines.push("");
  }

  // Full blog catalog — every GSC-tracked /blog/ URL, ranked by clicks then
  // impressions so AI crawlers hit the strongest content first. Each article
  // carries its live meta description (scraped once, cached in
  // scripts/.cache-blog-meta.json) so AI engines can judge relevance without
  // crawling every page. The llms.txt spec allows long lists; this doubles
  // as a crawl frontier for engines that prefer llms.txt over sitemap.xml.
  const blogs = all.filter((r) => r.url.startsWith("/blog/"));
  const meta = await blogDescriptions(blogs.map((b) => b.url));
  lines.push("## Articles", "");
  for (const b of blogs) {
    const d = meta.get(b.url);
    lines.push(d ? `- [${slugToTitle(b.url)}](${HOST}${b.url}): ${d}` : `- [${slugToTitle(b.url)}](${HOST}${b.url})`);
  }
  lines.push(
    "",
    "## Optional",
    "",
    `- [Sitemap](${HOST}/sitemap.xml): Full URL inventory of the site.`,
    `- [Blog index](${HOST}/blogs/all-articles): All articles on productivity, monitoring, and workforce analytics.`,
    "",
  );
  return lines.join("\n");
}

// ------------------------------------------------------------------- main

async function main() {
  mkdirSync("public/.well-known", { recursive: true });

  writeFileSync("public/robots.txt", ROBOTS_PROD);
  console.log("✅ public/robots.txt (production)");

  writeFileSync("public/robots.staging.txt", ROBOTS_STAGING);
  console.log("✅ public/robots.staging.txt (rename to robots.txt on we360ai.org)");

  writeFileSync("public/.well-known/security.txt", securityTxt());
  console.log("✅ public/.well-known/security.txt");

  const llms = await llmsTxt();
  writeFileSync("public/llms.txt", llms);
  console.log(`✅ public/llms.txt (${llms.split("\n").filter((l) => l.startsWith("- ")).length} pages listed)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
