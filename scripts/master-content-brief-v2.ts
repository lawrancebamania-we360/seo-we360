#!/usr/bin/env tsx
/**
 * Master Content Brief v2 — 110/month target across May–June 2026
 *
 * Combines 4 data sources:
 *   1. Useful Keywords (filtered from My Research + Lokesh Ideas) — 2,139 kws
 *   2. Moz Keyword Gap "All Ranking" — kws where We360 ranks 11-50
 *   3. Moz Keyword Gap "Keywords to Improve" — 19 curated SDR opportunities
 *   4. Topical Authority strategy doc + Feature×Topics map
 *
 * Volume tiers (locked):
 *   ≥10K commercial → landing page
 *   5K-10K          → big pillar blog OR page
 *   1K-5K           → own cluster blog
 *   500-999         → blog OR H2 section
 *   <500            → FAQ on hub
 *
 * Owner allocation (revised): Lokesh now picks up blog updates (no 3rd freelancer)
 *
 * Stops when keyword pool exhausted — does NOT pad to 220.
 */

import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";

const ANALYSIS_SRC = "C:/Users/HP/Downloads/New Keywords - 100K Plan + Analysis.xlsx";
const MOZ_ALL      = "D:/claude-projects/SEO - We360/seo-data/raw-csv/moz-keyword-gap-all.csv";
const MOZ_IMPROVE  = "D:/claude-projects/SEO - We360/seo-data/raw-csv/moz-keyword-gap-improve.csv";
const DEST         = "C:/Users/HP/Downloads/Master Content Brief v2.xlsx";

// =============================================================================
// Word counts + durations (per 25-yr SEO expert call, AI-assisted workflow)
// =============================================================================

const WORD_COUNTS: Record<string, number> = {
  "listicle":           2200,
  "pillar-blog":        2700,
  "cluster-blog":       1650,
  "definitional-blog":  1350,
  "how-to-blog":        2000,
  "vs-page":            2300,
  "alternative-page":   2300,
  "solution-page":      2700,
  "integration-page":   1700,
  "feature-pillar":     2700,
  "new-feature-page":   2200,
  "homepage-retarget":  1500,
  "update-blog":        1600,  // refresh existing /blog/ post
  "industry-page":      1900,
  "india-page":         1900,
};

// AI-assisted workflow: half the time of from-scratch
const DURATION_DAYS: Record<string, number> = {
  "vs-page":              2,
  "alternative-page":     2,
  "solution-page":        3,
  "integration-page":     2,
  "feature-pillar":       3,
  "new-feature-page":     2,
  "homepage-retarget":    1.5,
  "pillar-blog":          1.5,
  "listicle":             1.5,
  "cluster-blog":         0.5,
  "definitional-blog":    0.5,
  "how-to-blog":          1,
  "update-blog":          0.5,
  "industry-page":        1.5,
  "india-page":           1.5,
};

// =============================================================================
// Types
// =============================================================================

type Owner = "Lokesh" | "Ishika" | "Rahul" | "Freelancer-1" | "Freelancer-2";

interface KW { keyword: string; volume: number; cluster: string; score: number; serpFeatures: string }

interface Deliverable {
  owner: Owner;
  cluster: string;
  type: "page" | "blog";
  format: keyof typeof WORD_COUNTS;
  hubKw: string;
  url: string;
  isNew: boolean;
  hubPageToLink: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  volumeTargeted: number;
  source: string;            // e.g. "Moz SDR" / "Cluster spoke" / "100K plan" / "Unique angle"
  startDate?: string;
  endDate?: string;
  durationDays: number;
}

interface Brief {
  h1: string;
  h2s: string[];
  h3s: string[];
  faqs: string[];
  bodyKws: string[];
  wordCount: number;
}

// =============================================================================
// Helpers
// =============================================================================

function pickStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && "richText" in (v as object)) {
    return ((v as { richText: Array<{ text: string }> }).richText.map((p) => p.text).join("")).trim();
  }
  return String(v).trim();
}
function pickNum(v: unknown): number {
  if (v == null || v === "") return 0;
  const s = typeof v === "string" ? v.replace(/[,\s]/g, "") : String(v);
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const splitRow = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ;
      } else if (c === "," && !inQ) {
        out.push(cur); cur = "";
      } else cur += c;
    }
    out.push(cur);
    return out;
  };
  const headers = splitRow(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitRow(line);
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) row[headers[i]] = cells[i] ?? "";
    return row;
  });
}

// Topical-overlap scoring for H2/H3 generation
const STOP = new Set(["the","a","an","of","for","to","and","with","in","on","at","by","is","are","was","were","be","best","top","how","what","why","when","where","which","who","do","does","can","i","my","your","our","you","we"]);
function tokens(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length >= 3 && !STOP.has(t)));
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersect = 0;
  for (const t of a) if (b.has(t)) intersect++;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}
function questionize(kw: string): string {
  const k = kw.toLowerCase().trim();
  if (/^(how|what|why|when|where|which|who|is|are|do|does|can)\b/.test(k)) {
    return k.charAt(0).toUpperCase() + k.slice(1) + "?";
  }
  if (/^(track|monitor|measure|reduce|improve|calculate|implement|set\s*up)/i.test(k)) {
    return "How do you " + k + "?";
  }
  return "What is " + k + "?";
}
function titleCase(s: string): string {
  return s.split(/\s+/).map((w) => {
    if (/^(of|for|to|and|the|a|an|in|on|at|by|with|or|nor|but|yet|so|as|vs)$/i.test(w)) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(" ").replace(/^./, (c) => c.toUpperCase());
}
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim().replace(/\s+/g, "-").slice(0, 70);
}

function generateBrief(d: Deliverable, allKws: KW[]): Brief {
  const targetTokens = tokens(d.hubKw);
  const inCluster = allKws.filter((k) => k.cluster === d.cluster && k.keyword !== d.hubKw && k.score >= 1);
  const ranked = inCluster.map((k) => ({ kw: k, overlap: jaccard(tokens(k.keyword), targetTokens), vol: k.volume }))
    .map((x) => ({ ...x, score: x.overlap * 200 + Math.log10(x.vol + 1) * 20 }))
    .sort((a, b) => b.score - a.score);
  const qPat = /^(how|what|why|when|where|which|who|is|are|do|does|can)\b/i;
  const faqRanked = inCluster.filter((k) => qPat.test(k.keyword)).sort((a, b) => b.volume - a.volume);
  const h2s = ranked.slice(0, 7).map((x) => titleCase(x.kw.keyword));
  const h3s = ranked.slice(7, 19).map((x) => titleCase(x.kw.keyword));
  const faqs = faqRanked.slice(0, 6).map((k) => questionize(k.keyword));
  const bodyKws = ranked.slice(19, 39).map((x) => x.kw.keyword);
  const h1Suffix = d.format === "listicle" ? " [2026]: Top Tools Compared"
                  : d.format === "definitional-blog" ? ": Definition + Examples (2026)"
                  : d.format === "how-to-blog" ? ": Step-by-Step Guide (2026)"
                  : "";
  return {
    h1: titleCase(d.hubKw) + h1Suffix,
    h2s, h3s, faqs, bodyKws,
    wordCount: WORD_COUNTS[d.format] ?? 1500,
  };
}

// =============================================================================
// MAIN PIPELINE
// =============================================================================

async function main() {
  // -------------------------------------------------------------------------
  // 1. LOAD ALL KEYWORD DATA SOURCES
  // -------------------------------------------------------------------------
  console.log("Loading keyword data...\n");

  // 1a. Useful keywords from prior analysis (with cluster + score)
  const wb1 = new ExcelJS.Workbook();
  await wb1.xlsx.readFile(ANALYSIS_SRC);
  const useful = wb1.getWorksheet("Useful Keywords");
  if (!useful) { console.error("Missing Useful Keywords tab"); process.exit(1); }
  const uCol: Record<string, number> = {};
  useful.getRow(1).eachCell((cell, n) => { uCol[pickStr(cell.value).toLowerCase()] = n; });
  const allKws: KW[] = [];
  for (let r = 2; r <= useful.actualRowCount; r++) {
    const row = useful.getRow(r);
    const kw = pickStr(row.getCell(uCol["keyword"]).value);
    if (!kw) continue;
    allKws.push({
      keyword: kw,
      volume: pickNum(row.getCell(uCol["volume / mo"]).value),
      cluster: pickStr(row.getCell(uCol["cluster"]).value),
      score: pickNum(row.getCell(uCol["score (5=direct, 1=weak)"]).value),
      serpFeatures: pickStr(row.getCell(uCol["serp features (lokesh)"]).value),
    });
  }
  console.log(`  Useful Keywords: ${allKws.length} kws`);

  // 1b. Moz "Keywords to Improve" (curated SDR)
  const mozImproveRows = parseCSV(readFileSync(MOZ_IMPROVE, "utf-8"));
  const sdrCurated = mozImproveRows.map((r) => ({
    keyword: r["Keyword"]?.toLowerCase().trim() ?? "",
    vol: pickNum(r["Monthly Volume"]),
    ourPos: pickNum(r["We360.ai (rank)"]),
    lift: pickNum(r["Traffic Lift"]),
    kd: pickNum(r["Difficulty"]),
  })).filter((r) => r.keyword);
  console.log(`  Moz SDR (curated): ${sdrCurated.length} kws`);

  // 1c. Moz "All Ranking" — filter where We360 rank 11-30
  const mozAllRows = parseCSV(readFileSync(MOZ_ALL, "utf-8"));
  const sdrPool = mozAllRows.map((r) => ({
    keyword: r["Keyword"]?.toLowerCase().trim() ?? "",
    vol: pickNum(r["Monthly Volume"]),
    ourPos: pickNum(r["We360.ai (rank)"]),
    lift: pickNum(r["Traffic Lift"]),
    kd: pickNum(r["Difficulty"]),
  })).filter((r) =>
    r.keyword &&
    r.ourPos >= 11 && r.ourPos <= 30 &&
    r.vol >= 50 &&
    !sdrCurated.some((c) => c.keyword === r.keyword)  // exclude already in curated list
  ).sort((a, b) => b.lift - a.lift);
  console.log(`  Moz All-Ranking SDR pool (rank 11-30, vol ≥50): ${sdrPool.length} kws`);

  // -------------------------------------------------------------------------
  // 2. GENERATE DELIVERABLES (target: 220 across May+June, stop if pool empty)
  // -------------------------------------------------------------------------
  const D: Deliverable[] = [];

  // 2a. PAGES — vs / alt / integration / solution / feature / India / homepage
  // Lokesh: 5 vs + 5 alt
  const VS = [
    { slug: "we360-vs-hubstaff",     hub: "we360 vs hubstaff",      vol: 1326 },
    { slug: "we360-vs-time-doctor",  hub: "we360 vs time doctor",   vol: 1282 },
    { slug: "we360-vs-teramind",     hub: "we360 vs teramind",      vol: 600  },
    { slug: "we360-vs-activtrak",    hub: "we360 vs activtrak",     vol: 1616 },
    { slug: "we360-vs-desktime",     hub: "we360 vs desktime",      vol: 950  },
  ];
  for (const v of VS) D.push({
    owner: "Lokesh", cluster: "vs / Alternative pages (BoF)", type: "page", format: "vs-page",
    hubKw: v.hub, url: `/vs/${v.slug}`, isNew: true,
    hubPageToLink: `/vs/${v.slug}`, priority: "Critical", volumeTargeted: v.vol,
    source: "100K plan", durationDays: DURATION_DAYS["vs-page"],
  });
  const ALT = [
    { slug: "hubstaff-alternative",     hub: "hubstaff alternative",     vol: 1326 },
    { slug: "time-doctor-alternative",  hub: "time doctor alternative",  vol: 754  },
    { slug: "activtrak-alternative",    hub: "activtrak alternative",    vol: 1138 },
    { slug: "teramind-alternative",     hub: "teramind alternative",     vol: 600  },
    { slug: "desktime-alternative",     hub: "desktime alternative",     vol: 950  },
  ];
  for (const a of ALT) D.push({
    owner: "Lokesh", cluster: "vs / Alternative pages (BoF)", type: "page", format: "alternative-page",
    hubKw: a.hub, url: `/alternative/${a.slug}`, isNew: true,
    hubPageToLink: `/alternative/${a.slug}`, priority: "Critical", volumeTargeted: a.vol,
    source: "100K plan + pulled forward", durationDays: DURATION_DAYS["alternative-page"],
  });
  // Lokesh: homepage retarget (1)
  D.push({
    owner: "Lokesh", cluster: "Employee Monitoring Software (head)", type: "page",
    format: "homepage-retarget", hubKw: "employee monitoring software", url: "/",
    isNew: false, hubPageToLink: "/", priority: "Critical", volumeTargeted: 10000,
    source: "Keyword Gap strategy", durationDays: DURATION_DAYS["homepage-retarget"],
  });

  // Ishika: 5 integration pages
  const INT = [
    { slug: "jira",            tool: "jira",            vol: 3000 },  // big — Jira time-tracking sub-cluster
    { slug: "keka",            tool: "keka",            vol: 200 },
    { slug: "zoho",            tool: "zoho people",     vol: 200 },
    { slug: "greythr",         tool: "greythr",         vol: 100 },
    { slug: "microsoft-teams", tool: "microsoft teams", vol: 200 },
  ];
  for (const i of INT) D.push({
    owner: "Ishika", cluster: "Integration pages (real integrations only)", type: "page",
    format: "integration-page", hubKw: `we360 ${i.tool} integration`,
    url: `/integrations/${i.slug}`, isNew: true,
    hubPageToLink: `/integrations/${i.slug}`, priority: "High", volumeTargeted: i.vol,
    source: "100K plan", durationDays: DURATION_DAYS["integration-page"],
  });

  // Rahul: 5 solution refreshes + 3 industry + 3 India
  const SOL: Array<{ url: string; hub: string; vol: number; cluster: string }> = [
    { url: "/solutions/employee-monitoring",  hub: "employee monitoring software",     vol: 5000, cluster: "Employee Monitoring Software (head)" },
    { url: "/solutions/workforce-analytics",  hub: "workforce analytics software",     vol: 1500, cluster: "Workforce Management & Analytics" },
    { url: "/solutions/time-tracker",         hub: "time tracking software",           vol: 5000, cluster: "Time Tracking & Timesheets" },
    { url: "/attendance-tracking-software",   hub: "attendance management software",   vol: 2500, cluster: "Attendance Management & Leave" },
    { url: "/solutions/field-tracking",       hub: "field employee tracking software", vol: 800,  cluster: "Field Force / GPS Tracking" },
  ];
  for (const s of SOL) D.push({
    owner: "Rahul", cluster: s.cluster, type: "page", format: "solution-page",
    hubKw: s.hub, url: s.url, isNew: false, hubPageToLink: s.url,
    priority: s.vol >= 5000 ? "Critical" : "High", volumeTargeted: s.vol,
    source: "100K plan", durationDays: DURATION_DAYS["solution-page"],
  });
  // Rahul: 3 India pages + 3 industry pages
  const INDIA = [
    { slug: "employee-monitoring-software-india", hub: "employee monitoring software india", vol: 1000 },
    { slug: "attendance-tracking-software-india", hub: "attendance tracking software india", vol: 800  },
    { slug: "wfh-tracking-software-india",        hub: "wfh tracking software india",        vol: 550  },
  ];
  for (const i of INDIA) D.push({
    owner: "Rahul", cluster: "India-specific (DPDPA, ESI, PF, INR)", type: "page",
    format: "india-page", hubKw: i.hub, url: `/in/${i.slug}`, isNew: true,
    hubPageToLink: `/in/${i.slug}`, priority: "High", volumeTargeted: i.vol,
    source: "100K plan", durationDays: DURATION_DAYS["india-page"],
  });
  const IND = [
    { slug: "bpo",         hub: "employee monitoring bpo",         vol: 600 },
    { slug: "it-services", hub: "employee monitoring it services", vol: 400 },
    { slug: "banking",     hub: "employee monitoring banking",     vol: 300 },
  ];
  for (const i of IND) D.push({
    owner: "Rahul", cluster: "Industry pages (vertical landing)", type: "page",
    format: "industry-page", hubKw: i.hub, url: `/industries/${i.slug}`, isNew: true,
    hubPageToLink: `/industries/${i.slug}`, priority: "Medium", volumeTargeted: i.vol,
    source: "100K plan", durationDays: DURATION_DAYS["industry-page"],
  });

  // Freelancer-1: 2 feature pillars (Productivity Tracking + Screen Recording)
  D.push({
    owner: "Freelancer-1", cluster: "Productivity Tracking & Monitoring", type: "page",
    format: "feature-pillar", hubKw: "productivity tracking software",
    url: "/features/productivity-tracking", isNew: false,
    hubPageToLink: "/features/productivity-tracking", priority: "Critical",
    volumeTargeted: 1500, source: "100K plan",
    durationDays: DURATION_DAYS["feature-pillar"],
  });
  D.push({
    owner: "Freelancer-1", cluster: "Screen Recording / Live Monitoring", type: "page",
    format: "feature-pillar", hubKw: "screen monitoring software",
    url: "/features/screen-recording", isNew: false,
    hubPageToLink: "/features/screen-recording", priority: "High",
    volumeTargeted: 1750, source: "100K plan",
    durationDays: DURATION_DAYS["feature-pillar"],
  });

  // Freelancer-2: 2 feature pillars (Activity Monitoring + Agentic AI)
  D.push({
    owner: "Freelancer-2", cluster: "Activity Monitoring (Apps & URLs)", type: "page",
    format: "feature-pillar", hubKw: "activity monitoring software",
    url: "/features/activity-tracking", isNew: false,
    hubPageToLink: "/features/activity-tracking", priority: "Medium",
    volumeTargeted: 800, source: "100K plan",
    durationDays: DURATION_DAYS["feature-pillar"],
  });
  D.push({
    owner: "Freelancer-2", cluster: "Agentic AI / AI for Workforce", type: "page",
    format: "feature-pillar", hubKw: "ai productivity software",
    url: "/features/agentic-ai", isNew: false,
    hubPageToLink: "/features/agentic-ai", priority: "High",
    volumeTargeted: 1500, source: "100K plan",
    durationDays: DURATION_DAYS["feature-pillar"],
  });

  // 2b. UNIQUE-ANGLE BLOGS (30 from Topical Authority strategy)
  const UA = [
    // Agentic AI cluster (5)
    { kw: "agentic ai employee monitoring",            vol: 450,  format: "pillar-blog" as const,       hub: "/features/agentic-ai" },
    { kw: "ai workforce recommendations",              vol: 450,  format: "cluster-blog" as const,      hub: "/features/agentic-ai" },
    { kw: "ai vs traditional monitoring",              vol: 300,  format: "cluster-blog" as const,      hub: "/features/agentic-ai" },
    { kw: "future of workforce management ai",         vol: 600,  format: "pillar-blog" as const,       hub: "/features/agentic-ai" },
    { kw: "ai productivity risk detection",            vol: 225,  format: "definitional-blog" as const, hub: "/features/agentic-ai" },
    // Cost Intelligence cluster (5)
    { kw: "cost of unproductive employees",            vol: 750,  format: "pillar-blog" as const,       hub: "/features/cost-intelligence" },
    { kw: "employee monitoring roi",                   vol: 450,  format: "how-to-blog" as const,       hub: "/features/cost-intelligence" },
    { kw: "employee cost calculator",                  vol: 900,  format: "how-to-blog" as const,       hub: "/features/cost-intelligence" },
    { kw: "workforce cost optimisation india",         vol: 300,  format: "cluster-blog" as const,      hub: "/features/cost-intelligence" },
    { kw: "cost intelligence employee monitoring",     vol: 225,  format: "definitional-blog" as const, hub: "/features/cost-intelligence" },
    // Field Force India (5)
    { kw: "field employee gps tracking india",         vol: 750,  format: "pillar-blog" as const,       hub: "/solutions/field-tracking" },
    { kw: "fmcg field force tracking india",           vol: 300,  format: "cluster-blog" as const,      hub: "/solutions/field-tracking" },
    { kw: "gps attendance field staff india",          vol: 600,  format: "how-to-blog" as const,       hub: "/solutions/field-tracking" },
    { kw: "field force management software india",     vol: 750,  format: "listicle" as const,          hub: "/solutions/field-tracking" },
    { kw: "manage field employees multiple cities india", vol: 300, format: "how-to-blog" as const,    hub: "/solutions/field-tracking" },
    // Livestream Monitoring (5)
    { kw: "live screen monitoring software",           vol: 900,  format: "pillar-blog" as const,       hub: "/features/screen-recording" },
    { kw: "employee live monitoring ethics",           vol: 450,  format: "how-to-blog" as const,       hub: "/features/screen-recording" },
    { kw: "livestream vs screenshot monitoring",       vol: 300,  format: "cluster-blog" as const,      hub: "/features/screen-recording" },
    { kw: "real time monitoring bpo india",            vol: 250,  format: "cluster-blog" as const,      hub: "/features/screen-recording" },
    { kw: "employee monitoring compliance india",      vol: 450,  format: "pillar-blog" as const,       hub: "/security-and-compliance" },
    // Technology Usage / SaaS (5)
    { kw: "shadow it india",                           vol: 450,  format: "cluster-blog" as const,      hub: "/features/technology-usage" },
    { kw: "reduce saas costs employee monitoring",     vol: 600,  format: "how-to-blog" as const,       hub: "/features/technology-usage" },
    { kw: "technology adoption analytics hr",          vol: 300,  format: "cluster-blog" as const,      hub: "/features/technology-usage" },
    { kw: "saas stack optimisation",                   vol: 750,  format: "pillar-blog" as const,       hub: "/features/technology-usage" },
    { kw: "unused software detection",                 vol: 300,  format: "definitional-blog" as const, hub: "/features/technology-usage" },
    // Multi-Location Productivity (5)
    { kw: "compare productivity multiple offices",     vol: 600,  format: "pillar-blog" as const,       hub: "/features/location-performance" },
    { kw: "multi city workforce analytics india",      vol: 250,  format: "cluster-blog" as const,      hub: "/features/location-performance" },
    { kw: "office vs wfh productivity india",          vol: 1100, format: "pillar-blog" as const,       hub: "/features/location-performance" },
    { kw: "location performance analytics india",      vol: 225,  format: "cluster-blog" as const,      hub: "/features/location-performance" },
    { kw: "benchmark team performance india offices",  vol: 225,  format: "cluster-blog" as const,      hub: "/features/location-performance" },
  ];
  // Distribute unique-angle blogs evenly between F1 and F2
  UA.forEach((u, i) => {
    const owner: Owner = i % 2 === 0 ? "Freelancer-1" : "Freelancer-2";
    D.push({
      owner, cluster: "Unique-angle blog cluster", type: "blog", format: u.format,
      hubKw: u.kw, url: `/blog/${slugify(u.kw)}`, isNew: true,
      hubPageToLink: u.hub,
      priority: u.vol >= 600 ? "High" : "Medium", volumeTargeted: u.vol,
      source: "Topical Authority — Unique Angles",
      durationDays: DURATION_DAYS[u.format],
    });
  });

  // 2c. STRIKING-DISTANCE UPDATE BLOGS (Moz curated 19 + top from All-Ranking pool)
  // Total target: 80 update blogs/month × 2 months = 160. SDR pool = 19 + ~150 = ~169 candidates.
  // Cap at 160. Distribute across owners (Lokesh now picks up blog work).
  const sdrAll = [...sdrCurated, ...sdrPool].slice(0, 160);  // up to 160 update-blog candidates
  console.log(`  Total SDR candidates available: ${sdrAll.length}`);

  // Round-robin allocate update-blogs across owners with weights:
  //   Freelancer-1: 30%, Freelancer-2: 30%, Lokesh: 20%, Rahul: 12%, Ishika: 8%
  const ownerWeights: Array<[Owner, number]> = [
    ["Freelancer-1", 30],
    ["Freelancer-2", 30],
    ["Lokesh",       20],
    ["Rahul",        12],
    ["Ishika",       8],
  ];
  const ownerQueue: Owner[] = [];
  for (const [o, w] of ownerWeights) for (let i = 0; i < w; i++) ownerQueue.push(o);

  for (let i = 0; i < sdrAll.length; i++) {
    const sdr = sdrAll[i];
    const owner = ownerQueue[i % 100];
    D.push({
      owner, cluster: "Update existing blog (striking-distance refresh)", type: "blog",
      format: "update-blog", hubKw: sdr.keyword,
      url: `(use GSC URL Inspection to find ranking URL for "${sdr.keyword}")`,
      isNew: false, hubPageToLink: "/solutions/employee-monitoring",
      priority: sdr.lift >= 10 ? "High" : sdr.vol >= 1000 ? "High" : "Medium",
      volumeTargeted: sdr.vol,
      source: i < sdrCurated.length ? "Moz SDR (curated)" : "Moz All-Ranking (pos 11-30)",
      durationDays: DURATION_DAYS["update-blog"],
    });
  }

  // 2d. SUPPORTING BLOGS for vs / alt / integration pages (10 vs supports + 5 alt + 5 int)
  const VS_SUPPORT = [
    { hub: "switching from hubstaff to we360",          vol: 200, hubPage: "/vs/we360-vs-hubstaff" },
    { hub: "why teams switch from time doctor",         vol: 200, hubPage: "/vs/we360-vs-time-doctor" },
    { hub: "teramind pricing analysis",                 vol: 200, hubPage: "/vs/we360-vs-teramind" },
    { hub: "activtrak privacy concerns",                vol: 200, hubPage: "/vs/we360-vs-activtrak" },
    { hub: "desktime vs we360 features",                vol: 200, hubPage: "/vs/we360-vs-desktime" },
  ];
  for (const v of VS_SUPPORT) D.push({
    owner: "Lokesh", cluster: "vs supporting blogs", type: "blog", format: "cluster-blog",
    hubKw: v.hub, url: `/blog/${slugify(v.hub)}`, isNew: true,
    hubPageToLink: v.hubPage, priority: "Medium", volumeTargeted: v.vol,
    source: "Net-new (vs support)", durationDays: DURATION_DAYS["cluster-blog"],
  });
  // Integration supporting blog (Jira already has volume)
  D.push({
    owner: "Ishika", cluster: "Integration supporting blogs", type: "blog", format: "cluster-blog",
    hubKw: "jira time tracking guide", url: "/blog/jira-time-tracking-guide", isNew: true,
    hubPageToLink: "/integrations/jira", priority: "Medium", volumeTargeted: 500,
    source: "Net-new (integration support)", durationDays: DURATION_DAYS["cluster-blog"],
  });

  console.log(`\nTotal deliverables generated: ${D.length}`);

  // -------------------------------------------------------------------------
  // 3. Schedule day-by-day (Mon-Fri, May 4 → June 26)
  // -------------------------------------------------------------------------
  const ownerCursor: Record<Owner, Date> = {
    "Lokesh": new Date("2026-05-04"),
    "Ishika": new Date("2026-05-04"),  // start blogs in May, integrations in June
    "Rahul":  new Date("2026-05-04"),
    "Freelancer-1": new Date("2026-05-04"),
    "Freelancer-2": new Date("2026-05-04"),
  };
  function nextWorkday(d: Date): Date {
    const out = new Date(d);
    while (out.getDay() === 0 || out.getDay() === 6) out.setDate(out.getDate() + 1);
    return out;
  }
  function addWorkdays(d: Date, days: number): Date {
    const out = new Date(d);
    let added = 0;
    const target = Math.max(1, Math.ceil(days));
    while (added < target) {
      out.setDate(out.getDate() + 1);
      if (out.getDay() !== 0 && out.getDay() !== 6) added++;
    }
    return out;
  }
  function fmt(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  // Sort each owner's queue: Critical pages first, then High, then Medium blogs, then update-blogs
  const PRIO: Record<Deliverable["priority"], number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const owners: Owner[] = ["Lokesh", "Ishika", "Rahul", "Freelancer-1", "Freelancer-2"];
  const lastDay = new Date("2026-06-26");
  let scheduled = 0, dropped = 0;
  for (const o of owners) {
    const queue = D.filter((d) => d.owner === o)
      .sort((a, b) => PRIO[a.priority] - PRIO[b.priority]
                  || (a.type === "page" ? 0 : 1) - (b.type === "page" ? 0 : 1)
                  || b.volumeTargeted - a.volumeTargeted);
    for (const d of queue) {
      const start = nextWorkday(ownerCursor[o]);
      if (start > lastDay) {
        // Capacity exhausted — drop remaining (per user direction: stop, don't pad)
        d.startDate = "(out of scope — beyond June 26)";
        d.endDate = "";
        dropped++;
        continue;
      }
      const end = addWorkdays(start, d.durationDays - 1);
      d.startDate = fmt(start);
      d.endDate = fmt(end);
      ownerCursor[o] = nextWorkday(addWorkdays(start, d.durationDays));
      scheduled++;
    }
  }
  console.log(`\nScheduled: ${scheduled} (dropped beyond June 26: ${dropped})`);

  // Generate briefs
  const briefs = D.map((d) => generateBrief(d, allKws));

  // -------------------------------------------------------------------------
  // 4. Write XLSX with multiple tabs
  // -------------------------------------------------------------------------
  const out = new ExcelJS.Workbook();

  // ===== TAB 1: Calendar (Daily) =====
  const wsCal = out.addWorksheet("Calendar (Daily)");
  wsCal.columns = [
    { header: "Date",          key: "date",         width: 12 },
    { header: "Day",           key: "day",          width: 8  },
    { header: "Lokesh",        key: "Lokesh",       width: 50 },
    { header: "Ishika",        key: "Ishika",       width: 50 },
    { header: "Rahul",         key: "Rahul",        width: 50 },
    { header: "Freelancer-1",  key: "Freelancer-1", width: 50 },
    { header: "Freelancer-2",  key: "Freelancer-2", width: 50 },
  ];
  styleHeader(wsCal);
  wsCal.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
  let cursor = new Date("2026-05-04");
  while (cursor <= lastDay) {
    if (cursor.getDay() === 0 || cursor.getDay() === 6) { cursor.setDate(cursor.getDate() + 1); continue; }
    const dStr = fmt(cursor);
    const cell: Record<string, string> = {
      date: dStr,
      day: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][cursor.getDay()],
    };
    for (const o of owners) {
      const active = D.filter((d) => d.owner === o && d.startDate && d.endDate
        && dStr >= d.startDate && dStr <= d.endDate);
      cell[o] = active.map((d) => `${d.format} · ${d.hubKw}`.slice(0, 80)).join("\n") || "";
    }
    const r = wsCal.addRow(cell);
    r.alignment = { vertical: "top", wrapText: true };
    r.height = 50;
    if (cursor.getDay() === 1) r.getCell("date").fill = solid("FFEDE9FE");
    cursor.setDate(cursor.getDate() + 1);
  }

  // ===== TAB 2: All Deliverables (master sheet for SEO lead) =====
  writeBriefTab(out, "All Deliverables", D, briefs);

  // ===== TABS 3-7: Per-owner =====
  for (const o of owners) {
    const ownerItems = D.filter((d) => d.owner === o);
    const ownerBriefs = ownerItems.map((d) => generateBrief(d, allKws));
    writeBriefTab(out, `${o}'s Queue`, ownerItems, ownerBriefs);
  }

  // ===== TAB 8: Hub-and-Spoke Maps (FIXED linking — per blog) =====
  const wsHub = out.addWorksheet("Hub-and-Spoke Maps");
  wsHub.columns = [{ header: "Cluster diagram", key: "diag", width: 130 }];
  styleHeader(wsHub);
  const byCluster = new Map<string, Deliverable[]>();
  for (const d of D) {
    if (!byCluster.has(d.cluster)) byCluster.set(d.cluster, []);
    byCluster.get(d.cluster)!.push(d);
  }
  for (const [cluster, items] of byCluster.entries()) {
    const pages = items.filter((d) => d.type === "page");
    const blogs = items.filter((d) => d.type === "blog");
    let diag = `╔═══════════════════════════════════════════════════════════════════════╗\n`;
    diag += `║  CLUSTER: ${cluster.slice(0, 60).padEnd(60)}     ║\n`;
    diag += `╚═══════════════════════════════════════════════════════════════════════╝\n\n`;
    if (pages.length > 0) {
      diag += `   HUB PAGE${pages.length > 1 ? "S" : ""} (highest priority):\n`;
      for (const p of pages) {
        diag += `   ┌─ ${p.url}\n`;
        diag += `   │  ← ${p.hubKw}  (${p.volumeTargeted.toLocaleString()} vol/mo)\n`;
        diag += `   │  Owner: ${p.owner}  ·  ${p.startDate} → ${p.endDate}  ·  ${p.format}  ·  ${WORD_COUNTS[p.format]}w\n`;
      }
      diag += `\n`;
    }
    if (blogs.length > 0) {
      diag += `   SUPPORTING BLOG${blogs.length > 1 ? "S" : ""} — each links UP to its OWN hub page (NOT a single shared hub):\n\n`;
      for (const b of blogs) {
        diag += `       ↑  ${b.hubKw}  (${b.volumeTargeted.toLocaleString()} vol/mo)\n`;
        diag += `          → ${b.url}\n`;
        diag += `          ┗━ links UP to: ${b.hubPageToLink}\n`;
        diag += `          Owner: ${b.owner}  ·  ${b.startDate} → ${b.endDate}  ·  ${b.format}  ·  ${WORD_COUNTS[b.format]}w\n\n`;
      }
    }
    const r = wsHub.addRow({ diag });
    r.alignment = { vertical: "top", wrapText: true };
    r.height = Math.max(60, 18 + (pages.length * 28) + (blogs.length * 50));
    r.font = { name: "Consolas", size: 10 };
  }

  // ===== TAB 9: vs vs Alternative — Template Differentiation =====
  const wsTpl = out.addWorksheet("vs vs Alt Templates");
  wsTpl.columns = [
    { header: "Aspect",                key: "aspect", width: 22 },
    { header: "vs Page (e.g. /vs/we360-vs-hubstaff)", key: "vs",  width: 60 },
    { header: "Alternative Page (e.g. /alternative/hubstaff-alternative)", key: "alt", width: 60 },
  ];
  styleHeader(wsTpl);
  const TPL: Array<{ aspect: string; vs: string; alt: string }> = [
    { aspect: "Searcher intent",
      vs:  "Already evaluating BOTH tools, comparing 2-by-2 (shortlisted to 2)",
      alt: "Knows ONE competitor, wants to see ALTERNATIVES (a list of 5-8)" },
    { aspect: "Search query",
      vs:  "'we360 vs hubstaff', 'hubstaff vs we360'",
      alt: "'hubstaff alternative', 'best hubstaff alternatives 2026', 'alternatives to hubstaff'" },
    { aspect: "Volume range",
      vs:  "100-1,500/mo (forward bet for new comparisons)",
      alt: "500-2,000/mo (proven demand)" },
    { aspect: "Content format",
      vs:  "Head-to-head 2-tool comparison",
      alt: "Listicle of 5-8 tools (We360 ranked #1)" },
    { aspect: "Page structure",
      vs:  "1) 60-word verdict\n2) 10-15 row comparison table (2 columns)\n3) Use-case sections (privacy / India / BPO / pricing)\n4) Pros/Cons split per side\n5) Final verdict\n6) Demo CTA + free trial CTA",
      alt: "1) 'Why teams switch from <Comp>' opener\n2) 5-8 alternatives ranked\n3) Per-tool block (features / price / best for / pros/cons)\n4) Comparison matrix at end\n5) 'Switch today' CTA" },
    { aspect: "Tone",
      vs:  "Balanced, fact-based — 'here's where each tool wins'",
      alt: "Persuasive, We360-favored — 'here's why teams switch'" },
    { aspect: "Word count",
      vs:  "~2,300 words",
      alt: "~2,300 words (more sections but shorter each)" },
    { aspect: "Schema",
      vs:  "Product + FAQPage + BreadcrumbList",
      alt: "ItemList + FAQPage + BreadcrumbList" },
    { aspect: "CTA",
      vs:  "'Book demo to see We360 vs <Comp> live'",
      alt: "'Start free trial — switch from <Comp> in 30 days'" },
    { aspect: "Internal linking",
      vs:  "Links to related /alternative/<comp>-alternative page",
      alt: "Links to specific /vs/we360-vs-<top-pick> page" },
  ];
  for (const r of TPL) {
    const row = wsTpl.addRow(r);
    row.alignment = { vertical: "top", wrapText: true };
    row.height = 80;
    row.getCell("aspect").font = { bold: true };
  }

  // ===== TAB 10: FAQ Keyword Bank (per existing page) =====
  const wsFaq = out.addWorksheet("FAQ Keyword Bank");
  wsFaq.columns = [
    { header: "Existing page",    key: "page",    width: 50 },
    { header: "Cluster",          key: "cluster", width: 40 },
    { header: "FAQ question (H3)", key: "q",      width: 70 },
    { header: "Vol/mo",           key: "vol",     width: 10 },
    { header: "Suggested answer angle (80 words)", key: "ans", width: 70 },
  ];
  styleHeader(wsFaq);
  wsFaq.views = [{ state: "frozen", ySplit: 1 }];
  const PAGE_TO_CLUSTERS: Record<string, string[]> = {};
  for (const d of D) {
    if (!PAGE_TO_CLUSTERS[d.hubPageToLink]) PAGE_TO_CLUSTERS[d.hubPageToLink] = [];
    if (!PAGE_TO_CLUSTERS[d.hubPageToLink].includes(d.cluster)) PAGE_TO_CLUSTERS[d.hubPageToLink].push(d.cluster);
  }
  for (const [page, clusters] of Object.entries(PAGE_TO_CLUSTERS)) {
    for (const cluster of clusters) {
      const qPat = /^(how|what|why|when|where|which|who|is|are|do|does|can)\b/i;
      const candidates = allKws
        .filter((k) => k.cluster === cluster && qPat.test(k.keyword) && k.volume < 300 && k.score >= 1)
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 4);
      for (const c of candidates) {
        wsFaq.addRow({
          page, cluster,
          q: questionize(c.keyword), vol: c.volume,
          ans: deriveAnswerAngle(c.keyword),
        });
      }
    }
  }
  wsFaq.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 } };

  await out.xlsx.writeFile(DEST);
  console.log(`\n✅ Wrote ${DEST}\n`);

  // Console summary
  console.log("=== WORKLOAD BY OWNER ===\n");
  for (const o of owners) {
    const items = D.filter((d) => d.owner === o);
    const sched = items.filter((d) => d.startDate && !d.startDate.startsWith("(out"));
    const dropped = items.length - sched.length;
    const pages = items.filter((d) => d.type === "page").length;
    const blogs = items.filter((d) => d.type === "blog").length;
    const days = sched.reduce((s, d) => s + d.durationDays, 0);
    const lastEnd = sched.map((d) => d.endDate || "").sort().pop() ?? "—";
    console.log(`  ${o.padEnd(15)} ${items.length} total (${pages}p + ${blogs}b)  ·  scheduled: ${sched.length}  ·  dropped: ${dropped}  ·  ~${days.toFixed(0)} person-days  ·  last ends: ${lastEnd}`);
  }
  console.log(`\n  Calendar window: 2026-05-04 → 2026-06-26 (40 working days × 5 owners = 200 person-days)`);
  const totalNeeded = D.filter((d) => !d.startDate?.startsWith("(out")).reduce((s, d) => s + d.durationDays, 0);
  console.log(`  Total person-days needed (scheduled): ${totalNeeded.toFixed(0)} of 200 available  (${((totalNeeded / 200) * 100).toFixed(0)}% utilization)`);
}

function writeBriefTab(wb: ExcelJS.Workbook, tabName: string, items: Deliverable[], briefs: Brief[]) {
  const ws = wb.addWorksheet(tabName);
  ws.columns = [
    { header: "#",                                key: "n",       width: 5  },
    { header: "Owner",                            key: "owner",   width: 14 },
    { header: "Start",                            key: "start",   width: 12 },
    { header: "End",                              key: "end",     width: 12 },
    { header: "Days",                             key: "days",    width: 7  },
    { header: "Priority",                         key: "prio",    width: 10 },
    { header: "Type",                             key: "type",    width: 8  },
    { header: "Format",                           key: "format",  width: 18 },
    { header: "Words",                            key: "words",   width: 9  },
    { header: "URL",                              key: "url",     width: 50 },
    { header: "Hub keyword (H1 target)",          key: "hub",     width: 38 },
    { header: "Volume",                           key: "vol",     width: 11 },
    { header: "Source",                           key: "source",  width: 24 },
    { header: "Proposed H1",                      key: "h1",      width: 50 },
    { header: "H2 sections (5-7)",                key: "h2",      width: 90 },
    { header: "H3 subsections (8-12)",            key: "h3",      width: 90 },
    { header: "FAQ questions (4-6)",              key: "faq",     width: 90 },
    { header: "Body keywords (15-20)",            key: "body",    width: 90 },
    { header: "Cluster",                          key: "cluster", width: 40 },
    { header: "Hub page to link UP to",           key: "link",    width: 38 },
  ];
  styleHeader(ws);
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 6 }];
  items.forEach((d, i) => {
    const b = briefs[i];
    const row = ws.addRow({
      n: i + 1, owner: d.owner, start: d.startDate, end: d.endDate, days: d.durationDays,
      prio: d.priority, type: d.type.toUpperCase(), format: d.format, words: b.wordCount,
      url: d.url, hub: d.hubKw, vol: d.volumeTargeted, source: d.source, h1: b.h1,
      h2: b.h2s.length > 0 ? b.h2s.map((h, n) => `${n + 1}. ${h}`).join("\n") : "(write manually — no good cluster matches)",
      h3: b.h3s.length > 0 ? b.h3s.map((h, n) => `${n + 1}. ${h}`).join("\n") : "(write manually)",
      faq: b.faqs.length > 0 ? b.faqs.map((q, n) => `Q${n + 1}: ${q}`).join("\n") : "(write 4 FAQs manually)",
      body: b.bodyKws.join(", "),
      cluster: d.cluster, link: d.hubPageToLink,
    });
    row.alignment = { vertical: "top", wrapText: true };
    row.height = 180;
    const prioCell = row.getCell("prio");
    if (d.priority === "Critical") { prioCell.fill = solid("FFFEE2E2"); prioCell.font = { bold: true, color: { argb: "FF991B1B" } }; }
    else if (d.priority === "High") { prioCell.fill = solid("FFFEF3C7"); prioCell.font = { bold: true, color: { argb: "FF92400E" } }; }
    const ownerCell = row.getCell("owner");
    ownerCell.font = { bold: true };
    if (d.owner === "Lokesh") ownerCell.fill = solid("FFEDE9FE");
    else if (d.owner === "Ishika") ownerCell.fill = solid("FFD1FAE5");
    else if (d.owner === "Rahul") ownerCell.fill = solid("FFFEF3C7");
    else if (d.owner === "Freelancer-1") ownerCell.fill = solid("FFE0E7FF");
    else if (d.owner === "Freelancer-2") ownerCell.fill = solid("FFFCE7F3");
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 20 } };
}

function deriveAnswerAngle(kw: string): string {
  const k = kw.toLowerCase();
  if (k.startsWith("how to")) return "Step-by-step (3-5 steps), each step ≤2 sentences. End with CTA to relevant feature.";
  if (k.startsWith("what is")) return "Definition first sentence (≤25 words), expansion (2-3 sentences), 1 example, link to feature page.";
  if (k.startsWith("why")) return "Single causal reason in opening, 2-3 bullets, link to product feature that solves it.";
  if (k.startsWith("when")) return "Decision criteria: '__ when X', '__ when Y'. Tie to use case + product.";
  return "60-80 word direct answer, natural language. Wrap in FAQPage JSON-LD schema.";
}

function styleHeader(ws: ExcelJS.Worksheet) {
  const hr = ws.getRow(1);
  hr.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF231D4F" } };
  hr.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  hr.height = 30;
}
function solid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

main().catch((e) => { console.error(e); process.exit(1); });
