#!/usr/bin/env tsx
/**
 * Debug: print Calendar (Daily) tab contents + cross-check with All Deliverables.
 * Helps verify Rahul→Lokesh moves and find any Calendar entries that don't match
 * a deliverable row.
 */
import ExcelJS from "exceljs";

const SRC = "C:/Users/HP/Downloads/Master Content Brief v2 (1).xlsx";

const cellVal = (cell: ExcelJS.Cell): string => {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "object" && v !== null) {
    if ("richText" in v) return (v as { richText: Array<{ text: string }> }).richText.map((p) => p.text).join("");
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if ("text" in v) return String((v as { text: string }).text);
  }
  return String(v);
};

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);

  // All Deliverables: build map { format|hub → owner }
  const allWs = wb.getWorksheet("All Deliverables")!;
  const allDeliv: Map<string, { row: number; owner: string; type: string; hub: string }> = new Map();
  for (let r = 2; r <= allWs.actualRowCount; r++) {
    const row = allWs.getRow(r);
    const owner = cellVal(row.getCell(2));
    const type = cellVal(row.getCell(7));
    const format = cellVal(row.getCell(8));
    const hub = cellVal(row.getCell(11));
    if (!hub) continue;
    const key = `${format.toLowerCase()}|${hub.toLowerCase()}`;
    allDeliv.set(key, { row: r, owner, type, hub });
  }

  // Calendar: print every cell
  const calWs = wb.getWorksheet("Calendar (Daily)")!;
  const ownerColIdx: Record<string, number> = { Lokesh: 3, Ishika: 4, Rahul: 5 };

  console.log("=== Calendar entries vs All Deliverables ownership ===\n");
  let mismatchCount = 0;
  let unmatchedCount = 0;
  const seenInCalendar = new Set<string>();

  for (let r = 2; r <= calWs.actualRowCount; r++) {
    const date = cellVal(calWs.getRow(r).getCell(1));
    const day = cellVal(calWs.getRow(r).getCell(2));
    for (const [owner, colIdx] of Object.entries(ownerColIdx)) {
      const cell = cellVal(calWs.getRow(r).getCell(colIdx));
      if (!cell) continue;
      for (const line of cell.split(/\n+/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const m = trimmed.match(/^(.+?)\s*[·•]\s*(.+)$/);
        if (!m) {
          console.log(`  ❓ Unparseable cell: ${date} ${owner}: "${trimmed.slice(0, 80)}"`);
          continue;
        }
        const format = m[1].trim().toLowerCase();
        const hub = m[2].trim().toLowerCase();
        const key = `${format}|${hub}`;
        seenInCalendar.add(key);
        const orig = allDeliv.get(key);
        if (!orig) {
          console.log(`  ❌ Calendar entry NOT in All Deliverables: ${date} ${owner}: ${trimmed.slice(0, 80)}`);
          unmatchedCount++;
        } else if (orig.owner !== owner) {
          console.log(`  📦 MOVE: ${date} (${day}) — ${orig.type} ${trimmed.slice(0, 60)} | All-Deliv:${orig.owner} → Calendar:${owner}`);
          mismatchCount++;
        }
      }
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Calendar moves (different owner from All Deliverables): ${mismatchCount}`);
  console.log(`Calendar entries with no matching deliverable: ${unmatchedCount}`);

  // L/I/R deliverables NOT in Calendar
  console.log(`\n=== L/I/R deliverables NOT scheduled in Calendar ===`);
  let unscheduled = 0;
  for (const [key, info] of allDeliv) {
    if (!["Lokesh", "Ishika", "Rahul"].includes(info.owner)) continue;
    if (!seenInCalendar.has(key)) {
      console.log(`  ⏰ Row ${info.row}: ${info.owner} — ${key.replace("|", " · ")}`);
      unscheduled++;
    }
  }
  console.log(`Total unscheduled: ${unscheduled}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
