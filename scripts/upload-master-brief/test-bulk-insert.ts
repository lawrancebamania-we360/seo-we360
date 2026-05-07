// Test the actual DB insert that the bulk-upload server action does, so we
// catch any schema / constraint / RLS issue BEFORE the user hits Upload.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);
const PROJECT_ID = "11111111-1111-4111-8111-000000000001";

(async () => {
  // Get my user id (super-admin)
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, role")
    .eq("email", "lawrance.bamania@we360.ai")
    .single();
  const me = profiles as { id: string; email: string; role: string } | null;
  console.log("Caller:", me);

  // Resolve assignee email
  const { data: lokeshProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", "lokesh.kumar@we360.ai")
    .single();
  const lokeshId = (lokeshProfile as { id: string } | null)?.id;
  console.log("Lokesh ID:", lokeshId);

  const insertRows = [
    {
      project_id: PROJECT_ID,
      kind: "blog_task" as const,
      title: "BULK-TEST: Update existing blog: remote work guide",
      target_keyword: "remote work guide",
      url: null,
      priority: "high" as const,
      status: "todo" as const,
      scheduled_date: "2026-05-12",
      word_count_target: 1500,
      intent: "commercial" as const,
      team_member_id: lokeshId,
      source: "manual" as const,
      created_by: me?.id ?? null,
      brief: {
        title: "BULK-TEST: Update existing blog: remote work guide",
        target_keyword: "remote work guide",
        recommended_h1: "BULK-TEST: Update existing blog: remote work guide",
        recommended_h2s: [],
        recommended_h3s: [],
        paa_questions: [],
        secondary_keywords: [],
        sections_breakdown: [],
        internal_links: [],
        competitor_refs: [],
        writer_notes: ["Format: update-blog"],
        word_count_target: 1500,
        intent: "commercial",
        generated_by: "manual",
      },
    },
  ];

  console.log("\nAttempting insert...");
  const { data, error } = await admin
    .from("tasks")
    .insert(insertRows)
    .select("id, title");

  if (error) {
    console.error("\n❌ Insert FAILED:", error);
    console.error("Error details:", JSON.stringify(error, null, 2));
    return;
  }
  console.log("\n✅ Insert succeeded:", data);

  // Clean up
  if (data && data[0]) {
    const { error: delErr } = await admin.from("tasks").delete().eq("id", data[0].id);
    if (delErr) console.error("Cleanup failed:", delErr);
    else console.log("Test row cleaned up.");
  }
})().catch((e) => { console.error("Crash:", e); process.exit(1); });
