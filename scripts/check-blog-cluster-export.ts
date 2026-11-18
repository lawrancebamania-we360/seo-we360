// Checks the Blog Clusters export building blocks with no DB: the pure row
// mapping (lib/blog-clusters/export-rows) and the minimal .xlsx writer
// (lib/xlsx/workbook) - column counts, round-trip layout, sheet-name rules, and
// that the produced workbook is a well-formed zip with the expected parts.
//
// Usage: npx tsx scripts/check-blog-cluster-export.ts

import AdmZip from "adm-zip";
import {
  DETAIL_COLUMNS, OVERVIEW_COLUMNS, MAX_SUPPORTING, detailRow, overviewRow, type ExportItem,
} from "@/lib/blog-clusters/export-rows";
import { buildXlsx, columnLetter, sanitizeSheetName, uniqueSheetNames } from "@/lib/xlsx/workbook";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  ok  ${name}`);
  else { failures++; console.error(`  FAIL ${name}${detail ? ` - ${detail}` : ""}`); }
}

const item: ExportItem = {
  title: "What Is Workforce Analytics Software?",
  category: "Foundation",
  funnelStage: "TOFU",
  contentType: "Pillar page",
  targetKeyword: "workforce analytics software",
  volMo: 1400,
  serpVerdict: "CROWDED — no we360 in top 15",
  supportingKeywords: [
    { keyword: "what is workforce analytics?", volume: 3600 },
    { keyword: "workforce analytics", volume: 2000 },
    { keyword: "workforce analytics platform", volume: 350 },
  ],
  outline: ["What Is Workforce Analytics", "Benefits"],
  faqCandidates: ["What is the best workforce management software?"],
  interlinksTo: ["we360.ai/blog/a", "we360.ai/blog/b", "we360.ai/pricing/"],
  interlinksFrom: ["we360.ai/", "we360.ai/blog/a"],
  metaDescription: "Workforce analytics explained without the jargon.",
  urlSlug: "we360.ai/solutions/workforce-analytics/",
  primaryCta: "Subscribe / soft demo CTA",
};

// --- row mapping ---------------------------------------------------------
{
  check("DETAIL_COLUMNS length is 8 + 15*2 + 9", DETAIL_COLUMNS.length === 8 + MAX_SUPPORTING * 2 + 9, String(DETAIL_COLUMNS.length));
  const row = detailRow("Workforce Analytics", item);
  check("detailRow length == DETAIL_COLUMNS", row.length === DETAIL_COLUMNS.length, `${row.length} vs ${DETAIL_COLUMNS.length}`);
  const at = (col: string) => row[DETAIL_COLUMNS.indexOf(col)];
  check("Content Title mapped", at("Content Title") === item.title, String(at("Content Title")));
  check("Blog Category = cluster name", at("Blog Category") === "Workforce Analytics", String(at("Blog Category")));
  check("Primary Keyword mapped", at("Primary Keyword") === item.targetKeyword);
  check("Vol/mo is a number", at("Vol/mo") === 1400);
  check("Supporting Keyword 1", at("Supporting Keyword 1") === "what is workforce analytics?");
  check("Volume 1", at("Volume 1") === 3600);
  check("Supporting Keyword 4 blank (only 3 given)", at("Supporting Keyword 4") === null, String(at("Supporting Keyword 4")));
  check("Volume 15 blank", at("Volume 15") === null);
  check("H2 Candidates semicolon-joined", at("H2 Candidates") === "What Is Workforce Analytics; Benefits", String(at("H2 Candidates")));
  check("Interlinks To Count derived", at("Interlinks To Count") === 3, String(at("Interlinks To Count")));
  check("Interlinks From Count derived", at("Interlinks From Count") === 2, String(at("Interlinks From Count")));
  check("URL Slug mapped", at("URL Slug") === item.urlSlug);
  check("Primary CTA mapped", at("Primary CTA") === item.primaryCta);

  const ov = overviewRow("Workforce Analytics", item);
  check("overviewRow length == OVERVIEW_COLUMNS", ov.length === OVERVIEW_COLUMNS.length);
  check("overview # Supporting KWs", ov[OVERVIEW_COLUMNS.indexOf("# Supporting KWs")] === 3);
}

// --- sheet-name helpers --------------------------------------------------
{
  check("columnLetter 0/25/26/27", columnLetter(0) === "A" && columnLetter(25) === "Z" && columnLetter(26) === "AA" && columnLetter(27) === "AB");
  check("sanitize strips illegal chars", sanitizeSheetName("A/B:C[D]") === "A B C D", sanitizeSheetName("A/B:C[D]"));
  check("sanitize truncates to 31", sanitizeSheetName("x".repeat(40)).length === 31);
  const uniq = uniqueSheetNames(["Sales", "Sales", "Sales"]);
  check("uniqueSheetNames de-dupes", uniq[0] === "Sales" && uniq[1] === "Sales 2" && uniq[2] === "Sales 3", uniq.join("|"));
}

// --- xlsx structure ------------------------------------------------------
{
  const buf = buildXlsx([
    { name: "All", columns: OVERVIEW_COLUMNS, rows: [overviewRow("Workforce Analytics", item)] },
    { name: "Workforce Analytics", columns: DETAIL_COLUMNS, rows: [detailRow("Workforce Analytics", item)] },
  ]);
  check("buildXlsx returns a non-trivial Buffer", Buffer.isBuffer(buf) && buf.length > 500, `${buf.length} bytes`);

  const zip = new AdmZip(buf);
  const names = zip.getEntries().map((e) => e.entryName).sort();
  for (const part of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]) {
    check(`zip has ${part}`, names.includes(part), names.join(", "));
  }
  const workbook = zip.readAsText("xl/workbook.xml");
  check("workbook lists both tabs", workbook.includes('name="All"') && workbook.includes('name="Workforce Analytics"'));
  const sheet2 = zip.readAsText("xl/worksheets/sheet2.xml");
  check("detail sheet holds a value", sheet2.includes("workforce analytics software"));
  check("detail sheet has a numeric cell", /<v>1400<\/v>/.test(sheet2));
  check("every part is XML-declared", ["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"].every((p) => zip.readAsText(p).startsWith("<?xml")));

  // XML escaping of a nasty value.
  const esc = buildXlsx([{ name: "T", columns: ["A"], rows: [["x & y < z > \"q\""]] }]);
  const s1 = new AdmZip(esc).readAsText("xl/worksheets/sheet1.xml");
  check("values are XML-escaped", s1.includes("x &amp; y &lt; z &gt; &quot;q&quot;"), s1);
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
