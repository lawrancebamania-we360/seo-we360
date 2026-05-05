#!/usr/bin/env tsx
/**
 * Apify enrichment for upcoming blog tasks.
 *
 * For each blog task scheduled in the date window, this script:
 *   1. Runs apify/google-search-scraper (SERP) on the target_keyword:
 *      - Pulls top-N organic results → competitor_refs
 *      - Pulls "People Also Ask" → paa_questions
 *      - Pulls "Related searches" → secondary_keywords (merged with existing)
 *      - Detects featured-snippet / AI-overview presence → writer_notes
 *   2. Runs apilab/ai-content-gap-agent on the same keyword (with our domain
 *      + 4 anchor competitor domains as inputs):
 *      - Pulls suggestedOutline → recommended_h2s + recommended_h3s
 *      - Pulls missingSubtopics → writer_notes
 *      - Pulls suggestedKeywords → secondary_keywords (merged)
 *   3. Updates the task's `brief` JSONB with all of the above.
 *   4. Writes a short summary into the task's `data_backing` field
 *      (appending below the existing GSC backing — never overwrites).
 *
 * Sequential execution (apify free-plan memory cap). ~10-12s per task.
 *
 * Usage:
 *   npx tsx scripts/enrich-blog-tasks-apify.ts                  # dry run, prints what would happen
 *   npx tsx scripts/enrich-blog-tasks-apify.ts --execute        # default window: today → +30 days
 *   npx tsx scripts/enrich-blog-tasks-apify.ts --execute --start=2026-05-01 --end=2026-05-31
 *   npx tsx scripts/enrich-blog-tasks-apify.ts --execute --keys=B1.4a,B1.4b
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APIFY_TOKEN } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase env"); process.exit(1);
}
if (!APIFY_TOKEN) {
  console.error("Missing APIFY_TOKEN — add it to .env.local"); process.exit(1);
}
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.trim());
const PROJECT_ID = "11111111-1111-4111-8111-000000000001";
const PROJECT_DOMAIN = "we360.ai";
// Anchor competitors used as input to the content-gap actor. Pulled from the
// existing /alternative/* + /vs/* page targets — these are the brands writers
// already compare us against, so the actor's "missing subtopics" output stays
// on-pillar.
const COMPETITOR_DOMAINS = ["hubstaff.com", "timedoctor.com", "teramind.co", "activtrak.com"];

// ------------------------------- args -----------------------------------
const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  if (a === "--execute") args.set("execute", "1");
  else if (a.startsWith("--")) {
    const [k, v] = a.slice(2).split("=");
    args.set(k, v ?? "1");
  }
}
const EXECUTE = args.has("execute");
const today = new Date().toISOString().slice(0, 10);
const monthAhead = (() => {
  const d = new Date(); d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
})();
const START = args.get("start") ?? today;
const END = args.get("end") ?? monthAhead;
const KEYS = args.get("keys")?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;

// ----------------------------- types ------------------------------------

interface BlogBriefSeed {
  target_keyword: string;
  intent: string;
  word_count_target: number;
  recommended_h1: string;
  recommended_h2s: string[];
  recommended_h3s: string[];
  sections_breakdown: string[];
  paa_questions: string[];
  internal_links: string[];
  competitor_refs: string[];
  writer_notes: string[];
  generated_by: string;
  secondary_keywords: string[];
}

interface TaskRow {
  id: string;
  title: string;
  target_keyword: string | null;
  scheduled_date: string | null;
  data_backing: string | null;
  brief: BlogBriefSeed | null;
}

// --------------------------- main flow ----------------------------------

async function fetchTargetTasks(): Promise<TaskRow[]> {
  let q = admin
    .from("tasks")
    .select("id, title, target_keyword, scheduled_date, data_backing, brief")
    .eq("project_id", PROJECT_ID)
    .eq("kind", "blog_task")
    .not("target_keyword", "is", null)
    .gte("scheduled_date", START)
    .lte("scheduled_date", END)
    .order("scheduled_date", { ascending: true });

  if (KEYS && KEYS.length > 0) {
    // Explicit key filter overrides the date window
    q = admin
      .from("tasks")
      .select("id, title, target_keyword, scheduled_date, data_backing, brief")
      .eq("project_id", PROJECT_ID)
      .eq("kind", "blog_task")
      .or(KEYS.map((k) => `title.like.[${k}]%`).join(","))
      .order("scheduled_date", { ascending: true });
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as TaskRow[];
}

function dedupe(arr: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
    // Defensive: actors sometimes return arrays of objects (e.g. paaQuestions
    // as {question: "..."} or topUrls as {url: "..."}). Coerce to a string
    // we can dedupe on.
    let s: string;
    if (typeof raw === "string") s = raw;
    else if (raw && typeof raw === "object") {
      const o = raw as Record<string, unknown>;
      s = String(o.question ?? o.url ?? o.title ?? o.text ?? o.value ?? JSON.stringify(o));
    } else if (raw == null) continue;
    else s = String(raw);
    const trimmed = s.trim();
    const k = trimmed.toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(trimmed);
  }
  return out;
}

function trimToTopN(urls: string[], n: number): string[] {
  return urls.filter((u) => {
    try {
      const host = new URL(u).hostname.replace(/^www\./, "");
      // Skip our own domain + obvious aggregators we don't want as outline reference
      if (host.endsWith("we360.ai")) return false;
      if (/(reddit|quora|youtube|wikipedia|amazon|linkedin)\.com$/i.test(host)) return false;
      return true;
    } catch { return false; }
  }).slice(0, n);
}

// Single SERP call per task that returns EVERYTHING we need from one actor
// invocation: top organic URLs, PAA, related searches, AI Overview, featured
// snippet ownership, our own ranking. Avoids double-hitting the actor (which
// triggered Apify rate limits in the v1 of this script).
interface SerpFullResult {
  ourPosition: number | null;
  ownsFeaturedSnippet: boolean;
  topOrganicUrls: string[];
  paaQuestions: string[];
  relatedSearches: string[];
  aiOverviewPresent: boolean;
  projectCitedInAi: boolean;
}

async function callSerp(kw: string, retries = 1): Promise<SerpFullResult | null> {
  const slug = "apify~google-search-scraper";
  const url = `https://api.apify.com/v2/acts/${slug}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          queries: kw,
          countryCode: "in",
          mobileResults: false,
          resultsPerPage: 10,
          maxPagesPerQuery: 1,
        }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (attempt < retries) {
          await sleep(5000);
          continue;
        }
        throw new Error(`SERP HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      const items = await res.json() as Array<{
        organicResults?: Array<{ url?: string; position?: number }>;
        peopleAlsoAsk?: Array<{ question: string }>;
        relatedQueries?: Array<{ title: string }>;
        featuredSnippet?: { url?: string } | null;
        aiOverview?: { content?: string; sources?: Array<{ url?: string }> } | null;
      }>;
      const item = items[0];
      if (!item) return null;

      const allUrls = (item.organicResults ?? []).map((r) => r.url).filter(Boolean) as string[];
      const ours = (item.organicResults ?? []).find((r) => {
        try { return r.url ? new URL(r.url).hostname.replace(/^www\./, "").endsWith(PROJECT_DOMAIN) : false; }
        catch { return false; }
      });
      const ownsFs = !!(item.featuredSnippet?.url && (() => {
        try { return new URL(item.featuredSnippet!.url!).hostname.replace(/^www\./, "").endsWith(PROJECT_DOMAIN); }
        catch { return false; }
      })());
      const aoSources = item.aiOverview?.sources ?? [];
      const projectCited = aoSources.some((s) => {
        try { return s.url ? new URL(s.url).hostname.replace(/^www\./, "").endsWith(PROJECT_DOMAIN) : false; }
        catch { return false; }
      });

      return {
        ourPosition: ours?.position ?? null,
        ownsFeaturedSnippet: ownsFs,
        topOrganicUrls: trimToTopN(allUrls, 5),
        paaQuestions: (item.peopleAlsoAsk ?? []).map((q) => q.question).slice(0, 8),
        relatedSearches: (item.relatedQueries ?? []).map((r) => r.title).slice(0, 8),
        aiOverviewPresent: !!(item.aiOverview && (item.aiOverview.content || aoSources.length > 0)),
        projectCitedInAi: projectCited,
      };
    } catch (e) {
      if (attempt < retries) { await sleep(5000); continue; }
      throw e;
    }
  }
  return null;
}

interface ContentGapFullResult {
  suggestedH2s: string[];
  suggestedH3s: string[];
  missingTopics: string[];
  angleSuggestions: string[];
  topUrls: string[];
  paaQuestions: string[];
  redditTitles: string[];
}

// Parse the actor's markdown contentOutline to extract H1/H2/H3 headings.
// Outline format example:
//   # Title
//   ## 1. Introduction
//   ### 1.1. What is X
//   ### 1.2. Why it matters
//   ## 2. Core Concepts
function parseOutlineMarkdown(md: string): { h2s: string[]; h3s: string[] } {
  const h2s: string[] = [];
  const h3s: string[] = [];
  for (const rawLine of md.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("### ")) {
      h3s.push(line.replace(/^###\s+(\d+\.\d+\.?\s*)?/, "").trim());
    } else if (line.startsWith("## ")) {
      h2s.push(line.replace(/^##\s+(\d+\.\s*)?/, "").trim());
    }
  }
  return { h2s, h3s };
}

async function callContentGap(kw: string, retries = 1): Promise<ContentGapFullResult | null> {
  const slug = "apilab~ai-content-gap-agent";
  const url = `https://api.apify.com/v2/acts/${slug}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          keyword: kw,
          projectDomain: PROJECT_DOMAIN,
          competitorDomains: COMPETITOR_DOMAINS,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (attempt < retries) { await sleep(5000); continue; }
        throw new Error(`ContentGap HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      // The actor's actual schema (verified via debug-content-gap.ts on
      // 2026-04-27): {keyword, missingTopics[], angleSuggestions[],
      // contentOutline (markdown string), topUrls[], redditTitles[],
      // paaQuestions[]}. The original wrapper in lib/apify/intelligence.ts
      // expected suggestedOutline / missingSubtopics — those keys don't
      // exist, which is why everything came back as 0.
      const items = await res.json() as Array<{
        missingTopics?: string[];
        angleSuggestions?: string[];
        contentOutline?: string;
        topUrls?: string[];
        redditTitles?: string[];
        paaQuestions?: string[];
      }>;
      const item = items[0];
      if (!item) return { suggestedH2s: [], suggestedH3s: [], missingTopics: [], angleSuggestions: [], topUrls: [], paaQuestions: [], redditTitles: [] };
      const { h2s, h3s } = parseOutlineMarkdown(item.contentOutline ?? "");
      return {
        suggestedH2s: h2s,
        suggestedH3s: h3s,
        missingTopics: item.missingTopics ?? [],
        angleSuggestions: item.angleSuggestions ?? [],
        topUrls: item.topUrls ?? [],
        paaQuestions: item.paaQuestions ?? [],
        redditTitles: item.redditTitles ?? [],
      };
    } catch (e) {
      if (attempt < retries) { await sleep(5000); continue; }
      throw e;
    }
  }
  return null;
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function enrichOne(task: TaskRow): Promise<{
  added_h2s: number;
  added_h3s: number;
  added_paa: number;
  added_competitors: number;
  added_keywords: number;
  notes: string[];
}> {
  const kw = task.target_keyword!.trim();
  const notes: string[] = [];

  const serp = await callSerp(kw);
  // Stagger between actor invocations to avoid Apify free-plan rate caps.
  await sleep(3000);
  const gap = await callContentGap(kw);

  const paaFromSerp = serp?.paaQuestions ?? [];
  const relatedSearches = serp?.relatedSearches ?? [];
  const competitorRefs = [
    ...(serp?.topOrganicUrls ?? []),
    ...(gap?.topUrls ?? []),
  ];
  const suggestedH2s = gap?.suggestedH2s ?? [];
  const suggestedH3s = gap?.suggestedH3s ?? [];
  const missingTopics = gap?.missingTopics ?? [];
  const angleSuggestions = gap?.angleSuggestions ?? [];
  // Content-gap actor sometimes surfaces PAA the SERP scraper missed — merge
  const allPaa = dedupe([...paaFromSerp, ...(gap?.paaQuestions ?? [])]).slice(0, 8);
  // Reddit thread titles are useful as competitor_refs alternative + writer
  // research signals
  const redditTitles = gap?.redditTitles ?? [];

  // ---- Merge into the existing brief ----
  const existing = task.brief ?? {} as BlogBriefSeed;
  const merged: BlogBriefSeed = {
    ...existing,
    target_keyword: existing.target_keyword || kw,
    intent: existing.intent || "informational",
    word_count_target: existing.word_count_target || 1500,
    recommended_h1: existing.recommended_h1 || "",
    sections_breakdown: existing.sections_breakdown ?? [],
    internal_links: existing.internal_links ?? [],
    generated_by: "apify-enrich",
    recommended_h2s: dedupe([...(existing.recommended_h2s ?? []), ...suggestedH2s]),
    recommended_h3s: dedupe([...(existing.recommended_h3s ?? []), ...suggestedH3s]),
    paa_questions: dedupe([...(existing.paa_questions ?? []), ...allPaa]).slice(0, 8),
    competitor_refs: dedupe([...(existing.competitor_refs ?? []), ...competitorRefs]).slice(0, 8),
    secondary_keywords: dedupe([
      ...(existing.secondary_keywords ?? []),
      ...relatedSearches,
    ]).slice(0, 12),
    writer_notes: dedupe([
      ...(existing.writer_notes ?? []),
      ...(missingTopics.length > 0 ? [`📋 Topics competitors cover that we should address: ${missingTopics.slice(0, 5).join(" · ")}`] : []),
      ...(angleSuggestions.length > 0 ? [`💡 Differentiation angles (vs top-ranking pages): ${angleSuggestions.slice(0, 3).join(" · ")}`] : []),
      ...(redditTitles.length > 0 ? [`🔍 Reddit-discussion signals: ${redditTitles.slice(0, 3).join(" · ")}`] : []),
      ...(serp?.ownsFeaturedSnippet ? ["✅ We currently own the featured snippet — defend it."] :
          (allPaa.length > 0 ? ["PAA box exists — answer at least one PAA Q in <60 words near top to win the snippet."] : [])),
      ...(serp?.aiOverviewPresent ? [`AI Overview appears for this query${serp.projectCitedInAi ? " AND we are cited (defend the citation)." : " but we are NOT cited (target an answer-capsule + FAQ schema to win citation)."}`] : []),
    ]),
  };

  // ---- Append enrichment summary to data_backing (never overwrite the GSC backing) ----
  const enrichmentSummary = [
    `\n\n---\n**Apify enrichment (${new Date().toISOString().slice(0, 10)})**`,
    `SERP: ${(serp?.topOrganicUrls ?? []).length} top-organic competitors, ${paaFromSerp.length} PAA Qs, ${relatedSearches.length} related searches. ${serp?.ourPosition != null ? `We rank position ${serp.ourPosition} today (live SERP).` : "We don't appear in the top 10 today."}`,
    `Content-gap: ${suggestedH2s.length} H2s + ${suggestedH3s.length} H3s extracted from competitor outline, ${missingTopics.length} missing topics flagged, ${angleSuggestions.length} differentiation angles suggested.`,
    serp?.aiOverviewPresent ? `AI Overview: PRESENT${serp.projectCitedInAi ? " — we are cited." : " — we are NOT cited."}` : `AI Overview: not triggered for this query.`,
    serp?.ownsFeaturedSnippet ? `Featured snippet: WE OWN IT.` : (allPaa.length > 0 ? `Featured snippet: none, but PAA exists.` : `Featured snippet: none.`),
  ].join("\n");
  const newDataBacking = stripPriorEnrichment(task.data_backing ?? "") + enrichmentSummary;

  if (EXECUTE) {
    const { error } = await admin
      .from("tasks")
      .update({ brief: merged, data_backing: newDataBacking })
      .eq("id", task.id);
    if (error) throw error;
  }

  return {
    added_h2s: suggestedH2s.length,
    added_h3s: suggestedH3s.length,
    added_paa: allPaa.length,
    added_competitors: dedupe(competitorRefs).length,
    added_keywords: relatedSearches.length,
    notes,
  };
}

// Strip the prior `--- **Apify enrichment …** …` block if present so re-runs
// replace it instead of stacking duplicate summaries.
function stripPriorEnrichment(s: string): string {
  const idx = s.indexOf("\n\n---\n**Apify enrichment");
  return idx >= 0 ? s.slice(0, idx) : s;
}

async function main() {
  console.log(`Window: ${START} → ${END}${KEYS ? ` (filtered to keys: ${KEYS.join(", ")})` : ""}`);
  console.log(`Mode: ${EXECUTE ? "EXECUTE (writes to DB)" : "DRY RUN"}\n`);

  const tasks = await fetchTargetTasks();
  console.log(`Found ${tasks.length} blog tasks to enrich:\n`);
  for (const t of tasks) {
    console.log(`  ${t.scheduled_date}  ${t.title}`);
    console.log(`              kw: "${t.target_keyword}"`);
  }
  if (tasks.length === 0) { console.log("\nNothing to enrich."); return; }

  if (!EXECUTE) {
    const estimatedCost = tasks.length * (1.80 / 1000 * 2 + 0.0162);
    console.log(`\n📊 Estimated Apify cost: $${estimatedCost.toFixed(3)} (${tasks.length} tasks × $${(1.80 / 1000 * 2 + 0.0162).toFixed(4)}/each)`);
    console.log(`📊 Estimated time: ${Math.ceil(tasks.length * 12 / 60)} min sequential\n`);
    console.log("Pass --execute to run for real.");
    return;
  }

  console.log(`\nRunning sequentially (Apify free-plan 8GB cap; ~25-30s per task)...\n`);
  let totalH2s = 0, totalH3s = 0, totalPaa = 0, totalComp = 0;
  let failed = 0;
  const failedKeys: string[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const keyMatch = t.title.match(/^\[([^\]]+)\]/);
    const key = keyMatch?.[1] ?? "?";
    process.stdout.write(`[${i + 1}/${tasks.length}] ${key.padEnd(8)} kw="${t.target_keyword}"... `);
    try {
      const r = await enrichOne(t);
      totalH2s += r.added_h2s; totalH3s += r.added_h3s; totalPaa += r.added_paa; totalComp += r.added_competitors;
      console.log(`✅ +${r.added_h2s} H2s, +${r.added_h3s} H3s, +${r.added_paa} PAA, +${r.added_competitors} competitor refs`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : (typeof e === "object" ? JSON.stringify(e) : String(e));
      console.log(`❌ ${msg}`);
      failed++;
      failedKeys.push(key);
    }
    // Pause between tasks to stay polite to Apify.
    if (i < tasks.length - 1) await sleep(2000);
  }

  console.log(`\n✅ Done. Aggregate: +${totalH2s} H2s, +${totalH3s} H3s, +${totalPaa} PAA, +${totalComp} competitor refs across ${tasks.length - failed} tasks (${failed} failed).`);
  if (failed > 0) {
    console.log(`\nRetry the failed ones with:\n  npx tsx scripts/enrich-blog-tasks-apify.ts --execute --keys=${failedKeys.join(",")}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
