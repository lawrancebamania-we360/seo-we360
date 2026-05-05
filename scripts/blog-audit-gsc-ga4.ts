#!/usr/bin/env tsx
/**
 * Full blog-audit pipeline: pull GSC + GA4 data for every /blog/* URL,
 * apply the D/M/M/K (Delete / Merge / Modify / Keep) decision tree, and
 * write a snapshot into public.blog_audit. The /dashboard/blog-audit page
 * renders the latest snapshot so the SEO lead can work the queue.
 *
 * Decision tree (applied in order — first match wins):
 *   1. PRUNE   — 0 clicks AND <500 impressions over the window
 *   2. REFRESH — ≥1,000 impressions AND avg position 11-30
 *   3. KEEP    — ≥50 clicks AND avg position ≤15
 *   4. MERGE   — ≥100 impressions AND <10 clicks (cannibalized; suggest higher-traffic sibling)
 *   5. KEEP    — fallback (no action needed)
 *
 * Merge-target detection: Jaccard similarity on slug tokens (stopwords
 * removed). For each MERGE candidate, find the highest-Jaccard URL in the
 * same project that has ≥3× the candidate's clicks. If no good match,
 * we still flag it MERGE but leave merge_target_url null for SEO lead to set.
 *
 * Run:
 *   npx tsx scripts/blog-audit-gsc-ga4.ts             # dry-run preview
 *   npx tsx scripts/blog-audit-gsc-ga4.ts --execute   # writes new run + rows
 *
 * Prereqs:
 *   1. supabase/migrations/20260429000001_blog_audit.sql applied
 *   2. lib/integrations/secrets.ts has Google service-account JSON wired
 *   3. project row has gsc_property_url + ga4_property_id set
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { getGscUrlAggregates } from "../lib/google/gsc";
import { getGa4UrlAggregates } from "../lib/google/ga4";

config({ path: ".env.local" });
const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env"); process.exit(1);
}
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.trim());
const PROJECT_ID = "11111111-1111-4111-8111-000000000001";
const EXECUTE = process.argv.includes("--execute");
const GSC_WINDOW_DAYS = 480;   // ~16 months
const GA4_WINDOW_DAYS = 365;   // 12 months

// =============================================================================
// Sitemap discovery — handle the known broken-sitemap edge case (two
// concatenated XML docs) by parsing each <urlset> independently.
// =============================================================================

async function discoverBlogUrls(siteUrl: string): Promise<Set<string>> {
  const urls = new Set<string>();
  // Build candidate sitemap URLs
  const root = siteUrl.replace(/\/+$/, "");
  const candidates = [`${root}/sitemap.xml`, `${root}/blog-sitemap.xml`, `${root}/blog_sitemap.xml`];
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) continue;
      const xml = await res.text();
      // Extract every <loc>...</loc> regardless of how many <urlset> blocks
      // are concatenated in the file.
      for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
        const u = m[1].trim();
        if (/\/blog\//i.test(u)) urls.add(u);
      }
    } catch { /* skip */ }
  }
  return urls;
}

// =============================================================================
// URL normalization — GSC returns full URLs, GA4 returns paths only.
// =============================================================================

function urlToPath(url: string): string {
  try { return new URL(url).pathname.replace(/\/+$/, "") || "/"; }
  catch { return url; }
}

function pathToUrl(path: string, siteUrl: string): string {
  const root = siteUrl.replace(/\/+$/, "");
  return `${root}${path.startsWith("/") ? path : "/" + path}`;
}

// =============================================================================
// Slug tokenization + Jaccard similarity for merge-target detection
// =============================================================================

const STOPWORDS = new Set([
  "the","a","an","of","for","to","and","with","in","on","at","by",
  "guide","best","top","how","what","why","when","where","which",
  "complete","ultimate","comprehensive","full","essential","step",
  "blog","post","article","posts","articles",
  "2020","2021","2022","2023","2024","2025","2026","2027",
  "tips","tricks","ways","things","reasons","strategies",
  "your","you","our","we","i","my","be","is","are","was","were","this","that",
]);

function tokenize(slug: string): Set<string> {
  return new Set(
    slug.toLowerCase()
      .replace(/[^a-z0-9\s\-]/g, " ")
      .split(/[\s\-_]+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersect = 0;
  for (const t of a) if (b.has(t)) intersect++;
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

function lastSlug(url: string): string {
  return url.split("/").filter(Boolean).pop() ?? "";
}

// =============================================================================
// Decision tree
// =============================================================================

interface AuditRow {
  url: string;
  gsc_clicks: number;
  gsc_impressions: number;
  gsc_position: number | null;
  gsc_ctr: number | null;
  ga4_sessions: number;
  ga4_engaged_sessions: number;
  ga4_avg_engagement_time_sec: number | null;
}

interface Decision {
  decision: "prune" | "merge" | "refresh" | "keep";
  decision_reason: string;
  priority: "critical" | "high" | "medium" | "low";
}

function decide(row: AuditRow): Decision {
  const { gsc_clicks: clicks, gsc_impressions: imp, gsc_position: pos, ga4_sessions: sess } = row;
  // 1) PRUNE — completely invisible
  if (clicks === 0 && imp < 500 && sess < 30) {
    return { decision: "prune", decision_reason: `0 clicks, only ${imp} impressions over 16mo, ${sess} GA4 sessions over 12mo — invisible to Google`, priority: "low" };
  }
  // 2) REFRESH — high impressions but stuck in striking distance
  if (imp >= 1000 && pos != null && pos >= 11 && pos <= 30) {
    return { decision: "refresh", decision_reason: `${imp.toLocaleString()} impressions at avg position ${pos.toFixed(1)} — striking distance for top 10`, priority: imp >= 5000 ? "high" : "medium" };
  }
  // 3) KEEP (good performer)
  if (clicks >= 50 && pos != null && pos <= 15) {
    return { decision: "keep", decision_reason: `${clicks} clicks at avg pos ${pos.toFixed(1)} — performing well, just add internal links`, priority: "low" };
  }
  // 4) MERGE — impressions but no clicks (likely cannibalized)
  if (imp >= 100 && clicks < 10) {
    return { decision: "merge", decision_reason: `${imp} impressions, only ${clicks} clicks — likely cannibalized; merge into stronger sibling`, priority: "medium" };
  }
  // 5) Fallback — no action
  return { decision: "keep", decision_reason: `${clicks} clicks / ${imp} impressions — modest performer, no action`, priority: "low" };
}

// =============================================================================
// Main
// =============================================================================

interface ProjectRow {
  id: string;
  domain: string;
  gsc_property_url: string | null;
  ga4_property_id: string | null;
}

async function main() {
  // Load project metadata
  const { data: project } = await admin
    .from("projects").select("id, domain, gsc_property_url, ga4_property_id")
    .eq("id", PROJECT_ID).single();
  const proj = project as ProjectRow | null;
  if (!proj) { console.error("Project not found"); process.exit(1); }
  if (!proj.gsc_property_url) { console.error("Project has no gsc_property_url; set it from /dashboard/integrations"); process.exit(1); }

  const siteUrl = proj.domain.startsWith("http") ? proj.domain : `https://${proj.domain.replace(/^www\./, "")}`;

  console.log(`Project:  ${proj.domain}`);
  console.log(`GSC prop: ${proj.gsc_property_url}`);
  console.log(`GA4 prop: ${proj.ga4_property_id ?? "(none — GA4 columns will be 0)"}`);
  console.log(`Mode:     ${EXECUTE ? "EXECUTE" : "DRY-RUN"}`);
  console.log();

  // Step 1: collect URLs from sitemap + GSC
  console.log("Step 1 — collecting URLs from sitemap + GSC...");
  const sitemapUrls = await discoverBlogUrls(siteUrl);
  console.log(`  sitemap: ${sitemapUrls.size} /blog/* URLs`);

  console.log(`  fetching GSC aggregates (${GSC_WINDOW_DAYS}-day window, /blog/ filter)...`);
  const gscRows = await getGscUrlAggregates({
    siteUrl: proj.gsc_property_url,
    windowDays: GSC_WINDOW_DAYS,
    urlContains: "/blog/",
  });
  console.log(`  GSC: ${gscRows.length} URLs with impressions`);

  // Step 2: GA4 (if configured)
  let ga4Rows: Awaited<ReturnType<typeof getGa4UrlAggregates>> = [];
  if (proj.ga4_property_id) {
    console.log(`  fetching GA4 aggregates (${GA4_WINDOW_DAYS}-day window, /blog/ filter)...`);
    try {
      ga4Rows = await getGa4UrlAggregates({
        propertyId: proj.ga4_property_id,
        windowDays: GA4_WINDOW_DAYS,
        pathContains: "/blog/",
      });
      console.log(`  GA4: ${ga4Rows.length} URLs with sessions`);
    } catch (e) {
      console.warn(`  GA4 failed (continuing without GA4 data): ${e instanceof Error ? e.message : "unknown"}`);
    }
  }

  // Step 3: union all URLs (sitemap + GSC + GA4)
  const allUrls = new Set<string>(sitemapUrls);
  for (const r of gscRows) allUrls.add(r.url);
  for (const r of ga4Rows) allUrls.add(pathToUrl(r.pagePath, siteUrl));
  console.log(`\nStep 2 — unioned URL set: ${allUrls.size} unique /blog/* URLs`);

  // Step 4: build per-URL aggregate map
  const gscByUrl = new Map(gscRows.map((r) => [r.url.replace(/\/+$/, ""), r]));
  const ga4ByPath = new Map(ga4Rows.map((r) => [r.pagePath.replace(/\/+$/, ""), r]));

  const audits: AuditRow[] = [];
  for (const rawUrl of allUrls) {
    const url = rawUrl.replace(/\/+$/, "");
    const path = urlToPath(url);
    const g = gscByUrl.get(url);
    const a = ga4ByPath.get(path);
    audits.push({
      url,
      gsc_clicks: g?.clicks ?? 0,
      gsc_impressions: g?.impressions ?? 0,
      gsc_position: g?.position ?? null,
      gsc_ctr: g?.ctr ?? null,
      ga4_sessions: a?.sessions ?? 0,
      ga4_engaged_sessions: a?.engagedSessions ?? 0,
      ga4_avg_engagement_time_sec: a?.avgEngagementTimeSec ?? null,
    });
  }

  // Step 5: decisions
  console.log("\nStep 3 — applying decision tree...");
  const withDecisions = audits.map((a) => ({ ...a, ...decide(a) }));

  // Step 6: merge-target detection (Jaccard ≥ 0.3, target has ≥3× clicks)
  console.log("\nStep 4 — finding merge targets (Jaccard slug similarity)...");
  const slugTokenCache = new Map<string, Set<string>>();
  const tokensFor = (u: string) => {
    const cached = slugTokenCache.get(u);
    if (cached) return cached;
    const t = tokenize(lastSlug(u));
    slugTokenCache.set(u, t);
    return t;
  };
  type WithMerge = (typeof withDecisions)[number] & { merge_target_url: string | null; merge_target_score: number | null };
  const final: WithMerge[] = [];
  for (const row of withDecisions) {
    if (row.decision !== "merge") {
      final.push({ ...row, merge_target_url: null, merge_target_score: null });
      continue;
    }
    const myTokens = tokensFor(row.url);
    if (myTokens.size === 0) {
      final.push({ ...row, merge_target_url: null, merge_target_score: null });
      continue;
    }
    let best: { url: string; score: number } | null = null;
    for (const candidate of withDecisions) {
      if (candidate.url === row.url) continue;
      // candidate must have ≥3× clicks AND keep/refresh decision (not pruned)
      if (candidate.gsc_clicks < Math.max(3, row.gsc_clicks * 3)) continue;
      if (candidate.decision === "prune") continue;
      const score = jaccard(myTokens, tokensFor(candidate.url));
      if (score < 0.3) continue;
      if (!best || score > best.score) best = { url: candidate.url, score };
    }
    final.push({ ...row, merge_target_url: best?.url ?? null, merge_target_score: best?.score ?? null });
  }

  // Step 7: summary
  const counts = { prune: 0, merge: 0, refresh: 0, keep: 0 };
  for (const r of final) counts[r.decision]++;
  console.log("\n=== DECISION SUMMARY ===");
  console.log(`Total URLs:       ${final.length}`);
  console.log(`  prune (410):    ${counts.prune}`);
  console.log(`  merge (301):    ${counts.merge}  (${final.filter((r) => r.decision === "merge" && r.merge_target_url).length} have a suggested target)`);
  console.log(`  refresh:        ${counts.refresh}`);
  console.log(`  keep as-is:     ${counts.keep}`);

  // Sample top in each bucket
  console.log("\n--- Top 5 PRUNE candidates ---");
  for (const r of final.filter((r) => r.decision === "prune").slice(0, 5)) {
    console.log(`  ${r.url}  (clicks=${r.gsc_clicks}, imp=${r.gsc_impressions}, sess=${r.ga4_sessions})`);
  }
  console.log("\n--- Top 5 REFRESH (highest impressions) ---");
  for (const r of [...final].filter((r) => r.decision === "refresh").sort((a, b) => b.gsc_impressions - a.gsc_impressions).slice(0, 5)) {
    console.log(`  ${r.url}  (imp=${r.gsc_impressions.toLocaleString()}, pos=${r.gsc_position?.toFixed(1)}, clicks=${r.gsc_clicks})`);
  }
  console.log("\n--- Top 5 MERGE candidates with targets ---");
  for (const r of final.filter((r) => r.decision === "merge" && r.merge_target_url).slice(0, 5)) {
    console.log(`  ${r.url}\n    → ${r.merge_target_url}  (jaccard=${r.merge_target_score?.toFixed(2)})`);
  }

  if (!EXECUTE) {
    console.log("\nDRY RUN — pass --execute to write a new run + rows.");
    return;
  }

  // Step 8: insert run + rows
  console.log("\nStep 5 — inserting new audit run + rows...");
  const { data: runRow, error: runErr } = await admin
    .from("blog_audit_runs")
    .insert({
      project_id: PROJECT_ID,
      gsc_window_days: GSC_WINDOW_DAYS,
      ga4_window_days: GA4_WINDOW_DAYS,
      total_urls: final.length,
      notes: `Snapshot of /blog/* URLs. GSC=${gscRows.length}, GA4=${ga4Rows.length}, sitemap=${sitemapUrls.size}, total unique=${final.length}.`,
    })
    .select("id")
    .single();
  if (runErr || !runRow) { console.error("Could not insert run:", runErr); process.exit(1); }
  const runId = (runRow as { id: string }).id;

  // Bulk-insert rows in batches of 200
  const rows = final.map((r) => ({
    project_id: PROJECT_ID,
    run_id: runId,
    url: r.url,
    gsc_clicks: r.gsc_clicks,
    gsc_impressions: r.gsc_impressions,
    gsc_position: r.gsc_position,
    gsc_ctr: r.gsc_ctr,
    ga4_sessions: r.ga4_sessions,
    ga4_engaged_sessions: r.ga4_engaged_sessions,
    ga4_avg_engagement_time_sec: r.ga4_avg_engagement_time_sec,
    decision: r.decision,
    decision_reason: r.decision_reason,
    merge_target_url: r.merge_target_url,
    merge_target_score: r.merge_target_score,
    priority: r.priority,
    status: "todo" as const,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const { error } = await admin.from("blog_audit").insert(batch);
    if (error) { console.error(`Insert batch ${i / 200} failed:`, error); process.exit(1); }
  }
  console.log(`✅ Wrote run ${runId} with ${rows.length} blog_audit rows.`);
  console.log(`   View at /dashboard/blog-audit`);
}

main().catch((e) => { console.error(e); process.exit(1); });
