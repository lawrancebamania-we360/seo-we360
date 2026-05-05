#!/usr/bin/env tsx
/**
 * Phase 15: Write GSC + GA4 backing onto the 13 "Update X" tasks.
 *
 * GSC data was scraped via Chrome (GSC Performance > Pages, last 28 days)
 * since service-account JSON wasn't set up. GA4 data scraped from the same
 * GA4 property (Pages and screens report). Numbers are from the user's
 * own browser session as lawrance.bamania@we360.ai.
 *
 * Usage:
 *   npx tsx scripts/upload-master-brief/15-write-update-backing.ts            # dry run
 *   npx tsx scripts/upload-master-brief/15-write-update-backing.ts --execute  # write
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);
const PROJECT_ID = "11111111-1111-4111-8111-000000000001";
const EXECUTE = process.argv.includes("--execute");

interface UrlData {
  taskTitleContains: string;
  pathSlug: string;
  // GSC last 28 days
  gscClicks: number;
  gscImpressions: number;
  gscCtr: number;       // 0–1 (e.g. 0.028 for 2.8%)
  gscPosition: number;
  // GA4 last 28 days
  ga4Views: number | null;
  ga4Users: number | null;
  ga4AvgEngagement: string | null;  // e.g. "31s" or "1m 04s"
}

// Hand-curated from Chrome scrapes (GSC Pages report + GA4 Pages and screens
// report, both last 28 days, signed in as lawrance.bamania@we360.ai).
const URL_DATA: UrlData[] = [
  { taskTitleContains: "prohance alternative",                 pathSlug: "/blog/top-5-prohance-alternatives-in-2025",
    gscClicks: 9, gscImpressions: 4014, gscCtr: 0.002, gscPosition: 8.5,
    ga4Views: 32, ga4Users: 27, ga4AvgEngagement: "31s" },
  { taskTitleContains: "remote screen monitoring software",    pathSlug: "/blog/remote-screen-monitoring-software-a-game-changer-for-work-from-home-teams",
    gscClicks: 9, gscImpressions: 4523, gscCtr: 0.002, gscPosition: 19.5,
    ga4Views: 27, ga4Users: 27, ga4AvgEngagement: "8s" },
  { taskTitleContains: "how to measure productivity",          pathSlug: "/blog/how-to-measure-productivity-formula-metrics-and-best-methods",
    gscClicks: 7, gscImpressions: 4225, gscCtr: 0.002, gscPosition: 26.6,
    ga4Views: 22, ga4Users: 20, ga4AvgEngagement: "11s" },
  { taskTitleContains: "/solutions/employee-monitoring",       pathSlug: "/solutions/employee-monitoring",
    gscClicks: 12, gscImpressions: 1890, gscCtr: 0.006, gscPosition: 12.6,
    ga4Views: 297, ga4Users: 211, ga4AvgEngagement: "30s" },
  { taskTitleContains: "/automated-attendance",                pathSlug: "/automated-attendance",
    gscClicks: 3, gscImpressions: 2095, gscCtr: 0.001, gscPosition: 13.7,
    ga4Views: null, ga4Users: null, ga4AvgEngagement: null },
  { taskTitleContains: "zoho people vs keka",                  pathSlug: "/blog/zoho-people-vs-keka-hr",
    gscClicks: 8, gscImpressions: 1503, gscCtr: 0.005, gscPosition: 8.5,
    ga4Views: 24, ga4Users: 24, ga4AvgEngagement: "8s" },
  { taskTitleContains: "canva-alternative",                    pathSlug: "/blog/canva-alternative",
    gscClicks: 4, gscImpressions: 2641, gscCtr: 0.002, gscPosition: 12.0,
    ga4Views: 22, ga4Users: 18, ga4AvgEngagement: "2s" },
  { taskTitleContains: "best work from home monitoring",       pathSlug: "/blog/best-work-from-home-monitoring-software",
    gscClicks: 2, gscImpressions: 7052, gscCtr: 0, gscPosition: 30.6,
    ga4Views: 21, ga4Users: 20, ga4AvgEngagement: "25s" },
  { taskTitleContains: "team dynamics at workplace",           pathSlug: "/blog/team-dynamics-at-workplace",
    gscClicks: 9, gscImpressions: 2292, gscCtr: 0.004, gscPosition: 13.4,
    ga4Views: 31, ga4Users: 27, ga4AvgEngagement: "12s" },
  { taskTitleContains: "/remote-employee-monitoring",          pathSlug: "/remote-employee-monitoring",
    gscClicks: 6, gscImpressions: 5822, gscCtr: 0.001, gscPosition: 36.3,
    ga4Views: null, ga4Users: null, ga4AvgEngagement: null },
  { taskTitleContains: "/professional-invoice-generator",      pathSlug: "/professional-invoice-generator",
    gscClicks: 22, gscImpressions: 788, gscCtr: 0.028, gscPosition: 15.9,
    ga4Views: 36, ga4Users: 30, ga4AvgEngagement: "4s" },
  { taskTitleContains: "/blog-generator",                      pathSlug: "/blog-generator",
    gscClicks: 25, gscImpressions: 1677, gscCtr: 0.015, gscPosition: 12.8,
    ga4Views: 39, ga4Users: 31, ga4AvgEngagement: "11s" },
  { taskTitleContains: "crm-specialist",                       pathSlug: "/job-descriptions/crm-specialist-job-descriptions",
    gscClicks: 10, gscImpressions: 5237, gscCtr: 0.002, gscPosition: 7.8,
    ga4Views: null, ga4Users: null, ga4AvgEngagement: null },
];

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

function buildBacking(d: UrlData): string {
  const lines: string[] = [];
  lines.push(`GSC 28d: ${d.gscImpressions.toLocaleString()} imp · ${d.gscClicks} clk · CTR ${pct(d.gscCtr)} · pos ${d.gscPosition.toFixed(1)}`);
  if (d.ga4Views != null && d.ga4Users != null) {
    lines.push(`GA4 28d: ${d.ga4Views} pageviews · ${d.ga4Users} active users · avg ${d.ga4AvgEngagement} engagement`);
  } else {
    lines.push(`GA4 28d: no recorded sessions on this URL (low/zero internal traffic)`);
  }

  // "Why update" hint based on the GSC numbers
  if (d.gscPosition > 20 && d.gscImpressions > 1000) {
    lines.push(`→ Deep refresh needed: pos ${d.gscPosition.toFixed(0)} (page 3+) but ${d.gscImpressions.toLocaleString()} imp/mo means there's intent. Likely thin/outdated content blocking the climb.`);
  } else if (d.gscPosition > 10 && d.gscPosition <= 20 && d.gscImpressions > 500) {
    lines.push(`→ Striking distance: pos ${d.gscPosition.toFixed(0)} on page 2 with ${d.gscImpressions.toLocaleString()} imp/mo. Refresh to push into top-10 = real traffic.`);
  } else if (d.gscPosition > 5 && d.gscPosition <= 10 && d.gscCtr < 0.02 && d.gscImpressions > 1000) {
    lines.push(`→ Title/meta refresh opportunity: ranking page-1 (pos ${d.gscPosition.toFixed(0)}) but CTR ${pct(d.gscCtr)} is below benchmark — fix the snippet, capture more clicks.`);
  } else if (d.gscPosition <= 10 && d.gscClicks >= 20) {
    lines.push(`→ Already strong (pos ${d.gscPosition.toFixed(0)}, ${d.gscClicks} clk/mo). Refresh to defend ranking + add depth for AI Overviews.`);
  }

  // GA4-driven engagement hint
  if (d.ga4Views != null && d.ga4AvgEngagement) {
    const secMatch = /(\d+)s/.exec(d.ga4AvgEngagement);
    const sec = secMatch ? parseInt(secMatch[1], 10) : 0;
    const isMin = /m/.test(d.ga4AvgEngagement);
    if (!isMin && sec < 15 && d.ga4Views > 10) {
      lines.push(`→ Engagement gap: avg ${d.ga4AvgEngagement} on page is too short — readers are bouncing. Restructure intro + add scannable structure.`);
    }
  }
  return lines.join("\n");
}

async function main() {
  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}\n`);

  const { data } = await admin
    .from("tasks")
    .select("id, title, url, data_backing")
    .eq("project_id", PROJECT_ID)
    .eq("kind", "blog_task")
    .ilike("title", "Update %");

  const tasks = (data ?? []) as Array<{ id: string; title: string; url: string | null; data_backing: string | null }>;
  console.log(`Found ${tasks.length} update tasks.\n`);

  let written = 0, missed = 0;
  for (const t of tasks) {
    if (!t.url) { missed++; continue; }
    const path = (() => { try { return new URL(t.url).pathname; } catch { return t.url; } })();

    // Match by path slug (most precise) or title contains
    const d = URL_DATA.find((x) => path === x.pathSlug || path.endsWith(x.pathSlug)) ??
              URL_DATA.find((x) => path.includes(x.taskTitleContains.toLowerCase()) || t.title.toLowerCase().includes(x.taskTitleContains.toLowerCase()));
    if (!d) {
      console.log(`[${t.id.slice(0, 8)}] NO MATCH for ${path}`);
      missed++;
      continue;
    }

    const backing = buildBacking(d);
    console.log(`[${t.id.slice(0, 8)}] ${t.title.slice(0, 55)}`);
    console.log(`    path: ${path}`);
    for (const ln of backing.split("\n")) console.log(`    ${ln}`);
    console.log();

    if (EXECUTE) {
      const { error } = await admin
        .from("tasks")
        .update({ data_backing: backing, updated_at: new Date().toISOString() })
        .eq("id", t.id);
      if (error) console.error(`    ✗ ${error.message}`);
    }
    written++;
  }

  console.log(`\n${written} task(s) written, ${missed} skipped (no matching URL_DATA row)`);
  if (!EXECUTE) console.log(`(Dry run — re-run with --execute to write)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
