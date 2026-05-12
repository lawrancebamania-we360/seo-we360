// Weekly content-gap enrichment for blog tasks.
//
// Runs via GitHub Actions every Sunday late evening IST. Picks the top 2
// blog tasks that:
//   - have a target_keyword
//   - don't yet have content-gap data (brief.recommended_h2s < 3 entries)
//   - rank for actual impressions (we join url_metrics_latest to prioritize)
// ...and runs apilab/ai-content-gap-agent on each. Costs ~$0.30-$0.50 per
// task, so 2/week = ~$3.20/month worst case.
//
// Tasks are processed in DESCENDING IMPRESSIONS order — biggest visible
// upside drained first.
//
// Usage:
//   npx tsx scripts/composio/weekly-content-gap.ts                # process top 2
//   npx tsx scripts/composio/weekly-content-gap.ts --cap=5        # override cap
//   npx tsx scripts/composio/weekly-content-gap.ts --dry-run      # show plan only

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const {
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  APIFY_TOKEN,
} = process.env;

if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing Supabase env"); process.exit(1);
}
if (!APIFY_TOKEN) {
  console.error("Missing APIFY_TOKEN"); process.exit(1);
}

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.trim());

// --------------------------- args ---------------------------------------
const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  if (a === "--dry-run") args.set("dry-run", "1");
  else if (a.startsWith("--")) {
    const [k, v] = a.slice(2).split("=");
    args.set(k, v ?? "1");
  }
}
const DRY_RUN = args.has("dry-run");
const CAP = Math.max(1, Math.min(10, parseInt(args.get("cap") ?? "2", 10)));

const PROJECT_ID = "11111111-1111-4111-8111-000000000001";
const PROJECT_DOMAIN = "we360.ai";
const COMPETITOR_DOMAINS = ["hubstaff.com", "timedoctor.com", "teramind.co", "activtrak.com"];

// ----------------------- types -----------------------------------------
interface TaskRow {
  id: string;
  title: string;
  target_keyword: string | null;
  url: string | null;
  data_backing: string | null;
  brief: BriefShape | null;
}

interface BriefShape {
  target_keyword?: string;
  recommended_h2s?: string[];
  recommended_h3s?: string[];
  paa_questions?: string[];
  writer_notes?: string[];
  competitor_refs?: string[];
  secondary_keywords?: string[];
  intent?: string;
  word_count_target?: number;
  recommended_h1?: string;
  sections_breakdown?: string[];
  internal_links?: string[];
  generated_by?: string;
  enriched_at?: string;
  content_gap_at?: string;
}

interface ContentGapResult {
  suggestedH2s: string[];
  suggestedH3s: string[];
  missingTopics: string[];
  angleSuggestions: string[];
  topUrls: string[];
  paaQuestions: string[];
  redditTitles: string[];
}

// ------------------------ DB helpers -----------------------------------

async function fetchCandidates(): Promise<TaskRow[]> {
  // Get all blog tasks lacking content-gap data
  const { data: tasks, error } = await admin
    .from("tasks")
    .select("id, title, target_keyword, url, data_backing, brief")
    .eq("project_id", PROJECT_ID)
    .eq("kind", "blog_task")
    .not("target_keyword", "is", null)
    .neq("status", "done");
  if (error) throw error;

  const rows = (tasks ?? []) as TaskRow[];

  // Filter to tasks lacking proper content-gap data:
  // - brief.recommended_h2s has < 3 entries (= not yet content-gap-enriched)
  // - OR brief is null entirely
  const needsEnrichment = rows.filter((r) => {
    const h2s = r.brief?.recommended_h2s;
    const hasContentGap = Array.isArray(h2s) && h2s.length >= 3 && r.brief?.content_gap_at;
    return !hasContentGap;
  });

  if (needsEnrichment.length === 0) return [];

  // Join with url_metrics_latest (90d) so we can sort by impressions desc.
  // Tasks without a url, or whose url has no metrics, get impressions=0 and
  // sort to the bottom — they'll be picked up later if nothing better exists.
  const urls = needsEnrichment.map((r) => r.url).filter(Boolean) as string[];
  const impressionsByUrl = new Map<string, number>();
  if (urls.length > 0) {
    const { data: metrics } = await admin
      .from("url_metrics_latest")
      .select("url, gsc_impressions")
      .eq("project_id", PROJECT_ID)
      .eq("period", "90d")
      .in("url", urls);
    for (const m of (metrics ?? []) as Array<{ url: string; gsc_impressions: number }>) {
      impressionsByUrl.set(m.url, m.gsc_impressions);
    }
  }

  needsEnrichment.sort((a, b) => {
    const ai = a.url ? (impressionsByUrl.get(a.url) ?? 0) : 0;
    const bi = b.url ? (impressionsByUrl.get(b.url) ?? 0) : 0;
    return bi - ai;
  });

  return needsEnrichment.slice(0, CAP).map((r) => ({
    ...r,
    // attach impressions for logging
    ...({ _impressions: r.url ? impressionsByUrl.get(r.url) ?? 0 : 0 } as object),
  }));
}

// ---------------------- content-gap actor call -------------------------

async function callContentGap(kw: string, retries = 1): Promise<ContentGapResult | null> {
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

function dedupe(arr: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
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

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

// -------------------- enrichment writer --------------------------------

async function enrichOne(task: TaskRow): Promise<{ added_h2s: number; added_topics: number }> {
  const kw = task.target_keyword!.trim();
  console.log(`\n  → "${kw}" (task ${task.id.slice(0, 8)})`);

  const gap = await callContentGap(kw);
  if (!gap) {
    console.log("    no result");
    return { added_h2s: 0, added_topics: 0 };
  }

  const existing = task.brief ?? {};
  const mergedBrief: BriefShape = {
    ...existing,
    target_keyword: existing.target_keyword || kw,
    intent: existing.intent || "informational",
    word_count_target: existing.word_count_target || 1500,
    recommended_h1: existing.recommended_h1 || "",
    sections_breakdown: existing.sections_breakdown ?? [],
    internal_links: existing.internal_links ?? [],
    recommended_h2s: dedupe([...(existing.recommended_h2s ?? []), ...gap.suggestedH2s]),
    recommended_h3s: dedupe([...(existing.recommended_h3s ?? []), ...gap.suggestedH3s]),
    paa_questions: dedupe([...(existing.paa_questions ?? []), ...gap.paaQuestions]).slice(0, 8),
    competitor_refs: dedupe([...(existing.competitor_refs ?? []), ...gap.topUrls]).slice(0, 8),
    writer_notes: dedupe([
      ...(existing.writer_notes ?? []),
      ...(gap.missingTopics.length > 0 ? [`📋 Topics competitors cover that we should address: ${gap.missingTopics.slice(0, 5).join(" · ")}`] : []),
      ...(gap.angleSuggestions.length > 0 ? [`💡 Differentiation angles (vs top-ranking pages): ${gap.angleSuggestions.slice(0, 3).join(" · ")}`] : []),
      ...(gap.redditTitles.length > 0 ? [`🔍 Reddit-discussion signals: ${gap.redditTitles.slice(0, 3).join(" · ")}`] : []),
    ]),
    generated_by: "apify-enrich-full",
    content_gap_at: new Date().toISOString(),
  };

  // Append content-gap summary to data_backing
  const date = new Date().toISOString().slice(0, 10);
  const summary = [
    `\n\n---\n**Apify content-gap (${date})**`,
    `Outline: ${gap.suggestedH2s.length} H2s + ${gap.suggestedH3s.length} H3s.`,
    `Missing topics: ${gap.missingTopics.length}.`,
    `Differentiation angles: ${gap.angleSuggestions.length}.`,
  ].join("\n");
  const newDataBacking = stripPriorContentGap(task.data_backing ?? "") + summary;

  if (!DRY_RUN) {
    const { error } = await admin
      .from("tasks")
      .update({ brief: mergedBrief, data_backing: newDataBacking })
      .eq("id", task.id);
    if (error) throw error;
  }

  console.log(`    +${gap.suggestedH2s.length} H2s, +${gap.missingTopics.length} missing topics`);
  return { added_h2s: gap.suggestedH2s.length, added_topics: gap.missingTopics.length };
}

function stripPriorContentGap(s: string): string {
  const idx = s.indexOf("\n\n---\n**Apify content-gap");
  return idx >= 0 ? s.slice(0, idx) : s;
}

// ----------------------------- main ------------------------------------

async function main() {
  console.log(`Weekly content-gap enrichment — mode=${DRY_RUN ? "DRY RUN" : "EXECUTE"}, cap=${CAP}`);

  const candidates = await fetchCandidates();
  console.log(`Found ${candidates.length} task(s) needing content-gap (impressions-sorted):`);
  for (const t of candidates) {
    const impr = (t as { _impressions?: number })._impressions ?? 0;
    console.log(`  ${impr.toLocaleString().padStart(6)} impr · ${t.title}`);
  }
  if (candidates.length === 0) {
    console.log("\nNothing to enrich — all blog tasks have content-gap data.");
    return;
  }

  if (DRY_RUN) {
    const cost = candidates.length * 0.40;
    console.log(`\nDry run — would spend ~$${cost.toFixed(2)} (est. $0.40/task × ${candidates.length}).`);
    return;
  }

  let ok = 0, fail = 0;
  for (const t of candidates) {
    try {
      await enrichOne(t);
      ok++;
    } catch (e) {
      console.error(`  failed: ${e instanceof Error ? e.message : e}`);
      fail++;
    }
    // Stagger between actor invocations (Apify free-plan friendly).
    await sleep(3000);
  }
  console.log(`\nDone. ${ok} enriched, ${fail} failed. Est. spend: $${(ok * 0.40).toFixed(2)}.`);
}

main().catch((e) => { console.error("Crash:", e); process.exit(1); });
