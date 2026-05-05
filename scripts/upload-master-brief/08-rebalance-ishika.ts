#!/usr/bin/env tsx
/**
 * Phase 7a: Rebalance — move all vs/alt pages off Ishika's plate. Distribute
 * between Rahul and Lokesh. Hard cap Rahul at 50 tasks total; once he's full,
 * remaining go to Lokesh.
 *
 * Pattern-match vs/alt task titles:
 *   - "Build new comparison page: ..." / "Write vs-competitor page: ..."
 *   - "Build new alternative page: ..." / "Write alternative-to page: ..."
 *   - Anything tagged [B-VS.*] or [B-ALT.*]
 *
 * MCB-tagged sheet tasks aren't moved (sheet ownership is authoritative).
 *
 * Usage:
 *   npx tsx scripts/upload-master-brief/08-rebalance-ishika.ts            # dry run
 *   npx tsx scripts/upload-master-brief/08-rebalance-ishika.ts --execute  # write
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
const RAHUL_CAP = 50;

const isVsAlt = (title: string): boolean => {
  const t = title.toLowerCase();
  return (
    /^build new comparison page:/.test(t) ||
    /^write vs-competitor page:/.test(t) ||
    /^build new alternative page:/.test(t) ||
    /^write alternative-to page:/.test(t) ||
    /\[b-vs\./.test(t) ||
    /\[b-alt\./.test(t)
  );
};

interface Task { id: string; title: string; team_member_id: string | null; }

async function main() {
  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}\n`);

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, name, email")
    .in("email", ["lokesh.kumar@we360.ai", "ishika.takhtani@we360.ai", "rahul.deswal@we360.ai"]);
  const ownerIdMap: Record<string, string> = {};
  const idToName: Record<string, string> = {};
  for (const p of profiles ?? []) {
    if (p.email === "lokesh.kumar@we360.ai") ownerIdMap.Lokesh = p.id;
    if (p.email === "ishika.takhtani@we360.ai") ownerIdMap.Ishika = p.id;
    if (p.email === "rahul.deswal@we360.ai") ownerIdMap.Rahul = p.id;
    idToName[p.id] = p.name;
  }

  const { data: tasks } = await admin
    .from("tasks")
    .select("id, title, team_member_id")
    .eq("project_id", PROJECT_ID)
    .eq("kind", "blog_task");

  const all = (tasks ?? []) as Task[];

  // Current totals per owner
  const currentCount: Record<string, number> = { Lokesh: 0, Ishika: 0, Rahul: 0 };
  for (const t of all) {
    const name = t.team_member_id ? idToName[t.team_member_id] : null;
    if (name && currentCount[name] !== undefined) currentCount[name]++;
  }
  console.log(`Current totals — Lokesh: ${currentCount.Lokesh}, Ishika: ${currentCount.Ishika}, Rahul: ${currentCount.Rahul}\n`);

  // Find Ishika's vs/alt tasks
  const ishikaVsAlt = all.filter((t) =>
    t.team_member_id === ownerIdMap.Ishika && isVsAlt(t.title)
  );
  console.log(`Ishika's vs/alt tasks to move: ${ishikaVsAlt.length}\n`);

  if (ishikaVsAlt.length === 0) {
    console.log("Nothing to move. Done.");
    return;
  }

  // Sort alphabetically for deterministic distribution
  ishikaVsAlt.sort((a, b) => a.title.localeCompare(b.title));

  // Distribute: round-robin Rahul/Lokesh, but Rahul caps at RAHUL_CAP
  let rahulRunning = currentCount.Rahul;
  let toRahul = true;
  const moves: Array<{ task: Task; newOwner: "Rahul" | "Lokesh" }> = [];
  for (const t of ishikaVsAlt) {
    let target: "Rahul" | "Lokesh";
    if (toRahul && rahulRunning < RAHUL_CAP) {
      target = "Rahul";
      rahulRunning++;
    } else if (toRahul && rahulRunning >= RAHUL_CAP) {
      // Rahul is at cap — push everything left to Lokesh
      target = "Lokesh";
    } else {
      target = "Lokesh";
    }
    moves.push({ task: t, newOwner: target });
    toRahul = !toRahul;
  }

  // Print plan
  let pRahul = 0, pLokesh = 0;
  for (const m of moves) {
    const tag = m.newOwner === "Rahul" ? "→ Rahul " : "→ Lokesh";
    console.log(`  ${tag}: ${m.task.title.slice(0, 80)}`);
    if (m.newOwner === "Rahul") pRahul++; else pLokesh++;
  }
  console.log(`\nMoves: Rahul +${pRahul}, Lokesh +${pLokesh}`);
  console.log(`After move — Lokesh: ${currentCount.Lokesh + pLokesh}, Ishika: ${currentCount.Ishika - moves.length}, Rahul: ${currentCount.Rahul + pRahul}`);
  console.log(`(Rahul cap = ${RAHUL_CAP})`);

  if (!EXECUTE) { console.log(`\n(Dry run — re-run with --execute to write)`); return; }

  // Apply
  let updated = 0, errors = 0;
  for (const m of moves) {
    const { error } = await admin.from("tasks")
      .update({ team_member_id: ownerIdMap[m.newOwner], updated_at: new Date().toISOString() })
      .eq("id", m.task.id);
    if (error) { errors++; console.error(`  ✗ ${m.task.id.slice(0, 8)}: ${error.message}`); }
    else updated++;
  }
  console.log(`\n✓ Updated ${updated} task(s)${errors ? ` — ${errors} error(s)` : ""}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
