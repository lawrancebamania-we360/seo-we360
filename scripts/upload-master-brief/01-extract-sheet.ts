#!/usr/bin/env tsx
/**
 * Phase 1: Extract the final, reconciled task list from the updated XLSX.
 *
 * Source of truth for OWNERSHIP = Calendar (Daily) tab — the user updated this
 * after running v2 (moving some tasks Rahul→Lokesh). The per-owner queue tabs
 * may still reflect original ownership; we ignore them.
 *
 * Source of truth for TASK DETAILS (H1/H2/H3/FAQ/words/URL/etc.) =
 * All Deliverables tab.
 *
 * Output: scripts/upload-master-brief/sheet-tasks.json
 *   Only includes Lokesh / Ishika / Rahul deliverables (Freelancer-1 and
 *   Freelancer-2 tasks are dropped — per user direction).
 */
import ExcelJS from "exceljs";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const SRC = "C:/Users/HP/Downloads/Master Content Brief v2 (1).xlsx";
const OUT_DIR = path.resolve(process.cwd(), "scripts/upload-master-brief");
const OUT = path.join(OUT_DIR, "sheet-tasks.json");

type Owner = "Lokesh" | "Ishika" | "Rahul";
const KEEP_OWNERS: Owner[] = ["Lokesh", "Ishika", "Rahul"];

interface SheetTask {
  rowIdx: number;
  owner: string;
  ownerFromCalendar?: Owner;
  start: string;
  end: string;
  days: number;
  priority: string;
  type: "PAGE" | "BLOG" | string;
  format: string;
  words: number;
  url: string;
  hubKeyword: string;        // H1 hub keyword (primary target_keyword)
  volume: number;
  source: string;
  proposedH1: string;
  h2Sections: string[];
  h3Subsections: string[];
  faqQuestions: string[];
  bodyKeywords: string[];
  cluster: string;
  hubPageLink: string;
  isCalendarOnly?: boolean;  // True for tasks added in Calendar but not in All Deliverables
}

const cellVal = (cell: ExcelJS.Cell): string => {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "object" && v !== null) {
    if ("richText" in v) {
      return (v as { richText: Array<{ text: string }> }).richText.map((p) => p.text).join("");
    }
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if ("text" in v) return String((v as { text: string }).text);
    if ("result" in v) return String((v as { result: unknown }).result ?? "");
  }
  return String(v);
};

const splitMulti = (s: string): string[] => {
  if (!s) return [];
  // Items in these cells are typically separated by " | " or newlines or "•"
  // Normalize and filter empties / placeholder text.
  return s
    .split(/\s*\|\s*|\n+|\s*•\s*/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && !/^\(write/i.test(x) && !/^\(no /i.test(x));
};

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);

  // ----- Read All Deliverables -----
  const allWs = wb.getWorksheet("All Deliverables");
  if (!allWs) throw new Error("All Deliverables tab not found");

  const tasks: SheetTask[] = [];
  for (let r = 2; r <= allWs.actualRowCount; r++) {
    const row = allWs.getRow(r);
    const c = (n: number) => cellVal(row.getCell(n));
    const t: SheetTask = {
      rowIdx: r,
      owner: c(2),
      start: c(3),
      end: c(4),
      days: Number(c(5)) || 0,
      priority: c(6),
      type: c(7),
      format: c(8),
      words: Number(c(9)) || 0,
      url: c(10),
      hubKeyword: c(11),
      volume: Number(c(12)) || 0,
      source: c(13),
      proposedH1: c(14),
      h2Sections: splitMulti(c(15)),
      h3Subsections: splitMulti(c(16)),
      faqQuestions: splitMulti(c(17)),
      bodyKeywords: splitMulti(c(18)),
      cluster: c(19),
      hubPageLink: c(20),
    };
    if (t.hubKeyword) tasks.push(t);
  }

  console.log(`Read ${tasks.length} deliverables from All Deliverables`);

  // ----- Read Calendar tab → build {format · hubKeyword} → owner map -----
  // Each cell in owner columns is "format · hub-keyword" (or empty).
  const calWs = wb.getWorksheet("Calendar (Daily)");
  if (!calWs) throw new Error("Calendar (Daily) tab not found");

  // Headers: Date, Day, Lokesh, Ishika, Rahul (cols 1-5)
  const ownerColIdx: Record<Owner, number> = { Lokesh: 3, Ishika: 4, Rahul: 5 };
  const calendarOwnerMap: Map<string, Owner> = new Map();

  for (let r = 2; r <= calWs.actualRowCount; r++) {
    for (const owner of KEEP_OWNERS) {
      const cell = cellVal(calWs.getRow(r).getCell(ownerColIdx[owner]));
      if (!cell) continue;
      // Cell content can be a single "format · hub" or multiline if multiple
      // tasks fall on the same day for that owner. Parse each line.
      for (const line of cell.split(/\n+/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // Expected pattern: "<format> · <hub-keyword>"
        const m = trimmed.match(/^(.+?)\s*[·•]\s*(.+)$/);
        if (!m) continue;
        const format = m[1].trim().toLowerCase();
        const hub = m[2].trim().toLowerCase();
        const key = `${format}|${hub}`;
        // Last write wins — but typically each task should map to only one owner.
        const existing = calendarOwnerMap.get(key);
        if (existing && existing !== owner) {
          console.warn(`  ⚠️  Calendar conflict for ${key}: ${existing} → also ${owner} (keeping ${owner})`);
        }
        calendarOwnerMap.set(key, owner);
      }
    }
  }

  console.log(`Calendar maps ${calendarOwnerMap.size} unique tasks to owners`);

  // ----- Pick up Calendar-only tasks (free-form titles added by user) -----
  // These are entries that don't follow the "format · hub-keyword" pattern —
  // user typed bare titles directly into the Calendar.
  const calendarOnlyTasks: SheetTask[] = [];
  for (let r = 2; r <= calWs.actualRowCount; r++) {
    const date = cellVal(calWs.getRow(r).getCell(1));
    for (const owner of KEEP_OWNERS) {
      const cell = cellVal(calWs.getRow(r).getCell(ownerColIdx[owner]));
      if (!cell) continue;
      for (const line of cell.split(/\n+/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // If it doesn't match "format · hub-keyword" pattern, treat as a new title.
        if (!trimmed.match(/^(.+?)\s*[·•]\s*(.+)$/)) {
          calendarOnlyTasks.push({
            rowIdx: -1,
            owner,
            ownerFromCalendar: owner,
            start: date,
            end: date,
            days: 1,
            priority: "Medium",
            type: "BLOG",            // Default to blog_task; user can re-classify in dashboard
            format: "manual-entry",
            words: 0,
            url: "",
            hubKeyword: trimmed.toLowerCase(),
            volume: 0,
            source: "Calendar (user added)",
            proposedH1: trimmed,
            h2Sections: [],
            h3Subsections: [],
            faqQuestions: [],
            bodyKeywords: [],
            cluster: "User-added",
            hubPageLink: "",
            isCalendarOnly: true,
          });
        }
      }
    }
  }
  console.log(`Found ${calendarOnlyTasks.length} Calendar-only task(s) (free-form titles added by user)`);
  for (const t of calendarOnlyTasks) console.log(`  + ${t.start} ${t.owner}: ${t.proposedH1}`);

  // ----- Reconcile: stamp ownerFromCalendar onto each task -----
  let movedCount = 0;
  for (const t of tasks) {
    const key = `${t.format.toLowerCase()}|${t.hubKeyword.toLowerCase()}`;
    const calOwner = calendarOwnerMap.get(key);
    if (calOwner) {
      t.ownerFromCalendar = calOwner;
      if (calOwner !== t.owner) {
        movedCount++;
        console.log(`  📦 MOVED: ${t.format} · ${t.hubKeyword.slice(0, 60)} — Queue says ${t.owner}, Calendar says ${calOwner}`);
      }
    }
  }
  console.log(`\n${movedCount} task(s) moved between owners (Calendar overrides Queue)`);

  // ----- Filter to Lokesh/Ishika/Rahul only -----
  const finalOwner = (t: SheetTask): string => t.ownerFromCalendar ?? t.owner;
  const kept = tasks.filter((t) => KEEP_OWNERS.includes(finalOwner(t) as Owner));
  const dropped = tasks.length - kept.length;

  // Stamp final owner field for downstream simplicity
  for (const t of kept) t.owner = finalOwner(t);

  // Append calendar-only tasks
  kept.push(...calendarOnlyTasks);

  console.log(`\nKept ${kept.length} total = ${kept.length - calendarOnlyTasks.length} from All Deliverables + ${calendarOnlyTasks.length} Calendar-only — dropped ${dropped} freelancer-owned`);

  // ----- Final owner distribution -----
  const dist: Record<string, number> = {};
  for (const t of kept) dist[t.owner] = (dist[t.owner] ?? 0) + 1;
  console.log("\nFinal distribution after reconciliation:");
  for (const [o, n] of Object.entries(dist).sort()) console.log(`  ${o}: ${n}`);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify(kept, null, 2));
  console.log(`\nWrote ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
