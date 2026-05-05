#!/usr/bin/env tsx
/**
 * Read user's "New Keywords - 100K Plan.xlsx" → My Research + Lokesh Ideas tabs.
 * 4-phase analysis:
 *
 *   PHASE 1 — Filter useful keywords (relevance scoring 0-5)
 *   PHASE 2 — Group into topic clusters (hub-and-spoke)
 *   PHASE 3 — Recommend Blog vs Page per cluster (intent-based)
 *   PHASE 4 — Map clusters to existing site pages (extend with FAQs / new sections)
 *
 * Output: NEW XLSX with 4 new tabs added to a copy of the original. Your
 * original file stays untouched.
 */

import ExcelJS from "exceljs";

const SRC  = "C:/Users/HP/Downloads/New Keywords - 100K Plan.xlsx";
const DEST = "C:/Users/HP/Downloads/New Keywords - 100K Plan + Analysis.xlsx";

// =============================================================================
// PHASE 1 — Relevance scoring
// Score 5 = direct product match, 0 = off-topic
// Order matters — check most-specific first.
// =============================================================================

interface Score { score: number; theme: string }

function scoreRelevance(kw: string): Score {
  const k = kw.toLowerCase().trim();

  const direct = [
    /employee\s*(monitor|surveil|spy)/, /staff\s*(monitor|surveil|spy)/,
    /workforce\s*(monitor|intelligence)/,
    /screen\s*(monitor|record|capture|share|watch)/, /screenshot\s*soft/,
    /productivity\s*(monitor|track|software|tool)/,
    /\btime\s*(track|monitor|clock|sheet)/,
    /attendance\s*(track|system|manage|software)/,
    /activity\s*(monitor|track|log)/,
    /(workforce|people)\s*analytics/,
    /remote\s*(employee|worker|staff)\s*(monitor|track)/,
    /wfh\s*(monitor|track)/,
    /work\s*from\s*home\s*(monitor|track)/,
    /live\s*(screen|monitor|view)/,
    /computer\s*monitor/, /pc\s*monitor/,
    /spy\s*soft/, /surveillance\s*soft/,
    /agentic\s*ai/,
    /cost\s*intelligence/,
    /(shadow|unused)\s*it/,
    /saas\s*(optim|cost)/,
    /domain\s*block/,
    /url\s*(monitor|filter|track)/,
    /application\s*(usage|track|monitor)/,
    /website\s*(monitor|track|usage)/,
    /internet\s*usage/,
    /usb\s*(detect|monitor)/,
    /attrition\s*risk/,
    /capacity\s*planning/,
    /location\s*performance/,
    /workforce\s*plan/,
    /field\s*(employee|force|sales)\s*(track|gps|manage)/,
    /gps\s*(attendance|track)\s*(employee|staff|field)/,
    /(employee|staff|workforce)\s*tracking\s*(soft|tool|system)/,
    /productivity\s*manag/,
    /leave\s*manag/,
    /biometric\s*(attend|track)/,
  ];
  for (const p of direct) if (p.test(k)) return { score: 5, theme: "Direct product" };

  const strong = [
    /performance\s*(manage|review)/, /\bokr/,
    /(employee|staff)\s*productivity/,
    /workforce\s*(productivity|management)/,
    /people\s*manag/, /human\s*capital/,
    /aht/, /first\s*call\s*resolution/, /shift\s*adherence/,
    /agent\s*(productivity|monitor|perform)/,
    /call\s*center\s*(monitor|analytic|qa)/,
    /bpo\s*(track|monitor|productivity)/,
    /workforce\s*(intelligence|insight)/,
    /\bdlp\b/, /data\s*loss/, /insider\s*threat/, /\bsoc\s*2\b/, /\biso\s*27/,
    /dpdpa/, /\bgdpr/, /\bccpa/,
    /productivity\s*(tool|software|platform|system)/,
    /(time|task|project)\s*(manage|tracking)\s*(software|tool)/,
    /hybrid\s*work/,
    /remote\s*work\s*(tool|software|platform)/,
    /unproductive\s*(employee|hour|time)/,
    /productivity\s*ai/,
    /ai\s*productivity/, /ai\s*work(force|place)/,
    /1\s*on\s*1/, /manager\s*train/,
    /idle\s*time/,
    /payroll\s*soft/, /hr\s*soft/, /hrms/,
  ];
  for (const p of strong) if (p.test(k)) return { score: 4, theme: "Feature / persona" };

  const persona = [
    /engagement\s*(survey|score)/, /employee\s*engagement/, /engaged\s*employees/,
    /employee\s*performance/, /team\s*performance/,
    /\bkpi\b/, /\bkri\b/,
    /attrition/, /retention/, /turnover/, /quiet\s*quit/,
    /onboarding/, /offboarding/,
    /remote\s*team/, /distributed\s*team/, /hybrid\s*team/,
    /productivity\s*(hack|tip|improve|increase|boost)/,
    /efficiency/, /efficient/,
    /compensation/, /salary\s*benchmark/,
    /hr\s*(analytics|metrics|tech|stack)/,
    /meeting\s*(overload|time|cost|reduc)/,
    /workforce\s*(plan|optim|trend)/,
    /\bbpo\b/, /call\s*center/,
    /people\s*performance/, /employee\s*experience/,
    /productivity\s*formula/,
    /work\s*ethic/, /work\s*habit/,
    /performance\s*(metric|indicator)/,
    /productivity\s*(metric|formula|measure|method|index)/,
    /performance\s*(culture|management)/,
    /retention\s*strateg/,
    /goal\s*(track|set)/,
    /multi[-\s]?location/, /multi[-\s]?city/,
    /(india|indian)\s*(saas|company|hr|workforce|enterprise|bpo)/,
    /(saas|tech|software|hr|bpo|fmcg|insurance|banking|healthcare|manufacturing|legal|edtech)\s*(india|company)/,
    /productivity\s*paradox/,
  ];
  for (const p of persona) if (p.test(k)) return { score: 3, theme: "Persona / use case" };

  const tangent = [
    /\bteam\s*productivity\b/, /\bwork\s*productivity\b/, /\bbusiness\s*productivity\b/,
    /\bgen\s*z/, /\bgenz/,
    /\bhybrid\b/, /\bremote\s*work\b/, /\bwfh\b/, /\bwork\s*from\s*home\b/,
    /^employee$/, /^workforce$/,
    /^manager$/, /\bleadership/,
    /(india|indian)\s*(law|policy|regulation|labour|labor)/,
    /\bcompliance\b/, /\bgdpr/, /\bpdpa/,
    /culture/,
    /training\s*program/,
    /company\s*size/,
    /headcount/,
    /\bhuman\s*resource/, /\bhr\b/,
    /productivity\s*book/, /productivity\s*podcast/,
  ];
  for (const p of tangent) if (p.test(k)) return { score: 2, theme: "Tangent" };

  const weak = [
    /\bproductivity\b/, /\bperformance\b/, /\befficiency\b/,
    /\bemployees?\b/, /\bworkforce\b/,
    /\bmanagement\b/, /\bmanager\b/,
    /\bteam\b/, /\bpeople\b/,
    /\bwork\b/, /\boffice\b/,
    /motivat/, /retention/,
  ];
  for (const p of weak) if (p.test(k)) return { score: 1, theme: "Adjacent (weak)" };

  return { score: 0, theme: "Off-topic" };
}

// =============================================================================
// PHASE 2 — Cluster patterns
// First match wins. Order from specific → general.
// =============================================================================

interface ClusterDef { name: string; pattern: RegExp; intent: "page" | "blog" | "mix" }

const CLUSTERS: ClusterDef[] = [
  { name: "Screen Recording & Live Monitoring", pattern: /(screen\s*(monitor|record|capture|watch|share)|screenshot|live\s*(screen|monitor|view))/i, intent: "page" },
  { name: "Activity Monitoring (apps & URLs)",   pattern: /(activity\s*(monitor|track|log)|app(lication)?\s*(usage|track|monitor)|website\s*(monitor|track|usage)|internet\s*usage|domain\s*block|url\s*(monitor|filter|track))/i, intent: "page" },
  { name: "Time Tracking & Timesheets",         pattern: /\btime\s*(track|monitor|clock|sheet)/i, intent: "mix" },
  { name: "Attendance Management",              pattern: /(attendance|biometric|leave\s*manage|payroll)/i, intent: "page" },
  { name: "Productivity Tracking & Analytics",  pattern: /(productivity\s*(monitor|track|analytic|score|measure|formula|metric|index|software|tool|platform))/i, intent: "page" },
  { name: "Workforce Analytics & People Analytics", pattern: /((workforce|people|hr)\s*analytics|workforce\s*intelligence|workforce\s*plan|hr\s*metric)/i, intent: "page" },
  { name: "Remote Work / WFH / Hybrid",         pattern: /(remote\s*(employee|worker|team|monitor|track)|wfh|work\s*from\s*home|hybrid\s*work|distributed\s*team)/i, intent: "mix" },
  { name: "AI for Workforce (Agentic AI)",      pattern: /(\bai\s*(work|product|monitor|hr|recommendation|tool|analyt)|agentic|machine\s*learning\s*(hr|workforce|product))/i, intent: "mix" },
  { name: "India-specific (DPDPA, ESI, PF, INR)", pattern: /\b(india|indian|dpdpa|aadhaar|\besi\b|\bpf\b|inr|hindi|bangalore|mumbai|delhi|pune|hyderabad|chennai)\b/i, intent: "page" },
  { name: "Field Force / GPS Tracking",         pattern: /(field\s*(employee|force|sales|staff|worker)|gps\s*(track|attendance)|on[-\s]?field)/i, intent: "page" },
  { name: "Engagement / Retention / Attrition", pattern: /(engagement|engaged|attrit|retent|turnover|quiet\s*quit|onboard|offboard|exit\s*interview)/i, intent: "blog" },
  { name: "OKR / Performance Management",       pattern: /(\bokr\b|performance\s*(manage|review)|1\s*on\s*1|goal\s*(set|track))/i, intent: "blog" },
  { name: "Manager / Leadership Training",      pattern: /(manager\s*train|leader\s*train|management\s*course|coaching|first[-\s]?time\s*manager)/i, intent: "blog" },
  { name: "BPO / Call Center Operations",       pattern: /(bpo|call\s*center|aht|first\s*call|shift\s*adherence|agent\s*(productivity|monitor|qa))/i, intent: "mix" },
  { name: "Cost Intelligence / ROI",            pattern: /(cost\s*intelligence|cost\s*of\s*(employee|unproductive)|roi\s*(of|for|productivity)|saas\s*cost|spend\s*optim|employee\s*cost\s*calc)/i, intent: "mix" },
  { name: "Compliance / Security / DLP",        pattern: /(\bdlp\b|data\s*loss|insider\s*threat|shadow\s*it|byod|\bsoc\s*2\b|\biso\s*27|compliance|gdpr|pdpa|ccpa)/i, intent: "mix" },
  { name: "Project & Task Management",          pattern: /(project\s*(track|manage|tool)|task\s*(track|manage|tool))/i, intent: "blog" },
  { name: "Multi-Location / Multi-Office",      pattern: /(multi[-\s]?(location|city|office|branch)|cross[-\s]?location)/i, intent: "page" },
  { name: "Compensation & Benefits",            pattern: /(compensation|salary\s*benchmark|comp\s*range|pay\s*equity|benefits)/i, intent: "blog" },
  { name: "Productivity Hacks / Tips / Methods", pattern: /(productivity\s*(hack|tip|improve|increase|boost|method|technique|paradox)|efficien|focus\s*time|deep\s*work|pomodoro)/i, intent: "blog" },
  { name: "Generic Workforce / HR (catch-all)", pattern: /(employee|workforce|hr|human\s*resource|people\s*manage|staff)/i, intent: "blog" },
];

function clusterOf(kw: string): string {
  const k = kw.toLowerCase();
  for (const c of CLUSTERS) if (c.pattern.test(k)) return c.name;
  return "Other / Misc";
}

function clusterIntent(name: string): "page" | "blog" | "mix" {
  return CLUSTERS.find((c) => c.name === name)?.intent ?? "blog";
}

// =============================================================================
// PHASE 4 — Map clusters to existing site pages
// =============================================================================

const EXISTING_PAGE_MAP: Record<string, string[]> = {
  "Screen Recording & Live Monitoring": ["/features/screen-recording", "/features/screen-shots", "/features/livestream"],
  "Activity Monitoring (apps & URLs)":  ["/features/activity-tracking", "/features/application-and-website-usage", "/features/technology-usage", "/features/devices"],
  "Time Tracking & Timesheets":         ["/solutions/time-tracker", "/features/timesheet", "/features/timeline"],
  "Attendance Management":              ["/automated-attendance", "/attendance-tracking-software", "/features/attendance-insights", "/features/leaves"],
  "Productivity Tracking & Analytics":  ["/features/productivity-tracking", "/solutions/employee-monitoring", "/features/roi-productivity-trends", "/features/business-intelligence"],
  "Workforce Analytics & People Analytics": ["/solutions/workforce-analytics", "/features/business-intelligence", "/features/capacity-planning", "/features/attrition-risk"],
  "Remote Work / WFH / Hybrid":         ["/remote-employee-monitoring", "/solutions/wfh-monitoring", "/solutions/employee-monitoring"],
  "AI for Workforce (Agentic AI)":      ["/features/agentic-ai"],
  "India-specific (DPDPA, ESI, PF, INR)": ["/in/employee-monitoring-software-india", "/in/attendance-tracking-software-india"],
  "Field Force / GPS Tracking":         ["/solutions/field-tracking", "/in/field-force-management-india"],
  "Engagement / Retention / Attrition": ["/features/attrition-risk", "/features/wellness", "/templates/employee-recognition-survey-form"],
  "OKR / Performance Management":       ["/features/goals", "/templates/employee-of-the-month-form"],
  "Manager / Leadership Training":      [],
  "BPO / Call Center Operations":       ["/industry/bpo"],
  "Cost Intelligence / ROI":            ["/features/cost-intelligence", "/employee-productivity-roi-calculator"],
  "Compliance / Security / DLP":        ["/features/usb-detection", "/security-and-compliance"],
  "Project & Task Management":          ["/features/project-and-task-management"],
  "Multi-Location / Multi-Office":      ["/features/location-performance"],
  "Compensation & Benefits":            [],
  "Productivity Hacks / Tips / Methods": ["/blog/best-ai-productivity-tools"],
  "Generic Workforce / HR (catch-all)": [],
  "Other / Misc":                       [],
};

// =============================================================================
// Helpers
// =============================================================================

interface Row {
  keyword: string;
  volume: number;
  competition: string;
  source: "My Research" | "Lokesh Ideas";
  serpFeatures: string;          // Lokesh-only column
  score: number;
  theme: string;
  cluster: string;
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
// Main
// =============================================================================

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);

  const myResearch = wb.getWorksheet("My Research");
  const lokesh = wb.getWorksheet("Lokesh Ideas");
  if (!myResearch || !lokesh) { console.error("Missing required sheets"); process.exit(1); }

  // -------------------------------------------------------------------------
  // PHASE 1 — Read + filter
  // -------------------------------------------------------------------------
  const all: Row[] = [];
  const seen = new Set<string>();

  // My Research: cols are Keyword | Currency | Avg. monthly searches | ...
  const myrHdr = myResearch.getRow(1);
  const myrColMap: Record<string, number> = {};
  myrHdr.eachCell((cell, n) => { myrColMap[pickStr(cell.value).toLowerCase()] = n; });
  const myrKwCol  = myrColMap["keyword"] ?? 1;
  const myrVolCol = myrColMap["avg. monthly searches"] ?? myrColMap["avg monthly searches"] ?? 3;
  const myrCompCol = myrColMap["competition"] ?? 6;

  for (let r = 2; r <= myResearch.actualRowCount; r++) {
    const row = myResearch.getRow(r);
    const kw = pickStr(row.getCell(myrKwCol).value).toLowerCase();
    if (!kw || seen.has(kw)) continue;
    seen.add(kw);
    const vol = pickNum(row.getCell(myrVolCol).value);
    const comp = pickStr(row.getCell(myrCompCol).value);
    const sc = scoreRelevance(kw);
    if (sc.score < 1) continue; // drop off-topic
    all.push({
      keyword: kw, volume: vol, competition: comp,
      source: "My Research", serpFeatures: "",
      score: sc.score, theme: sc.theme, cluster: clusterOf(kw),
    });
  }

  // Lokesh Ideas: cols are Keyword | SERP features | Volume
  const lokHdr = lokesh.getRow(1);
  const lokColMap: Record<string, number> = {};
  lokHdr.eachCell((cell, n) => { lokColMap[pickStr(cell.value).toLowerCase()] = n; });
  const lokKwCol   = lokColMap["keyword"] ?? 1;
  const lokSerpCol = lokColMap["serp features eligibility"] ?? lokColMap["serp features"] ?? 2;
  const lokVolCol  = lokColMap["volume"] ?? lokColMap["avg. monthly searches"] ?? 3;

  for (let r = 2; r <= lokesh.actualRowCount; r++) {
    const row = lokesh.getRow(r);
    const kw = pickStr(row.getCell(lokKwCol).value).toLowerCase();
    if (!kw) continue;
    if (seen.has(kw)) {
      // already in My Research — augment SERP features if available
      const existing = all.find((x) => x.keyword === kw);
      if (existing) existing.serpFeatures = pickStr(row.getCell(lokSerpCol).value);
      continue;
    }
    seen.add(kw);
    const vol = pickNum(row.getCell(lokVolCol).value);
    const sc = scoreRelevance(kw);
    if (sc.score < 1) continue;
    all.push({
      keyword: kw, volume: vol, competition: "",
      source: "Lokesh Ideas", serpFeatures: pickStr(row.getCell(lokSerpCol).value),
      score: sc.score, theme: sc.theme, cluster: clusterOf(kw),
    });
  }

  console.log(`\nPhase 1: ${all.length} useful keywords retained (score ≥ 1)`);
  const byScore: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of all) byScore[r.score]++;
  console.log(`  Score 5 (direct):   ${byScore[5]}`);
  console.log(`  Score 4 (feature):  ${byScore[4]}`);
  console.log(`  Score 3 (persona):  ${byScore[3]}`);
  console.log(`  Score 2 (tangent):  ${byScore[2]}`);
  console.log(`  Score 1 (weak):     ${byScore[1]}`);

  // -------------------------------------------------------------------------
  // PHASE 2 — Cluster summary
  // -------------------------------------------------------------------------
  interface ClusterRow {
    cluster: string;
    intent: "page" | "blog" | "mix";
    keywordCount: number;
    totalVolume: number;
    hubKeyword: string;       // highest-volume kw
    hubVolume: number;
    aiOverviewCount: number;  // # of cluster kws flagged AI Overview by Lokesh
    sampleSpokes: string[];   // up to 8 supporting kws
    existingPages: string[];
  }

  const clusterMap = new Map<string, Row[]>();
  for (const r of all) {
    if (!clusterMap.has(r.cluster)) clusterMap.set(r.cluster, []);
    clusterMap.get(r.cluster)!.push(r);
  }

  const clusterRows: ClusterRow[] = [];
  for (const [name, rows] of clusterMap.entries()) {
    rows.sort((a, b) => b.volume - a.volume);
    const hub = rows[0];
    const aiCount = rows.filter((r) => /AI Overview/i.test(r.serpFeatures)).length;
    clusterRows.push({
      cluster: name,
      intent: clusterIntent(name),
      keywordCount: rows.length,
      totalVolume: rows.reduce((s, r) => s + r.volume, 0),
      hubKeyword: hub.keyword,
      hubVolume: hub.volume,
      aiOverviewCount: aiCount,
      sampleSpokes: rows.slice(1, 9).map((r) => `${r.keyword} (${r.volume.toLocaleString()})`),
      existingPages: EXISTING_PAGE_MAP[name] ?? [],
    });
  }
  clusterRows.sort((a, b) => b.totalVolume - a.totalVolume);

  console.log(`\nPhase 2: ${clusterRows.length} clusters formed.`);
  for (const c of clusterRows.slice(0, 10)) {
    console.log(`  ${c.cluster.padEnd(50)} ${String(c.keywordCount).padStart(4)} kws · ${c.totalVolume.toLocaleString().padStart(10)} vol/mo · hub: "${c.hubKeyword}"`);
  }

  // -------------------------------------------------------------------------
  // PHASE 3 — Blog vs Page recommendation per cluster
  // (driven by intent + AI Overview presence + commercial-pattern heuristic)
  // -------------------------------------------------------------------------
  const COMMERCIAL_PAT = /(software|tool|platform|service|provider|system|app|company|comparison|vs|alternative|price|pricing|best|top|review|free|india)/i;
  const INFO_PAT = /(how|what|why|when|guide|template|example|formula|method|technique|hack|tip|definition|meaning|cause|reason)/i;

  function intentMix(rows: Row[]): { commercial: number; info: number; mixed: number } {
    let c = 0, i = 0;
    for (const r of rows) {
      const isComm = COMMERCIAL_PAT.test(r.keyword);
      const isInfo = INFO_PAT.test(r.keyword);
      if (isComm && !isInfo) c++;
      else if (isInfo && !isComm) i++;
      else c++; // ambiguous → counts as commercial-leaning
    }
    return { commercial: c, info: i, mixed: rows.length - c - i };
  }

  interface PlanRow {
    cluster: string;
    decision: string;          // "Build new PAGE" / "Write BLOG cluster" / "Both"
    rationale: string;
    pageUrlSuggestion: string;
    blogCount: number;
    commercialCount: number;
    infoCount: number;
    totalVolume: number;
  }

  const planRows: PlanRow[] = clusterRows.map((c) => {
    const rows = clusterMap.get(c.cluster)!;
    const im = intentMix(rows);
    let decision: string;
    let rationale: string;
    if (im.commercial >= 5 && im.info >= 3) {
      decision = "BOTH — build hub PAGE + write blog cluster (3-5 spokes)";
      rationale = `${im.commercial} commercial-intent kws + ${im.info} informational kws — page anchors the cluster, blogs feed it`;
    } else if (im.commercial >= im.info * 1.5 || c.intent === "page") {
      decision = "Build new PAGE (or extend existing)";
      rationale = `${im.commercial} commercial vs ${im.info} informational → pure landing-page intent`;
    } else if (im.info >= im.commercial * 1.5 || c.intent === "blog") {
      decision = "Write BLOG cluster (3-5 spokes)";
      rationale = `${im.info} informational vs ${im.commercial} commercial → blog-heavy cluster`;
    } else {
      decision = "BOTH — start with blog cluster, evaluate page after";
      rationale = `Balanced (${im.commercial} commercial, ${im.info} informational) — start blog, see what ranks, then decide page`;
    }
    // Suggest URL slug for the page if applicable
    const slug = c.cluster.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const pageUrl = c.existingPages.length > 0
      ? `(extend existing: ${c.existingPages[0]})`
      : `/${slug}`;
    return {
      cluster: c.cluster,
      decision,
      rationale,
      pageUrlSuggestion: pageUrl,
      blogCount: Math.min(8, rows.length - 1),
      commercialCount: im.commercial,
      infoCount: im.info,
      totalVolume: c.totalVolume,
    };
  });

  // -------------------------------------------------------------------------
  // PHASE 4 — Map keywords → existing pages (extend with FAQs / sections)
  // For each existing page, list the cluster's keywords as "candidates to add"
  // -------------------------------------------------------------------------
  interface MapRow {
    existingPage: string;
    cluster: string;
    keywordsToAdd: string;
    suggestedFormat: string;
    addedVolume: number;
  }

  const mapRows: MapRow[] = [];
  for (const c of clusterRows) {
    const pages = c.existingPages;
    if (pages.length === 0) continue;
    const rows = clusterMap.get(c.cluster)!;
    // Pick top 6 keywords NOT used as the page's primary target — add as FAQ / section
    const candidates = rows.slice(0, 8).map((r) => `"${r.keyword}" (${r.volume.toLocaleString()})`).join("; ");
    for (const page of pages) {
      // Determine format suggestion based on intent
      const im = intentMix(rows);
      const fmt = im.info >= 3 ? "FAQ block (4-6 Qs) + sub-section" : "Sub-section + secondary keywords in body";
      mapRows.push({
        existingPage: page,
        cluster: c.cluster,
        keywordsToAdd: candidates,
        suggestedFormat: fmt,
        addedVolume: rows.slice(0, 8).reduce((s, r) => s + r.volume, 0),
      });
    }
  }
  mapRows.sort((a, b) => b.addedVolume - a.addedVolume);

  // -------------------------------------------------------------------------
  // Write 4 new tabs to the destination XLSX
  // -------------------------------------------------------------------------
  for (const tabName of ["Useful Keywords", "Topic Clusters", "Blog vs Page Plan", "Map to Existing Pages"]) {
    const existing = wb.getWorksheet(tabName);
    if (existing) wb.removeWorksheet(existing.id);
  }

  // === Tab 1: Useful Keywords ===
  const ws1 = wb.addWorksheet("Useful Keywords");
  ws1.columns = [
    { header: "Keyword",                key: "kw",       width: 50 },
    { header: "Volume / mo",            key: "vol",      width: 14 },
    { header: "Competition",            key: "comp",     width: 14 },
    { header: "Source",                 key: "src",      width: 14 },
    { header: "SERP features (Lokesh)", key: "serp",     width: 50 },
    { header: "Score (5=direct, 1=weak)", key: "score",  width: 12 },
    { header: "Theme",                  key: "theme",    width: 24 },
    { header: "Cluster",                key: "cluster",  width: 40 },
  ];
  styleHeader(ws1);
  const sortedAll = [...all].sort((a, b) => b.score - a.score || b.volume - a.volume);
  for (const r of sortedAll) {
    const row = ws1.addRow({
      kw: r.keyword, vol: r.volume, comp: r.competition, src: r.source,
      serp: r.serpFeatures, score: r.score, theme: r.theme, cluster: r.cluster,
    });
    if (r.score === 5) row.getCell("score").fill = solid("FFD1FAE5");
    else if (r.score === 4) row.getCell("score").fill = solid("FFE6FFFA");
    else if (r.score === 3) row.getCell("score").fill = solid("FFFEF3C7");
    else if (r.score === 2) row.getCell("score").fill = solid("FFFEE2E2");
    else row.getCell("score").fill = solid("FFF3F4F6");
  }
  ws1.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 8 } };
  ws1.views = [{ state: "frozen", ySplit: 1 }];

  // === Tab 2: Topic Clusters ===
  const ws2 = wb.addWorksheet("Topic Clusters");
  ws2.columns = [
    { header: "Cluster",              key: "cluster",   width: 42 },
    { header: "# Keywords",           key: "count",     width: 12 },
    { header: "Total volume / mo",    key: "vol",       width: 18 },
    { header: "Hub keyword (highest vol)", key: "hub", width: 40 },
    { header: "Hub volume",           key: "hubVol",    width: 14 },
    { header: "AI Overview count",    key: "ai",        width: 16 },
    { header: "Sample spokes (top 8)", key: "spokes",   width: 80 },
    { header: "Recommended intent",   key: "intent",    width: 16 },
    { header: "Existing site pages",  key: "existing",  width: 50 },
  ];
  styleHeader(ws2);
  for (const c of clusterRows) {
    const row = ws2.addRow({
      cluster: c.cluster, count: c.keywordCount, vol: c.totalVolume,
      hub: c.hubKeyword, hubVol: c.hubVolume, ai: c.aiOverviewCount,
      spokes: c.sampleSpokes.join(" · "),
      intent: c.intent.toUpperCase(),
      existing: c.existingPages.join(", ") || "(none — net-new opportunity)",
    });
    row.alignment = { vertical: "top", wrapText: true };
    row.height = Math.min(120, 20 + c.sampleSpokes.length * 8);
    if (c.intent === "page") row.getCell("intent").fill = solid("FFEDE9FE");
    else if (c.intent === "blog") row.getCell("intent").fill = solid("FFFCE7F3");
    else row.getCell("intent").fill = solid("FFFEF3C7");
  }
  ws2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 9 } };
  ws2.views = [{ state: "frozen", ySplit: 1 }];

  // === Tab 3: Blog vs Page Plan ===
  const ws3 = wb.addWorksheet("Blog vs Page Plan");
  ws3.columns = [
    { header: "Cluster",                 key: "cluster",   width: 42 },
    { header: "Decision",                key: "decision",  width: 50 },
    { header: "Why",                     key: "why",       width: 65 },
    { header: "Page URL suggestion",     key: "url",       width: 36 },
    { header: "# Blogs in cluster",      key: "blogs",     width: 12 },
    { header: "Commercial-intent kws",   key: "comm",      width: 18 },
    { header: "Informational kws",       key: "info",      width: 16 },
    { header: "Total volume / mo",       key: "vol",       width: 18 },
  ];
  styleHeader(ws3);
  for (const p of planRows) {
    const row = ws3.addRow({
      cluster: p.cluster, decision: p.decision, why: p.rationale,
      url: p.pageUrlSuggestion, blogs: p.blogCount,
      comm: p.commercialCount, info: p.infoCount, vol: p.totalVolume,
    });
    row.alignment = { vertical: "top", wrapText: true };
    row.height = 50;
    // Color decision cell by type
    if (/^Build new PAGE/i.test(p.decision)) row.getCell("decision").fill = solid("FFEDE9FE");
    else if (/^Write BLOG/i.test(p.decision)) row.getCell("decision").fill = solid("FFFCE7F3");
    else if (/^BOTH/i.test(p.decision)) row.getCell("decision").fill = solid("FFFEF3C7");
  }
  ws3.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 8 } };
  ws3.views = [{ state: "frozen", ySplit: 1 }];

  // === Tab 4: Map to Existing Pages ===
  const ws4 = wb.addWorksheet("Map to Existing Pages");
  ws4.columns = [
    { header: "Existing page URL",        key: "page",     width: 50 },
    { header: "Cluster",                  key: "cluster",  width: 42 },
    { header: "Keywords to weave in (top 8 by volume)", key: "kws", width: 90 },
    { header: "Suggested format",         key: "fmt",      width: 36 },
    { header: "Added volume opportunity", key: "vol",      width: 22 },
  ];
  styleHeader(ws4);
  for (const m of mapRows) {
    const row = ws4.addRow({
      page: m.existingPage, cluster: m.cluster, kws: m.keywordsToAdd,
      fmt: m.suggestedFormat, vol: m.addedVolume,
    });
    row.alignment = { vertical: "top", wrapText: true };
    row.height = 70;
  }
  ws4.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 } };
  ws4.views = [{ state: "frozen", ySplit: 1 }];

  // -------------------------------------------------------------------------
  // Save + summary print
  // -------------------------------------------------------------------------
  await wb.xlsx.writeFile(DEST);
  console.log(`\n✅ Wrote ${DEST}`);
  console.log(`   Original: ${SRC}  (untouched)\n`);
  console.log(`Tabs added:`);
  console.log(`  📋 Useful Keywords       — ${all.length} rows (filtered from ${myResearch.actualRowCount + lokesh.actualRowCount - 2} raw)`);
  console.log(`  🗂️  Topic Clusters        — ${clusterRows.length} clusters`);
  console.log(`  📐 Blog vs Page Plan     — ${planRows.length} decisions`);
  console.log(`  🔗 Map to Existing Pages — ${mapRows.length} page-keyword mappings`);
}

function styleHeader(ws: ExcelJS.Worksheet) {
  const hr = ws.getRow(1);
  hr.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF231D4F" } };
  hr.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  hr.height = 28;
}

function solid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

main().catch((e) => { console.error(e); process.exit(1); });
