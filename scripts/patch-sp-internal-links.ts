#!/usr/bin/env tsx
// Replace the dead internal_links on SP1-SP6 with verified-live equivalents
// from url_metrics_latest. The dead ones I seeded from memory don't match
// the actual we360.ai blog slugs — writers would have shipped 404s.
//
// Each SP gets its TARGETED replacements (best thematic match, weighted toward
// pages we already track positions for so the link signals reinforce ranking
// queries we care about).

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env"); process.exit(1);
}
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.trim());
const PROJECT_ID = "11111111-1111-4111-8111-000000000001";

// Per-task verified internal_link sets. Every link in this map was confirmed
// live via curl HEAD or url_metrics_latest (GSC-tracked = exists on we360.ai).
// Ordering matters — first 4 are the ones surfaced in the brief.
const SP_LINKS: Record<string, string[]> = {
  SP1: [
    "/solutions/employee-monitoring",                                                          // 200 ✓
    "/features/productivity-tracking",                                                         // 200 ✓
    "/features/application-and-website-usage",                                                 // 200 (was /features/application-tracking)
    "/blog/a-comprehensive-guide-to-user-monitoring-software-for-small-businesses",            // GSC-tracked (was /blog/employee-monitoring-software)
  ],
  SP2: [
    "/solutions/employee-monitoring",                                                          // 200 ✓
    "/features/application-and-website-usage",                                                 // 200 ✓
    "/employee-productivity-roi-calculator",                                                   // GSC-tracked, pos 9.1 (was /blog/employee-productivity-roi-calculator)
    "/blog/how-employee-monitoring-software-reduces-costs",                                    // GSC-tracked (pivots to spend/cost theme — fits AI spend page)
  ],
  SP3: [
    "/solutions/employee-monitoring",                                                          // 200 ✓
    "/features/productivity-tracking",                                                         // 200 ✓
    "/blog/the-hidden-signals-of-burnout-what-workforce-analytics-detects-early",              // GSC-tracked, pos 11.4 (was /blog/employee-burnout)
    "/blog/using-data-to-detect-disengagement",                                                // GSC-tracked, pos 6.1 (was /blog/employee-engagement-metrics)
  ],
  SP4: [
    "/solutions/employee-monitoring",                                                          // 200 ✓
    "/features/productivity-tracking",                                                         // 200 ✓
    "/employee-productivity-roi-calculator",                                                   // GSC-tracked, pos 9.1 (was /blog/employee-productivity-roi-calculator)
    "/blog/how-to-measure-productivity-formula-metrics-and-best-methods",                      // 200 ✓
  ],
  SP5: [
    "/solutions/employee-monitoring",                                                          // 200 ✓
    "/features/productivity-tracking",                                                         // 200 ✓
    "/features/application-and-website-usage",                                                 // 200 (was /features/application-tracking)
    "/blog/computer-activity-monitoring-software-for-managing-remote-teams",                   // GSC-tracked, IT-tilt theme (was /industries/it-services — /industries/* doesn't exist)
  ],
  SP6: [
    "/solutions/employee-monitoring",                                                          // 200 ✓
    "/features/productivity-tracking",                                                         // 200 ✓
    "/features/timesheet",                                                                     // 200 ✓
    "/blog/how-employee-monitoring-software-reduces-costs",                                    // GSC-tracked (cost / CFO angle — fits Finance page) (was /industries/finance)
  ],
};

async function main() {
  let updated = 0;
  for (const [key, links] of Object.entries(SP_LINKS)) {
    const keyTag = `[${key}]`;
    const { data: rows } = await admin
      .from("tasks")
      .select("id, title, brief")
      .eq("project_id", PROJECT_ID)
      .ilike("title", `%${keyTag}`)
      .limit(1);
    const t = (rows ?? [])[0] as { id: string; title: string; brief: Record<string, unknown> } | undefined;
    if (!t) { console.log(`  ⚠  no task for ${key}`); continue; }

    const brief = (t.brief ?? {}) as { internal_links?: string[] } & Record<string, unknown>;
    const oldLinks = brief.internal_links ?? [];
    const merged = {
      ...brief,
      internal_links: links,
    };
    const { error } = await admin.from("tasks").update({ brief: merged }).eq("id", t.id);
    if (error) { console.error(`  ❌ ${key}: ${error.message}`); continue; }
    updated += 1;
    console.log(`  ✅ ${key}  swapped ${oldLinks.length} → ${links.length} links`);
    for (const l of oldLinks) console.log(`        was: ${l}`);
    for (const l of links)    console.log(`        now: ${l}`);
  }
  console.log(`\n=== ${updated}/${Object.keys(SP_LINKS).length} tasks patched ===`);
}

main().catch((e) => { console.error(e); process.exit(1); });
