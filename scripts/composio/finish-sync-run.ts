// Close out a sync run: count totals and mark status.
// Usage: npx tsx scripts/composio/finish-sync-run.ts <run_id> <urls_total> [error_message]
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);

(async () => {
  const runId = process.argv[2];
  const urlsTotal = parseInt(process.argv[3] ?? "0", 10);
  const errorMsg = process.argv[4] ?? null;
  if (!runId) { console.error("Usage: finish-sync-run.ts <run_id> <urls_total> [error]"); process.exit(2); }

  const { data: run } = await admin
    .from("url_metrics_runs")
    .select("urls_succeeded")
    .eq("id", runId)
    .single();
  const succeeded = (run as { urls_succeeded: number } | null)?.urls_succeeded ?? 0;
  const failed = Math.max(0, urlsTotal - succeeded);

  const { error } = await admin
    .from("url_metrics_runs")
    .update({
      finished_at: new Date().toISOString(),
      urls_total: urlsTotal,
      urls_failed: failed,
      status: errorMsg ? "failed" : "completed",
      error_message: errorMsg,
    })
    .eq("id", runId);
  if (error) { console.error(error.message); process.exit(1); }

  console.log(JSON.stringify({ ok: true, urlsTotal, succeeded, failed }));
})().catch((e) => { console.error("Crash:", e); process.exit(1); });
