// One-off helper: print the Google service account email + list the
// Google Docs currently failing with doc_unreachable, so the admin can
// share each doc with the service account and unblock verification.

import { config } from "dotenv";
config({ path: ".env.local" });
import { createAdminClient } from "@/lib/supabase/admin";

(async () => {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) { console.error("Missing GOOGLE_SERVICE_ACCOUNT_JSON in .env.local"); process.exit(1); }
  let email = "(parse failed)";
  try { email = (JSON.parse(raw) as { client_email?: string }).client_email ?? "(missing client_email)"; }
  catch (e) { console.error("Bad JSON:", e); process.exit(1); }

  console.log("=".repeat(76));
  console.log("SERVICE ACCOUNT EMAIL — share every Google Doc with this address:");
  console.log("");
  console.log(`  ${email}`);
  console.log("");
  console.log("=".repeat(76));

  const s = createAdminClient();
  const { data } = await s
    .from("task_verifications")
    .select("source_url, tasks!task_verifications_task_id_fkey!inner(title)")
    .eq("source_type", "google_doc")
    .eq("status", "failed")
    .order("queued_at", { ascending: true });

  const rows = (data ?? []) as Array<{ source_url: string; tasks: { title: string } }>;
  console.log(`\nDocs to share (${rows.length}):\n`);
  rows.forEach((r, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${r.tasks.title.slice(0, 70)}`);
    console.log(`      ${r.source_url}\n`);
  });
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
