#!/usr/bin/env tsx
/**
 * Master Content Brief — full per-deliverable plan with daily schedule.
 *
 * Reads:  C:/Users/HP/Downloads/New Keywords - 100K Plan + Team Allocation.xlsx
 *           - Useful Keywords (2,139 rows with volume + cluster + score)
 *           - Strategic Clusters
 * Writes: C:/Users/HP/Downloads/Master Content Brief.xlsx
 *           - Calendar (daily Mon-Fri, May 4 → June 26)
 *           - Per-Deliverable Brief (every page/blog with H1/H2/H3/FAQ/body kws)
 *           - Hub-and-Spoke Maps (visual cluster diagrams)
 *           - FAQ Keyword Bank (per existing page)
 *
 * Volume tiers (per 25-yr SEO expert call):
 *   ≥10K commercial → landing page
 *   5K-10K          → big pillar blog OR page
 *   1K-5K           → own cluster blog
 *   500-999         → blog OR H2 section
 *   300-499         → H2 section on hub page
 *   <300            → FAQ entry on hub page
 *
 * Word counts vary by format — see WORD_COUNTS below.
 */

import ExcelJS from "exceljs";

const SRC  = "C:/Users/HP/Downloads/New Keywords - 100K Plan + Team Allocation.xlsx";
const DEST = "C:/Users/HP/Downloads/Master Content Brief.xlsx";

// =============================================================================
// 1. Word counts by format (2026 SEO best practice)
// =============================================================================

const WORD_COUNTS: Record<string, number> = {
  "listicle":           2200,  // "Best X 2026"
  "pillar-blog":        2700,  // 2,500-3,000 range, mid
  "cluster-blog":       1650,  // 1,500-1,800
  "definitional-blog":  1350,  // 1,200-1,500 (AIO-optimized)
  "how-to-blog":        2000,  // 1,800-2,200
  "vs-page":            2300,  // 2,200-2,500
  "alternative-page":   2300,
  "solution-page":      2700,  // 2,500-3,000 hub
  "integration-page":   1700,  // 1,500-2,000
  "feature-pillar":     2700,  // 2,500-3,000
  "new-feature-page":   2200,
  "homepage-retarget":  1500,  // hero + answer-capsule + sections
};

// =============================================================================
// 2. Owner queue + duration heuristics
// =============================================================================

type Owner = "Lokesh" | "Ishika" | "Rahul" | "Freelancer-1" | "Freelancer-2";

const DURATION_DAYS: Record<string, number> = {
  "vs-page":              3,   // research + table + draft
  "alternative-page":     3,
  "solution-page":        4,   // big refresh
  "integration-page":     3,
  "feature-pillar":       4,
  "new-feature-page":     3,
  "homepage-retarget":    2,
  "pillar-blog":          2,
  "listicle":             2,
  "cluster-blog":         1,
  "definitional-blog":    1,
  "how-to-blog":          1.5,
};

// =============================================================================
// 3. Read keyword data + cluster mapping
// =============================================================================

interface KW { keyword: string; volume: number; cluster: string; score: number; serpFeatures: string }

interface Deliverable {
  owner: Owner;
  cluster: string;
  type: "page" | "blog";
  format: keyof typeof WORD_COUNTS;
  hubKw: string;
  url: string;             // existing or new slug
  isNew: boolean;
  hubPageToLink: string;   // for blog deliverables — which hub page they link to
  priority: "Critical" | "High" | "Medium" | "Low";
  volumeTargeted: number;
  startDate?: string;      // assigned later
  endDate?: string;
  durationDays: number;
}

interface Brief {
  h1: string;
  h2s: string[];           // 5-7
  h3s: string[];           // 8-12
  faqs: string[];           // 4-6 (formatted as questions)
  bodyKws: string[];       // 15-20
  wordCount: number;
}

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

// =============================================================================
// 4. Brief generator (H1/H2/H3/FAQ from real keyword data)
// =============================================================================

const STOP = new Set(["the","a","an","of","for","to","and","with","in","on","at","by","is","are","was","were","be","best","top","how","what","why","when","where","which","who","do","does","can","i","my","your","our","you","we"]);

function tokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((t) => t.length >= 3 && !STOP.has(t))
  );
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
  // Auto-prefix
  if (/^(track|monitor|measure|reduce|improve|calculate|implement|set\s*up)/i.test(k)) {
    return "How do you " + k + "?";
  }
  return "What is " + k + "?";
}

function generateBrief(d: Deliverable, allKws: KW[]): Brief {
  const targetTokens = tokens(d.hubKw);
  // Same-cluster candidates with topical overlap
  const inCluster = allKws.filter((k) => k.cluster === d.cluster && k.keyword !== d.hubKw && k.score >= 1);
  const ranked = inCluster.map((k) => ({ kw: k, overlap: jaccard(tokens(k.keyword), targetTokens), vol: k.volume }))
    .map((x) => ({ ...x, score: x.overlap * 200 + Math.log10(x.vol + 1) * 20 }))
    .sort((a, b) => b.score - a.score);

  // FAQ: filter for question-shaped queries within cluster
  const qPat = /^(how|what|why|when|where|which|who|is|are|do|does|can)\b/i;
  const faqRanked = inCluster.filter((k) => qPat.test(k.keyword)).sort((a, b) => b.volume - a.volume);

  // H2: top 7 by combined overlap+volume
  const h2s = ranked.slice(0, 7).map((x) => titleCase(x.kw.keyword));
  // H3: next 12 (varied long-tails)
  const h3s = ranked.slice(7, 19).map((x) => titleCase(x.kw.keyword));
  // FAQ: top 6 question-shaped
  const faqs = faqRanked.slice(0, 6).map((k) => questionize(k.keyword));
  // Body kws: another 20 from rank 19+
  const bodyKws = ranked.slice(19, 39).map((x) => x.kw.keyword);

  const wordCount = WORD_COUNTS[d.format] ?? 1500;
  return {
    h1: titleCase(d.hubKw) + (d.format === "listicle" ? " [2026]: Top Tools Compared" : ""),
    h2s, h3s, faqs, bodyKws, wordCount,
  };
}

function titleCase(s: string): string {
  return s.split(/\s+/).map((w) => {
    if (/^(of|for|to|and|the|a|an|in|on|at|by|with|or|nor|but|yet|so|as|vs)$/i.test(w)) return w.toLowerCase();
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(" ").replace(/^./, (c) => c.toUpperCase());
}

// =============================================================================
// 5. Main pipeline
// =============================================================================

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);
  const useful = wb.getWorksheet("Useful Keywords");
  if (!useful) { console.error("Missing Useful Keywords tab"); process.exit(1); }

  // Read keywords
  const colMap: Record<string, number> = {};
  useful.getRow(1).eachCell((cell, n) => { colMap[pickStr(cell.value).toLowerCase()] = n; });
  const allKws: KW[] = [];
  for (let r = 2; r <= useful.actualRowCount; r++) {
    const row = useful.getRow(r);
    const kw = pickStr(row.getCell(colMap["keyword"]).value);
    if (!kw) continue;
    allKws.push({
      keyword: kw,
      volume: pickNum(row.getCell(colMap["volume / mo"]).value),
      cluster: pickStr(row.getCell(colMap["cluster"]).value),
      score: pickNum(row.getCell(colMap["score (5=direct, 1=weak)"]).value),
      serpFeatures: pickStr(row.getCell(colMap["serp features (lokesh)"]).value),
    });
  }
  console.log(`Loaded ${allKws.length} keywords.`);

  // -------------------------------------------------------------------------
  // 5a. Define deliverables — one per major piece of work
  // Driven by the strategic-clusters team allocation; each cluster expands
  // into a hub page + 3-8 supporting blogs based on volume tiers.
  // -------------------------------------------------------------------------
  const D: Deliverable[] = [];

  // ---- Lokesh — vs/alt pages from the 100K plan + homepage retarget (May-Jun) ----
  const VS_TARGETS = [
    { slug: "we360-vs-hubstaff",  hub: "we360 vs hubstaff",  vol: 1326 },
    { slug: "we360-vs-time-doctor", hub: "we360 vs time doctor", vol: 1282 },
    { slug: "we360-vs-teramind", hub: "we360 vs teramind", vol: 600 },
    { slug: "we360-vs-activtrak", hub: "we360 vs activtrak", vol: 1616 },
    { slug: "we360-vs-desktime", hub: "we360 vs desktime", vol: 950 },
  ];
  for (const v of VS_TARGETS) {
    D.push({
      owner: "Lokesh", cluster: "vs / Alternative pages (BoF buyers comparing tools)",
      type: "page", format: "vs-page",
      hubKw: v.hub, url: `/vs/${v.slug}`, isNew: true,
      hubPageToLink: "/solutions/employee-monitoring",
      priority: "Critical", volumeTargeted: v.vol,
      durationDays: DURATION_DAYS["vs-page"],
    });
  }
  // Homepage retarget (Lokesh's biggest single piece)
  D.push({
    owner: "Lokesh", cluster: "Employee Monitoring Software (head term)",
    type: "page", format: "homepage-retarget",
    hubKw: "employee monitoring software", url: "/", isNew: false,
    hubPageToLink: "/", priority: "Critical", volumeTargeted: 10000,
    durationDays: DURATION_DAYS["homepage-retarget"],
  });

  // ---- Ishika — 5 integration pages (June) ----
  const INT_TARGETS: Array<{ slug: string; tool: string; vol: number }> = [
    { slug: "keka",            tool: "keka",            vol: 200 },
    { slug: "zoho",            tool: "zoho people",     vol: 200 },
    { slug: "greythr",         tool: "greythr",         vol: 100 },
    { slug: "jira",            tool: "jira",            vol: 3000 },  // big — Jira time tracking 500x6
    { slug: "microsoft-teams", tool: "microsoft teams", vol: 200 },
  ];
  for (const i of INT_TARGETS) {
    D.push({
      owner: "Ishika", cluster: "Integration pages (real integrations only)",
      type: "page", format: "integration-page",
      hubKw: `we360 ${i.tool} integration`, url: `/integrations/${i.slug}`, isNew: true,
      hubPageToLink: "/solutions/employee-monitoring",
      priority: "High", volumeTargeted: i.vol,
      durationDays: DURATION_DAYS["integration-page"],
    });
  }
  // 1 supporting blog per high-volume integration (Jira — has the volume)
  D.push({
    owner: "Ishika", cluster: "Integration pages (real integrations only)",
    type: "blog", format: "cluster-blog",
    hubKw: "jira time tracking", url: "/blog/jira-time-tracking-guide", isNew: true,
    hubPageToLink: "/integrations/jira",
    priority: "Medium", volumeTargeted: 500,
    durationDays: DURATION_DAYS["cluster-blog"],
  });

  // ---- Rahul — 5 solution-page refreshes ----
  const SOL_TARGETS: Array<{ url: string; hub: string; vol: number; cluster: string }> = [
    { url: "/solutions/employee-monitoring", hub: "employee monitoring software", vol: 5000,
      cluster: "Employee Monitoring Software (head term)" },
    { url: "/solutions/workforce-analytics", hub: "workforce analytics software",  vol: 1500,
      cluster: "Workforce Management & Analytics" },
    { url: "/solutions/time-tracker",        hub: "time tracking software",         vol: 5000,
      cluster: "Time Tracking & Timesheets" },
    { url: "/attendance-tracking-software",  hub: "attendance management software", vol: 2500,
      cluster: "Attendance Management & Leave" },
    { url: "/solutions/field-tracking",      hub: "field employee tracking software", vol: 800,
      cluster: "Field Force / GPS Tracking" },
  ];
  for (const s of SOL_TARGETS) {
    D.push({
      owner: "Rahul", cluster: s.cluster,
      type: "page", format: "solution-page",
      hubKw: s.hub, url: s.url, isNew: false,
      hubPageToLink: s.url, priority: s.vol >= 5000 ? "Critical" : "High",
      volumeTargeted: s.vol,
      durationDays: DURATION_DAYS["solution-page"],
    });
  }

  // ---- Freelancer-1 — 2 feature pillars + 4 cluster blogs ----
  D.push({
    owner: "Freelancer-1", cluster: "Productivity Tracking & Monitoring",
    type: "page", format: "feature-pillar",
    hubKw: "productivity tracking software", url: "/features/productivity-tracking", isNew: false,
    hubPageToLink: "/features/productivity-tracking",
    priority: "Critical", volumeTargeted: 1500,
    durationDays: DURATION_DAYS["feature-pillar"],
  });
  D.push({
    owner: "Freelancer-1", cluster: "Screen Recording / Live Monitoring",
    type: "page", format: "feature-pillar",
    hubKw: "screen monitoring software", url: "/features/screen-recording", isNew: false,
    hubPageToLink: "/features/screen-recording",
    priority: "High", volumeTargeted: 1750,
    durationDays: DURATION_DAYS["feature-pillar"],
  });
  // Cluster blogs supporting Productivity Tracking
  for (const kw of ["how to track employee productivity", "what is productivity monitoring", "productivity formula", "best productivity tracker"]) {
    D.push({
      owner: "Freelancer-1", cluster: "Productivity Tracking & Monitoring",
      type: "blog", format: kw.startsWith("what is") ? "definitional-blog" : kw.startsWith("how") ? "how-to-blog" : "cluster-blog",
      hubKw: kw, url: `/blog/${kw.replace(/\s+/g, "-")}`, isNew: true,
      hubPageToLink: "/features/productivity-tracking",
      priority: "Medium", volumeTargeted: 1000,
      durationDays: DURATION_DAYS["cluster-blog"],
    });
  }

  // ---- Freelancer-2 — Activity Monitoring + Agentic AI pillars + cluster blogs ----
  D.push({
    owner: "Freelancer-2", cluster: "Activity Monitoring (Apps & URLs)",
    type: "page", format: "feature-pillar",
    hubKw: "activity monitoring software", url: "/features/activity-tracking", isNew: false,
    hubPageToLink: "/features/activity-tracking",
    priority: "Medium", volumeTargeted: 800,
    durationDays: DURATION_DAYS["feature-pillar"],
  });
  D.push({
    owner: "Freelancer-2", cluster: "Agentic AI / AI for Workforce",
    type: "page", format: "feature-pillar",
    hubKw: "ai productivity software", url: "/features/agentic-ai", isNew: false,
    hubPageToLink: "/features/agentic-ai",
    priority: "High", volumeTargeted: 1500,
    durationDays: DURATION_DAYS["feature-pillar"],
  });
  for (const kw of ["how to track employee internet usage", "website monitoring for employees", "what is application usage tracking"]) {
    D.push({
      owner: "Freelancer-2", cluster: "Activity Monitoring (Apps & URLs)",
      type: "blog", format: kw.startsWith("what") ? "definitional-blog" : kw.startsWith("how") ? "how-to-blog" : "cluster-blog",
      hubKw: kw, url: `/blog/${kw.replace(/\s+/g, "-")}`, isNew: true,
      hubPageToLink: "/features/activity-tracking",
      priority: "Medium", volumeTargeted: 1500,
      durationDays: DURATION_DAYS[kw.startsWith("what") ? "definitional-blog" : kw.startsWith("how") ? "how-to-blog" : "cluster-blog"],
    });
  }
  for (const kw of ["agentic ai employee monitoring", "ai workforce recommendations", "ai vs traditional monitoring"]) {
    D.push({
      owner: "Freelancer-2", cluster: "Agentic AI / AI for Workforce",
      type: "blog", format: kw.startsWith("ai vs") ? "cluster-blog" : "pillar-blog",
      hubKw: kw, url: `/blog/${kw.replace(/\s+/g, "-")}`, isNew: true,
      hubPageToLink: "/features/agentic-ai",
      priority: "High", volumeTargeted: 450,
      durationDays: DURATION_DAYS[kw.startsWith("ai vs") ? "cluster-blog" : "pillar-blog"],
    });
  }

  // ---- Freelancers (split) — 3 blog clusters ----
  // Engagement / Retention / Attrition (50K head!)
  const ENG_BLOGS: Array<{ kw: string; vol: number; format: keyof typeof WORD_COUNTS; owner: Owner }> = [
    { kw: "engaged employees",                  vol: 50000, format: "pillar-blog",        owner: "Freelancer-1" },
    { kw: "what is employee engagement",        vol: 1000,  format: "definitional-blog",  owner: "Freelancer-2" },
    { kw: "how to calculate attrition rate",    vol: 1300,  format: "how-to-blog",        owner: "Freelancer-1" },
    { kw: "what is attrition rate",             vol: 1000,  format: "definitional-blog",  owner: "Freelancer-2" },
    { kw: "employee onboarding kit",            vol: 500,   format: "cluster-blog",       owner: "Freelancer-1" },
    { kw: "best employee engagement platforms", vol: 500,   format: "listicle",           owner: "Freelancer-2" },
  ];
  for (const b of ENG_BLOGS) {
    D.push({
      owner: b.owner, cluster: "Employee Engagement / Retention / Attrition (Blog Cluster)",
      type: "blog", format: b.format,
      hubKw: b.kw, url: `/blog/${b.kw.replace(/\s+/g, "-")}`, isNew: true,
      hubPageToLink: "/features/attrition-risk",
      priority: b.vol >= 10000 ? "High" : "Medium", volumeTargeted: b.vol,
      durationDays: DURATION_DAYS[b.format],
    });
  }
  // Performance Mgmt / OKR
  const PM_BLOGS: Array<{ kw: string; vol: number; format: keyof typeof WORD_COUNTS; owner: Owner }> = [
    { kw: "performance management",             vol: 8100, format: "pillar-blog",       owner: "Freelancer-1" },
    { kw: "what is okr",                        vol: 2000, format: "definitional-blog", owner: "Freelancer-2" },
    { kw: "how to implement okr",               vol: 800,  format: "how-to-blog",       owner: "Freelancer-1" },
    { kw: "kpi vs okr",                         vol: 600,  format: "cluster-blog",      owner: "Freelancer-2" },
  ];
  for (const b of PM_BLOGS) {
    D.push({
      owner: b.owner, cluster: "Performance Management / OKR (Blog Cluster)",
      type: "blog", format: b.format,
      hubKw: b.kw, url: `/blog/${b.kw.replace(/\s+/g, "-")}`, isNew: true,
      hubPageToLink: "/features/goals",
      priority: b.vol >= 5000 ? "High" : "Medium", volumeTargeted: b.vol,
      durationDays: DURATION_DAYS[b.format],
    });
  }
  // Time Management / Productivity Hacks
  const TM_BLOGS: Array<{ kw: string; vol: number; format: keyof typeof WORD_COUNTS; owner: Owner }> = [
    { kw: "time management techniques",       vol: 6600, format: "pillar-blog",       owner: "Freelancer-1" },
    { kw: "best productivity hacks",          vol: 2900, format: "listicle",          owner: "Freelancer-2" },
    { kw: "what is deep work",                vol: 1000, format: "definitional-blog", owner: "Freelancer-1" },
  ];
  for (const b of TM_BLOGS) {
    D.push({
      owner: b.owner, cluster: "Time Management & Productivity Tips (Blog Cluster)",
      type: "blog", format: b.format,
      hubKw: b.kw, url: `/blog/${b.kw.replace(/\s+/g, "-")}`, isNew: true,
      hubPageToLink: "/features/productivity-tracking",
      priority: "Medium", volumeTargeted: b.vol,
      durationDays: DURATION_DAYS[b.format],
    });
  }

  console.log(`\nGenerated ${D.length} deliverables.`);

  // -------------------------------------------------------------------------
  // 5b. Schedule day-by-day (Mon-Fri, May 4 → June 26)
  // -------------------------------------------------------------------------
  const ownerCursor: Record<Owner, Date> = {
    "Lokesh": new Date("2026-05-04"),
    "Ishika": new Date("2026-06-01"), // June kickoff
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
    const target = Math.ceil(days);
    while (added < target) {
      out.setDate(out.getDate() + 1);
      if (out.getDay() !== 0 && out.getDay() !== 6) added++;
    }
    return out;
  }
  function fmt(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  // Sort deliverables per owner by priority + volume
  const PRIO: Record<Deliverable["priority"], number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const owners: Owner[] = ["Lokesh", "Ishika", "Rahul", "Freelancer-1", "Freelancer-2"];
  for (const o of owners) {
    const queue = D.filter((d) => d.owner === o)
      .sort((a, b) => PRIO[a.priority] - PRIO[b.priority] || b.volumeTargeted - a.volumeTargeted);
    for (const d of queue) {
      const start = nextWorkday(ownerCursor[o]);
      const end = addWorkdays(start, d.durationDays - 1);
      d.startDate = fmt(start);
      d.endDate = fmt(end);
      ownerCursor[o] = nextWorkday(addWorkdays(start, d.durationDays));
    }
  }

  // Generate briefs for each
  const briefs = D.map((d) => generateBrief(d, allKws));

  // -------------------------------------------------------------------------
  // 6. Write output XLSX with 4 tabs
  // -------------------------------------------------------------------------
  const out = new ExcelJS.Workbook();

  // ===== TAB 1: Calendar (daily) =====
  const ws1 = out.addWorksheet("Calendar (Daily)");
  ws1.columns = [
    { header: "Date",         key: "date",   width: 14 },
    { header: "Day",          key: "day",    width: 10 },
    { header: "Lokesh",       key: "Lokesh", width: 60 },
    { header: "Ishika",       key: "Ishika", width: 60 },
    { header: "Rahul",        key: "Rahul",  width: 60 },
    { header: "Freelancer-1", key: "Freelancer-1", width: 60 },
    { header: "Freelancer-2", key: "Freelancer-2", width: 60 },
  ];
  styleHeader(ws1);
  ws1.views = [{ state: "frozen", ySplit: 1, xSplit: 2 }];
  // For each working day from May 4 → June 26
  let cursor = new Date("2026-05-04");
  const lastDay = new Date("2026-06-26");
  while (cursor <= lastDay) {
    if (cursor.getDay() === 0 || cursor.getDay() === 6) {
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }
    const dStr = fmt(cursor);
    const cell: Record<string, string> = {
      date: dStr,
      day: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][cursor.getDay()],
    };
    for (const o of owners) {
      const active = D.filter((d) => d.owner === o && d.startDate && d.endDate
        && dStr >= d.startDate && dStr <= d.endDate);
      cell[o] = active.map((d) => `${dayNumber(d, dStr)} ${d.format} · ${d.hubKw} → ${d.url}`).join("\n") || "";
    }
    const r = ws1.addRow(cell);
    r.alignment = { vertical: "top", wrapText: true };
    r.height = 50;
    if (cursor.getDay() === 1) r.getCell("date").fill = solid("FFEDE9FE"); // Mondays
    cursor.setDate(cursor.getDate() + 1);
  }

  // ===== TAB 2: Per-Deliverable Brief =====
  const ws2 = out.addWorksheet("Per-Deliverable Brief");
  ws2.columns = [
    { header: "#", key: "n", width: 5 },
    { header: "Owner",          key: "owner",   width: 14 },
    { header: "Start",          key: "start",   width: 12 },
    { header: "End",            key: "end",     width: 12 },
    { header: "Days",           key: "days",    width: 7 },
    { header: "Priority",       key: "prio",    width: 10 },
    { header: "Type",           key: "type",    width: 10 },
    { header: "Format",         key: "format",  width: 18 },
    { header: "Words",          key: "words",   width: 9 },
    { header: "URL",            key: "url",     width: 40 },
    { header: "Hub keyword (H1 target)", key: "hub", width: 38 },
    { header: "Volume",         key: "vol",     width: 11 },
    { header: "Proposed H1",    key: "h1",      width: 50 },
    { header: "H2 sections (5-7)", key: "h2",   width: 90 },
    { header: "H3 subsections (8-12)", key: "h3", width: 90 },
    { header: "FAQ questions (4-6)", key: "faq", width: 90 },
    { header: "Body keywords (15-20)", key: "body", width: 90 },
    { header: "Cluster",        key: "cluster", width: 40 },
    { header: "Hub page to link to", key: "link", width: 38 },
  ];
  styleHeader(ws2);
  ws2.views = [{ state: "frozen", ySplit: 1, xSplit: 6 }];

  D.forEach((d, i) => {
    const b = briefs[i];
    const row = ws2.addRow({
      n: i + 1,
      owner: d.owner,
      start: d.startDate, end: d.endDate, days: d.durationDays,
      prio: d.priority,
      type: d.type.toUpperCase(),
      format: d.format,
      words: b.wordCount,
      url: d.url,
      hub: d.hubKw,
      vol: d.volumeTargeted,
      h1: b.h1,
      h2: b.h2s.length > 0 ? b.h2s.map((h, n) => `${n + 1}. ${h}`).join("\n") : "(no good cluster matches — manual H2s)",
      h3: b.h3s.length > 0 ? b.h3s.map((h, n) => `${n + 1}. ${h}`).join("\n") : "(no good cluster matches — manual H3s)",
      faq: b.faqs.length > 0 ? b.faqs.map((q, n) => `Q${n + 1}: ${q}`).join("\n") : "(no question-shaped queries in cluster — write manually)",
      body: b.bodyKws.join(", "),
      cluster: d.cluster,
      link: d.hubPageToLink,
    });
    row.alignment = { vertical: "top", wrapText: true };
    row.height = 200;
    // Color by priority
    const prioCell = row.getCell("prio");
    if (d.priority === "Critical") { prioCell.fill = solid("FFFEE2E2"); prioCell.font = { bold: true, color: { argb: "FF991B1B" } }; }
    else if (d.priority === "High") { prioCell.fill = solid("FFFEF3C7"); prioCell.font = { bold: true, color: { argb: "FF92400E" } }; }
    // Color by owner
    const ownerCell = row.getCell("owner");
    ownerCell.font = { bold: true };
    if (d.owner === "Lokesh") ownerCell.fill = solid("FFEDE9FE");
    else if (d.owner === "Ishika") ownerCell.fill = solid("FFD1FAE5");
    else if (d.owner === "Rahul") ownerCell.fill = solid("FFFEF3C7");
    else if (d.owner === "Freelancer-1") ownerCell.fill = solid("FFE0E7FF");
    else if (d.owner === "Freelancer-2") ownerCell.fill = solid("FFFCE7F3");
  });

  // ===== TAB 3: Hub-and-Spoke Maps =====
  const ws3 = out.addWorksheet("Hub-and-Spoke Maps");
  ws3.columns = [
    { header: "Cluster diagram", key: "diag", width: 130 },
  ];
  styleHeader(ws3);
  // Group deliverables by cluster
  const byCluster = new Map<string, Deliverable[]>();
  for (const d of D) {
    if (!byCluster.has(d.cluster)) byCluster.set(d.cluster, []);
    byCluster.get(d.cluster)!.push(d);
  }
  for (const [cluster, items] of byCluster.entries()) {
    const pages = items.filter((d) => d.type === "page");
    const blogs = items.filter((d) => d.type === "blog");
    let diag = `╔════════════════════════════════════════════════════════════════════╗\n`;
    diag += `║  CLUSTER: ${cluster.padEnd(54)}  ║\n`;
    diag += `╚════════════════════════════════════════════════════════════════════╝\n\n`;
    if (pages.length > 0) {
      diag += `   HUB PAGE${pages.length > 1 ? "S" : ""} (highest priority):\n`;
      for (const p of pages) {
        diag += `   ┌─ ${p.url}  ←  ${p.hubKw}  (${p.volumeTargeted.toLocaleString()} vol/mo)\n`;
        diag += `   │       Owner: ${p.owner}  ·  ${p.startDate} → ${p.endDate}  ·  ${p.format}  ·  ${WORD_COUNTS[p.format]}w\n`;
      }
      diag += `   │\n`;
    }
    if (blogs.length > 0) {
      diag += `   ${pages.length > 0 ? "└─" : "  "}  SUPPORTING BLOG${blogs.length > 1 ? "S" : ""} (link UP to hub):\n`;
      for (const b of blogs) {
        diag += `       ↑  ${b.hubKw}\n`;
        diag += `          → ${b.url}  (${b.volumeTargeted.toLocaleString()} vol/mo)\n`;
        diag += `          Owner: ${b.owner}  ·  ${b.startDate} → ${b.endDate}  ·  ${b.format}  ·  ${WORD_COUNTS[b.format]}w\n`;
      }
    }
    if (pages.length > 0) {
      diag += `\n   Linking strategy: every blog body cites + footer-links to ${pages[0].url}\n`;
      diag += `                     ${pages[0].url} sidebar lists all ${blogs.length} blog${blogs.length === 1 ? "" : "s"} as "Related reading"\n`;
    }
    const r = ws3.addRow({ diag });
    r.alignment = { vertical: "top", wrapText: true };
    r.height = Math.max(60, 18 + (pages.length + blogs.length) * 24);
    r.font = { name: "Consolas", size: 10 };
  }

  // ===== TAB 4: FAQ Keyword Bank =====
  const ws4 = out.addWorksheet("FAQ Keyword Bank");
  ws4.columns = [
    { header: "Existing page",       key: "page", width: 50 },
    { header: "Cluster",             key: "cluster", width: 40 },
    { header: "FAQ question (H3)",   key: "q",    width: 70 },
    { header: "Vol/mo",              key: "vol",  width: 10 },
    { header: "Suggested 80-word answer angle", key: "ans", width: 80 },
  ];
  styleHeader(ws4);
  ws4.views = [{ state: "frozen", ySplit: 1 }];
  // For each existing page in our hub-page-to-link map, find low-volume question-shaped kws to add as FAQs
  const PAGE_TO_CLUSTERS: Record<string, string[]> = {};
  for (const d of D) {
    if (!PAGE_TO_CLUSTERS[d.hubPageToLink]) PAGE_TO_CLUSTERS[d.hubPageToLink] = [];
    if (!PAGE_TO_CLUSTERS[d.hubPageToLink].includes(d.cluster)) PAGE_TO_CLUSTERS[d.hubPageToLink].push(d.cluster);
  }
  for (const [page, clusters] of Object.entries(PAGE_TO_CLUSTERS)) {
    for (const cluster of clusters) {
      // Pick 4-6 question-shaped low-volume kws (vol <300, score ≥1)
      const qPat = /^(how|what|why|when|where|which|who|is|are|do|does|can)\b/i;
      const candidates = allKws
        .filter((k) => k.cluster === cluster && qPat.test(k.keyword) && k.volume < 300 && k.score >= 1)
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 5);
      for (const c of candidates) {
        ws4.addRow({
          page, cluster,
          q: questionize(c.keyword),
          vol: c.volume,
          ans: deriveAnswerAngle(c.keyword),
        });
      }
    }
  }
  ws4.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 } };

  await out.xlsx.writeFile(DEST);
  console.log(`\n✅ Wrote ${DEST}`);
  console.log(`   Tabs:`);
  console.log(`     1. Calendar (Daily)         — May 4 → June 26 (40 working days × 5 owners)`);
  console.log(`     2. Per-Deliverable Brief    — ${D.length} rows with H1/H2/H3/FAQ/body kws`);
  console.log(`     3. Hub-and-Spoke Maps       — ${byCluster.size} cluster diagrams`);
  console.log(`     4. FAQ Keyword Bank         — FAQs for every linked existing page`);

  // Console summary
  console.log(`\n=== DELIVERABLE SUMMARY BY OWNER ===\n`);
  for (const o of owners) {
    const items = D.filter((d) => d.owner === o);
    const pages = items.filter((d) => d.type === "page").length;
    const blogs = items.filter((d) => d.type === "blog").length;
    console.log(`  ${o.padEnd(15)} ${items.length} deliverables (${pages} pages + ${blogs} blogs)`);
    console.log(`                 first: ${items[0]?.startDate}  last: ${items[items.length - 1]?.endDate}`);
  }
}

function dayNumber(d: Deliverable, currentDate: string): string {
  if (!d.startDate) return "";
  const start = new Date(d.startDate);
  const cur = new Date(currentDate);
  let elapsed = 0;
  const t = new Date(start);
  while (t < cur) {
    t.setDate(t.getDate() + 1);
    if (t.getDay() !== 0 && t.getDay() !== 6) elapsed++;
  }
  return `Day ${elapsed + 1}/${Math.ceil(d.durationDays)}:`;
}

function deriveAnswerAngle(kw: string): string {
  const k = kw.toLowerCase();
  if (k.startsWith("how to")) return "Step-by-step procedure (3-5 steps), each step ≤2 sentences. End with CTA to relevant feature/page.";
  if (k.startsWith("what is")) return "Definition first sentence (≤25 words), expansion (2-3 sentences), 1-line example, link to feature page.";
  if (k.startsWith("why")) return "Single causal reason in opening, 2-3 supporting bullets, link to product feature that solves it.";
  if (k.startsWith("when")) return "Decision criteria: '__ when X', '__ when Y', '__ when Z'. Tie to use case + product.";
  return "60-80 word direct answer using natural language. Wrap as FAQPage JSON-LD schema.";
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
