#!/usr/bin/env tsx
/**
 * Senior-SEO clustering: cut to head (score ≥3, volume ≥500), hand-cluster
 * into 12 strategic clusters, assign each cluster to a team member based on
 * their lane (Lokesh = vs/alt + solutions, Ishika = integrations, Rahul =
 * solutions, Freelancers = features + blogs).
 *
 * Long-tail keywords (score 1-2 OR volume <500) go to a "Secondary Keyword
 * Bank" tab — writers pull from it when filling out briefs as supporting
 * keywords, NOT as their own page bets.
 *
 * Output: 3 new tabs replace/augment the previous analysis file.
 */

import ExcelJS from "exceljs";

const SRC  = "C:/Users/HP/Downloads/New Keywords - 100K Plan + Analysis.xlsx";
const DEST = "C:/Users/HP/Downloads/New Keywords - 100K Plan + Team Allocation.xlsx";

// =============================================================================
// Hand-defined 12 strategic clusters — owner-aligned, action-oriented
// Each cluster has a regex pattern matching its head terms + spokes.
// First-match wins (order from most-specific to most-general).
// =============================================================================

interface ClusterDef {
  name: string;
  owner: "Lokesh" | "Ishika" | "Rahul" | "Freelancer-1" | "Freelancer-2" | "Freelancers (split)";
  deliverable: string;
  pageType: "Solution Page" | "Feature Pillar" | "Blog Cluster" | "BoF Comparison" | "Integration Page" | "Industry Page" | "Solution + Blog";
  existingUrl: string | null;
  newUrl: string | null;
  hubLikely: string;             // human-readable hub keyword guess
  patterns: RegExp[];
  priority: "Critical" | "High" | "Medium";
  twoMonthScope: string;          // what to ship in May+June
  rationale: string;              // 1-line reason
}

const CLUSTERS: ClusterDef[] = [
  // ---- Lokesh: BoF comparison work (his existing primary lane) ----
  {
    name: "vs / Alternative pages (BoF buyers comparing tools)",
    owner: "Lokesh",
    deliverable: "Build 14 /vs/<comp> + 8 /alternative/<comp> pages",
    pageType: "BoF Comparison",
    existingUrl: null,
    newUrl: "/vs/* and /alternative/*",
    hubLikely: "we360 vs hubstaff / hubstaff alternative / activtrak alternative",
    patterns: [
      /\bvs\.?\s*(hubstaff|time\s*doctor|teramind|activtrak|desktime|insightful|controlio|monitask)\b/i,
      /\b(hubstaff|time\s*doctor|teramind|activtrak|desktime|insightful|controlio|monitask)\s*(alternative|vs|alternatives)\b/i,
      /\b(time\s*doctor|hubstaff|activtrak|teramind|desktime|insightful)\s*(price|review|software)\b/i,
    ],
    priority: "Critical",
    twoMonthScope: "May–Jun: 5 vs-pages (Hubstaff, Time Doctor, Teramind, ActivTrak, DeskTime) + 2 alternative pages",
    rationale: "Evaluator-stage queries with 1.3K+ vol/mo each — highest demo conversion in your funnel",
  },

  // ---- Ishika: integration pages ----
  {
    name: "Integration pages (real integrations only)",
    owner: "Ishika",
    deliverable: "Build 5 /integrations/* pages — Keka, Zoho, GreyTHR, Jira, MS Teams",
    pageType: "Integration Page",
    existingUrl: null,
    newUrl: "/integrations/keka, /integrations/zoho, /integrations/greythr, /integrations/jira, /integrations/microsoft-teams",
    hubLikely: "we360 keka integration / we360 zoho integration",
    patterns: [
      /\b(keka|zoho\s*people|zoho|greythr|grey\s*?hr|jira|microsoft\s*teams|ms\s*teams)\b/i,
      /\bintegration/i,
    ],
    priority: "High",
    twoMonthScope: "All 5 ship in June (one per week)",
    rationale: "Integration pages convert at 3-5% demo rate vs 0.31% sitewide — Keka/Zoho are India HR head terms",
  },

  // ---- Rahul: solution pages (refreshes existing /solutions/* + /attendance-tracking-software) ----
  {
    name: "Employee Monitoring Software (head term)",
    owner: "Rahul",
    deliverable: "Refresh /solutions/employee-monitoring + retarget homepage for head term",
    pageType: "Solution Page",
    existingUrl: "/solutions/employee-monitoring",
    newUrl: null,
    hubLikely: "employee monitoring software",
    patterns: [
      /\bemployee\s*monitoring\s*(software|tool|system|app|platform|solution)\b/i,
      /\bemployee\s*surveillance\s*soft/i,
      /\bemployee\s*spy\s*soft/i,
      /\bstaff\s*monitor/i,
      /\bcomputer\s*monitor(?:ing)?\s*soft/i,
      /\bpc\s*monitor(?:ing)?\s*soft/i,
      /\bemployee\s*tracking\s*soft/i,
    ],
    priority: "Critical",
    twoMonthScope: "May 18: homepage retarget. Jun 2: /solutions/employee-monitoring deep refresh",
    rationale: "10K monthly head-term searches; we're not in top 50; biggest single keyword opportunity",
  },
  {
    name: "Workforce Management & Analytics",
    owner: "Rahul",
    deliverable: "Refresh /solutions/workforce-analytics + extend with workforce-management head term",
    pageType: "Solution Page",
    existingUrl: "/solutions/workforce-analytics",
    newUrl: null,
    hubLikely: "workforce management / workforce analytics",
    patterns: [
      /\bworkforce\s*(management|planning|analytics|intelligence|optim|trend)/i,
      /\bpeople\s*analytics/i,
      /\bhr\s*(analytics|metric|tech|stack|dashboard)/i,
    ],
    priority: "High",
    twoMonthScope: "Jun: refresh with workforce-management head + people-analytics secondary kws",
    rationale: "5K+ vol on 'workforce management' head + 3K on people analytics — under-served by us today",
  },
  {
    name: "Time Tracking & Timesheets",
    owner: "Rahul",
    deliverable: "Refresh /solutions/time-tracker for time-tracking-software head term",
    pageType: "Solution Page",
    existingUrl: "/solutions/time-tracker",
    newUrl: null,
    hubLikely: "time tracking software",
    patterns: [
      /\btime\s*(track|tracker|tracking|monitor|clock|sheet|recording)/i,
      /\btimesheet/i,
      /\btime\s*management\s*(soft|tool|app)/i,
      /\bemployee\s*time/i,
    ],
    priority: "Critical",
    twoMonthScope: "Jun: full refresh with timesheet + time-clock secondary kws woven in",
    rationale: "5K-8K vol on 'time tracking software for employees' head term + sister queries",
  },
  {
    name: "Attendance Management & Leave",
    owner: "Rahul",
    deliverable: "Refresh /attendance-tracking-software + extend for leave-management India",
    pageType: "Solution Page",
    existingUrl: "/attendance-tracking-software",
    newUrl: null,
    hubLikely: "attendance management software",
    patterns: [
      /\battendance/i,
      /\bbiometric/i,
      /\bleave\s*(manage|track|software)/i,
      /\bautomated\s*attendance\b/i,
      /\bcloud\s*based\s*attendance\b/i,
    ],
    priority: "High",
    twoMonthScope: "Jun 3: deep refresh of /attendance-tracking-software (current pos 35, 75K imp)",
    rationale: "75K imp/16mo, only 132 clicks — biggest impression-to-click gap on solution pages",
  },
  {
    name: "Field Force / GPS Tracking",
    owner: "Rahul",
    deliverable: "Refresh /solutions/field-tracking + India field-force expansion",
    pageType: "Solution Page",
    existingUrl: "/solutions/field-tracking",
    newUrl: "/in/field-force-management-india",
    hubLikely: "field employee tracking",
    patterns: [
      /\bfield\s*(employee|force|sales|staff|worker)\s*(track|gps|manage|monitor)\b/i,
      /\bgps\s*(attendance|track)\s*(employee|staff|field)\b/i,
      /\bon[-\s]?field\s*(track|monitor)\b/i,
    ],
    priority: "Medium",
    twoMonthScope: "Jun 23: build /in/field-force-management-india (0 competitor coverage)",
    rationale: "Uncontested India angle — FMCG/pharma/insurance verticals, zero global competitor pages",
  },

  // ---- Freelancers: feature pages + blog clusters ----
  {
    name: "Productivity Tracking & Monitoring",
    owner: "Freelancer-1",
    deliverable: "Refresh /features/productivity-tracking + 5 cluster blogs",
    pageType: "Feature Pillar",
    existingUrl: "/features/productivity-tracking",
    newUrl: null,
    hubLikely: "productivity monitoring software",
    patterns: [
      /\bproductivity\s*(tracker|tracking|monitoring|software|tool|platform|system|app)/i,
      /\bproductivity\s*(score|metric|measure|analytics|formula|management)/i,
      /\bemployee\s*productivity/i,
    ],
    priority: "Critical",
    twoMonthScope: "Jun 8: refresh /features/productivity-tracking. Jun 9-10: write 2 cluster blogs",
    rationale: "1-2.5K vol on 'productivity monitoring software' head term + 4K on 'how to track productivity'",
  },
  {
    name: "Screen Recording / Live Monitoring",
    owner: "Freelancer-1",
    deliverable: "Refresh /features/screen-recording + build new /features/livestream pillar",
    pageType: "Feature Pillar",
    existingUrl: "/features/screen-recording",
    newUrl: "/features/livestream",
    hubLikely: "screen monitoring software",
    patterns: [
      /\bscreen\s*(monitor|recording|capture|share|watch|tracking)\b/i,
      /\bscreenshot\s*(soft|tool|monitor)\b/i,
      /\blive\s*(screen|monitor|view|streaming)\b/i,
    ],
    priority: "High",
    twoMonthScope: "Jun 1: refresh screen-recording. Jun 15: build /features/livestream",
    rationale: "Hubstaff explicitly refuses livestream — own the 'responsible live monitoring' narrative",
  },
  {
    name: "Activity Monitoring (Apps & URLs)",
    owner: "Freelancer-2",
    deliverable: "Refresh /features/activity-tracking + URL/app cluster blogs",
    pageType: "Feature Pillar",
    existingUrl: "/features/activity-tracking",
    newUrl: null,
    hubLikely: "activity monitoring software",
    patterns: [
      /\bactivity\s*(monitor|track|log)/i,
      /\bapp(lication)?\s*(usage|track|monitor)/i,
      /\bwebsite\s*(monitor|track|usage|block)/i,
      /\binternet\s*usage\s*(track|monitor)/i,
      /\burl\s*(monitor|filter|track|block)/i,
      /\bdomain\s*block/i,
    ],
    priority: "Medium",
    twoMonthScope: "Jun 3-5: refresh /features/activity-tracking + 3 cluster blogs (track internet usage, website monitoring, app usage)",
    rationale: "1.5-3K vol on 'how to track employee internet usage' + sister queries; ActivTrak ranks #1 today",
  },
  {
    name: "Agentic AI / AI for Workforce",
    owner: "Freelancer-2",
    deliverable: "Refresh /features/agentic-ai + 5 Agentic AI cluster blogs",
    pageType: "Feature Pillar",
    existingUrl: "/features/agentic-ai",
    newUrl: null,
    hubLikely: "AI productivity software",
    patterns: [
      /\bai\s*(productivity|workforce|monitor|hr|recommendation|tool|analyt|coach|engine)\b/i,
      /\bai\s*-?\s*(powered|driven|based|native)\s*(monitor|track|product|workforce)\b/i,
      /\bagentic\s*ai\b/i,
      /\bartificial\s*intelligence\s*(workplace|workforce|productivity|hr)\b/i,
    ],
    priority: "High",
    twoMonthScope: "May: 5 Agentic AI cluster blogs (already in plan). Jun 22: refresh /features/agentic-ai",
    rationale: "Hubstaff/Time Doctor have ZERO AI features — entire AI-native content space unclaimed",
  },
  {
    name: "Performance Management / OKR (Blog Cluster)",
    owner: "Freelancers (split)",
    deliverable: "5-7 cluster blogs feeding /features/goals (informational, no new page)",
    pageType: "Blog Cluster",
    existingUrl: "/features/goals",
    newUrl: null,
    hubLikely: "performance management",
    patterns: [
      /\bperformance\s*(management|review|appraisal|metric)\b/i,
      /\bokr\b/i,
      /\bkpi\s*(framework|operations|hr)\b/i,
      /\b1\s*on\s*1\s*(template|meeting|guide)\b/i,
      /\bgoal\s*(setting|tracking)\b/i,
    ],
    priority: "Medium",
    twoMonthScope: "May-Jun: 4 cluster blogs split between freelancers (2 each)",
    rationale: "8K vol on 'performance management' head + 2K on 'manager 1 on 1 template' — top-of-funnel HR persona",
  },
  {
    name: "Employee Engagement / Retention / Attrition (Blog Cluster)",
    owner: "Freelancers (split)",
    deliverable: "6-8 cluster blogs (informational; no new page — feeds CRM nurture)",
    pageType: "Blog Cluster",
    existingUrl: null,
    newUrl: null,
    hubLikely: "engaged employees / employee engagement",
    patterns: [
      /\bemployee\s*engagement\b/i,
      /\bengaged\s*employees\b/i,
      /\battrition\b/i,
      /\bretention\b/i,
      /\bturnover\s*(rate|cause|reduce)\b/i,
      /\bquiet\s*quitting\b/i,
      /\bemployee\s*(experience|morale|satisfaction|motivat)\b/i,
      /\bonboarding\s*(employee|remote|new|checklist)\b/i,
    ],
    priority: "Medium",
    twoMonthScope: "May-Jun: 4 blogs (2 each freelancer)",
    rationale: "50K vol on 'engaged employees' head — top-of-funnel HR ICP, builds brand familiarity 6-12 months pre-purchase",
  },

  // ---- Catch-all not in the above ----
  {
    name: "Time Management & Productivity Tips (Blog Cluster)",
    owner: "Freelancers (split)",
    deliverable: "4-5 informational blog posts on productivity hacks (low priority)",
    pageType: "Blog Cluster",
    existingUrl: null,
    newUrl: null,
    hubLikely: "time management techniques / productivity hacks",
    patterns: [
      /\btime\s*management\s*(technique|tip|skill|tool)\b/i,
      /\bproductivity\s*(hack|tip|technique|method|secret)\b/i,
      /\bfocus\s*time\b/i,
      /\bdeep\s*work\b/i,
      /\bpomodoro\b/i,
      /\bformula\s*of\s*efficiency\b/i,
      /\bproductivity\s*formula\b/i,
    ],
    priority: "Medium",
    twoMonthScope: "Jun: 2 blogs (one per freelancer) — fast quick-wins, low competition",
    rationale: "17K vol combined on time-mgmt + productivity-hack queries; broadest top-of-funnel reach",
  },
];

// =============================================================================
// Read previously-generated useful keywords + match to clusters
// =============================================================================

interface UsefulKw {
  keyword: string;
  volume: number;
  competition: string;
  source: string;
  serpFeatures: string;
  score: number;
  theme: string;
}

interface ClusterAssignment {
  cluster: ClusterDef;
  headSpokes: UsefulKw[];   // score ≥3 AND vol ≥500
  longTail: UsefulKw[];     // score 1-2 OR vol <500
  totalVolume: number;
  aiOverviewCount: number;
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

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);

  const usefulSheet = wb.getWorksheet("Useful Keywords");
  if (!usefulSheet) { console.error("Missing 'Useful Keywords' sheet — run analyze-keyword-planner.ts first"); process.exit(1); }

  // Read Useful Keywords
  const all: UsefulKw[] = [];
  const headers: Record<string, number> = {};
  usefulSheet.getRow(1).eachCell((cell, n) => { headers[pickStr(cell.value).toLowerCase()] = n; });
  for (let r = 2; r <= usefulSheet.actualRowCount; r++) {
    const row = usefulSheet.getRow(r);
    const kw = pickStr(row.getCell(headers["keyword"] ?? 1).value);
    if (!kw) continue;
    all.push({
      keyword: kw,
      volume: pickNum(row.getCell(headers["volume / mo"] ?? headers["volume"] ?? 2).value),
      competition: pickStr(row.getCell(headers["competition"] ?? 3).value),
      source: pickStr(row.getCell(headers["source"] ?? 4).value),
      serpFeatures: pickStr(row.getCell(headers["serp features (lokesh)"] ?? headers["serp features"] ?? 5).value),
      score: pickNum(row.getCell(headers["score (5=direct, 1=weak)"] ?? headers["score"] ?? 6).value),
      theme: pickStr(row.getCell(headers["theme"] ?? 7).value),
    });
  }
  console.log(`Loaded ${all.length} useful keywords from previous analysis.`);

  // Match each kw to its first cluster (or none)
  const assignments: ClusterAssignment[] = CLUSTERS.map((c) => ({
    cluster: c, headSpokes: [], longTail: [], totalVolume: 0, aiOverviewCount: 0,
  }));
  const unmatched: UsefulKw[] = [];

  for (const kw of all) {
    const matched = assignments.find((a) => a.cluster.patterns.some((p) => p.test(kw.keyword)));
    if (!matched) {
      unmatched.push(kw);
      continue;
    }
    matched.totalVolume += kw.volume;
    if (/AI Overview/i.test(kw.serpFeatures)) matched.aiOverviewCount++;
    if (kw.score >= 3 && kw.volume >= 500) matched.headSpokes.push(kw);
    else matched.longTail.push(kw);
  }

  // Sort spokes within each cluster
  for (const a of assignments) {
    a.headSpokes.sort((x, y) => y.volume - x.volume);
    a.longTail.sort((x, y) => y.volume - x.volume);
  }
  // Sort clusters by total volume (informational view)
  const clustersByVolume = [...assignments].sort((a, b) => b.totalVolume - a.totalVolume);

  console.log(`\nCluster matches: ${all.length - unmatched.length} matched, ${unmatched.length} unmatched.`);

  // -------------------------------------------------------------------------
  // Tab 1: Strategic Clusters (Head)
  // -------------------------------------------------------------------------
  for (const tab of ["Strategic Clusters", "Team Allocation", "Secondary Keyword Bank"]) {
    const existing = wb.getWorksheet(tab);
    if (existing) wb.removeWorksheet(existing.id);
  }

  const ws1 = wb.addWorksheet("Strategic Clusters");
  ws1.columns = [
    { header: "Cluster",                  key: "cluster",   width: 50 },
    { header: "Owner",                    key: "owner",     width: 18 },
    { header: "Page type",                key: "pagetype",  width: 22 },
    { header: "Deliverable",              key: "deliv",     width: 70 },
    { header: "Existing URL",             key: "existing",  width: 32 },
    { header: "New URL",                  key: "newurl",    width: 32 },
    { header: "Hub keyword",              key: "hub",       width: 40 },
    { header: "Top spokes (vol)",         key: "spokes",    width: 80 },
    { header: "Cluster volume",           key: "vol",       width: 16 },
    { header: "AI Overview triggers",     key: "ai",        width: 16 },
    { header: "Priority",                 key: "priority",  width: 12 },
    { header: "May–Jun scope",            key: "scope",     width: 60 },
    { header: "Why it matters",           key: "why",       width: 60 },
  ];
  styleHeader(ws1);
  for (const a of clustersByVolume) {
    const c = a.cluster;
    const row = ws1.addRow({
      cluster: c.name,
      owner: c.owner,
      pagetype: c.pageType,
      deliv: c.deliverable,
      existing: c.existingUrl ?? "(net-new)",
      newurl: c.newUrl ?? "(refresh existing)",
      hub: c.hubLikely,
      spokes: a.headSpokes.slice(0, 6).map((s) => `"${s.keyword}" (${s.volume.toLocaleString()})`).join(" · ") || "(no head spokes ≥500 vol)",
      vol: a.totalVolume,
      ai: a.aiOverviewCount,
      priority: c.priority,
      scope: c.twoMonthScope,
      why: c.rationale,
    });
    row.alignment = { vertical: "top", wrapText: true };
    row.height = 80;
    if (c.priority === "Critical") row.getCell("priority").fill = solid("FFFEE2E2");
    else if (c.priority === "High") row.getCell("priority").fill = solid("FFFEF3C7");
    else row.getCell("priority").fill = solid("FFE0E7FF");
    row.getCell("owner").fill = ownerColor(c.owner);
    row.getCell("owner").font = { bold: true, color: { argb: "FF231D4F" } };
  }
  ws1.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 13 } };
  ws1.views = [{ state: "frozen", ySplit: 1 }];

  // -------------------------------------------------------------------------
  // Tab 2: Team Allocation — by owner, sorted, with full keyword bank per cluster
  // -------------------------------------------------------------------------
  const ws2 = wb.addWorksheet("Team Allocation");
  ws2.columns = [
    { header: "Owner",                    key: "owner",     width: 18 },
    { header: "Cluster",                  key: "cluster",   width: 50 },
    { header: "Page type",                key: "pagetype",  width: 22 },
    { header: "Deliverable",              key: "deliv",     width: 65 },
    { header: "Page URL",                 key: "url",       width: 36 },
    { header: "Hub keyword",              key: "hub",       width: 40 },
    { header: "Head spokes (≥500 vol, weave into page)", key: "spokes", width: 90 },
    { header: "Total cluster volume",     key: "vol",       width: 18 },
    { header: "May–Jun scope",            key: "scope",     width: 60 },
    { header: "Priority",                 key: "priority",  width: 12 },
  ];
  styleHeader(ws2);

  const ownerOrder: Array<ClusterDef["owner"]> = ["Lokesh", "Ishika", "Rahul", "Freelancer-1", "Freelancer-2", "Freelancers (split)"];
  for (const owner of ownerOrder) {
    const clusters = assignments
      .filter((a) => a.cluster.owner === owner)
      .sort((a, b) => priorityRank(a.cluster.priority) - priorityRank(b.cluster.priority));
    if (clusters.length === 0) continue;

    // Owner header row
    const headerRow = ws2.addRow({ owner: `▸ ${owner}` });
    headerRow.getCell("owner").font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
    headerRow.getCell("owner").fill = solid("FF5B45E0");
    headerRow.height = 24;
    ws2.mergeCells(headerRow.number, 1, headerRow.number, 10);

    for (const a of clusters) {
      const c = a.cluster;
      const url = c.existingUrl && c.newUrl ? `${c.existingUrl}  +  ${c.newUrl}`
                : c.existingUrl ?? c.newUrl ?? "(net-new)";
      const spokeText = a.headSpokes.length === 0
        ? "(no head spokes — see Secondary Keyword Bank for long-tail)"
        : a.headSpokes.slice(0, 8).map((s) => `"${s.keyword}" (${s.volume.toLocaleString()})`).join(" · ");
      const row = ws2.addRow({
        owner: c.owner,
        cluster: c.name,
        pagetype: c.pageType,
        deliv: c.deliverable,
        url,
        hub: c.hubLikely,
        spokes: spokeText,
        vol: a.totalVolume,
        scope: c.twoMonthScope,
        priority: c.priority,
      });
      row.alignment = { vertical: "top", wrapText: true };
      row.height = 90;
      if (c.priority === "Critical") row.getCell("priority").fill = solid("FFFEE2E2");
      else if (c.priority === "High") row.getCell("priority").fill = solid("FFFEF3C7");
      else row.getCell("priority").fill = solid("FFE0E7FF");
      row.getCell("owner").fill = ownerColor(owner);
      row.getCell("owner").font = { bold: true, color: { argb: "FF231D4F" } };
    }
  }
  ws2.views = [{ state: "frozen", ySplit: 1 }];

  // -------------------------------------------------------------------------
  // Tab 3: Secondary Keyword Bank — long-tail kws for writers to weave in
  // -------------------------------------------------------------------------
  const ws3 = wb.addWorksheet("Secondary Keyword Bank");
  ws3.columns = [
    { header: "Cluster",                  key: "cluster",   width: 50 },
    { header: "Keyword",                  key: "kw",        width: 50 },
    { header: "Volume / mo",              key: "vol",       width: 14 },
    { header: "Competition",              key: "comp",      width: 14 },
    { header: "Score (3+=head, 1-2=tail)", key: "score",    width: 12 },
    { header: "Theme",                    key: "theme",     width: 24 },
    { header: "Source",                   key: "src",       width: 14 },
    { header: "SERP features",            key: "serp",      width: 50 },
    { header: "Owner (page that targets this cluster)", key: "owner", width: 22 },
    { header: "Suggested usage",          key: "usage",     width: 40 },
  ];
  styleHeader(ws3);

  // Long-tail across all clusters + unmatched
  for (const a of assignments) {
    for (const kw of a.longTail) {
      const usage = kw.score >= 3 ? "Secondary keyword in body / FAQ"
                  : kw.volume >= 100 ? "Long-tail — weave naturally in body"
                  : "Low-priority — only if it fits";
      const row = ws3.addRow({
        cluster: a.cluster.name, kw: kw.keyword, vol: kw.volume, comp: kw.competition,
        score: kw.score, theme: kw.theme, src: kw.source, serp: kw.serpFeatures,
        owner: a.cluster.owner, usage,
      });
      row.alignment = { vertical: "top", wrapText: true };
    }
  }
  for (const kw of unmatched) {
    const row = ws3.addRow({
      cluster: "(unmatched — review)", kw: kw.keyword, vol: kw.volume, comp: kw.competition,
      score: kw.score, theme: kw.theme, src: kw.source, serp: kw.serpFeatures,
      owner: "—", usage: "(unmatched — manually assign)",
    });
    row.alignment = { vertical: "top", wrapText: true };
  }
  ws3.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 10 } };
  ws3.views = [{ state: "frozen", ySplit: 1 }];

  await wb.xlsx.writeFile(DEST);
  console.log(`\n✅ Wrote ${DEST}`);
  console.log(`   Original analysis file: ${SRC}`);

  // Console summary by owner
  console.log(`\n=== TEAM WORKLOAD (May–June 2026) ===\n`);
  for (const owner of ownerOrder) {
    const clusters = assignments.filter((a) => a.cluster.owner === owner);
    if (clusters.length === 0) continue;
    const totalKws = clusters.reduce((s, a) => s + a.headSpokes.length, 0);
    const totalVol = clusters.reduce((s, a) => s + a.totalVolume, 0);
    console.log(`▸ ${owner.padEnd(20)} ${clusters.length} cluster(s), ${totalKws} head kws, ${totalVol.toLocaleString()} total vol/mo`);
    for (const a of clusters) {
      console.log(`    ${(a.cluster.priority === "Critical" ? "🔴" : a.cluster.priority === "High" ? "🟡" : "🔵")} ${a.cluster.name}`);
      console.log(`      → ${a.cluster.deliverable}`);
    }
  }
  console.log(`\n${unmatched.length} unmatched keywords landed in 'Secondary Keyword Bank' under "(unmatched — review)" — quick scan + may surface a missed cluster.`);
}

function priorityRank(p: ClusterDef["priority"]): number {
  return p === "Critical" ? 1 : p === "High" ? 2 : 3;
}

function ownerColor(owner: ClusterDef["owner"]): ExcelJS.Fill {
  // Subtle per-owner tint
  if (owner === "Lokesh") return solid("FFE0E7FF");
  if (owner === "Ishika") return solid("FFFCE7F3");
  if (owner === "Rahul") return solid("FFD1FAE5");
  if (owner === "Freelancer-1") return solid("FFFEF3C7");
  if (owner === "Freelancer-2") return solid("FFFFEDD5");
  return solid("FFF3F4F6");
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
