#!/usr/bin/env tsx
/**
 * Phase 5: Apply the decisions to Supabase.
 *
 * 1. UPDATE matched DB tasks: title, target_keyword, brief.recommended_h1/h2s/h3s/paa,
 *    word_count_target, team_member_id, scheduled_date.
 *    "Sheet wins when present, else keep DB" merge rule for h2/h3/faq fields.
 * 2. INSERT new tasks for sheet rows with action='new' (kind=blog_task per user).
 * 3. ROUTE remaining unassigned DB tasks (not matched, no team_member_id) per
 *    the routing rules — Ishika→integration, Rahul→industry/India/landing,
 *    else→Lokesh.
 *
 * Usage:
 *   npx tsx scripts/upload-master-brief/05-apply.ts                # dry run
 *   npx tsx scripts/upload-master-brief/05-apply.ts --execute      # write
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";

config({ path: ".env.local" });
const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase env"); process.exit(1);
}
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.trim());

const EXECUTE = process.argv.includes("--execute");
const DIR = path.resolve(process.cwd(), "scripts/upload-master-brief");
const PROJECT_ID = "11111111-1111-4111-8111-000000000001";

// ---------------------------------------------------------------- Types
interface SheetTask {
  rowIdx: number;
  owner: string;
  start: string;
  end: string;
  priority: string;
  type: string;
  format: string;
  words: number;
  url: string;
  hubKeyword: string;
  proposedH1: string;
  h2Sections: string[];
  h3Subsections: string[];
  faqQuestions: string[];
  bodyKeywords: string[];
  cluster: string;
  hubPageLink: string;
  isCalendarOnly?: boolean;
}

interface DbTask {
  id: string;
  title: string;
  target_keyword: string | null;
  url: string | null;
  team_member_id: string | null;
  scheduled_date: string | null;
  status: string;
  done: boolean;
  kind: string;
  brief: Record<string, unknown> | null;
  word_count_target: number | null;
  competition: string | null;
  intent: string | null;
}

interface Decision {
  sheetIdx: number;
  action: "match" | "new";
  dbTaskIdPrefix?: string;
  notes: string;
}

interface CandidateBundle {
  sheetIdx: number;
  candidates: Array<{ dbTaskId: string }>;
}

// ---------------------------------------------------------------- Routing
//
// Updated rules (per user direction):
//   - "Update existing ..." tasks (blog refresh, landing-page touch-up) → Lokesh.
//     These are maintenance / SEO-ops work and Lokesh leads that.
//   - Every other unmatched DB task → round-robin between Ishika and Rahul,
//     so net-new content work gets split evenly between them. Freelancers can
//     later take individual tasks via the [MCB-XXX] / existing identifier.
const isUpdateTask = (title: string): boolean => {
  const t = title.toLowerCase().trim();
  return /^update existing\b/.test(t) || /^clean up\b/.test(t);
};

// Map sheet "owner" name to routing for new inserts (sheet owner is authoritative).
const routeForSheetTask = (s: SheetTask): "Ishika" | "Rahul" | "Lokesh" => {
  if (s.owner === "Ishika" || s.owner === "Rahul" || s.owner === "Lokesh") return s.owner;
  return "Lokesh";
};

// Derive priority text → DB enum
const mapPriority = (p: string): string => {
  const norm = p.toLowerCase().trim();
  if (["critical", "high", "medium", "low"].includes(norm)) return norm;
  return "medium";
};

// Derive intent from format
const inferIntent = (format: string): string => {
  const f = format.toLowerCase();
  if (f.includes("vs") || f.includes("alternative") || f.includes("solution") || f.includes("integration")) return "commercial";
  if (f.includes("how-to") || f.includes("definitional") || f.includes("guide")) return "informational";
  if (f.includes("homepage") || f.includes("india") || f.includes("industry")) return "commercial";
  return "informational";
};

// ---------------------------------------------------------------- Main
async function main() {
  console.log(`Mode: ${EXECUTE ? "EXECUTE (will write to DB)" : "DRY RUN (no writes)"}\n`);

  // Load inputs
  const sheetTasks: SheetTask[] = JSON.parse(readFileSync(path.join(DIR, "sheet-tasks.json"), "utf8"));
  const decisions: { decisions: Decision[] } = JSON.parse(readFileSync(path.join(DIR, "decisions.json"), "utf8"));
  const dbTasks: DbTask[] = JSON.parse(readFileSync(path.join(DIR, "db-tasks.json"), "utf8"));
  const candidates: CandidateBundle[] = JSON.parse(readFileSync(path.join(DIR, "candidates.json"), "utf8"));

  console.log(`Sheet tasks: ${sheetTasks.length}`);
  console.log(`Decisions:   ${decisions.decisions.length}`);
  console.log(`DB tasks:    ${dbTasks.length}\n`);

  // Resolve dbTaskIdPrefix → full UUID via candidates
  const resolveDbId = (sheetIdx: number, prefix: string): string | null => {
    const bundle = candidates.find((b) => b.sheetIdx === sheetIdx);
    if (!bundle) return null;
    const c = bundle.candidates.find((c) => c.dbTaskId.startsWith(prefix));
    return c?.dbTaskId ?? null;
  };

  // Resolve owner names → profile IDs
  const ownerEmails: Record<string, string> = {
    Lokesh: "lokesh.kumar@we360.ai",
    Ishika: "ishika.takhtani@we360.ai",
    Rahul: "rahul.deswal@we360.ai",
  };
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, name, email")
    .in("email", Object.values(ownerEmails));
  const ownerIdMap: Record<string, string> = {};
  for (const [name, email] of Object.entries(ownerEmails)) {
    const p = profiles?.find((x) => x.email === email);
    if (!p) { console.error(`Missing profile for ${name} <${email}>`); process.exit(1); }
    ownerIdMap[name] = p.id;
  }
  console.log("Owner profile IDs:", ownerIdMap, "\n");

  // ============================================================
  // PHASE A — Apply decisions for the 38 sheet tasks
  // ============================================================
  // Each sheet task gets a stable identifier MCB-XXX (Master Content Brief +
  // sequential 3-digit). The user can use this to identify a task in the
  // dashboard and reassign it later (e.g. when freelancers join).
  let updates = 0, inserts = 0, skips = 0;
  const matchedDbIds = new Set<string>();
  const mcbId = (idx: number) => `MCB-${String(idx + 1).padStart(3, "0")}`;

  // Strip any existing [MCB-XXX] from a title so we don't double-tag on re-runs
  const stripMcb = (title: string) => title.replace(/\s*\[MCB-\d+\]\s*$/, "").trim();
  const tagWithMcb = (title: string, idx: number) => `${stripMcb(title)} [${mcbId(idx)}]`;

  console.log("=== PHASE A: applying sheet decisions ===\n");

  for (const dec of decisions.decisions) {
    const sheet = sheetTasks[dec.sheetIdx];
    if (!sheet) { console.warn(`  Skip — no sheet task at idx ${dec.sheetIdx}`); skips++; continue; }
    const ownerId = ownerIdMap[sheet.owner];
    if (!ownerId) { console.warn(`  Skip — unknown owner "${sheet.owner}"`); skips++; continue; }

    if (dec.action === "match") {
      const dbId = dec.dbTaskIdPrefix ? resolveDbId(dec.sheetIdx, dec.dbTaskIdPrefix) : null;
      if (!dbId) { console.warn(`  ⚠️  #${dec.sheetIdx} match prefix '${dec.dbTaskIdPrefix}' not found in candidates — falling back to insert`); }
      const dbTask = dbId ? dbTasks.find((d) => d.id === dbId) : null;
      if (!dbTask) {
        // Fall back to insert
        await doInsert(sheet, ownerId);
        inserts++;
        continue;
      }

      // Build merged brief — sheet wins when present, else keep DB
      const existingBrief = (dbTask.brief ?? {}) as Record<string, unknown>;
      const mergedBrief: Record<string, unknown> = {
        ...existingBrief,
        recommended_h1: sheet.proposedH1 || (existingBrief.recommended_h1 as string) || sheet.hubKeyword,
        recommended_h2s: sheet.h2Sections.length ? sheet.h2Sections : (existingBrief.recommended_h2s ?? []),
        recommended_h3s: sheet.h3Subsections.length ? sheet.h3Subsections : (existingBrief.recommended_h3s ?? []),
        paa_questions:   sheet.faqQuestions.length ? sheet.faqQuestions : (existingBrief.paa_questions ?? []),
        secondary_keywords: sheet.bodyKeywords.length ? sheet.bodyKeywords : (existingBrief.secondary_keywords ?? []),
        word_count_target: sheet.words || (existingBrief.word_count_target as number) || 1500,
        generated_by: "manual",
      };

      const newTitle = tagWithMcb(sheet.proposedH1 || dbTask.title, dec.sheetIdx);
      const update = {
        title: newTitle,
        target_keyword: sheet.hubKeyword || dbTask.target_keyword,
        url: sheet.url || dbTask.url,
        team_member_id: ownerId,
        scheduled_date: sheet.start || dbTask.scheduled_date,
        priority: mapPriority(sheet.priority),
        word_count_target: sheet.words || dbTask.word_count_target,
        intent: dbTask.intent ?? inferIntent(sheet.format),
        brief: mergedBrief,
        updated_at: new Date().toISOString(),
      };

      console.log(`  ✏️  UPDATE [${dbId.slice(0, 8)}] ${dbTask.title.slice(0, 60)}`);
      console.log(`         → [${mcbId(dec.sheetIdx)}] ${sheet.owner} | ${sheet.proposedH1.slice(0, 60)} | ${sheet.start}`);
      if (EXECUTE) {
        const { error } = await admin.from("tasks").update(update).eq("id", dbId);
        if (error) console.error(`         ✗ ${error.message}`);
      }
      matchedDbIds.add(dbId);
      updates++;
    } else if (dec.action === "new") {
      await doInsert(sheet, ownerId, dec.sheetIdx);
      inserts++;
    }
  }

  async function doInsert(sheet: SheetTask, ownerId: string, sheetIdx: number) {
    const baseTitle = sheet.proposedH1 || sheet.hubKeyword;
    const insert = {
      project_id: PROJECT_ID,
      kind: "blog_task",
      title: tagWithMcb(baseTitle, sheetIdx),
      target_keyword: sheet.hubKeyword,
      url: sheet.url || null,
      team_member_id: ownerId,
      scheduled_date: sheet.start || null,
      priority: mapPriority(sheet.priority),
      status: "todo",
      word_count_target: sheet.words || 1500,
      competition: null,
      intent: inferIntent(sheet.format),
      pillar: null,
      source: "manual",
      brief: {
        recommended_h1: baseTitle,
        recommended_h2s: sheet.h2Sections,
        recommended_h3s: sheet.h3Subsections,
        paa_questions: sheet.faqQuestions,
        secondary_keywords: sheet.bodyKeywords,
        word_count_target: sheet.words || 1500,
        target_keyword: sheet.hubKeyword,
        title: baseTitle,
        intent: inferIntent(sheet.format),
        sections_breakdown: [],
        internal_links: sheet.hubPageLink ? [sheet.hubPageLink] : [],
        competitor_refs: [],
        writer_notes: sheet.cluster ? [`Cluster: ${sheet.cluster}`] : [],
        generated_by: "manual",
      },
    };
    const owner = Object.entries(ownerIdMap).find(([, id]) => id === ownerId)?.[0] ?? "?";
    console.log(`  ➕ INSERT [${mcbId(sheetIdx)}] [${owner}] ${baseTitle.slice(0, 55)} | ${sheet.format} | ${sheet.start}`);
    if (EXECUTE) {
      const { error } = await admin.from("tasks").insert(insert);
      if (error) console.error(`         ✗ ${error.message}`);
    }
  }

  // ============================================================
  // PHASE B — Route unmatched DB tasks (currently unassigned) to team
  // ============================================================
  // Routing rules (per user direction):
  //   - "Update existing ..." or "Clean up ..." tasks → Lokesh (maintenance/SEO ops)
  //   - Everything else → round-robin between Ishika and Rahul (split evenly)
  //
  // Existing DB tasks all already carry their own identifier in the title (e.g.
  // [B1.4a], [K1.2], [B-VS.we360-vs-X]) so we don't need to add MCB-XXX here.
  console.log("\n=== PHASE B: routing unmatched DB tasks ===\n");
  let routed = 0;
  const routeBucket: Record<string, number> = { Lokesh: 0, Ishika: 0, Rahul: 0 };
  let ishikaTurn = true;     // start with Ishika so she catches up vs Lokesh
  // Pull unmatched, unassigned tasks first so we can sort them — gives a stable
  // round-robin (otherwise output is whatever order the array is in).
  const toRoute = dbTasks
    .filter((t) => !matchedDbIds.has(t.id) && !t.team_member_id)
    .sort((a, b) => a.title.localeCompare(b.title));

  for (const t of toRoute) {
    let owner: "Lokesh" | "Ishika" | "Rahul";
    if (isUpdateTask(t.title)) {
      owner = "Lokesh";
    } else {
      owner = ishikaTurn ? "Ishika" : "Rahul";
      ishikaTurn = !ishikaTurn;
    }
    routeBucket[owner]++;
    console.log(`  → ${owner.padEnd(8)}: ${t.title.slice(0, 80)}`);
    if (EXECUTE) {
      const { error } = await admin.from("tasks")
        .update({ team_member_id: ownerIdMap[owner], updated_at: new Date().toISOString() })
        .eq("id", t.id);
      if (error) console.error(`         ✗ ${error.message}`);
    }
    routed++;
  }

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log(`\n=== SUMMARY ===`);
  console.log(`Sheet decisions:`);
  console.log(`  ✏️  Updates: ${updates}`);
  console.log(`  ➕ Inserts: ${inserts}`);
  console.log(`  ⚠️  Skips:   ${skips}`);
  console.log(`Routed unassigned DB tasks: ${routed}`);
  console.log(`  Lokesh: ${routeBucket.Lokesh}`);
  console.log(`  Ishika: ${routeBucket.Ishika}`);
  console.log(`  Rahul:  ${routeBucket.Rahul}`);
  if (!EXECUTE) console.log(`\n(Dry run — re-run with --execute to apply)\n`);
  else console.log(`\n✅ Done.\n`);
}
main().catch((e) => { console.error(e); process.exit(1); });
