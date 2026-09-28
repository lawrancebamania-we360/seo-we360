// Manual/local runner for the url_metrics sync - calls the SAME
// runUrlMetricsTick() the Vercel Cron route (app/api/cron/url-metrics)
// uses in production, just looped locally with a generous per-call budget
// until today's run is fully "completed". Useful for backfilling or
// testing without waiting for the 5 staggered daily cron entries.
//
// Usage: npx tsx scripts/sync-url-metrics.ts
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { runUrlMetricsTick } from "@/lib/cron/url-metrics";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);

// No Vercel duration ceiling locally - use a large per-call budget so a
// full drain takes only a couple of calls, not dozens.
const LOCAL_TICK_BUDGET_MS = 4 * 60_000;

(async () => {
  console.log("Sync url_metrics — start\n");
  for (let pass = 1; ; pass++) {
    const summary = await runUrlMetricsTick(admin, { budgetMs: LOCAL_TICK_BUDGET_MS });
    console.log(
      `  pass ${pass}: status=${summary.status} run_id=${summary.runId} ` +
      `${summary.nextIndex}/${summary.tasksTotal} tasks (+${summary.tasksDoneNow} this pass, ${summary.urlsTotal} URLs)`,
    );
    if (!summary.ok) {
      console.error(`  ✗ ${summary.error}`);
      process.exit(1);
    }
    if (summary.status === "completed" || summary.status === "already_done") break;
  }
  console.log("\nSync complete");
})().catch((e) => {
  console.error("Crash:", e instanceof Error ? e.message : e);
  process.exit(1);
});
