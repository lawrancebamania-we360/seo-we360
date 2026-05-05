#!/usr/bin/env tsx
/**
 * Phase 6: Verify the final DB state.
 *   - Total blog_task count
 *   - Per-owner distribution
 *   - MCB-XXX identifier sweep (every sheet task accounted for)
 *   - Tasks still unassigned
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!.trim());
const PROJECT_ID = "11111111-1111-4111-8111-000000000001";

async function main() {
  const { data: tasks, error } = await admin
    .from("tasks")
    .select("id, title, team_member_id, scheduled_date, kind")
    .eq("project_id", PROJECT_ID)
    .eq("kind", "blog_task");
  if (error) { console.error(error); process.exit(1); }

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, name, email")
    .in("email", ["lokesh.kumar@we360.ai", "ishika.takhtani@we360.ai", "rahul.deswal@we360.ai"]);
  const idToName: Record<string, string> = {};
  for (const p of profiles ?? []) idToName[p.id] = p.name;

  const all = tasks ?? [];
  console.log(`\nTotal blog_tasks in we360.ai project: ${all.length}\n`);

  // Owner distribution
  const byOwner: Record<string, number> = {};
  let unassigned = 0;
  for (const t of all) {
    if (t.team_member_id) {
      const name = idToName[t.team_member_id] ?? `unknown(${t.team_member_id.slice(0, 8)})`;
      byOwner[name] = (byOwner[name] ?? 0) + 1;
    } else unassigned++;
  }
  console.log("=== Owner distribution ===");
  for (const [name, n] of Object.entries(byOwner).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name.padEnd(8)}: ${n}`);
  }
  if (unassigned) console.log(`  unassigned: ${unassigned}`);

  // MCB identifier sweep
  const mcbTasks = all.filter((t) => /\[MCB-\d+\]/.test(t.title));
  const mcbIds = mcbTasks.map((t) => t.title.match(/\[MCB-(\d+)\]/)?.[1]).filter(Boolean);
  const mcbSet = new Set(mcbIds);
  console.log(`\n=== MCB identifiers ===`);
  console.log(`  Tasks with [MCB-XXX] tag: ${mcbTasks.length}`);
  console.log(`  Unique MCB IDs: ${mcbSet.size}`);
  console.log(`  Range: MCB-${[...mcbSet].sort()[0]} → MCB-${[...mcbSet].sort().at(-1)}`);

  // Missing MCB IDs (should be MCB-001 through MCB-038)
  const expected = Array.from({ length: 38 }, (_, i) => String(i + 1).padStart(3, "0"));
  const missing = expected.filter((id) => !mcbSet.has(id));
  if (missing.length) console.log(`  ⚠️  Missing MCB IDs: ${missing.join(", ")}`);
  else console.log(`  ✓ All MCB-001 through MCB-038 accounted for`);

  // Earliest / latest scheduled
  const dated = all.filter((t) => t.scheduled_date).sort((a, b) => (a.scheduled_date ?? "").localeCompare(b.scheduled_date ?? ""));
  if (dated.length) {
    console.log(`\n=== Schedule window ===`);
    console.log(`  Earliest: ${dated[0].scheduled_date}`);
    console.log(`  Latest:   ${dated.at(-1)!.scheduled_date}`);
    console.log(`  Tasks scheduled: ${dated.length} / ${all.length}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
