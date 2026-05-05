#!/usr/bin/env tsx
/**
 * Inspect the updated Master Content Brief v2 XLSX — print sheet names,
 * row/col counts, headers, and a few sample rows per tab.
 */
import ExcelJS from "exceljs";

const SRC = "C:/Users/HP/Downloads/Master Content Brief v2 (1).xlsx";

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);
  console.log(`\nWorkbook: ${SRC}`);
  console.log(`Sheets: ${wb.worksheets.length}\n`);
  for (const ws of wb.worksheets) {
    console.log(`=== ${ws.name} (${ws.actualRowCount} rows × ${ws.actualColumnCount} cols) ===`);
    for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
      const row = ws.getRow(r);
      const vals: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value;
        const s = v == null ? "" : typeof v === "object" && v !== null && "richText" in v
          ? (v as { richText: Array<{ text: string }> }).richText.map((p) => p.text).join("")
          : String(v);
        vals.push(s.slice(0, 80));
      });
      console.log(`  R${r}: ${vals.slice(0, 8).join(" | ").slice(0, 320)}`);
    }
    console.log();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
