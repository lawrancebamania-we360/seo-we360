#!/usr/bin/env tsx
/**
 * Validate top-of-funnel tangent topics for 3 ICPs (HR Head / Ops Director /
 * BPO Manager) by running Apify SERP scraper on each query and converting the
 * SERP signals (resultsTotal, AI Overview presence, PAA depth, related
 * searches) into an estimated monthly search volume band.
 *
 * Outputs:
 *   - Console: 3 tables (one per ICP), 3 columns (ICP / Topic / Est. Volume),
 *     sorted by score desc
 *   - XLSX: new "Top of Funnel" tab in
 *     C:\Users\HP\Downloads\100K Traffic - SEO Plan + Activity Mix.xlsx
 *
 * Note: SERP-signal-based volume estimates are DIRECTIONAL, not exact. For
 * exact monthly volumes we'd need Google Keyword Planner or DataForSEO ($).
 */

import ExcelJS from "exceljs";
import { config } from "dotenv";
import { getApifyCreds } from "../lib/integrations/secrets";

config({ path: ".env.local" });

const SRC = "C:/Users/HP/Downloads/100K Traffic - SEO Plan + Activity Mix.xlsx";
const DEST = "C:/Users/HP/Downloads/100K Traffic - SEO Plan + Activity Mix + ToF.xlsx";

type Icp = "HR Head" | "Ops Director" | "BPO Manager";

const TOPICS: Record<Icp, string[]> = {
  "HR Head": [
    "How to reduce attrition in GenZ employees",
    "Hybrid work policy template India 2026",
    "Annual compensation benchmarking India SaaS",
    "Employee engagement survey questions 2026",
    "Performance review template OKR aligned",
    "DEI metrics for India tech companies",
    "How to implement OKRs in 50 person team",
    "Manager 1 on 1 template",
    "Onboarding checklist for remote employees India",
    "Quiet quitting how to detect",
    "Manager training programs for new managers India",
    "Workforce planning model template 2026",
  ],
  "Ops Director": [
    "How to measure operational efficiency",
    "Process bottleneck identification framework",
    "Multi location productivity comparison",
    "KPI framework for operations teams",
    "How to scale ops team from 50 to 200",
    "Lean Six Sigma for SaaS companies",
    "Workflow optimization tools 2026",
    "BPO agent productivity benchmarks India",
    "How to standardize ops across India offices",
    "Cost per output calculation method",
    "How to reduce meeting overload in remote teams",
    "Process documentation tools for India SaaS",
  ],
  "BPO Manager": [
    "How to reduce AHT in BPO",
    "BPO agent attrition causes India",
    "Shift adherence tracking BPO",
    "Call center quality scoring framework",
    "BPO benchmarks India 2026",
    "How to onboard BPO agents faster",
    "WFH BPO setup India",
    "Real time agent monitoring tools",
    "BPO cost per minute optimization",
    "DPDPA for BPO companies",
    "How to improve first call resolution rate",
    "BPO workforce management software comparison India",
  ],
};

interface TopicResult {
  icp: Icp;
  topic: string;
  totalResults: number | null;
  paaCount: number;
  relatedCount: number;
  aiOverviewPresent: boolean;
  topUrls: string[];     // top 3 organic URLs
  score: number;
  band: string;
}

// =============================================================================
// Volume-band heuristic (signal-based, NOT exact)
// =============================================================================
function computeScore(args: {
  totalResults: number | null;
  paaCount: number;
  relatedCount: number;
  aiOverviewPresent: boolean;
}): number {
  let score = 0;
  // Base from resultsTotal (log scale, capped)
  if (args.totalResults && args.totalResults > 0) {
    score += Math.min(50, Math.log10(args.totalResults) * 5.5);
  }
  // AI Overview triggered = strong demand signal (high-volume B2B query)
  if (args.aiOverviewPresent) score += 20;
  // PAA count = consistent search demand (Google shows PAA on real queries)
  score += Math.min(15, args.paaCount * 3);
  // Related searches = clustering of intent
  score += Math.min(10, args.relatedCount * 2);
  return Math.round(score);
}

function scoreToBand(score: number): string {
  if (score >= 80) return "Very High (5K-15K/mo est.)";
  if (score >= 60) return "High (1.5K-5K/mo est.)";
  if (score >= 40) return "Medium (300-1.5K/mo est.)";
  if (score >= 20) return "Low (50-300/mo est.)";
  return "Very Low (<50/mo est.)";
}

// =============================================================================
// SERP fetch — direct call to apify/google-search-scraper, ONE keyword per
// call with a 90s timeout. Matches the working pattern from
// enrich-blog-tasks-apify.ts which is proven to succeed.
// =============================================================================

interface SerpItem {
  organicResults?: Array<{ url: string; title?: string }>;
  peopleAlsoAsk?: Array<{ question: string }>;
  relatedQueries?: Array<{ title: string }>;
  aiOverview?: { content?: string; sources?: Array<{ url: string; title?: string }> } | null;
  resultsTotal?: number;
}

async function fetchSerpForKeyword(token: string, keyword: string, attempt = 1): Promise<{
  totalResults: number | null;
  paaCount: number;
  relatedCount: number;
  aiOverviewPresent: boolean;
  topUrls: string[];
} | null> {
  const actorId = "apify~google-search-scraper";
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        queries: keyword,
        countryCode: "in",
        mobileResults: false,
        resultsPerPage: 10,
        maxPagesPerQuery: 1,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`SERP HTTP ${res.status}: ${body.slice(0, 200)}`);
    }
    const items = (await res.json()) as SerpItem[];
    if (items.length === 0) return null;
    const it = items[0];
    return {
      totalResults: it.resultsTotal ?? null,
      paaCount: (it.peopleAlsoAsk ?? []).length,
      relatedCount: (it.relatedQueries ?? []).length,
      aiOverviewPresent: !!(it.aiOverview && (it.aiOverview.content || (it.aiOverview.sources?.length ?? 0) > 0)),
      topUrls: (it.organicResults ?? []).map((r) => r.url).slice(0, 3),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (attempt < 2) {
      console.warn(`     ↻ retry "${keyword.slice(0, 50)}..." — ${msg}`);
      await new Promise((r) => setTimeout(r, 5000));
      return fetchSerpForKeyword(token, keyword, attempt + 1);
    }
    console.warn(`     ✗ FAILED "${keyword.slice(0, 50)}..." — ${msg}`);
    return null;
  }
}

async function fetchSerpBatch(token: string, keywords: string[]): Promise<TopicResult[]> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const out: TopicResult[] = [];
  for (let i = 0; i < keywords.length; i++) {
    const kw = keywords[i];
    process.stdout.write(`  [${i + 1}/${keywords.length}] "${kw.slice(0, 55)}"`.padEnd(70));
    const t0 = Date.now();
    const data = await fetchSerpForKeyword(token, kw);
    const dt = Math.round((Date.now() - t0) / 1000);
    if (!data) {
      out.push({
        icp: "" as Icp, topic: kw, totalResults: null, paaCount: 0, relatedCount: 0,
        aiOverviewPresent: false, topUrls: [], score: 0, band: "(no data)",
      });
      console.log(` (${dt}s, no data)`);
      continue;
    }
    const score = computeScore({
      totalResults: data.totalResults, paaCount: data.paaCount,
      relatedCount: data.relatedCount, aiOverviewPresent: data.aiOverviewPresent,
    });
    const band = scoreToBand(score);
    out.push({
      icp: "" as Icp, topic: kw, totalResults: data.totalResults,
      paaCount: data.paaCount, relatedCount: data.relatedCount,
      aiOverviewPresent: data.aiOverviewPresent, topUrls: data.topUrls,
      score, band,
    });
    console.log(` (${dt}s, score=${score})`);
    if (i < keywords.length - 1) await sleep(2000);
  }
  return out;
}

// =============================================================================
// Main
// =============================================================================
async function main() {
  const creds = await getApifyCreds();
  if (!creds) { console.error("No Apify creds"); process.exit(1); }
  const token = creds.token;

  console.log(`\n📊 Validating ${Object.values(TOPICS).flat().length} tangent topics across 3 ICPs...`);
  console.log("   Using Apify SERP scraper (signal-based volume estimates).\n");

  const allResults: TopicResult[] = [];
  for (const icp of Object.keys(TOPICS) as Icp[]) {
    console.log(`[${icp}] Fetching SERP for ${TOPICS[icp].length} topics...`);
    const results = await fetchSerpBatch(token, TOPICS[icp]);
    for (const r of results) r.icp = icp;
    allResults.push(...results);
    console.log(`  ✅ ${results.length} topics scraped`);
  }

  // ===========================================================================
  // Console output — 3 tables, sorted by score desc within each ICP
  // ===========================================================================
  for (const icp of Object.keys(TOPICS) as Icp[]) {
    const rows = allResults.filter((r) => r.icp === icp).sort((a, b) => b.score - a.score);
    console.log(`\n\n=== ${icp.toUpperCase()} (sorted by estimated demand) ===\n`);
    console.log(`${"ICP".padEnd(15)} ${"Topic".padEnd(60)} Est. Volume`);
    console.log("-".repeat(120));
    for (const r of rows) {
      console.log(`${r.icp.padEnd(15)} ${r.topic.slice(0, 58).padEnd(60)} ${r.band}`);
    }
  }

  // ===========================================================================
  // XLSX — append "Top of Funnel" tab to the activity-mix workbook
  // ===========================================================================
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);
  const existing = wb.getWorksheet("Top of Funnel");
  if (existing) wb.removeWorksheet(existing.id);
  const ws = wb.addWorksheet("Top of Funnel");

  ws.columns = [
    { header: "ICP",                     key: "icp",        width: 16 },
    { header: "Tangent search topic",    key: "topic",      width: 60 },
    { header: "Estimated volume",        key: "band",       width: 28 },
    { header: "Signal score (0-100)",    key: "score",      width: 16 },
    { header: "AI Overview",             key: "ai",         width: 14 },
    { header: "PAA Qs",                  key: "paa",        width: 10 },
    { header: "Related searches",        key: "related",    width: 16 },
  ];

  // Header styling
  const hr = ws.getRow(1);
  hr.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF231D4F" } };
  hr.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  hr.height = 26;
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // Sort all results by ICP then score desc
  const sortedAll = [...allResults].sort((a, b) => {
    const order: Icp[] = ["HR Head", "Ops Director", "BPO Manager"];
    const ai = order.indexOf(a.icp);
    const bi = order.indexOf(b.icp);
    if (ai !== bi) return ai - bi;
    return b.score - a.score;
  });

  for (const r of sortedAll) {
    const row = ws.addRow({
      icp: r.icp,
      topic: r.topic,
      band: r.band,
      score: r.score,
      ai: r.aiOverviewPresent ? "Yes" : "No",
      paa: r.paaCount,
      related: r.relatedCount,
    });
    row.alignment = { vertical: "middle", wrapText: true };
    row.height = 22;

    // Color band cell
    const bandCell = row.getCell("band");
    if (r.band.startsWith("Very High")) {
      bandCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
      bandCell.font = { bold: true, color: { argb: "FF065F46" } };
    } else if (r.band.startsWith("High")) {
      bandCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6FFFA" } };
      bandCell.font = { bold: true, color: { argb: "FF0F766E" } };
    } else if (r.band.startsWith("Medium")) {
      bandCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
      bandCell.font = { color: { argb: "FF92400E" } };
    } else if (r.band.startsWith("Low")) {
      bandCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
      bandCell.font = { color: { argb: "FF991B1B" } };
    } else {
      bandCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
      bandCell.font = { color: { argb: "FF6B7280" } };
    }

    // ICP color tint
    const icpCell = row.getCell("icp");
    icpCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDE9FE" } };
    icpCell.font = { bold: true, color: { argb: "FF5B45E0" } };
  }

  // Auto-filter
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 7 } };

  await wb.xlsx.writeFile(DEST);
  console.log(`\n\n✅ Wrote ${DEST}`);
  console.log(`   New tab "Top of Funnel" added with ${sortedAll.length} rows.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
