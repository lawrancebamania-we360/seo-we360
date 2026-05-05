#!/usr/bin/env tsx
/**
 * Export the May+June 2026 SEO plan as a polished XLSX (and CSV backup).
 *
 * Filters per user directive (Apr 29 2026):
 *   - SEO tasks only (drop kind=web_task + PSI dev tasks)
 *   - Drop K1.7 (GA4 channel cleanup) + K1.8 (monthly report) from SEO Ops
 *   - Drop Key, Category, URL/Slug columns
 *   - Keep Pillar + Difficulty columns
 *   - Action verbs constrained to: Update / Delete / Create
 *   - Asset constrained to: Blog / Page
 *   - Replace verbose data_backing with a 1-line "Why" derived from task fields
 *
 * Outputs:
 *   seo-data/may-jun-2026-plan.xlsx
 *   seo-data/may-jun-2026-plan.csv  (backup)
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { SEO_OPS_TASKS, BLOG_TASKS } from "./import-100k-plan";

const OUT_DIR = "D:/claude-projects/SEO - We360/seo-data";
const WINDOW_START = "2026-05-01";
const WINDOW_END   = "2026-06-30";
const SEO_OPS_DROP = new Set(["K1.7", "K1.8"]);  // user directive

interface Row {
  date: string;
  type: string;          // "Create Blog" / "Update Page" / "Ops" / etc.
  title: string;
  target_keyword: string;
  est_volume: number | null;
  difficulty: string;
  format: string;
  priority: string;
  pillar: string;
  why: string;
}

const inWindow = (d: string) => d >= WINDOW_START && d <= WINDOW_END;

// ============================================================================
// Type mapping — user directive: Update/Delete/Create × Blog/Page only
// ============================================================================
function mapType(internal: { type: string; asset: string }): string {
  // internal.type is one of the 8 from import script (New Post / Update Post / etc.)
  // OR "Ops" / "Dev"
  if (internal.type === "Ops" || internal.type === "Dev" || internal.type === "SEO Ops") return "Ops";
  // Map verb New → Create, asset Post → Blog
  const t = internal.type;
  if (t.startsWith("New ")) return t.replace("New ", "Create ").replace(" Post", " Blog");
  if (t.startsWith("Update ")) return t.replace(" Post", " Blog");
  if (t.startsWith("Delete ")) return t.replace(" Post", " Blog");
  // Modify (merge) folded into Update for stakeholder simplicity
  if (t.startsWith("Modify ")) return t.replace("Modify ", "Update ").replace(" Post", " Blog");
  return t;
}

// ============================================================================
// 1-line "Why" derivation — layman, ~80-140 chars
// ============================================================================
function deriveWhy(t: typeof BLOG_TASKS[number]): string {
  const k = t.key;
  const vol = t.est_volume;

  // ---- Update Blog (refresh existing /blog/*) ----
  if (k === "B1.4a") return "47K impressions but only 72 clicks at pos 35 — refresh to start capturing them";
  if (k === "B1.4b") return "51K impressions, 27 clicks (CTR 0.05%) at pos 43 — biggest impression/click gap on the site";
  if (k === "B1.4c") return "Already ranking #10 for 'prohance alternative' (16K imp/16mo) — push to top 5 with retitle + answer-capsule";
  if (k === "B1.4d") return "29K imp, 53 clicks at pos 17.5 — striking distance + absorb 'what causes low productivity' (25K imp/16mo)";
  if (k === "B1.4e") return "22K imp, 101 clicks at pos 16 — already 100+ clicks/16mo, refresh to ~3× clicks";
  if (k === "B1.4f") return "Already top-10 (pos 10.6, 76 clicks/16mo) for 'zoho people vs keka' — small refresh pushes to top 5";
  if (k === "B1.5a") return "4,346 imp/mo for 'blog generator' at pos 13 — striking distance for top 10 (~280 clicks/mo upside)";
  if (k === "B1.5b") return "Cluster of 4 attendance-system queries at pos 11–16 (~7K imp/16mo combined) — refresh for top 5";
  if (k === "B1.5c") return "Existing JD template at pos 17 — expand with salary + skills + interview Qs to push top 5";
  if (k === "B2.4a") return "1,020 imp/mo at pos 12 — refresh existing /blog/canva-alternative to top 5";
  if (k === "B2.4c") return "Existing /professional-invoice-generator at pos 12 for 'ai invoice generator' (894 imp/mo) — retitle for AI angle";
  if (k && k.startsWith("B-SDR.")) {
    // Striking-distance refresh — derive from key suffix and est_volume
    return `Already ranking — push to top 10 for measurable click lift (${vol ?? "—"} monthly searches, KD per Moz)`;
  }

  // ---- Update Page (refresh existing landing page) ----
  if (k === "B2.2a") return "/solutions/employee-monitoring is our top BoF page — 393 sessions/mo today; refresh targets 1,000+ sessions/mo";
  if (k === "B2.2b") return "/attendance-tracking-software has 75K imp/16mo at pos 35 — biggest latent-demand solution page";
  if (k === "B2.2c") return "/remote-employee-monitoring has 82K imp/16mo at pos 39 — invisible to searchers despite high impressions";
  if (k === "F.screen-rec") return "Existing /features/screen-recording is thin — refresh for 'screen monitoring software' (1.7K vol, KD Medium)";
  if (k === "F.productivity") return "Existing /features/productivity-tracking is thin — target 'productivity monitoring software' head term";
  if (k === "F.agentic-ai") return "Refresh /features/agentic-ai to anchor the 5 Agentic AI cluster blogs (1,150 vol/mo for AI head term)";
  if (k === "K-HOME") return "'Employee monitoring software' = 10K monthly searches — biggest keyword gap (we're not in top 50 today)";

  // ---- Create Blog (brand-new blog post) ----
  if (k && k.startsWith("B-UA.")) {
    // Unique-angle articles
    const theme = k.split(".")[1];
    const themeName = ({
      AI: "Agentic AI",
      COST: "Cost Intelligence",
      TECH: "SaaS / Technology Usage",
      FIELD: "India Field Force GPS",
      LIVE: "Livestream Monitoring",
      MULTI: "Multi-Location Productivity",
    } as Record<string, string>)[theme] ?? theme;
    return `${vol ?? "—"} monthly searches, very low competition — uncontested theme (${themeName})`;
  }
  if (k === "D.best-em-listicle") return "5,500 monthly searches for 'best employee monitoring software 2026' — listicle owns this query type";
  if (k === "D.how-monitor-remote") return "2,250 monthly searches, low competition — quick-win how-to guide";
  if (k && k.startsWith("FC.")) return `${vol ?? "—"} monthly searches — feature cluster blog feeding the relevant feature pillar`;
  if (k === "E.expertise-may" || k === "E.expertise-jun") return "Industry-leader byline — E-E-A-T signal + LinkedIn distribution drives referral traffic";

  // ---- Create Page (brand-new landing page) ----
  if (k && k.startsWith("B-VS.")) {
    const slug = k.replace("B-VS.", "");
    return `Build /vs/${slug} comparison page — captures evaluator-stage buyers comparing tools`;
  }
  if (k && k.startsWith("B-ALT.")) {
    const slug = k.replace("B-ALT.", "");
    return `Build /alternative/${slug} page — '${slug.replace(/-/g, " ")}' search volume currently won by competitors`;
  }
  if (k && k.startsWith("B-INT.")) {
    const slug = k.replace("B-INT.", "");
    return `Build /integrations/${slug} page — convert ${slug.replace(/-/g, " ")}-shop visitors who can integrate We360`;
  }
  if (k && k.startsWith("B3.2")) return "India-localized landing — uncontested by global competitors (Hubstaff/ActivTrak have ZERO India pages)";
  if (k && (k.startsWith("B3.1i") || k.startsWith("B4.2"))) return "Industry-vertical landing — captures vertical-specific buyer queries with low competition";
  if (k === "F.remote-em") return "3K monthly searches for 'remote employee monitoring software' — dedicated feature page (we don't have one)";
  if (k === "F.livestream") return "Build /features/livestream — Hubstaff differentiator (they refuse to offer this); anchors livestream cluster";
  if (k === "D.time-tracking-landing") return "6,500 monthly searches for 'time tracking software for employees' — current /solutions/time-tracker is thin";
  if (k === "D.in-wfh-tracking") return "550 monthly searches for 'WFH tracking software India' — uncontested by global competitors";
  if (k === "D.in-leave-mgmt") return "1,150 monthly searches for 'leave management software India' — overlaps with Keka/Zoho integration plays";
  if (k === "D.in-field-force") return "750 monthly searches — pillar for the 5 India Field Force cluster blogs (FMCG/pharma/insurance verticals)";
  if (k === "K-REVIEWS") return "Aggregate G2/Capterra reviews on-site — strong AI Overview citation signal + branded SERP improvement";
  if (k === "K-HOWITWORKS") return "Mid-funnel explainer covering install → tracking → reports — pre-sales education + branded SERP";

  // ---- Operational / cleanup ----
  if (k === "B2.1") return "Audit 41 thin blog posts (Crawled-not-indexed by Google) — decide merge, delete, or refresh each";
  if (k === "B3.4") return "Data study #1 — 'India workforce productivity index 2026'; PR + 50+ referring domains";
  if (k === "B5.3") return "Data study #2 launch — AI tools at work, 200-respondent HR survey + PR push";
  if (k === "B7.3" || k === "B8.3" || k === "B8.4") return "Operational/study task — output is a document or PR launch, not a webpage";

  return "—";
}

// SEO Ops tasks (kind=blog_task without target_keyword) — bespoke 1-liners
function deriveOpsWhy(t: typeof SEO_OPS_TASKS[number]): string {
  if (t.key === "K1.2") return "924 of 1,275 backlinks (72%) come from a PBN — disavow to protect Ahrefs DR + clean profile for Month-3 study";
  if (t.key === "K1.6") return "No GBP listing today — 'we360' branded SERP shows no knowledge panel; 25 reviews lift visibility 3-5×";
  if (t.key === "K3.1") return "BoF pages need ≥5 internal links each — cheapest CTR + topical-authority lift in the entire plan";
  if (t.key === "K6.4") return "Mid-plan health check — re-pull GSC + GA4 vs targets; decide H2 priorities";
  return "Operational task";
}

// ============================================================================
// Task type inference
// ============================================================================
function inferType(t: typeof BLOG_TASKS[number]): { type: string; asset: string } {
  if (!t.target_keyword) return { type: "Ops", asset: "Ops" };
  const k = t.key;
  const isPage =
    /^(B-VS|B-ALT|B-INT|F\.)/.test(k) ||
    /^B3\.2/.test(k) || /^B3\.1i/.test(k) || /^B4\.2/.test(k) ||
    /^K-(HOME|REVIEWS|HOWITWORKS)$/.test(k) ||
    /^D\.(in-|time-tracking|productivity-monitoring)/.test(k);
  const forcePost = /^D\.(best-em-listicle|how-monitor-remote)/.test(k);
  const isRefresh =
    /^B1\.[45][a-z]?$/.test(k) ||
    /^B2\.2[a-z]/.test(k) ||
    /^B2\.4[ac]$/.test(k) ||
    /^B-SDR\./.test(k) ||
    /^F\.(screen-rec|productivity|agentic-ai)$/.test(k) ||
    k === "K-HOME";
  const asset = forcePost ? "Post" : (isPage ? "Page" : "Post");
  const verb = isRefresh ? "Update" : "New";
  return { type: `${verb} ${asset}`, asset };
}

// ============================================================================
// Build rows
// ============================================================================
const rows: Row[] = [];

// SEO Ops tasks
for (const t of SEO_OPS_TASKS) {
  if (!inWindow(t.scheduled_date)) continue;
  if (SEO_OPS_DROP.has(t.key)) continue;
  rows.push({
    date: t.scheduled_date,
    type: "Ops",
    title: t.title,
    target_keyword: "",
    est_volume: null,
    difficulty: "",
    format: "External admin / report",
    priority: t.priority,
    pillar: t.pillar,
    why: deriveOpsWhy(t),
  });
}

// Blog tasks
for (const t of BLOG_TASKS) {
  if (!inWindow(t.scheduled_date)) continue;
  const internal = inferType(t);
  const wordCount = t.brief?.word_count_target ?? null;
  const isOps = internal.type === "Ops";
  const format =
    isOps ? "Operational"
    : internal.asset === "Page" ? `${wordCount ?? 1500}w landing page`
    : `${wordCount ?? 1500}w ${
        /pillar/i.test(t.title) ? "pillar"
        : /listicle|best/i.test(t.title) ? "listicle"
        : /comparison|vs /i.test(t.title) ? "comparison"
        : /guide|how/i.test(t.title) ? "guide" : "blog"
      }`;
  rows.push({
    date: t.scheduled_date,
    type: mapType(internal),
    title: t.title,
    target_keyword: t.target_keyword ?? "",
    est_volume: t.est_volume ?? null,
    difficulty: t.competition ?? "",
    format,
    priority: t.priority,
    pillar: t.pillar,
    why: deriveWhy(t),
  });
}

// Sort: by date asc, then Ops first, then Update before Create
rows.sort((a, b) => {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  const order: Record<string, number> = { "Ops": 0, "Update Blog": 1, "Update Page": 2, "Create Page": 3, "Create Blog": 4, "Delete Blog": 5, "Delete Page": 6 };
  return (order[a.type] ?? 9) - (order[b.type] ?? 9);
});

// ============================================================================
// Write CSV (backup)
// ============================================================================
const HEADERS = ["Date", "Type", "Title", "Target Keyword", "Est. Volume / mo", "Difficulty", "Format", "Priority", "Pillar", "Why (1-liner)"];

function escCsv(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const csvLines = [HEADERS.map(escCsv).join(",")];
for (const r of rows) {
  csvLines.push([
    r.date, r.type, r.title, r.target_keyword,
    r.est_volume == null ? "" : String(r.est_volume),
    r.difficulty, r.format, r.priority, r.pillar, r.why,
  ].map(escCsv).join(","));
}
writeFileSync(path.join(OUT_DIR, "may-jun-2026-plan.csv"), csvLines.join("\n"), "utf-8");

// ============================================================================
// Write XLSX (formatted)
// ============================================================================
async function writeXlsx() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "We360 SEO";
  wb.lastModifiedBy = "Plan export";
  wb.created = new Date();
  const ws = wb.addWorksheet("May–Jun 2026 Plan", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // Column widths
  ws.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Type", key: "type", width: 14 },
    { header: "Title", key: "title", width: 60 },
    { header: "Target Keyword", key: "target_keyword", width: 32 },
    { header: "Est. Vol/mo", key: "est_volume", width: 12 },
    { header: "Difficulty", key: "difficulty", width: 18 },
    { header: "Format", key: "format", width: 22 },
    { header: "Priority", key: "priority", width: 11 },
    { header: "Pillar", key: "pillar", width: 9 },
    { header: "Why (1-liner)", key: "why", width: 90 },
  ];

  // Header styling — brand purple
  const headerRow = ws.getRow(1);
  headerRow.font = { name: "Inter", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5B45E0" } };
  headerRow.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  headerRow.height = 26;

  // Data rows
  for (const r of rows) {
    ws.addRow({
      date: r.date,
      type: r.type,
      title: r.title,
      target_keyword: r.target_keyword,
      est_volume: r.est_volume,
      difficulty: r.difficulty,
      format: r.format,
      priority: r.priority,
      pillar: r.pillar,
      why: r.why,
    });
  }

  // Per-row styling
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return;
    row.height = 32;
    row.alignment = { vertical: "top", wrapText: true };

    // Type column color — verb-based
    const typeCell = row.getCell("type");
    const typeVal = String(typeCell.value ?? "");
    const verb = typeVal.split(" ")[0];
    let fg = "FFF1F5F9", color = "FF1F2937";
    if (verb === "Create") { fg = "FFD1FAE5"; color = "FF065F46"; }
    else if (verb === "Update") { fg = "FFEDE9FE"; color = "FF5B21B6"; }
    else if (verb === "Delete") { fg = "FFFEE2E2"; color = "FF991B1B"; }
    else if (verb === "Ops") { fg = "FFFEF3C7"; color = "FF92400E"; }
    typeCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fg } };
    typeCell.font = { name: "Inter", size: 10, bold: true, color: { argb: color } };
    typeCell.alignment = { vertical: "middle", horizontal: "center" };

    // Priority column color
    const priCell = row.getCell("priority");
    const priVal = String(priCell.value ?? "");
    let priFg = "FFF1F5F9", priColor = "FF374151";
    if (priVal === "critical") { priFg = "FFFEE2E2"; priColor = "FF991B1B"; }
    else if (priVal === "high") { priFg = "FFFFEDD5"; priColor = "FF9A3412"; }
    else if (priVal === "medium") { priFg = "FFEDE9FE"; priColor = "FF5B21B6"; }
    else if (priVal === "low") { priFg = "FFE5E7EB"; priColor = "FF4B5563"; }
    priCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: priFg } };
    priCell.font = { name: "Inter", size: 10, bold: true, color: { argb: priColor } };
    priCell.alignment = { vertical: "middle", horizontal: "center" };

    // Date column right-aligned
    row.getCell("date").alignment = { vertical: "middle", horizontal: "left" };
    // Volume right-aligned + thousands separator
    const volCell = row.getCell("est_volume");
    volCell.alignment = { vertical: "middle", horizontal: "right" };
    volCell.numFmt = '#,##0;-#,##0;""';

    // General cell font
    row.getCell("title").font = { name: "Inter", size: 10, bold: true, color: { argb: "FF231D4F" } };
    row.getCell("target_keyword").font = { name: "Inter", size: 9, color: { argb: "FF374151" } };
    row.getCell("format").font = { name: "Inter", size: 9, color: { argb: "FF4B5563" } };
    row.getCell("pillar").font = { name: "Inter", size: 9, color: { argb: "FF6B7280" } };
    row.getCell("difficulty").font = { name: "Inter", size: 9, color: { argb: "FF4B5563" } };
    row.getCell("why").font = { name: "Inter", size: 10, color: { argb: "FF374151" } };

    // Borders — light gray
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
    });
  });

  // Auto-filter on the header row
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: HEADERS.length } };

  await wb.xlsx.writeFile(path.join(OUT_DIR, "may-jun-2026-plan.xlsx"));
}

// ============================================================================
// Run
// ============================================================================
async function main() {
  await writeXlsx();
  // Quick summary
  const byMonth: Record<string, { count: number; types: Record<string, number> }> = {};
  for (const r of rows) {
    const month = r.date.slice(0, 7);
    byMonth[month] = byMonth[month] ?? { count: 0, types: {} };
    byMonth[month].count++;
    byMonth[month].types[r.type] = (byMonth[month].types[r.type] ?? 0) + 1;
  }
  console.log(`\n✅ Exported ${rows.length} SEO tasks across May+June 2026.\n`);
  console.log("Files:");
  console.log("  seo-data/may-jun-2026-plan.xlsx   ← polished, color-coded, frozen header");
  console.log("  seo-data/may-jun-2026-plan.csv    ← backup (open in Excel/Sheets)\n");
  for (const [month, info] of Object.entries(byMonth).sort()) {
    console.log(`${month}: ${info.count} tasks`);
    for (const [type, count] of Object.entries(info.types).sort()) {
      console.log(`  ${type.padEnd(14)} ${count}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
