#!/usr/bin/env tsx
/**
 * Quick inspection of the user's Google Keyword Planner data export.
 * Prints sheet names + headers + sample rows + total row count per sheet.
 */
import ExcelJS from "exceljs";

const SRC = "C:/Users/HP/Downloads/New Keywords - 100K Plan.xlsx";

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);
  console.log(`\nWorkbook: ${SRC}`);
  console.log(`Sheets: ${wb.worksheets.length}\n`);
  for (const ws of wb.worksheets) {
    console.log(`=== ${ws.name} (${ws.actualRowCount} rows × ${ws.actualColumnCount} cols) ===`);
    // Show first 3 rows
    for (let r = 1; r <= Math.min(4, ws.rowCount); r++) {
      const row = ws.getRow(r);
      const vals: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value;
        const s = v == null ? "" : typeof v === "object" && "richText" in v
          ? (v as { richText: Array<{ text: string }> }).richText.map((p) => p.text).join("")
          : String(v);
        vals.push(s.slice(0, 50));
      });
      console.log(`  R${r}: ${vals.join(" | ").slice(0, 280)}`);
    }
    console.log();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
