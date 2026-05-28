#!/usr/bin/env tsx
/**
 * Importer for "SEO Content Brief – New Solution Pages" PDF (shared 2026-05-28).
 *
 * Adds 6 new landing-page tasks to the blog sprint, assigned to Lokesh,
 * scheduled across the upcoming week (Mon Jun 1 – Sat Jun 6, 2026). Every
 * existing task currently scheduled in Jun 1-7 is bumped +7 days to make
 * room — preserves the day-of-week, just slides into Jun 8-14.
 *
 * The PDF contains 6 pages:
 *   1. /features/ai-tools-usage-tracking
 *   2. /features/ai-optimization-spend
 *   3. /features/employee-retention-risk-analysis
 *   4. /features/executive-insights
 *   5. /solutions/operations-it
 *   6. /solutions/finance
 *
 * One placeholder for #1 already exists on Jun 1 ("AI Tools Usage Tracking
 * (Copilot, ChatGPT, Gemini, Claude)") with an empty brief. We DELETE it
 * before the bump pass so the new fully-briefed task replaces it instead of
 * duplicating + drifting to Jun 8.
 *
 * Each task's brief is fully populated (target_keyword + secondary_keywords +
 * recommended_h1 + recommended_h2s + recommended_h3s + paa_questions +
 * internal_links + writer_notes) so the Copy AI Prompt button on the task
 * detail dialog renders a complete page brief with no manual editing.
 *
 * Idempotent: re-running first checks for existing tasks with the same
 * title prefix `[SP1]` ... `[SP6]` and updates in place rather than inserting.
 *
 * Run:  npx tsx --env-file=.env.local scripts/import-solution-pages-jun.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env"); process.exit(1);
}
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.trim());
const PROJECT_ID = "11111111-1111-4111-8111-000000000001";
const LOKESH_ID = "6248781f-82cf-4cb8-abea-30aa27aebcbf";

// ---------------------------------------------------------------------------
// Source data, transcribed verbatim from the PDF
// ---------------------------------------------------------------------------

interface SolutionPageBrief {
  key: string;                 // "SP1" .. "SP6" — task-title suffix for idempotent dedupe
  scheduledDate: string;       // YYYY-MM-DD (must be in Jun 1-6 range)
  priority: "critical" | "high" | "medium" | "low";
  url: string;                 // suggested URL slug (without domain)
  title: string;               // plain-English title shown on the kanban card
  format: "solution-page";     // matches FORMAT_OPTIONS in bulk-upload-tasks-button.tsx
  recommendedH1: string;       // PDF "Suggested H1"
  targetKeyword: string;       // first primary keyword
  primaryKeywords: string[];   // ALL primary keywords from the PDF
  secondaryKeywords: string[]; // PDF "Secondary Keywords" + "Supporting SEO Terms" merged
  recommendedH2s: string[];    // PDF "Suggested H2s" (top-level only)
  recommendedH3s: string[];    // PDF bullets under each H2, flattened
  paaQuestions: string[];      // We synthesize 4-6 PAA-style questions from the H2s + intent
  internalLinks: string[];     // /vs/* + /solutions/* + /features/* + /blog/* that thematically link
  dataBacking: string;         // free-form rationale shown in the yellow callout above the brief
  wordCountTarget: number;
}

const PAGES: SolutionPageBrief[] = [
  // -------------------------------------------------------------------------
  // 1. AI Tools Usage Tracking (Copilot, ChatGPT, Gemini, Claude)
  // -------------------------------------------------------------------------
  {
    key: "SP1",
    scheduledDate: "2026-06-01",       // Mon
    priority: "critical",
    url: "/features/ai-tools-usage-tracking",
    title: "Build new feature page: AI Tools Usage Tracking (Copilot, ChatGPT, Gemini, Claude)",
    format: "solution-page",
    recommendedH1: "AI Tools Usage Tracking & AI Productivity Insights",
    targetKeyword: "AI tools usage tracking",
    primaryKeywords: [
      "AI tools usage tracking",
      "AI ROI tracking",
      "AI productivity impact",
      "AI governance and compliance",
      "AI adoption benchmarking",
      "AI usage analytics",
      "AI workforce analytics",
      "ChatGPT employee usage tracking",
      "Copilot usage tracking",
      "Gemini usage analytics",
      "Claude AI monitoring",
    ],
    secondaryKeywords: [
      "AI adoption maturity",
      "enterprise AI visibility",
      "AI productivity measurement",
      "AI usage dashboard",
      "AI compliance tracking",
      "AI policy management",
      "AI insights for enterprises",
      "workforce AI trends",
    ],
    recommendedH2s: [
      "Monitor Enterprise AI Tool Adoption",
      "Measure AI ROI & Productivity Impact",
      "AI Governance & Compliance Monitoring",
      "Benchmark AI Adoption Across Teams",
      "Executive Dashboard for AI Insights",
    ],
    recommendedH3s: [
      "Track ChatGPT, Copilot, Gemini, Claude usage",
      "Department-wise AI adoption visibility",
      "Productivity gains from AI tools",
      "AI-assisted workflow analysis",
      "Shadow AI detection",
      "AI usage policy compliance",
      "AI maturity benchmarking",
      "Compare adoption trends by department",
      "AI usage analytics",
      "ROI dashboards for leadership",
    ],
    paaQuestions: [
      "How do you track ChatGPT and Copilot usage across employees?",
      "What is shadow AI and how do you detect it in enterprises?",
      "How is AI ROI measured for workforce productivity?",
      "Which department uses generative AI the most?",
      "Can you measure AI adoption maturity across teams?",
      "How does AI usage tracking comply with DPDPA and GDPR?",
    ],
    internalLinks: [
      "/solutions/employee-monitoring",
      "/features/productivity-tracking",
      "/features/application-tracking",
      "/blog/employee-monitoring-software",
    ],
    dataBacking: `New solution page launching the AI category. Target buyers: CIOs, CTOs, IT Leaders, CHROs running pilot or production deployments of ChatGPT Enterprise / Copilot for M365 / Gemini for Workspace / Claude for Work. Current AI-tool category search demand is rising 60-80% QoQ globally and there is no Indian competitor owning "AI tools usage tracking" as a navigational phrase yet. We own the workforce-analytics narrative — this page extends it into the AI-governance buying cycle.`,
    wordCountTarget: 1800,
  },

  // -------------------------------------------------------------------------
  // 2. AI Optimization & Spend
  // -------------------------------------------------------------------------
  {
    key: "SP2",
    scheduledDate: "2026-06-02",       // Tue
    priority: "high",
    url: "/features/ai-optimization-spend",
    title: "Build new feature page: AI Optimization & Spend",
    format: "solution-page",
    recommendedH1: "Optimize AI Spend & Reduce License Waste",
    targetKeyword: "AI optimization",
    primaryKeywords: [
      "AI optimization",
      "AI spend management",
      "AI license optimization",
      "AI software spend tracking",
      "AI cost optimization",
      "AI license waste",
      "AI spend recovery",
    ],
    secondaryKeywords: [
      "SaaS AI optimization",
      "AI subscription visibility",
      "AI utilization tracking",
      "unused AI licenses",
      "AI budget optimization",
      "AI spend analytics",
    ],
    recommendedH2s: [
      "Identify Unused AI Licenses",
      "Optimize AI Tool Investments",
      "Improve AI ROI Across Teams",
      "Recover Wasted SaaS & AI Spend",
      "Enterprise AI Spend Analytics",
    ],
    recommendedH3s: [
      "Detect inactive AI subscriptions",
      "Reduce unnecessary AI costs",
      "AI utilization tracking",
      "Cost vs usage analysis",
      "AI adoption vs spend insights",
      "Budget allocation visibility",
      "License waste recovery",
      "AI tool rationalization",
      "Department-wise spend analysis",
      "AI software optimization dashboard",
    ],
    paaQuestions: [
      "How much do unused AI subscriptions cost enterprises annually?",
      "How do you identify shadow AI subscriptions in a SaaS portfolio?",
      "What is AI license waste and how is it calculated?",
      "How to optimize AI spend across departments?",
      "Which AI tools are over-licensed in most enterprises?",
    ],
    internalLinks: [
      "/features/ai-tools-usage-tracking",
      "/features/application-tracking",
      "/solutions/employee-monitoring",
      "/blog/employee-productivity-roi-calculator",
    ],
    dataBacking: `Companion page to /features/ai-tools-usage-tracking, targets the spend-side buyer (CFO, FinOps lead, IT Procurement). Pitch is: enterprises waste 30-40% of their AI subscription budget on unused / under-utilized licenses (Copilot, ChatGPT Enterprise, Gemini, Claude). We360 surfaces who actually uses the tools so procurement can right-size. No Indian-market competitor explicitly owns "AI license waste" — green field.`,
    wordCountTarget: 1800,
  },

  // -------------------------------------------------------------------------
  // 3. AI-enabled Retention Risk / Attrition Prediction
  // -------------------------------------------------------------------------
  {
    key: "SP3",
    scheduledDate: "2026-06-03",       // Wed
    priority: "high",
    url: "/features/employee-retention-risk-analysis",
    title: "Build new feature page: AI-Powered Employee Retention & Attrition Prediction",
    format: "solution-page",
    recommendedH1: "AI-Powered Employee Retention & Attrition Prediction",
    targetKeyword: "employee retention risk",
    primaryKeywords: [
      "employee retention risk",
      "attrition prediction software",
      "employee disengagement analytics",
      "workforce retention analytics",
      "AI attrition prediction",
      "employee turnover prediction",
    ],
    secondaryKeywords: [
      "employee burnout detection",
      "workforce disengagement",
      "employee behavior analytics",
      "predictive workforce analytics",
      "retention intelligence",
      "workforce risk insights",
    ],
    recommendedH2s: [
      "Detect Early Signs of Employee Disengagement",
      "Predict Employee Attrition Risks",
      "Improve Workforce Retention Strategies",
      "Workforce Behavior & Productivity Insights",
      "Executive Workforce Risk Dashboard",
    ],
    recommendedH3s: [
      "Productivity decline indicators",
      "Work pattern analysis",
      "AI-powered workforce predictions",
      "High-risk employee identification",
      "Managerial intervention insights",
      "Retention improvement analytics",
      "Employee engagement trends",
      "Work-life balance analytics",
      "Team retention analytics",
      "Attrition forecasting",
    ],
    paaQuestions: [
      "How can AI predict employee attrition before resignation?",
      "What are the early signs of employee disengagement?",
      "How do you measure burnout risk across a workforce?",
      "What workforce signals indicate high attrition risk?",
      "Can productivity data predict who will quit?",
    ],
    internalLinks: [
      "/solutions/employee-monitoring",
      "/features/productivity-tracking",
      "/blog/employee-burnout",
      "/blog/employee-engagement-metrics",
    ],
    dataBacking: `Page targets CHRO + HRBP + People Analytics buyers worried about attrition during the post-2025 hiring slowdown. Differentiation: most competitors (Visier, Workday Talent) need 24+ months of HRIS data. We360 predicts using passive productivity signals (app usage drops, work pattern shifts, focus-time decay) — works in 30 days.`,
    wordCountTarget: 1800,
  },

  // -------------------------------------------------------------------------
  // 4. Executive Insights / Hidden Capacity & Financial Loss
  // -------------------------------------------------------------------------
  {
    key: "SP4",
    scheduledDate: "2026-06-04",       // Thu
    priority: "high",
    url: "/features/executive-insights",
    title: "Build new feature page: Executive Insights into Hidden Capacity & Financial Loss",
    format: "solution-page",
    recommendedH1: "Executive Insights into Hidden Capacity & Financial Loss",
    targetKeyword: "executive workforce insights",
    primaryKeywords: [
      "executive workforce insights",
      "hidden productivity loss",
      "workforce capacity analysis",
      "operational efficiency analytics",
      "workforce financial loss analysis",
      "hidden capacity tracking",
    ],
    secondaryKeywords: [
      "executive productivity dashboard",
      "workforce utilization analytics",
      "operational waste analysis",
      "productivity benchmarking",
      "business efficiency insights",
      "workforce intelligence dashboard",
      "workforce efficiency analytics",
      "operational intelligence software",
      "business productivity analytics",
      "employee utilization software",
    ],
    recommendedH2s: [
      "Identify Hidden Productivity Gaps",
      "Discover Untapped Workforce Capacity",
      "Analyze Financial Impact of Inefficiencies",
      "Executive-Level Workforce Dashboards",
      "Improve Operational Efficiency",
    ],
    recommendedH3s: [
      "Productivity leakage analysis",
      "Time waste visibility",
      "Capacity planning insights",
      "Team utilization analytics",
      "Productivity cost analysis",
      "Operational loss visibility",
      "Organization-wide performance insights",
      "Department benchmarking",
      "Data-driven workforce optimization",
      "Productivity improvement strategies",
    ],
    paaQuestions: [
      "How do you measure hidden productivity loss in an organization?",
      "What is workforce capacity analysis?",
      "How do you quantify the financial cost of low productivity?",
      "How can executives identify operational waste?",
      "Which dashboards do CEOs use to track workforce efficiency?",
    ],
    internalLinks: [
      "/solutions/employee-monitoring",
      "/features/productivity-tracking",
      "/blog/employee-productivity-roi-calculator",
      "/blog/how-to-measure-productivity-formula-metrics-and-best-methods",
    ],
    dataBacking: `Executive-tier page targeting CEO / COO / CFO buyers — the "show me the money" view of workforce analytics. Pitch: typical mid-market enterprise loses ₹2-5 Cr / year on hidden capacity (unbilled time, parallel tool use, low utilization). Page should anchor to the ROI calculator and lead to the demo CTA. Differentiation: dashboards built for boardroom, not for HRBP.`,
    wordCountTarget: 2000,
  },

  // -------------------------------------------------------------------------
  // 5. Solutions for Operations & IT
  // -------------------------------------------------------------------------
  {
    key: "SP5",
    scheduledDate: "2026-06-05",       // Fri
    priority: "high",
    url: "/solutions/operations-it",
    title: "Build new solution page: Workforce Analytics for Operations & IT Teams",
    format: "solution-page",
    recommendedH1: "Workforce Analytics Solutions for Operations & IT Teams",
    targetKeyword: "operations workforce analytics",
    primaryKeywords: [
      "operations workforce analytics",
      "IT workforce monitoring",
      "IT productivity analytics",
      "operations productivity software",
      "workforce visibility for IT teams",
    ],
    secondaryKeywords: [
      "operational efficiency tracking",
      "IT team productivity monitoring",
      "digital operations analytics",
      "workforce operations dashboard",
      "employee performance analytics",
      "IT operations analytics",
      "workforce operations intelligence",
      "employee productivity software for IT",
      "operations management analytics",
    ],
    recommendedH2s: [
      "Improve IT Team Productivity",
      "Optimize Operational Efficiency",
      "Gain Real-Time Workforce Visibility",
      "Strengthen Compliance & Security",
      "Data-Driven Operational Decisions",
    ],
    recommendedH3s: [
      "Monitor engineering productivity",
      "Track digital workflows",
      "Identify process bottlenecks",
      "Improve workforce utilization",
      "Team productivity dashboards",
      "Operational performance insights",
      "Workforce policy compliance",
      "Digital activity visibility",
      "Executive reporting",
      "Productivity benchmarking",
    ],
    paaQuestions: [
      "How is workforce analytics used in IT operations?",
      "Which KPIs matter for engineering productivity?",
      "How do you measure IT team productivity remotely?",
      "What is operational efficiency tracking?",
      "How does workforce analytics support IT compliance?",
    ],
    internalLinks: [
      "/solutions/employee-monitoring",
      "/features/productivity-tracking",
      "/features/application-tracking",
      "/industries/it-services",
    ],
    dataBacking: `First entry in the "Solutions for <function>" navigation pattern. Targets ITOps + DevOps + Service-Desk leaders. The pitch differs from the HR pitch: this is about workflow visibility, ticket-cycle-time correlation, on-call balance, and incident-response patterns — not about "are people working." Keep the tone collaborative-engineer, not punitive-manager.`,
    wordCountTarget: 1800,
  },

  // -------------------------------------------------------------------------
  // 6. Solutions for Finance
  // -------------------------------------------------------------------------
  {
    key: "SP6",
    scheduledDate: "2026-06-06",       // Sat
    priority: "high",
    url: "/solutions/finance",
    title: "Build new solution page: Workforce Analytics for Finance Teams",
    format: "solution-page",
    recommendedH1: "Workforce Analytics Solutions for Finance Teams",
    targetKeyword: "workforce analytics for finance",
    primaryKeywords: [
      "workforce analytics for finance",
      "finance team productivity software",
      "financial operations analytics",
      "finance workforce monitoring",
      "finance productivity insights",
    ],
    secondaryKeywords: [
      "finance operations efficiency",
      "accounting team productivity",
      "workforce analytics for CFOs",
      "finance department analytics",
      "employee productivity for finance teams",
      "finance workforce intelligence",
      "accounting productivity analytics",
      "CFO workforce dashboard",
      "finance operations optimization",
    ],
    recommendedH2s: [
      "Improve Finance Team Productivity",
      "Gain Visibility into Team Performance",
      "Reduce Operational Inefficiencies",
      "Support Compliance & Governance",
      "Executive Insights for CFOs",
    ],
    recommendedH3s: [
      "Track operational efficiency",
      "Optimize financial workflows",
      "Finance workforce dashboards",
      "Workload distribution analysis",
      "Productivity bottleneck detection",
      "Process optimization insights",
      "Audit-ready workforce visibility",
      "Secure workforce analytics",
      "Financial productivity benchmarking",
      "Workforce cost optimization",
    ],
    paaQuestions: [
      "How is workforce analytics used in finance teams?",
      "What productivity metrics matter for accounting teams?",
      "How do CFOs measure finance department productivity?",
      "What workforce data supports SOX / DPDPA compliance?",
      "How do you track workload distribution in finance teams?",
    ],
    internalLinks: [
      "/solutions/employee-monitoring",
      "/features/productivity-tracking",
      "/features/timesheet",
      "/industries/finance",
    ],
    dataBacking: `Companion to /solutions/operations-it. Targets CFO + Finance Operations + Audit/Compliance leaders. Lean into the audit-and-governance angle: workforce data as audit-trail material, plus the controllership-side productivity question (close cycle time, FTE per ledger entry, AP automation gaps). Indian audience: anchor compliance angle in DPDPA + IT Act, not GDPR.`,
    wordCountTarget: 1800,
  },
];

// ---------------------------------------------------------------------------
// Brief builder — produces the same JSON shape as bulkCreateBlogTasks().brief,
// fully populated so the Copy AI Prompt button renders a complete page brief.
// ---------------------------------------------------------------------------
function briefFor(p: SolutionPageBrief) {
  // Merge primary (minus the target keyword used as H1 anchor) + secondary
  // into a deduped "secondary_keywords" array. The Copy AI Prompt template
  // surfaces these as the keyword pool in Section 4.
  const seen = new Set<string>([p.targetKeyword.toLowerCase()]);
  const secondaries: string[] = [];
  for (const k of [...p.primaryKeywords, ...p.secondaryKeywords]) {
    const key = k.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    secondaries.push(k.trim());
  }

  return {
    title: p.title,
    target_keyword: p.targetKeyword,
    recommended_h1: p.recommendedH1,
    recommended_h2s: p.recommendedH2s,
    recommended_h3s: p.recommendedH3s,
    paa_questions: p.paaQuestions,
    secondary_keywords: secondaries,
    sections_breakdown: [],
    internal_links: p.internalLinks,
    competitor_refs: [
      "https://www.activtrak.com/solutions/",
      "https://www.teramind.co/solutions/",
      "https://www.hubstaff.com/employee-monitoring",
    ],
    writer_notes: [
      `Format: ${p.format}`,
      `Suggested URL: ${p.url}`,
      // AEO rules from blog-brief.ts writerNotesFor() — copied here so they
      // also apply to this manually-seeded brief.
      `Reframe at least 2 body H2s as direct questions ("How does X work?" not "How X works"). Lead each question H2 with a 1-2 sentence direct answer before expanding.`,
      `Define any specialist term inline on first use (e.g. DPDPA, GDPR Art. 88, AHT, ISO 27001) in 1-2 sentences.`,
      // Page-specific structural notes
      `Above-the-fold hero must include H1 + 1-line subhead + primary CTA + trust line.`,
      `Include 1 comparison table (We360 vs 2-3 competitors) somewhere in the body.`,
      `Add FAQPage JSON-LD schema for the PAA questions block.`,
      `Add SoftwareApplication schema with offers / aggregateRating / brand fields.`,
      `Anchor the CTA to /book-demo (primary) and /pricing (secondary). Do NOT invent new CTAs.`,
    ],
    word_count_target: p.wordCountTarget,
    intent: "commercial" as const,
    generated_by: "manual" as const,
  };
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

async function deleteExistingPlaceholder() {
  // Delete the empty "AI Tools Usage Tracking (Copilot, ChatGPT, Gemini, Claude)"
  // task on Jun 1 — the SP1 task supersedes it. Done BEFORE the bump pass so
  // it doesn't slide to Jun 8 and become a duplicate.
  const { data: rows } = await admin
    .from("tasks")
    .select("id, title, scheduled_date")
    .eq("project_id", PROJECT_ID)
    .eq("scheduled_date", "2026-06-01")
    .ilike("title", "AI Tools Usage Tracking (Copilot, ChatGPT, Gemini, Claude)%");
  for (const r of (rows ?? []) as Array<{ id: string; title: string }>) {
    console.log(`  🗑  deleting placeholder: ${r.title.slice(0, 80)}`);
    await admin.from("tasks").delete().eq("id", r.id);
  }
  return (rows ?? []).length;
}

async function bumpExistingJun1to7By7Days() {
  // Bump every remaining Jun 1-7 task forward by 7 days so the new PDF tasks
  // can take that week. Preserves day-of-week. Skip any task that already has
  // an [SPx] suffix — those are our own tasks (idempotent re-runs).
  const { data: rows } = await admin
    .from("tasks")
    .select("id, title, scheduled_date")
    .eq("project_id", PROJECT_ID)
    .gte("scheduled_date", "2026-06-01")
    .lte("scheduled_date", "2026-06-07");
  let bumped = 0;
  for (const r of (rows ?? []) as Array<{ id: string; title: string; scheduled_date: string }>) {
    if (/\[SP\d+\]$/.test(r.title)) {
      continue;            // our own task — skip
    }
    const d = new Date(`${r.scheduled_date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7);
    const newDate = d.toISOString().slice(0, 10);
    const { error } = await admin
      .from("tasks")
      .update({ scheduled_date: newDate })
      .eq("id", r.id);
    if (error) {
      console.error(`  ❌ bump failed for ${r.title}: ${error.message}`);
      continue;
    }
    bumped += 1;
    console.log(`  ⏭  ${r.scheduled_date} → ${newDate}  ${r.title.slice(0, 70)}`);
  }
  return bumped;
}

async function upsertPdfTask(p: SolutionPageBrief): Promise<"inserted" | "updated"> {
  const keyTag = `[${p.key}]`;
  const fullTitle = `[New Page] ${p.title} ${keyTag}`;

  const { data: existing } = await admin
    .from("tasks")
    .select("id")
    .eq("project_id", PROJECT_ID)
    .ilike("title", `%${keyTag}`)
    .limit(1)
    .maybeSingle();

  const brief = briefFor(p);

  const row: Record<string, unknown> = {
    project_id: PROJECT_ID,
    kind: "blog_task",
    title: fullTitle,
    url: `https://we360.ai${p.url}`,    // full URL so taskKindLabel + report views work
    target_keyword: p.targetKeyword,
    priority: p.priority,
    status: "todo",
    scheduled_date: p.scheduledDate,
    team_member_id: LOKESH_ID,
    source: "manual",
    pillar: "SEO",
    task_type: "New Page",
    word_count_target: p.wordCountTarget,
    intent: "commercial",
    competition: "Medium Competition",
    brief,
    data_backing: p.dataBacking,
    issue: `New solution page (zero existing content). Build from scratch using the H1/H2/H3 + keyword pool below.`,
    impl: [
      `1. Build the Webflow page at ${p.url} following the H2 structure in the brief.`,
      `2. Use the recommended_h1 verbatim, H2s in order, H3s as section anchors.`,
      `3. Add hero CTA + mid-page CTA + final CTA — all pointing to /book-demo.`,
      `4. Add a 3-column comparison table (We360 vs 2-3 named competitors).`,
      `5. Add FAQ block with the PAA questions + FAQPage JSON-LD.`,
      `6. Add SoftwareApplication JSON-LD with brand + offers + aggregateRating.`,
      `7. Submit to GSC > URL Inspection > Request Indexing once live.`,
      `8. Add internal links FROM ${p.internalLinks.slice(0, 3).join(", ")} pointing to the new page.`,
      ``,
      `Acceptance: page live, indexed in GSC within 7 days, has at least 5 inbound internal links from existing high-traffic blogs.`,
    ].join("\n"),
    est_volume: null,
  };

  if (existing) {
    const { error } = await admin.from("tasks").update(row).eq("id", existing.id);
    if (error) throw error;
    return "updated";
  }

  // INSERT — we need a created_by. Use Lokesh himself (he's the assignee, makes sense).
  const { error } = await admin.from("tasks").insert({ ...row, created_by: LOKESH_ID });
  if (error) throw error;
  return "inserted";
}

async function main() {
  console.log("=== Step 1: delete Jun 1 placeholder for AI Tools Usage Tracking ===");
  const deleted = await deleteExistingPlaceholder();
  console.log(`  deleted ${deleted} placeholder task(s)\n`);

  console.log("=== Step 2: bump Jun 1-7 tasks +7 days (preserve day-of-week) ===");
  const bumped = await bumpExistingJun1to7By7Days();
  console.log(`  bumped ${bumped} task(s)\n`);

  console.log("=== Step 3: insert/update 6 PDF tasks, assigned to Lokesh ===");
  let inserted = 0;
  let updated = 0;
  for (const p of PAGES) {
    const action = await upsertPdfTask(p);
    if (action === "inserted") inserted += 1; else updated += 1;
    console.log(`  ${action === "inserted" ? "➕" : "♻"}  ${p.key} · ${p.scheduledDate} · ${p.url}`);
  }
  console.log(`\n=== Done. inserted=${inserted}  updated=${updated}  bumped=${bumped}  deleted=${deleted} ===`);

  // Verification echo
  const { data: lokeshJun } = await admin
    .from("tasks")
    .select("title, scheduled_date, priority, target_keyword")
    .eq("project_id", PROJECT_ID)
    .eq("team_member_id", LOKESH_ID)
    .gte("scheduled_date", "2026-06-01")
    .lte("scheduled_date", "2026-06-07")
    .order("scheduled_date");
  console.log(`\n=== Lokesh's Jun 1-7 queue after run (${(lokeshJun ?? []).length}) ===`);
  for (const t of (lokeshJun ?? []) as Array<{ title: string; scheduled_date: string; priority: string; target_keyword: string }>) {
    console.log(`  ${t.scheduled_date}  [${t.priority.padEnd(8)}]  ${t.title.slice(0, 75)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
