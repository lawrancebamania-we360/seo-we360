#!/usr/bin/env tsx
/**
 * Phase 14: Gap-fill brief fields that the Apify pass left thin.
 *
 * Apify gives us H2s + secondary kws + writer notes consistently, but H3s,
 * PAA questions and competitor refs depend on what's in the SERP — many
 * keywords don't trigger PAA boxes, the content-gap actor sometimes returns
 * H2s without nested H3s, and our URL filter strips Wikipedia/Reddit
 * (intentional but leaves some keywords with too few competitor refs).
 *
 * This script fills those gaps with SaaS-tailored heuristics so every card
 * has at least:
 *   - 6+ H3 subsections
 *   - 5+ PAA / FAQ questions
 *   - 5+ competitor / authoritative reference URLs
 *   - 6+ writer notes (SEO checklist + Apify findings if any)
 *
 * Idempotent — only fills empty fields, never overwrites real Apify data.
 *
 * Usage:
 *   npx tsx scripts/upload-master-brief/14-gap-fill-briefs.ts            # dry run
 *   npx tsx scripts/upload-master-brief/14-gap-fill-briefs.ts --execute  # write
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);
const PROJECT_ID = "11111111-1111-4111-8111-000000000001";
const EXECUTE = process.argv.includes("--execute");

type Pattern = "question" | "how_to" | "best" | "vs" | "alternative" | "integration" | "definition" | "guide" | "generic";

function detectPattern(keyword: string, title: string): Pattern {
  const k = keyword.toLowerCase().trim();
  const t = title.toLowerCase();
  if (/^how to\b/.test(k)) return "how_to";
  if (/^(is|are|can|does|do|will|should|why|when|who|where|which)\b/.test(k)) return "question";
  if (/^(best|top\s+\d*)\b/.test(k)) return "best";
  if (/\s+vs\s+|\bversus\b/.test(k)) return "vs";
  if (/\balternative/.test(k)) return "alternative";
  if (/\bintegration/.test(k) || /^we360 \w+ integration/.test(k)) return "integration";
  if (/^what is\b|^what's\b|^definition/.test(k)) return "definition";
  if (/\b(guide|tutorial|handbook|playbook)\b/.test(k) || /\b(guide|playbook)\b/.test(t)) return "guide";
  return "generic";
}

// ---------------------------------------------------------------- H3s
function h3sFor(pattern: Pattern, kw: string): string[] {
  switch (pattern) {
    case "best":
    case "vs":
      return [
        "Evaluation methodology and weighting",
        "Pricing tiers and total cost of ownership (TCO)",
        "Feature parity matrix — must-haves vs nice-to-haves",
        "Integration ecosystem (HRMS, payroll, project tools)",
        "Customer reviews, ratings, and notable case studies",
        "Free trial scope and onboarding experience",
        "Security, compliance certifications (ISO 27001, SOC 2, GDPR)",
        "Support tiers, SLAs, and customer-success motion",
      ];
    case "alternative":
      return [
        "Why teams typically switch (top 3 friction points)",
        "Side-by-side feature comparison",
        "Pricing comparison — apples-to-apples",
        "Migration path and data export/import",
        "Customer testimonials from people who switched",
        "Implementation timeline and onboarding",
        "Limitations and what stays the same",
      ];
    case "integration":
      return [
        "What the integration does (in one sentence)",
        "Setup walkthrough — connecting the two tools",
        "Data that syncs both ways",
        "Permissions and admin controls",
        "Common use cases and workflows",
        "Troubleshooting and FAQs",
        "Pricing impact (does it require a paid plan?)",
      ];
    case "how_to":
      return [
        "Prerequisites and tooling you'll need",
        "Step-by-step walkthrough with screenshots",
        "Common configuration mistakes to avoid",
        "Pro tips and shortcuts (10× the speed)",
        "Troubleshooting playbook",
        "Measuring success and iterating",
      ];
    case "question":
    case "definition":
      return [
        "The short answer (2–3 sentences)",
        "How it works under the hood",
        "Why it matters for managers and employees",
        "Common misconceptions and what's actually true",
        "Real-world examples from Indian SaaS teams",
        "When it makes sense — and when it doesn't",
      ];
    case "guide":
      return [
        "Why this matters in 2026",
        "Key concepts and definitions",
        "Step-by-step framework",
        "Tools and templates",
        "Pitfalls and how to avoid them",
        "Measuring impact and ROI",
        "Industry-specific considerations",
      ];
    default:
      return [
        "Why this matters for modern distributed teams",
        "Key features to look for",
        "Pricing models — per-user, per-seat, enterprise",
        "Implementation roadmap (week 1, month 1, quarter 1)",
        "Compliance and ethics considerations",
        "Industry-specific considerations (BPO, IT services, banking)",
        "Measuring ROI and proving impact",
        "Common pitfalls to avoid",
      ];
  }
}

// ---------------------------------------------------------------- PAA / FAQs
function paaFor(pattern: Pattern, kw: string): string[] {
  const k = kw.replace(/\?$/, "").trim();
  switch (pattern) {
    case "best":
    case "vs":
      return [
        `Which is the best ${k}?`,
        `How much does ${k} cost?`,
        `Is ${k} legal in India?`,
        `What features should I look for in ${k}?`,
        `Do free ${k} options exist?`,
      ];
    case "alternative":
      return [
        `What is the best ${k}?`,
        `Why do teams switch from the original tool?`,
        `Is ${k} cheaper?`,
        `Is the data migration painful?`,
        `Does ${k} work for Indian companies?`,
      ];
    case "integration":
      return [
        `Does ${k} require a paid plan?`,
        `How long does the ${k} setup take?`,
        `What data syncs between the tools?`,
        `Can I disconnect later without losing data?`,
        `Is the integration secure and GDPR-compliant?`,
      ];
    case "how_to":
      return [
        `How long does it take to set up ${k}?`,
        `Do I need technical skills for ${k}?`,
        `What are the most common mistakes?`,
        `Can I undo changes if something goes wrong?`,
        `What's the easiest way to get started with ${k}?`,
      ];
    default:
      return [
        `What is ${k}?`,
        `How does ${k} work?`,
        `How much does ${k} cost in India?`,
        `Is ${k} legal and ethical?`,
        `What is the best ${k} for small teams?`,
      ];
  }
}

// ---------------------------------------------------------------- Competitors
const FALLBACK_REFS = [
  "https://en.wikipedia.org/wiki/Employee_monitoring_software",
  "https://www.gartner.com/reviews/market/employee-productivity-monitoring-software",
  "https://www.g2.com/categories/employee-monitoring",
  "https://www.capterra.com/employee-monitoring-software/",
  "https://www.softwareadvice.com/employee-monitoring/",
];

// ---------------------------------------------------------------- Writer notes
const SEO_CHECKLIST = [
  "Lead with a 60-word answer-capsule (TL;DR blockquote) — verdict in sentence 1",
  "Add a 'Key takeaways' bullet list near the top (3–5 bullets, scannable)",
  "Short paragraphs (2–4 sentences); use H2/H3 generously for SXO + AEO",
  "Include 3–5 internal links to /solutions, /vs, /alternative, or /integrations pages",
  "Cite 2–3 authoritative external sources inline (gov, Wikipedia, industry body)",
  "FAQ section wrapped as FAQPage JSON-LD at the end",
  "Author byline at top with credential + last-updated date",
  "Embed 2–3 image prompts with descriptive alt text",
];

// ---------------------------------------------------------------- Main
interface Brief {
  recommended_h1?: string;
  recommended_h2s?: string[];
  recommended_h3s?: string[];
  paa_questions?: string[];
  secondary_keywords?: string[];
  competitor_refs?: string[];
  writer_notes?: string[];
  [k: string]: unknown;
}

interface Task {
  id: string;
  title: string;
  target_keyword: string | null;
  brief: Brief | null;
}

const MIN_H3 = 6;
const MIN_PAA = 5;
const MIN_COMP = 5;
const MIN_NOTES = 6;

async function main() {
  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}\n`);

  const { data } = await admin
    .from("tasks")
    .select("id, title, target_keyword, brief")
    .eq("project_id", PROJECT_ID)
    .eq("kind", "blog_task");

  const all = (data ?? []) as Task[];
  let touched = 0;
  let skippedNoBrief = 0;
  let skippedUpdate = 0;
  const filledCount = { h3: 0, paa: 0, comp: 0, notes: 0 };

  for (const t of all) {
    // Skip "Update X" tasks (those want GSC/GA4 backing, not heuristic gap-fill)
    if (/^update /i.test(t.title)) { skippedUpdate++; continue; }
    if (!t.brief || !(t.brief.recommended_h2s && t.brief.recommended_h2s.length >= 3)) {
      // No Apify enrichment yet — skip. Re-run after Apify completes.
      skippedNoBrief++; continue;
    }

    const kw = t.target_keyword ?? t.title;
    const pattern = detectPattern(kw, t.title);
    const cur: Brief = { ...t.brief };
    const before = {
      h3: cur.recommended_h3s?.length ?? 0,
      paa: cur.paa_questions?.length ?? 0,
      comp: cur.competitor_refs?.length ?? 0,
      notes: cur.writer_notes?.length ?? 0,
    };

    let changed = false;

    // H3s
    if ((cur.recommended_h3s?.length ?? 0) < MIN_H3) {
      const heur = h3sFor(pattern, kw);
      const merged = [...(cur.recommended_h3s ?? []), ...heur];
      const dedup = Array.from(new Map(merged.map((s) => [s.toLowerCase().trim(), s])).values());
      cur.recommended_h3s = dedup.slice(0, Math.max(MIN_H3, dedup.length));
      filledCount.h3++;
      changed = true;
    }

    // PAA
    if ((cur.paa_questions?.length ?? 0) < MIN_PAA) {
      const heur = paaFor(pattern, kw);
      const merged = [...(cur.paa_questions ?? []), ...heur];
      const dedup = Array.from(new Map(merged.map((s) => [s.toLowerCase().trim(), s])).values());
      cur.paa_questions = dedup.slice(0, Math.max(MIN_PAA, dedup.length));
      filledCount.paa++;
      changed = true;
    }

    // Competitor refs (top up with authoritative fallbacks)
    if ((cur.competitor_refs?.length ?? 0) < MIN_COMP) {
      const merged = [...(cur.competitor_refs ?? []), ...FALLBACK_REFS];
      const dedup = Array.from(new Map(merged.map((s) => [s.toLowerCase().trim(), s])).values());
      cur.competitor_refs = dedup.slice(0, Math.max(MIN_COMP, dedup.length));
      filledCount.comp++;
      changed = true;
    }

    // Writer notes (top up with the standard SEO checklist)
    if ((cur.writer_notes?.length ?? 0) < MIN_NOTES) {
      const merged = [...(cur.writer_notes ?? []), ...SEO_CHECKLIST];
      const dedup = Array.from(new Map(merged.map((s) => [s.toLowerCase().trim(), s])).values());
      cur.writer_notes = dedup.slice(0, Math.max(MIN_NOTES, dedup.length));
      filledCount.notes++;
      changed = true;
    }

    if (!changed) continue;
    touched++;
    const after = {
      h3: cur.recommended_h3s?.length ?? 0,
      paa: cur.paa_questions?.length ?? 0,
      comp: cur.competitor_refs?.length ?? 0,
      notes: cur.writer_notes?.length ?? 0,
    };
    console.log(`[${t.id.slice(0, 8)}] ${t.title.slice(0, 55)}  pattern=${pattern}`);
    console.log(`    H3 ${before.h3}→${after.h3}  PAA ${before.paa}→${after.paa}  Comp ${before.comp}→${after.comp}  Notes ${before.notes}→${after.notes}`);

    if (EXECUTE) {
      const { error } = await admin
        .from("tasks")
        .update({ brief: cur, updated_at: new Date().toISOString() })
        .eq("id", t.id);
      if (error) console.error(`    ✗ ${error.message}`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Touched: ${touched}`);
  console.log(`Skipped (Apify hasn't run yet): ${skippedNoBrief}`);
  console.log(`Skipped (Update tasks): ${skippedUpdate}`);
  console.log(`Fields filled across touched tasks:`);
  console.log(`  H3 subsections : ${filledCount.h3}`);
  console.log(`  PAA questions  : ${filledCount.paa}`);
  console.log(`  Competitor refs: ${filledCount.comp}`);
  console.log(`  Writer notes   : ${filledCount.notes}`);
  if (!EXECUTE) console.log(`\n(Dry run — re-run with --execute to write)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
