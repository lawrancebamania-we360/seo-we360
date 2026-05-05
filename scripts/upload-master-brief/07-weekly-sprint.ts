#!/usr/bin/env tsx
/**
 * Phase 7: Reschedule all 120 blog_tasks into weekly sprints, starting from
 * tomorrow onwards, with each task's scheduled_date set to the Monday of the
 * week it belongs to.
 *
 * Today is 2026-05-05 (Tue), tomorrow is 2026-05-06 (Wed). The first sprint
 * Monday on-or-after tomorrow is 2026-05-11. Week 1 = 2026-05-11, Week 2 =
 * 2026-05-18, ...
 *
 * Per-owner cadence: 3 tasks per week (configurable via TASKS_PER_WEEK).
 * Tasks within an owner's queue are assigned to weeks in their current
 * scheduled_date order — critical/early-scheduled work lands in early weeks,
 * later work pushes to later weeks. Order is preserved.
 *
 * Usage:
 *   npx tsx scripts/upload-master-brief/07-weekly-sprint.ts            # dry run
 *   npx tsx scripts/upload-master-brief/07-weekly-sprint.ts --execute  # write
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
// Capacity bump: monthly target is 60 blogs + 20 pages = 80 deliverables.
// 5 tasks/wk × 3 people × 4 weeks = 60 tasks/month — meets the 60-blog target
// in May and finishes the full 120 by early July. Bump if team has headroom.
const TASKS_PER_WEEK = 5;

// "Today" comes from CLAUDE.md context — Tuesday 2026-05-05. Tomorrow = May 6.
// Per user direction: work starts tomorrow. Week 1 scheduled_date = tomorrow
// (Wed May 6); from Week 2 onwards we snap to Mondays so the rest of the
// schedule aligns to calendar weeks.
const today = new Date("2026-05-05T00:00:00Z");
const tomorrow = new Date(today); tomorrow.setUTCDate(today.getUTCDate() + 1);
function nextMondayAfter(d: Date): Date {
  const dow = d.getUTCDay();           // 0=Sun, 1=Mon, ... 6=Sat
  const daysToAdd = dow === 0 ? 1 : (dow === 1 ? 7 : 8 - dow);
  const m = new Date(d); m.setUTCDate(d.getUTCDate() + daysToAdd);
  return m;
}
const sprintWeek1 = tomorrow;                          // May 6 (Wed)
const sprintWeek2 = nextMondayAfter(tomorrow);         // May 11 (Mon)
const iso = (d: Date) => d.toISOString().slice(0, 10);

const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

interface Task {
  id: string;
  title: string;
  team_member_id: string | null;
  scheduled_date: string | null;
  priority: string | null;
  brief: { writer_notes?: string[]; [k: string]: unknown } | null;
}

async function main() {
  console.log(`Mode: ${EXECUTE ? "EXECUTE (will write)" : "DRY RUN"}`);
  console.log(`Today:    ${iso(today)} (Tue)`);
  console.log(`Tomorrow: ${iso(tomorrow)} (Wed)`);
  console.log(`Sprint Week 1: ${iso(sprintWeek1)} (Wed) — partial first week, work starts tomorrow`);
  console.log(`Sprint Week 2: ${iso(sprintWeek2)} (Mon) — subsequent weeks Monday-aligned`);
  console.log(`Cadence: ${TASKS_PER_WEEK} task(s) per person per week\n`);

  const { data: tasks, error } = await admin
    .from("tasks")
    .select("id, title, team_member_id, scheduled_date, priority, brief")
    .eq("project_id", PROJECT_ID)
    .eq("kind", "blog_task");
  if (error) { console.error(error); process.exit(1); }

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, name, email")
    .in("email", ["lokesh.kumar@we360.ai", "ishika.takhtani@we360.ai", "rahul.deswal@we360.ai"]);
  const idToName: Record<string, string> = {};
  for (const p of profiles ?? []) idToName[p.id] = p.name;

  // Group by owner
  const byOwner: Record<string, Task[]> = { Lokesh: [], Ishika: [], Rahul: [] };
  let unassigned = 0;
  for (const t of (tasks as unknown as Task[]) ?? []) {
    const name = t.team_member_id ? idToName[t.team_member_id] : null;
    if (name && byOwner[name]) byOwner[name].push(t);
    else unassigned++;
  }
  if (unassigned) console.warn(`⚠️  ${unassigned} unassigned task(s) skipped`);

  // Sort each owner's queue: priority first, then current scheduled_date, then title.
  const sortQueue = (a: Task, b: Task) => {
    const pa = PRIORITY_RANK[a.priority ?? "medium"] ?? 2;
    const pb = PRIORITY_RANK[b.priority ?? "medium"] ?? 2;
    if (pa !== pb) return pa - pb;
    const da = a.scheduled_date ?? "9999-12-31";
    const db = b.scheduled_date ?? "9999-12-31";
    if (da !== db) return da.localeCompare(db);
    return a.title.localeCompare(b.title);
  };

  // Build the redistribution plan
  type Plan = { task: Task; owner: string; weekIdx: number; weekDate: string };
  const plan: Plan[] = [];
  // Week 1 = sprintWeek1 (Wed May 6, partial week). Week 2+ = sprintWeek2,
  // sprintWeek2+7d, sprintWeek2+14d, ... (Mondays).
  const dateForWeek = (weekIdx: number): string => {
    if (weekIdx === 0) return iso(sprintWeek1);
    const d = new Date(sprintWeek2); d.setUTCDate(sprintWeek2.getUTCDate() + (weekIdx - 1) * 7);
    return iso(d);
  };

  for (const [owner, queue] of Object.entries(byOwner)) {
    queue.sort(sortQueue);
    queue.forEach((task, i) => {
      const weekIdx = Math.floor(i / TASKS_PER_WEEK);
      plan.push({ task, owner, weekIdx, weekDate: dateForWeek(weekIdx) });
    });
  }

  // Print the plan, week by week
  const byWeek: Record<string, Plan[]> = {};
  for (const p of plan) (byWeek[p.weekDate] ??= []).push(p);
  const weekDates = Object.keys(byWeek).sort();

  console.log(`\n=== Distribution plan (${plan.length} tasks across ${weekDates.length} weeks) ===\n`);
  for (const wd of weekDates) {
    const weekIdx = byWeek[wd][0].weekIdx + 1;
    const counts = { Lokesh: 0, Ishika: 0, Rahul: 0 } as Record<string, number>;
    for (const p of byWeek[wd]) counts[p.owner]++;
    console.log(`Week ${weekIdx} — Mon ${wd}: ${byWeek[wd].length} task(s) (Lokesh ${counts.Lokesh}, Ishika ${counts.Ishika}, Rahul ${counts.Rahul})`);
  }

  // Per-owner summary
  console.log(`\n=== Per-owner span ===`);
  for (const owner of ["Lokesh", "Ishika", "Rahul"]) {
    const ownerPlans = plan.filter((p) => p.owner === owner);
    if (!ownerPlans.length) continue;
    const first = ownerPlans[0].weekDate;
    const last = ownerPlans.at(-1)!.weekDate;
    const weeks = ownerPlans.at(-1)!.weekIdx + 1;
    console.log(`  ${owner}: ${ownerPlans.length} tasks across ${weeks} weeks (${first} → ${last})`);
  }

  if (!EXECUTE) {
    console.log(`\n(Dry run — re-run with --execute to write)`);
    return;
  }

  // Apply the updates — only scheduled_date changes; writer_notes stays clean.
  console.log(`\n=== Applying ===`);
  let updated = 0, errors = 0;
  for (const p of plan) {
    const { error } = await admin.from("tasks").update({
      scheduled_date: p.weekDate,
      updated_at: new Date().toISOString(),
    }).eq("id", p.task.id);

    if (error) { errors++; console.error(`  ✗ ${p.task.id.slice(0, 8)}: ${error.message}`); }
    else updated++;
  }
  console.log(`\n✓ Updated ${updated} task(s)${errors ? ` — ${errors} error(s)` : ""}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
