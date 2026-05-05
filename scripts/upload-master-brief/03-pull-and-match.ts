#!/usr/bin/env tsx
/**
 * Phase 3+4: Pull existing blog_task rows from Supabase and build a candidate
 * match list for each sheet task.
 *
 * Output:
 *   scripts/upload-master-brief/db-tasks.json   — raw DB rows (snapshot)
 *   scripts/upload-master-brief/candidates.json — for each sheet task, top-5 DB
 *                                                 candidates ranked by Jaccard
 *                                                 similarity. The user (Claude)
 *                                                 will read this and write
 *                                                 decisions.json next.
 *
 * Matching signal:
 *   normalized-token Jaccard on (title + target_keyword + brief.recommended_h1)
 *   stop-word filtered, basic stemming. ~2-token overlap threshold to filter
 *   noise. Top-5 per sheet task.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

config({ path: ".env.local" });
const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase env"); process.exit(1);
}
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.trim());

const DIR = path.resolve(process.cwd(), "scripts/upload-master-brief");
const PROJECT_ID = "11111111-1111-4111-8111-000000000001";

interface SheetTask {
  rowIdx: number;
  owner: string;
  type: string;
  format: string;
  hubKeyword: string;
  proposedH1: string;
  url: string;
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
  brief: {
    recommended_h1?: string;
    recommended_h2s?: string[];
    recommended_h3s?: string[];
    paa_questions?: string[];
    secondary_keywords?: string[];
  } | null;
  word_count_target: number | null;
  competition: string | null;
  intent: string | null;
}

// ---- Tokenization ----------------------------------------------------------
const STOP = new Set([
  "the", "a", "an", "and", "or", "to", "for", "of", "in", "on", "at",
  "is", "are", "be", "with", "your", "you", "i", "we", "by", "from",
  "vs", "versus", "best", "top", "how", "what", "why", "guide", "tips",
  "tutorial", "2026", "2025",
]);

const tokenize = (s: string): Set<string> => {
  const tokens = (s || "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter((t) => t.length >= 3 && !STOP.has(t))
    // Light stemming: drop trailing 's' / 'es' / 'ing'
    .map((t) => t.replace(/(ies|es|ing|s)$/, (m) => (m === "ies" ? "y" : "")))
    .filter((t) => t.length >= 3);
  return new Set(tokens);
};

const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
};

interface Candidate {
  dbTaskId: string;
  dbTitle: string;
  dbTargetKeyword: string | null;
  dbScheduledDate: string | null;
  dbAssigneeId: string | null;
  score: number;
  overlapTokens: string[];
}

interface CandidateBundle {
  sheetIdx: number;
  sheetTask: {
    owner: string;
    type: string;
    format: string;
    hubKeyword: string;
    proposedH1: string;
    url: string;
    isCalendarOnly: boolean;
  };
  candidates: Candidate[];     // top-5 by score, descending
}

async function main() {
  // ---- Pull DB blog_tasks ----
  console.log("Pulling blog_task rows from Supabase...");
  const { data: dbTasks, error } = await admin
    .from("tasks")
    .select("id, title, target_keyword, url, team_member_id, scheduled_date, status, done, kind, brief, word_count_target, competition, intent")
    .eq("project_id", PROJECT_ID)
    .eq("kind", "blog_task")
    .order("scheduled_date", { ascending: true });
  if (error) { console.error(error); process.exit(1); }
  const dbList = (dbTasks ?? []) as unknown as DbTask[];
  console.log(`  Got ${dbList.length} blog_task row(s)`);

  writeFileSync(path.join(DIR, "db-tasks.json"), JSON.stringify(dbList, null, 2));

  // Distribution
  const dbByAssignee: Record<string, number> = {};
  let unassigned = 0;
  for (const t of dbList) {
    if (t.team_member_id) dbByAssignee[t.team_member_id] = (dbByAssignee[t.team_member_id] ?? 0) + 1;
    else unassigned++;
  }
  console.log(`  Unassigned: ${unassigned}, Assigned: ${dbList.length - unassigned} (across ${Object.keys(dbByAssignee).length} people)\n`);

  // ---- Read sheet tasks ----
  const sheetTasks: SheetTask[] = JSON.parse(readFileSync(path.join(DIR, "sheet-tasks.json"), "utf8"));
  console.log(`Read ${sheetTasks.length} sheet tasks\n`);

  // ---- Build candidates ----
  console.log("Building candidate matches...");
  const bundles: CandidateBundle[] = [];

  for (let i = 0; i < sheetTasks.length; i++) {
    const sheet = sheetTasks[i];
    const sheetText = `${sheet.proposedH1} ${sheet.hubKeyword}`;
    const sheetTokens = tokenize(sheetText);

    const scored: Candidate[] = [];
    for (const db of dbList) {
      const dbText = [
        db.title,
        db.target_keyword ?? "",
        db.brief?.recommended_h1 ?? "",
      ].join(" ");
      const dbTokens = tokenize(dbText);
      const score = jaccard(sheetTokens, dbTokens);
      if (score < 0.05) continue;     // throw away clear noise — speeds review later
      const overlap = [...sheetTokens].filter((t) => dbTokens.has(t)).slice(0, 8);
      scored.push({
        dbTaskId: db.id,
        dbTitle: db.title,
        dbTargetKeyword: db.target_keyword,
        dbScheduledDate: db.scheduled_date,
        dbAssigneeId: db.team_member_id,
        score: Number(score.toFixed(3)),
        overlapTokens: overlap,
      });
    }
    scored.sort((a, b) => b.score - a.score);
    bundles.push({
      sheetIdx: i,
      sheetTask: {
        owner: sheet.owner,
        type: sheet.type,
        format: sheet.format,
        hubKeyword: sheet.hubKeyword,
        proposedH1: sheet.proposedH1,
        url: sheet.url,
        isCalendarOnly: !!sheet.isCalendarOnly,
      },
      candidates: scored.slice(0, 5),
    });
  }

  writeFileSync(path.join(DIR, "candidates.json"), JSON.stringify(bundles, null, 2));
  console.log(`  Wrote candidates.json (${bundles.length} sheet tasks × up to 5 candidates each)\n`);

  // ---- Quick stats ----
  const strong = bundles.filter((b) => b.candidates[0]?.score >= 0.7).length;
  const ambiguous = bundles.filter((b) => {
    const s = b.candidates[0]?.score ?? 0;
    return s >= 0.3 && s < 0.7;
  }).length;
  const noMatch = bundles.filter((b) => (b.candidates[0]?.score ?? 0) < 0.3).length;
  console.log("=== Match stats ===");
  console.log(`  Strong (top score ≥ 0.70):  ${strong}`);
  console.log(`  Ambiguous (0.30–0.69):       ${ambiguous}`);
  console.log(`  No clear match (< 0.30):     ${noMatch}`);
  console.log(`\nNext step: review candidates.json and write decisions.json`);
}
main().catch((e) => { console.error(e); process.exit(1); });
