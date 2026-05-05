#!/usr/bin/env tsx
// Load authoritative keywords from the We360_GSC_Baseline.xlsx into the
// `keywords` table. Replaces the 6 fake Apify-templated rows that snuck in
// during the first kickoff run.
//
// Sources used:
//   Sheet 4  — Striking distance (57 rows, pos 11-20, ≥100 impr)
//   Sheet 5  — Zero-click high-impression (566 rows)
//   Sheet 6  — Alternative + VS queries (42 rows)
//   Sheet 14 — Tier C target queries (150 rows, plan's rank-track list)
//
// Usage:
//   npx tsx scripts/import-gsc-keywords.ts [path-to-xlsx]
// Default: C:/Users/HP/Downloads/We360_GSC_Baseline.xlsx

import AdmZip from "adm-zip";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env"); process.exit(1);
}
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.trim());
const PROJECT_ID = "11111111-1111-4111-8111-000000000001";

// Parse an XLSX sheet with inlineStr cells into rows indexed by column letter.
// XLSX cells look like: <c r="B4" t="inlineStr"><is><t>...</t></is></c> (text)
// or: <c r="C4" t="n"><v>123</v></c> (number, t attr can also be absent).
// Columns are sparse — a row may skip columns — so we return arrays aligned to
// column letter (A=0, B=1, C=2, …) for stable indexing.
function colLetterToIndex(letter: string): number {
  let n = 0;
  for (const c of letter.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}
function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#8212;/g, "—")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}
function parseSheet(xml: string): Array<Array<string | number | null>> {
  const rows: Array<Array<string | number | null>> = [];
  const rowRe = /<row[^>]*>([\s\S]*?)<\/row>/g;
  for (const rowMatch of xml.matchAll(rowRe)) {
    const row: Array<string | number | null> = [];
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    for (const cellMatch of rowMatch[1].matchAll(cellRe)) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2];
      const refMatch = attrs.match(/\br="([A-Z]+)\d+"/);
      const typeMatch = attrs.match(/\bt="([^"]+)"/);
      const col = refMatch ? colLetterToIndex(refMatch[1]) : row.length;
      while (row.length < col) row.push(null);
      let value: string | number | null = null;
      if (typeMatch?.[1] === "inlineStr" || typeMatch?.[1] === "str") {
        const t = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
        value = t ? decodeXml(t[1]) : "";
      } else {
        const v = inner.match(/<v>([\s\S]*?)<\/v>/);
        value = v ? Number(v[1]) : null;
      }
      row[col] = value;
    }
    rows.push(row);
  }
  return rows;
}

function intentFor(q: string): "informational" | "commercial" | "transactional" | "navigational" | null {
  if (/\b(alternative|alternatives|vs\.?|versus|compare|comparison|competitor)\b/i.test(q)) return "commercial";
  if (/\b(buy|pricing|price|cost|cheap|deal|discount|free trial|trial)\b/i.test(q)) return "transactional";
  if (/\b(login|sign in|signin|dashboard)\b/i.test(q)) return "navigational";
  return "informational";
}

async function main() {
  const path = process.argv[2] ?? "C:/Users/HP/Downloads/We360_GSC_Baseline.xlsx";
  console.log(`Loading GSC baseline: ${path}`);
  const zip = new AdmZip(path);

  const read = (n: number) => zip.readAsText(`xl/worksheets/sheet${n}.xml`);

  // ========================================================
  // 1. Wipe the 6 fake Apify-templated rows (source='apify' with templated text)
  // ========================================================
  const { data: fake } = await admin.from("keywords")
    .select("id, keyword").eq("project_id", PROJECT_ID).eq("source", "apify");
  const fakeIds = (fake ?? []).map((r: { id: string }) => r.id);
  if (fakeIds.length > 0) {
    await admin.from("keywords").delete().in("id", fakeIds);
    console.log(`  Wiped ${fakeIds.length} Apify-templated rows.`);
  }

  // ========================================================
  // 2. Parse each sheet into a keyword rows map
  //    (project_id, keyword) is the upsert key; last-write-wins on cluster
  //    so Tier-C classification (which is the richest) takes precedence.
  // ========================================================
  type Intent = "informational" | "commercial" | "transactional" | "navigational";
  interface Row {
    keyword: string;
    current_rank: number | null;
    target_rank: number | null;
    priority: "critical" | "high" | "medium" | "low";
    intent: Intent;
    source: "gsc";
    trend: "new";
    cluster: string;
    target_page: string | null;
  }
  const bucket = new Map<string, Row>();
  const seed = (keyword: string, patch: Partial<Row>) => {
    const k = keyword.toLowerCase().trim();
    if (!k) return;
    const prev: Row = bucket.get(k) ?? {
      keyword: k,
      current_rank: null, target_rank: null,
      priority: "medium", intent: intentFor(k) ?? "informational",
      source: "gsc", trend: "new",
      cluster: "gsc",
      target_page: null,
    };
    bucket.set(k, { ...prev, ...patch, keyword: k });
  };

  // --- Sheet 4: Striking distance (57 rows, cols: #, Query, Clicks, Impr, Position, Est clicks) ---
  {
    const rows = parseSheet(read(4));
    let added = 0;
    for (const r of rows) {
      const q = typeof r[1] === "string" ? r[1] : null;
      const pos = typeof r[4] === "number" ? r[4] : null;
      if (!q || !pos) continue;
      if (q.length < 2 || q.length > 200) continue; // skip headers + junk
      if (/^(#|query|clicks|impressions|position|keyword|brand|source|tier)$/i.test(q)) continue;          // skip headers
      seed(q, { current_rank: Math.round(pos), target_rank: 5, priority: "high", cluster: "striking-distance" });
      added++;
    }
    console.log(`  Sheet 4 Striking distance: ${added} queries staged`);
  }

  // --- Sheet 5: Zero-click (566 rows) ---
  {
    const rows = parseSheet(read(5));
    let added = 0;
    for (const r of rows) {
      const q = typeof r[1] === "string" ? r[1] : null;
      const pos = typeof r[4] === "number" ? r[4] : null;
      if (!q || pos == null) continue;
      if (q.length < 2 || q.length > 200) continue; // skip headers + junk
      if (/^(#|query|clicks|impressions|position|keyword|brand|source|tier)$/i.test(q)) continue;
      seed(q, { current_rank: Math.round(pos), target_rank: 5, priority: "medium", cluster: "zero-click" });
      added++;
    }
    console.log(`  Sheet 5 Zero-click: ${added} queries staged`);
  }

  // --- Sheet 6: Alternative + VS (42 rows) ---
  {
    const rows = parseSheet(read(6));
    let added = 0;
    for (const r of rows) {
      const q = typeof r[1] === "string" ? r[1] : null;
      const pos = typeof r[4] === "number" ? r[4] : null;
      if (!q) continue;
      if (q.length < 2 || q.length > 200) continue; // skip headers + junk
      if (/^(#|query|clicks|impressions|position|keyword|brand|source|tier)$/i.test(q)) continue;
      seed(q, {
        current_rank: pos ? Math.round(pos) : null,
        target_rank: 3,
        priority: "high",
        cluster: "alternative-vs",
        intent: "commercial",
      });
      added++;
    }
    console.log(`  Sheet 6 Alternative+VS: ${added} queries staged`);
  }

  // --- Sheet 14: Tier C target queries (150 rank-tracker list) ---
  {
    const rows = parseSheet(read(14));
    let added = 0;
    for (const r of rows) {
      // Cols: #, Query, Source pool, Current clicks, Current imp, Current pos, Target pos, ...
      const q = typeof r[1] === "string" ? r[1] : null;
      const curPos = typeof r[5] === "number" ? r[5] : null;
      const targetPos = typeof r[6] === "number" ? r[6] : null;
      if (!q) continue;
      if (q.length < 2 || q.length > 200) continue; // skip headers + junk
      if (/^(#|query|clicks|impressions|position|keyword|brand|source|tier)$/i.test(q)) continue;
      seed(q, {
        current_rank: curPos ? Math.round(curPos) : null,
        target_rank: targetPos ? Math.round(targetPos) : 5,
        priority: curPos && curPos <= 20 ? "high" : "medium",
        cluster: "tier-c-tracker",
      });
      added++;
    }
    console.log(`  Sheet 14 Tier C tracker: ${added} queries staged`);
  }

  // ========================================================
  // 3. Batch upsert
  // ========================================================
  const rows = [...bucket.values()].map((r) => ({ project_id: PROJECT_ID, ...r }));
  console.log(`\n  Total unique non-brand keywords to upsert: ${rows.length}`);
  const BATCH = 200;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const { error } = await admin.from("keywords").upsert(chunk, { onConflict: "project_id,keyword" });
    if (error) { console.error("upsert err", error.message); process.exit(1); }
    upserted += chunk.length;
  }
  console.log(`  ✓ Upserted ${upserted} keywords into the dashboard.`);
  console.log("\n✅ GSC keywords import complete. Ready to re-run Apify intelligence.");
}

main().catch((e) => { console.error(e); process.exit(1); });
