// Bump retry_count on a verification (used when prepare/finalize errored).
// Usage: npx tsx scripts/verify/mark-retry.ts <verification_id> "<error_message>"
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);

(async () => {
  const verificationId = process.argv[2];
  const errorMsg = process.argv[3] ?? "Unknown error";
  if (!verificationId) {
    console.error("Usage: mark-retry.ts <verification_id> <error_message>");
    process.exit(2);
  }

  const { data: ver } = await admin
    .from("task_verifications")
    .select("retry_count, task_id")
    .eq("id", verificationId)
    .single();
  if (!ver) { console.error("Not found"); process.exit(1); }

  const v = ver as { retry_count: number; task_id: string };
  const next = v.retry_count + 1;
  const finalFail = next >= 3;

  await admin
    .from("task_verifications")
    .update({
      status: finalFail ? "failed" : "queued",
      retry_count: next,
      error_message: errorMsg,
      summary: finalFail ? `Retries exhausted (3): ${errorMsg.slice(0, 100)}` : null,
    })
    .eq("id", verificationId);

  if (finalFail) {
    await admin
      .from("tasks")
      .update({
        ai_verification_status: "failed",
        ai_verification_summary: `Retries exhausted: ${errorMsg.slice(0, 100)}`,
        ai_verified_at: new Date().toISOString(),
      })
      .eq("id", v.task_id);
  }

  console.log(JSON.stringify({ ok: true, retry_count: next, final_fail: finalFail }));
})().catch((e) => { console.error("Crash:", e); process.exit(1); });
