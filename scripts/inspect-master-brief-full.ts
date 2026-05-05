#!/usr/bin/env tsx
/**
 * Detailed inspection of the All Deliverables tab — full headers + owner distribution
 * + sample row showing every column.
 */
import ExcelJS from "exceljs";

const SRC = "C:/Users/HP/Downloads/Master Content Brief v2 (1).xlsx";

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);

  // All Deliverables tab — print every column header + first row
  const ws = wb.getWorksheet("All Deliverables");
  if (!ws) { console.error("All Deliverables tab missing"); return; }

  const cellVal = (cell: ExcelJS.Cell): string => {
    const v = cell.value;
    if (v == null) return "";
    if (typeof v === "object" && "richText" in v) {
      return (v as { richText: Array<{ text: string }> }).richText.map((p) => p.text).join("");
    }
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v);
  };

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (c) => headers.push(cellVal(c)));
  console.log("=== All Deliverables headers (20 cols) ===");
  headers.forEach((h, i) => console.log(`  col${i + 1}: ${h}`));
  console.log();

  // Print sample row 2 with every value
  const r2 = ws.getRow(2);
  console.log("=== Row 2 — full values ===");
  let i = 0;
  r2.eachCell({ includeEmpty: false }, (c) => {
    console.log(`  col${++i} [${headers[i - 1] ?? "?"}]: ${cellVal(c).slice(0, 200)}`);
  });
  console.log();

  // Owner distribution
  const ownerCount: Record<string, number> = {};
  const ownerByType: Record<string, Record<string, number>> = {};
  for (let r = 2; r <= ws.actualRowCount; r++) {
    const owner = cellVal(ws.getRow(r).getCell(2)) || "(blank)";
    const type = cellVal(ws.getRow(r).getCell(7)) || "(blank)";
    ownerCount[owner] = (ownerCount[owner] ?? 0) + 1;
    ownerByType[owner] = ownerByType[owner] ?? {};
    ownerByType[owner][type] = (ownerByType[owner][type] ?? 0) + 1;
  }
  console.log("=== Owner distribution ===");
  for (const [o, n] of Object.entries(ownerCount)) {
    console.log(`  ${o}: ${n}`);
    for (const [t, tn] of Object.entries(ownerByType[o] ?? {})) {
      console.log(`    - ${t}: ${tn}`);
    }
  }

  // Per-owner queue tab summaries
  console.log("\n=== Per-owner queue tab counts ===");
  for (const tab of ["Lokeshs Queue", "Ishikas Queue", "Rahuls Queue"]) {
    const t = wb.getWorksheet(tab);
    if (!t) continue;
    console.log(`  ${tab}: ${t.actualRowCount - 1} deliverables`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
