#!/usr/bin/env tsx
// One-shot backfill: any blog_task whose brief.generated_by indicates an Apify
// enrichment ALREADY happened (so the content-gap-style data is in the brief)
// gets brief.content_gap_at stamped retroactively. This prevents the weekly
// cron in scripts/composio/weekly-content-gap.ts from re-enriching them.
//
// We use generated_by as the signal because that's the only post-enrichment
// marker the prior version of enrich-blog-tasks-apify.ts set. Going forward,
// the updated script also sets content_gap_at directly — this backfill is
// only needed once.

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!.trim());
const PID = "11111111-1111-4111-8111-000000000001";

const STAMP = new Date().toISOString();

async function main() {
  // Pull every blog_task that looks like it's been Apify-enriched but lacks
  // the timestamp. Conservative filter: generated_by includes "apify".
  const { data, error } = await a
    .from("tasks")
    .select("id, title, brief")
    .eq("project_id", PID)
    .eq("kind", "blog_task");
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; title: string; brief: Record<string, unknown> | null }>;

  let touched = 0;
  let skipped = 0;
  for (const r of rows) {
    const b = (r.brief ?? {}) as { generated_by?: string; content_gap_at?: string; recommended_h2s?: string[] } & Record<string, unknown>;
    const looksEnriched =
      (typeof b.generated_by === "string" && /apify/i.test(b.generated_by)) ||
      ((b.recommended_h2s?.length ?? 0) >= 3);
    if (!looksEnriched) { skipped += 1; continue; }
    if (b.content_gap_at) { skipped += 1; continue; }

    const merged = { ...b, content_gap_at: STAMP };
    const { error: e2 } = await a.from("tasks").update({ brief: merged }).eq("id", r.id);
    if (e2) { console.error(`  ❌ ${r.title.slice(0, 60)}: ${e2.message}`); continue; }
    touched += 1;
    console.log(`  ✅ stamped: ${r.title.slice(0, 80)}`);
  }
  console.log(`\n=== backfill done. stamped=${touched}  skipped=${skipped} ===`);
}

main().catch((e) => { console.error(e); process.exit(1); });
