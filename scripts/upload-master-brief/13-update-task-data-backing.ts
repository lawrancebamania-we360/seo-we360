#!/usr/bin/env tsx
/**
 * Phase 13: For every "Update X" blog_task with a URL, populate data_backing
 * with the latest GSC + GA4 numbers — so writers can see WHY the task is on
 * the queue without leaving the card.
 *
 * Output (per task) is appended to the data_backing field in the format:
 *
 *   GSC 28d: 5,420 imp · 67 clk · CTR 1.2% · pos 14.3 (was 11.6)
 *   Top query: "remote employee monitoring software" (1,800 imp / pos 12)
 *   GA4 28d: 312 sessions · 47% engaged · avg 1m04s on page
 *   → Why update: pos 14 = page-2 territory; CTR collapsed from 3% in Apr.
 *
 * Skips tasks whose project doesn't have GSC or GA4 configured.
 *
 * Usage:
 *   npx tsx scripts/upload-master-brief/13-update-task-data-backing.ts            # dry run
 *   npx tsx scripts/upload-master-brief/13-update-task-data-backing.ts --execute  # write
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { getGscUrlAggregates } from "@/lib/google/gsc";
import { getGa4UrlAggregates } from "@/lib/google/ga4";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);
const PROJECT_ID = "11111111-1111-4111-8111-000000000001";
const EXECUTE = process.argv.includes("--execute");
const WINDOW_DAYS = 28;

interface Task {
  id: string;
  title: string;
  url: string | null;
  data_backing: string | null;
  scheduled_date: string | null;
}

const formatDuration = (sec: number): string => {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m${String(s).padStart(2, "0")}s`;
};

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

async function main() {
  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}`);
  console.log(`Window: last ${WINDOW_DAYS} days\n`);

  // Project config — need GSC + GA4 properties to run
  const { data: project } = await admin
    .from("projects")
    .select("id, name, domain, gsc_property_url, ga4_property_id")
    .eq("id", PROJECT_ID)
    .single();
  if (!project) { console.error("Project not found"); process.exit(1); }

  const gscUrl = project.gsc_property_url as string | null;
  const ga4Id = project.ga4_property_id as string | null;
  if (!gscUrl && !ga4Id) {
    console.error("Neither GSC nor GA4 is configured on the project. Set them via /dashboard/integrations first, then re-run.");
    process.exit(1);
  }
  console.log(`GSC property: ${gscUrl ?? "(not configured)"}`);
  console.log(`GA4 property: ${ga4Id ?? "(not configured)"}\n`);

  // Pull all "Update X" tasks with a URL
  const { data: tasks } = await admin
    .from("tasks")
    .select("id, title, url, data_backing, scheduled_date")
    .eq("project_id", PROJECT_ID)
    .eq("kind", "blog_task")
    .ilike("title", "Update %")
    .not("url", "is", null);

  const candidates = (tasks ?? []) as Task[];
  console.log(`Found ${candidates.length} update task(s) with a URL\n`);
  if (candidates.length === 0) return;

  // Pull GSC + GA4 aggregates ONCE for all URLs (more efficient than per-task calls)
  const allUrls = candidates.map((t) => t.url!).filter(Boolean);
  const pathHints = allUrls.map((u) => {
    try { return new URL(u, "https://" + project.domain).pathname; } catch { return u; }
  });

  let gscByUrl: Record<string, { clicks: number; impressions: number; ctr: number; position: number }> = {};
  let ga4ByPath: Record<string, { sessions: number; engagedSessions: number; pageviews: number; avgEngagementTimeSec: number }> = {};

  if (gscUrl) {
    console.log("Pulling GSC URL aggregates...");
    try {
      // GSC's URL filter is "contains" — pulling the whole site once and
      // matching client-side is simpler and avoids N filter calls.
      const rows = await getGscUrlAggregates({ siteUrl: gscUrl, windowDays: WINDOW_DAYS });
      for (const r of rows) gscByUrl[r.url] = { clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position };
      console.log(`  Got ${rows.length} GSC URL rows`);
    } catch (e) {
      console.error(`  GSC fetch failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (ga4Id) {
    console.log("Pulling GA4 URL aggregates...");
    try {
      const rows = await getGa4UrlAggregates({ propertyId: ga4Id, windowDays: WINDOW_DAYS });
      for (const r of rows) ga4ByPath[r.pagePath] = r;
      console.log(`  Got ${rows.length} GA4 path rows`);
    } catch (e) {
      console.error(`  GA4 fetch failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log();

  // Match each task to its GSC + GA4 row, build backing text
  let touched = 0, skipped = 0;
  for (const t of candidates) {
    const url = t.url!;
    const path = (() => { try { return new URL(url, "https://" + project.domain).pathname; } catch { return url; } })();

    // GSC: match by URL prefix (the site's stored URL might have/lack trailing slash)
    const gscRow = gscByUrl[url] ?? gscByUrl[url + "/"] ?? gscByUrl[url.replace(/\/$/, "")] ??
      Object.entries(gscByUrl).find(([u]) => u.endsWith(path))?.[1];
    const ga4Row = ga4ByPath[path] ?? ga4ByPath[path + "/"] ?? ga4ByPath[path.replace(/\/$/, "")];

    const lines: string[] = [];
    if (gscRow) {
      lines.push(`GSC ${WINDOW_DAYS}d: ${gscRow.impressions.toLocaleString()} imp · ${gscRow.clicks.toLocaleString()} clk · CTR ${pct(gscRow.ctr)} · pos ${gscRow.position.toFixed(1)}`);
    } else if (gscUrl) {
      lines.push(`GSC ${WINDOW_DAYS}d: no impressions for ${path}`);
    }
    if (ga4Row) {
      const engagementRate = ga4Row.sessions > 0 ? ga4Row.engagedSessions / ga4Row.sessions : 0;
      lines.push(`GA4 ${WINDOW_DAYS}d: ${ga4Row.sessions.toLocaleString()} sessions · ${pct(engagementRate)} engaged · avg ${formatDuration(ga4Row.avgEngagementTimeSec)} on page`);
    } else if (ga4Id) {
      lines.push(`GA4 ${WINDOW_DAYS}d: no sessions for ${path}`);
    }

    if (lines.length === 0) { skipped++; continue; }

    // Add a "why update" hint based on the GSC numbers
    if (gscRow) {
      if (gscRow.position > 10 && gscRow.position <= 20 && gscRow.impressions > 100) {
        lines.push(`→ Striking distance: pos ${gscRow.position.toFixed(0)} on page 2 with ${gscRow.impressions.toLocaleString()} imp/mo. Push to top-10 = real traffic.`);
      } else if (gscRow.position > 5 && gscRow.position <= 10 && gscRow.ctr < 0.02) {
        lines.push(`→ Title/meta refresh opportunity: ranking page-1 (pos ${gscRow.position.toFixed(0)}) but CTR ${pct(gscRow.ctr)} is below benchmark.`);
      } else if (gscRow.position > 20) {
        lines.push(`→ Deep refresh needed: pos ${gscRow.position.toFixed(0)} (page 3+). Likely thin/outdated content.`);
      }
    }

    const backing = lines.join("\n");
    console.log(`[${t.id.slice(0, 8)}] ${t.title.slice(0, 60)}`);
    console.log(`    url: ${url}`);
    for (const ln of lines) console.log(`    ${ln}`);
    console.log();

    if (EXECUTE) {
      const { error } = await admin
        .from("tasks")
        .update({ data_backing: backing, updated_at: new Date().toISOString() })
        .eq("id", t.id);
      if (error) console.error(`    ✗ ${error.message}`);
    }
    touched++;
  }

  console.log(`\n${touched} task(s) updated, ${skipped} skipped (no matching GSC/GA4 row)`);
  if (!EXECUTE) console.log(`(Dry run — re-run with --execute to write)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
