#!/usr/bin/env tsx
/**
 * Phase 11: Strip "Identifier: MCB-XXX" and "Sprint week: ..." lines from
 * brief.writer_notes on every blog_task. The user wants writer_notes to hold
 * actual writing guidance, not internal scheduling metadata.
 *
 * Usage:
 *   npx tsx scripts/upload-master-brief/11-clean-writer-notes.ts            # dry run
 *   npx tsx scripts/upload-master-brief/11-clean-writer-notes.ts --execute  # write
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);
const PROJECT_ID = "11111111-1111-4111-8111-000000000001";
const EXECUTE = process.argv.includes("--execute");

const isJunkLine = (s: string): boolean =>
  /^\s*(Identifier|Sprint week)\s*:/i.test(s);

interface Task {
  id: string;
  title: string;
  brief: { writer_notes?: string[]; [k: string]: unknown } | null;
}

async function main() {
  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}\n`);

  const { data: tasks } = await admin
    .from("tasks")
    .select("id, title, brief")
    .eq("project_id", PROJECT_ID)
    .eq("kind", "blog_task");

  const all = (tasks ?? []) as Task[];
  let touched = 0, examined = 0;

  for (const t of all) {
    examined++;
    const notes = (t.brief?.writer_notes as string[] | undefined) ?? [];
    const cleaned = notes.filter((n) => !isJunkLine(n));
    if (cleaned.length === notes.length) continue;
    touched++;

    console.log(`[${t.id.slice(0, 8)}] ${t.title.slice(0, 60)}`);
    for (const removed of notes.filter((n) => isJunkLine(n))) {
      console.log(`   - removed: "${removed}"`);
    }

    if (EXECUTE) {
      const newBrief = { ...(t.brief ?? {}), writer_notes: cleaned };
      const { error } = await admin.from("tasks").update({
        brief: newBrief,
        updated_at: new Date().toISOString(),
      }).eq("id", t.id);
      if (error) console.error(`   ✗ ${error.message}`);
    }
  }

  console.log(`\nExamined ${examined}, cleaned ${touched}.`);
  if (!EXECUTE) console.log(`(Dry run — re-run with --execute to apply)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
