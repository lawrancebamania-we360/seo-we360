// Open a sync run record so we have observability on what happened during
// the daily 10am IST pass. Outputs the run id, which all the per-URL writes
// reference via source_run_id.
//
// Usage: npx tsx scripts/composio/start-sync-run.ts <project_id>
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);

(async () => {
  const projectId = process.argv[2];
  if (!projectId) { console.error("Usage: start-sync-run.ts <project_id>"); process.exit(2); }
  const { data, error } = await admin
    .from("url_metrics_runs")
    .insert({ project_id: projectId, status: "running" })
    .select("id")
    .single();
  if (error) { console.error(error); process.exit(1); }
  console.log((data as { id: string }).id);
})().catch((e) => { console.error("Crash:", e); process.exit(1); });
