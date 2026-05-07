// Reproduce the in-component parser exactly so we can verify it on the sample.
// If this prints 3 valid rows, the front-end logic is fine and the issue is
// purely a UX click-discoverability problem (user not clicking "Use example").

interface Row { title: string; target_keyword: string; [k: string]: unknown }

function parseRows(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };
  const tabCount = (lines[0].match(/\t/g) ?? []).length;
  const commaCount = (lines[0].match(/,/g) ?? []).length;
  const sep = tabCount > commaCount ? "\t" : ",";
  const splitLine = (line: string): string[] => {
    if (sep === "\t") return line.split("\t");
    const out: string[] = [];
    let cur = ""; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = !inQuotes; }
      else if (c === "," && !inQuotes) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  return { headers: splitLine(lines[0]).map((h) => h.toLowerCase().trim()), rows: lines.slice(1).map(splitLine) };
}

function mapHeader(h: string): string | null {
  const n = h.toLowerCase().replace(/[\s_-]/g, "");
  if (["title", "task", "taskname", "name"].includes(n)) return "title";
  if (["h1", "h1keyword", "targetkeyword", "keyword", "primarykeyword"].includes(n)) return "target_keyword";
  if (["format", "type", "tasktype"].includes(n)) return "format";
  if (["priority"].includes(n)) return "priority";
  if (["date", "scheduleddate", "due", "duedate"].includes(n)) return "scheduled_date";
  if (["assignee", "assigneeemail", "owner", "email"].includes(n)) return "assignee_email";
  if (["wordcount", "words", "wordcounttarget"].includes(n)) return "word_count_target";
  if (["intent", "searchintent"].includes(n)) return "intent";
  if (["url", "slug", "page"].includes(n)) return "url";
  return null;
}

const sample = `title,h1_keyword,format,priority,date,assignee
Update existing blog: "remote work guide",remote work guide,update-blog,high,2026-05-12,lokesh.kumar@we360.ai
We360 vs Hubstaff,we360 vs hubstaff,vs-page,critical,2026-05-19,rahul.deswal@we360.ai
We360 Slack Integration,we360 slack integration,integration-page,medium,,ishika.takhtani@we360.ai`;

console.log("=== Parser test ===\n");
const { headers, rows } = parseRows(sample);
console.log("Headers:", headers);
console.log("Header → field mapping:", headers.map(mapHeader));
console.log("\nRows parsed:", rows.length);
rows.forEach((r, i) => {
  console.log(`  Row ${i + 1}: [${r.length} cells]`, r.slice(0, 3).map((c) => c.slice(0, 50)));
});

const headerMap = headers.map(mapHeader);
const titleIdx = headerMap.indexOf("title");
const kwIdx = headerMap.indexOf("target_keyword");
console.log(`\ntitleIdx: ${titleIdx} · target_keyword idx: ${kwIdx}`);

const out: Row[] = [];
const errs: string[] = [];
for (let i = 0; i < rows.length; i++) {
  const cells = rows[i];
  const row: Row = { title: "", target_keyword: "" };
  for (let c = 0; c < headerMap.length; c++) {
    const field = headerMap[c];
    const val = (cells[c] ?? "").trim();
    if (!field || !val) continue;
    row[field] = val;
  }
  if (!row.title || !row.target_keyword) {
    errs.push(`Row ${i + 2}: missing title or h1_keyword — skipped`);
    continue;
  }
  out.push(row);
}

console.log("\n=== Final ===");
console.log(`Valid rows: ${out.length}`);
console.log(`Errors: ${errs.length}`);
out.forEach((r, i) => {
  console.log(`\n  ${i + 1}. ${r.title}`);
  console.log(`     h1=${r.target_keyword}  fmt=${r.format}  pri=${r.priority}  date=${r.scheduled_date}  email=${r.assignee_email}`);
});
errs.forEach((e) => console.log(`  ⚠️  ${e}`));
