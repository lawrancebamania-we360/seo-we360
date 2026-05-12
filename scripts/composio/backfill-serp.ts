// One-shot SERP backfill for existing blog tasks that don't have Apify
// enrichment yet. Light enrichment only (apify/google-search-scraper,
// ~$0.005 per task) — the expensive content-gap agent is handled by the
// weekly cron, not this script.
//
// Safe to run on dozens of tasks ($0.50 for 100 tasks). Idempotent —
// re-runs skip tasks where brief.enriched_at is already set.
//
// Usage:
//   npx tsx scripts/composio/backfill-serp.ts                # dry run, list candidates
//   npx tsx scripts/composio/backfill-serp.ts --execute      # actually run + write
//   npx tsx scripts/composio/backfill-serp.ts --execute --cap=50

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import {
  callSerp, mergeSerpIntoBrief, formatSerpEnrichmentSummary, stripPriorEnrichment,
  type BriefSeed,
} from "../../lib/apify/serp";

config({ path: ".env.local" });

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APIFY_TOKEN } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase env"); process.exit(1);
}
if (!APIFY_TOKEN) { console.error("Missing APIFY_TOKEN"); process.exit(1); }

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.trim());

// --------------------------- args ---------------------------------------
const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  if (a === "--execute") args.set("execute", "1");
  else if (a.startsWith("--")) {
    const [k, v] = a.slice(2).split("=");
    args.set(k, v ?? "1");
  }
}
const EXECUTE = args.has("execute");
const CAP = parseInt(args.get("cap") ?? "200", 10);

const PROJECT_ID = "11111111-1111-4111-8111-000000000001";

// ----------------------- main -----------------------------------------

interface TaskRow {
  id: string;
  title: string;
  target_keyword: string | null;
  data_backing: string | null;
  brief: BriefSeed | null;
}

function isEnriched(t: TaskRow): boolean {
  // A task is considered enriched if any of these are true:
  //   - brief.enriched_at is set (our new sentinel)
  //   - data_backing contains the legacy enrichment marker (older runs)
  //   - brief.competitor_refs has 3+ entries (means SERP top-organic was merged)
  if (t.brief?.enriched_at) return true;
  if ((t.brief?.competitor_refs?.length ?? 0) >= 3) return true;
  if (t.data_backing?.includes("**Apify enrichment")) return true;
  return false;
}

async function main() {
  console.log(`SERP backfill — mode=${EXECUTE ? "EXECUTE" : "DRY RUN"}, cap=${CAP}`);

  const { data, error } = await admin
    .from("tasks")
    .select("id, title, target_keyword, data_backing, brief")
    .eq("project_id", PROJECT_ID)
    .eq("kind", "blog_task")
    .not("target_keyword", "is", null)
    .neq("status", "done")
    .limit(1000);
  if (error) throw error;
  const all = (data ?? []) as TaskRow[];
  const todo = all.filter((t) => !isEnriched(t)).slice(0, CAP);

  console.log(`Found ${todo.length} task(s) missing SERP enrichment (of ${all.length} total).`);
  if (todo.length === 0) { console.log("Nothing to do."); return; }

  // Estimated cost: $0.005 per task. Log it up front.
  const cost = todo.length * 0.005;
  console.log(`Estimated cost: ~$${cost.toFixed(2)}\n`);

  if (!EXECUTE) {
    console.log("First 10 candidates:");
    for (const t of todo.slice(0, 10)) {
      console.log(`  "${t.target_keyword}" — ${t.title}`);
    }
    console.log("\nRe-run with --execute to backfill.");
    return;
  }

  let ok = 0, fail = 0, skip = 0;
  for (let i = 0; i < todo.length; i++) {
    const t = todo[i];
    const kw = t.target_keyword!.trim();
    console.log(`[${i + 1}/${todo.length}] "${kw}"`);
    try {
      const serp = await callSerp(kw);
      if (!serp) { console.log("  no result, skipping"); skip++; continue; }
      const mergedBrief = mergeSerpIntoBrief(t.brief, kw, serp);
      const mergedDataBacking = stripPriorEnrichment(t.data_backing ?? "") + formatSerpEnrichmentSummary(serp);
      const { error: updErr } = await admin
        .from("tasks")
        .update({ brief: mergedBrief, data_backing: mergedDataBacking })
        .eq("id", t.id);
      if (updErr) throw updErr;
      console.log(`  ✓ +${serp.topOrganicUrls.length} competitors, +${serp.paaQuestions.length} PAA, +${serp.relatedSearches.length} related`);
      ok++;
    } catch (e) {
      console.error(`  ✗ ${e instanceof Error ? e.message : e}`);
      fail++;
    }
    // Stagger to avoid Apify rate-limits (free plan is touchy at >2 req/s).
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(`\nDone. ${ok} enriched, ${skip} skipped, ${fail} failed. Spend ≈ $${(ok * 0.005).toFixed(3)}.`);
}

main().catch((e) => { console.error("Crash:", e); process.exit(1); });
