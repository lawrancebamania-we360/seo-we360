#!/usr/bin/env tsx
/**
 * Phase 4 (helper): produce a compact human/LLM-readable summary of candidates.json
 * grouped into:
 *   - STRONG (top score >= 0.7) — auto-match, no judgment needed
 *   - AMBIGUOUS (0.3 <= top < 0.7) — needs LLM judgment
 *   - NO MATCH (< 0.3) — fresh insert
 *   - CALENDAR-ONLY — bare titles, search DB regardless of score
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve(process.cwd(), "scripts/upload-master-brief");

interface Bundle {
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
  candidates: Array<{
    dbTaskId: string;
    dbTitle: string;
    dbTargetKeyword: string | null;
    score: number;
    overlapTokens: string[];
  }>;
}

const bundles: Bundle[] = JSON.parse(readFileSync(path.join(DIR, "candidates.json"), "utf8"));

const lines: string[] = [];
const push = (s: string) => lines.push(s);

const sections = {
  strong: [] as Bundle[],
  ambiguous: [] as Bundle[],
  noMatch: [] as Bundle[],
  calendarOnly: [] as Bundle[],
};

for (const b of bundles) {
  if (b.sheetTask.isCalendarOnly) sections.calendarOnly.push(b);
  else {
    const top = b.candidates[0]?.score ?? 0;
    if (top >= 0.7) sections.strong.push(b);
    else if (top >= 0.3) sections.ambiguous.push(b);
    else sections.noMatch.push(b);
  }
}

const fmt = (b: Bundle) => {
  push(`\n[#${b.sheetIdx}] ${b.sheetTask.owner} | ${b.sheetTask.format} | "${b.sheetTask.proposedH1}"`);
  push(`     hub kw: ${b.sheetTask.hubKeyword}`);
  if (b.sheetTask.url) push(`     url: ${b.sheetTask.url}`);
  if (b.candidates.length === 0) {
    push(`     candidates: NONE (score < 0.05)`);
    return;
  }
  for (const c of b.candidates) {
    push(`     [${c.score.toFixed(2)}] ${c.dbTaskId.slice(0, 8)} → ${c.dbTitle.slice(0, 80)}`);
    if (c.dbTargetKeyword) push(`              target_kw: ${c.dbTargetKeyword.slice(0, 80)}`);
    push(`              overlap: ${c.overlapTokens.join(", ")}`);
  }
};

push(`========================================================`);
push(`STRONG (top score >= 0.70) — auto-match (${sections.strong.length})`);
push(`========================================================`);
for (const b of sections.strong) fmt(b);

push(`\n\n========================================================`);
push(`AMBIGUOUS (0.30 <= top < 0.70) — NEEDS LLM JUDGMENT (${sections.ambiguous.length})`);
push(`========================================================`);
for (const b of sections.ambiguous) fmt(b);

push(`\n\n========================================================`);
push(`NO MATCH (top < 0.30) — fresh insert (${sections.noMatch.length})`);
push(`========================================================`);
for (const b of sections.noMatch) fmt(b);

push(`\n\n========================================================`);
push(`CALENDAR-ONLY (user-added bare titles) — search DB regardless of score (${sections.calendarOnly.length})`);
push(`========================================================`);
for (const b of sections.calendarOnly) fmt(b);

writeFileSync(path.join(DIR, "candidates-summary.txt"), lines.join("\n"));
console.log(`Wrote candidates-summary.txt`);
console.log(`  STRONG: ${sections.strong.length}`);
console.log(`  AMBIGUOUS (LLM): ${sections.ambiguous.length}`);
console.log(`  NO MATCH: ${sections.noMatch.length}`);
console.log(`  CALENDAR-ONLY (LLM): ${sections.calendarOnly.length}`);
console.log(`\nTotal needing LLM judgment: ${sections.ambiguous.length + sections.calendarOnly.length}`);
