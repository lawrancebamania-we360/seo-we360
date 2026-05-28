#!/usr/bin/env tsx
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!.trim());
const PID = "11111111-1111-4111-8111-000000000001";

async function main() {
  const { data } = await a
    .from("tasks")
    .select("id, brief")
    .eq("project_id", PID)
    .ilike("title", `%[SP2]`)
    .limit(1);
  const t = (data ?? [])[0] as { id: string; brief: Record<string, unknown> } | undefined;
  if (!t) { console.log("no SP2 task found"); return; }
  const b = (t.brief ?? {}) as { writer_notes?: string[] } & Record<string, unknown>;
  const notes = b.writer_notes ?? [];

  const flag = `⚠️  SERP INTENT MISMATCH: Apify scrape of "AI optimization" returns Google AI-content-optimization + AI-search-engine-optimization results (SearchEngineLand, Conductor, etc.) — NOT AI-license-spend results. Consider pivoting the target_keyword to "AI spend management" or "AI license optimization" (both already in primary keyword pool) so SERP intent matches page intent.`;

  if (notes.some((n) => n.includes("SERP INTENT MISMATCH"))) {
    console.log("  already flagged"); return;
  }
  const updated = [flag, ...notes];
  const { error } = await a.from("tasks").update({ brief: { ...b, writer_notes: updated } }).eq("id", t.id);
  if (error) { console.error(error.message); return; }
  console.log("✅ SP2 flagged with intent-mismatch warning (added to top of writer_notes)");
}

main().catch((e) => { console.error(e); process.exit(1); });
