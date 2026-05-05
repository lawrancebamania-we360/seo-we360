#!/usr/bin/env tsx
/**
 * Read competitor SEO exports (Semrush + Moz format) and classify each
 * ranking URL into one of the 14 page-type buckets we're planning around.
 *
 * Inputs (all under seo-data/raw-csv/):
 *   - <competitor>.csv  — Semrush keyword × URL × volume × KD × rank
 *   - activtrak-moz-pa.csv  — Moz top pages by Page Authority (backlinks per URL)
 *
 * Outputs (under seo-data/):
 *   - competitors/<competitor>.json  — per-competitor parsed + bucketed rows
 *   - aggregate.json                  — cross-competitor roll-up:
 *       - per-bucket: page count, total volume, top URLs by volume,
 *         coverage matrix (which competitors have N pages in this bucket)
 *
 * Re-runnable: full overwrite each run. Append more raw CSVs and re-run.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = "D:/claude-projects/SEO - We360/seo-data";
const RAW = path.join(ROOT, "raw-csv");
const OUT_COMPETITORS = path.join(ROOT, "competitors");

// =============================================================================
// 14-bucket classifier — each item maps to URL-pattern checks. Order matters:
// more specific patterns run first.
// =============================================================================

type Bucket =
  | "vs-page"               // 2  — competitor comparison
  | "alternative-page"      // 2  — "X alternative" landing
  | "case-study"            // 3  — customer success stories
  | "use-case"              // 4  — persona × job-to-be-done
  | "solution-page"         // 5  — by buyer outcome
  | "industry-page"         // 6  — by vertical
  | "feature-page"          // 7  — per-product-feature
  | "integration-page"      // 8  — "X + tool" landing
  | "reviews-page"          // 9  — aggregated reviews
  | "how-it-works"          // 10 — explainer
  | "write-for-us"          // 11 — guest post invitation
  | "round-table"           // 12 — in-person event recap
  | "talk-show"             // 13 — interview series / podcast / webinar
  | "expertise-blog"        // 14 — invited industry-leader posts (heuristic)
  | "blog"                  // 1  — generic blog post (revamp candidate)
  | "glossary"              // extra — dictionary/term page
  | "tool-template"         // extra — calculator / generator / template
  | "job-description"       // extra — JD template
  | "core"                  // extra — homepage, pricing, about, etc.
  | "other";

interface Classification {
  bucket: Bucket;
  // For BoF buckets, sub-detail (e.g. competitor name, integration tool, industry slug)
  subject?: string;
}

function classify(rawUrl: string): Classification {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return { bucket: "other" }; }
  const p = url.pathname.toLowerCase().replace(/\/+$/, "") || "/";

  // 12 round-table / events
  if (/^\/(round-?table|events?|summit|conference)/.test(p)) {
    return { bucket: "round-table", subject: p.split("/")[2] ?? undefined };
  }

  // 13 talk show / podcast / webinar / video
  if (/^\/(talk-?show|podcast|webinar|video|episode)/.test(p)) {
    return { bucket: "talk-show", subject: p.split("/")[2] ?? undefined };
  }

  // 11 write for us / guest contributions
  if (/^\/(write-for-us|contribute|guest-post|submit)/.test(p)) {
    return { bucket: "write-for-us" };
  }

  // 9 reviews
  if (/^\/(reviews?|g2-reviews?|capterra|trustpilot|customer-reviews?)/.test(p)) {
    return { bucket: "reviews-page" };
  }

  // 10 how it works
  if (/^\/how-(it|we)-work/.test(p) || /^\/(how-to-use|getting-started|onboarding)/.test(p)) {
    return { bucket: "how-it-works" };
  }

  // 14 expertise blog — heuristic: /author/ or /by/ or /experts/ + sometimes /thought-leadership/
  if (/^\/(author|by|experts?|thought-leadership|industry-experts?)/.test(p)) {
    return { bucket: "expertise-blog", subject: p.split("/")[2] ?? undefined };
  }

  // 2a vs-page — covers /vs/X, /X-vs-Y, /comparisons/X
  // Match BEFORE blog (/blog/X-vs-Y is a vs-page in blog form)
  const vsMatch = p.match(/(?:^|\/)(vs|comparisons?)\/([a-z0-9-]+)/) ||
                  p.match(/\/([a-z0-9-]+-vs-[a-z0-9-]+)$/) ||
                  p.match(/\/([a-z0-9-]+)-vs\/?$/);
  if (vsMatch) return { bucket: "vs-page", subject: vsMatch[2] ?? vsMatch[1] };

  // 2b alternative-page
  const altMatch = p.match(/(?:^|\/)(alternatives?)\/([a-z0-9-]+)/) ||
                   p.match(/\/([a-z0-9-]+)-alternatives?$/);
  if (altMatch) return { bucket: "alternative-page", subject: altMatch[2] ?? altMatch[1] };

  // 3 case studies
  if (/^\/(case-stud|customer-stor|success-stor|customers?\/|client-stor)/.test(p)) {
    return { bucket: "case-study", subject: p.split("/")[2] ?? undefined };
  }

  // 4 use cases
  if (/^\/(use-cases?|usecases?)/.test(p)) {
    return { bucket: "use-case", subject: p.split("/")[2] ?? undefined };
  }

  // 8 integrations
  if (/^\/(integrations?|connect|apps?)\b/.test(p)) {
    return { bucket: "integration-page", subject: p.split("/")[2] ?? undefined };
  }

  // 6 industry pages
  if (/^\/(industries|industry|verticals?|for-)/.test(p)) {
    const subject = p.startsWith("/for-") ? p.slice(5).split("/")[0] : p.split("/")[2];
    return { bucket: "industry-page", subject };
  }

  // 5 solution pages
  if (/^\/(solutions?|who-we-serve|by-team|by-role)/.test(p)) {
    return { bucket: "solution-page", subject: p.split("/")[2] ?? undefined };
  }

  // 7 feature pages
  if (/^\/(features?|product|capabilities|platform)/.test(p)) {
    return { bucket: "feature-page", subject: p.split("/")[2] ?? undefined };
  }

  // Glossary
  if (/^\/(glossary|dictionary|terms\/|definitions?)/.test(p)) {
    return { bucket: "glossary", subject: p.split("/")[2] ?? undefined };
  }

  // Tools / templates / calculators / generators
  if (/^\/(templates?|calculators?|generators?|tools?\/|free-tools?)/.test(p)) {
    return { bucket: "tool-template", subject: p.split("/")[2] ?? undefined };
  }

  // Job descriptions
  if (/^\/(job-descriptions?|jd\/|job-description-templates?)/.test(p)) {
    return { bucket: "job-description", subject: p.split("/")[2] ?? undefined };
  }

  // 1 blog (catch /blog, /blogs, /articles, /insights, /resources/<x>)
  if (/^\/(blogs?|articles?|insights?|resources?|posts?)/.test(p)) {
    return { bucket: "blog", subject: p.split("/").pop() ?? undefined };
  }

  // Core pages
  if (
    p === "/" ||
    /^\/(pricing|contact|about|company|team|careers?|jobs|signup|signin|login|demo|free-trial|trial|security|privacy|terms|legal|partner|reseller|press|news|sitemap|faq|support|help|docs?)\b/.test(p)
  ) {
    return { bucket: "core" };
  }

  return { bucket: "other" };
}

// =============================================================================
// CSV parsing — lightweight, handles the Semrush format
// =============================================================================

function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  // Parse with quote handling
  const splitRow = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (c === "," && !inQ) {
        out.push(cur);
        cur = "";
      } else {
        cur += c;
      }
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

// =============================================================================
// Per-competitor processing
// =============================================================================

interface KeywordRow {
  keyword: string;
  volume: number;
  difficulty: number;
  rank: number;
  url: string;
  bucket: Bucket;
  subject?: string;
}

interface CompetitorOutput {
  competitor: string;
  domain: string;
  source: "semrush";
  rows: number;
  keyword_rows: KeywordRow[];
  bucket_summary: Record<Bucket, {
    page_count: number;
    keyword_count: number;
    total_volume: number;
    top_urls: Array<{ url: string; subject?: string; keyword_count: number; total_volume: number }>;
  }>;
}

function processSemrushCSV(competitor: string, domain: string, file: string): CompetitorOutput {
  const text = readFileSync(file, "utf-8");
  const rows = parseCSV(text);
  // Find URL + rank columns by suffix (header includes domain)
  const urlCol = Object.keys(rows[0] ?? {}).find((k) => k.endsWith("Top Ranking URL")) ?? "Top Ranking URL";
  const rankCol = Object.keys(rows[0] ?? {}).find((k) => k.endsWith("Top Rank")) ?? "Top Rank";

  const kwRows: KeywordRow[] = [];
  for (const r of rows) {
    const url = r[urlCol]?.trim();
    if (!url) continue;
    const c = classify(url);
    kwRows.push({
      keyword: r["Keyword"]?.trim() ?? "",
      volume: parseFloat(r["Specific Monthly Volume"] || r["Min Monthly Volume"] || "0") || 0,
      difficulty: parseInt(r["Difficulty"] || "0", 10) || 0,
      rank: parseInt(r[rankCol] || "0", 10) || 0,
      url,
      bucket: c.bucket,
      subject: c.subject,
    });
  }

  // Per-bucket roll-up
  const summary: Record<string, {
    page_count: number;
    keyword_count: number;
    total_volume: number;
    top_urls: Array<{ url: string; subject?: string; keyword_count: number; total_volume: number }>;
  }> = {};

  const buckets: Bucket[] = [
    "vs-page", "alternative-page", "case-study", "use-case", "solution-page",
    "industry-page", "feature-page", "integration-page", "reviews-page",
    "how-it-works", "write-for-us", "round-table", "talk-show", "expertise-blog",
    "blog", "glossary", "tool-template", "job-description", "core", "other",
  ];

  for (const b of buckets) {
    const inB = kwRows.filter((r) => r.bucket === b);
    const byUrl = new Map<string, { url: string; subject?: string; keyword_count: number; total_volume: number }>();
    for (const r of inB) {
      const e = byUrl.get(r.url) ?? { url: r.url, subject: r.subject, keyword_count: 0, total_volume: 0 };
      e.keyword_count++;
      e.total_volume += r.volume;
      byUrl.set(r.url, e);
    }
    const top = [...byUrl.values()].sort((a, b) => b.total_volume - a.total_volume).slice(0, 25);
    summary[b] = {
      page_count: byUrl.size,
      keyword_count: inB.length,
      total_volume: inB.reduce((s, r) => s + r.volume, 0),
      top_urls: top,
    };
  }

  return {
    competitor,
    domain,
    source: "semrush",
    rows: kwRows.length,
    keyword_rows: kwRows,
    bucket_summary: summary as CompetitorOutput["bucket_summary"],
  };
}

// =============================================================================
// Moz Page Authority CSV (different schema — backlink data per URL)
// =============================================================================

interface MozPageRow {
  url: string;
  title: string;
  page_authority: number;
  total_links: number;
  linking_domains: number;
  bucket: Bucket;
  subject?: string;
}

function processMozPaCSV(competitor: string, file: string): {
  competitor: string;
  source: "moz-pa";
  rows: number;
  page_rows: MozPageRow[];
  top_by_pa: MozPageRow[];
  bucket_pa_distribution: Record<Bucket, { page_count: number; sum_links: number; sum_linking_domains: number }>;
} {
  const text = readFileSync(file, "utf-8");
  // The Moz file has 5 metadata lines before the actual header — skip them
  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => l.startsWith("URL,Title,"));
  if (headerIdx < 0) {
    return { competitor, source: "moz-pa", rows: 0, page_rows: [], top_by_pa: [], bucket_pa_distribution: {} as Record<Bucket, { page_count: number; sum_links: number; sum_linking_domains: number }> };
  }
  const csvText = lines.slice(headerIdx).join("\n");
  const rows = parseCSV(csvText);

  const pageRows: MozPageRow[] = [];
  for (const r of rows) {
    let url = r["URL"]?.trim();
    if (!url) continue;
    if (!/^https?:\/\//.test(url)) url = `https://${url}`;
    const c = classify(url);
    pageRows.push({
      url,
      title: r["Title"]?.trim() ?? "",
      page_authority: parseInt(r["PA"] || "0", 10) || 0,
      total_links: parseInt(r["Total Links"] || "0", 10) || 0,
      linking_domains: parseInt(r["Linking Domains to Page"] || "0", 10) || 0,
      bucket: c.bucket,
      subject: c.subject,
    });
  }

  const topByPa = [...pageRows].sort((a, b) => b.page_authority - a.page_authority || b.linking_domains - a.linking_domains).slice(0, 50);

  const dist: Record<string, { page_count: number; sum_links: number; sum_linking_domains: number }> = {};
  for (const r of pageRows) {
    const e = dist[r.bucket] ?? { page_count: 0, sum_links: 0, sum_linking_domains: 0 };
    e.page_count++;
    e.sum_links += r.total_links;
    e.sum_linking_domains += r.linking_domains;
    dist[r.bucket] = e;
  }

  return {
    competitor,
    source: "moz-pa",
    rows: pageRows.length,
    page_rows: pageRows,
    top_by_pa: topByPa,
    bucket_pa_distribution: dist as Record<Bucket, { page_count: number; sum_links: number; sum_linking_domains: number }>,
  };
}

// =============================================================================
// Aggregate roll-up across all competitors
// =============================================================================

interface AggregateBucket {
  bucket: Bucket;
  competitor_coverage: Array<{ competitor: string; page_count: number; total_volume: number }>;
  total_competitor_pages: number;
  total_competitor_volume: number;
  top_subjects: Array<{ subject: string; competitors: string[]; combined_volume: number }>;
  top_urls_by_volume: Array<{ competitor: string; url: string; total_volume: number; keyword_count: number }>;
}

function buildAggregate(competitorOutputs: CompetitorOutput[]) {
  const buckets: Bucket[] = [
    "vs-page", "alternative-page", "case-study", "use-case", "solution-page",
    "industry-page", "feature-page", "integration-page", "reviews-page",
    "how-it-works", "write-for-us", "round-table", "talk-show", "expertise-blog",
    "blog", "glossary", "tool-template", "job-description", "core", "other",
  ];

  const out: AggregateBucket[] = [];
  for (const b of buckets) {
    const coverage = competitorOutputs.map((c) => ({
      competitor: c.competitor,
      page_count: c.bucket_summary[b]?.page_count ?? 0,
      total_volume: Math.round(c.bucket_summary[b]?.total_volume ?? 0),
    }));

    // Subjects: aggregate by `subject` across competitors (e.g., "slack" integration appears for Hubstaff + ActivTrak + ...)
    const subjectMap = new Map<string, { competitors: Set<string>; combined_volume: number }>();
    const allUrlsInBucket: Array<{ competitor: string; url: string; total_volume: number; keyword_count: number }> = [];
    for (const c of competitorOutputs) {
      for (const u of c.bucket_summary[b]?.top_urls ?? []) {
        if (u.subject) {
          const e = subjectMap.get(u.subject) ?? { competitors: new Set(), combined_volume: 0 };
          e.competitors.add(c.competitor);
          e.combined_volume += u.total_volume;
          subjectMap.set(u.subject, e);
        }
        allUrlsInBucket.push({ competitor: c.competitor, url: u.url, total_volume: Math.round(u.total_volume), keyword_count: u.keyword_count });
      }
    }
    const topSubjects = [...subjectMap.entries()]
      .map(([subject, v]) => ({ subject, competitors: [...v.competitors], combined_volume: Math.round(v.combined_volume) }))
      .sort((a, b) => b.combined_volume - a.combined_volume)
      .slice(0, 30);

    out.push({
      bucket: b,
      competitor_coverage: coverage,
      total_competitor_pages: coverage.reduce((s, c) => s + c.page_count, 0),
      total_competitor_volume: coverage.reduce((s, c) => s + c.total_volume, 0),
      top_subjects: topSubjects,
      top_urls_by_volume: allUrlsInBucket.sort((a, b) => b.total_volume - a.total_volume).slice(0, 25),
    });
  }
  return out;
}

// =============================================================================
// Driver
// =============================================================================

interface Manifest {
  competitor: string;
  domain: string;
  file: string;
  type: "semrush" | "moz-pa";
}

const MANIFEST: Manifest[] = [
  { competitor: "timechamp", domain: "timechamp.io", file: "timechamp.csv", type: "semrush" },
  { competitor: "insightful", domain: "insightful.io", file: "insightful.csv", type: "semrush" },
  { competitor: "prohance", domain: "prohance.ai", file: "prohance.csv", type: "semrush" },
  { competitor: "flowace", domain: "flowace.ai", file: "flowace.csv", type: "semrush" },
  { competitor: "activtrak", domain: "activtrak.com", file: "activtrak-keywords.csv", type: "semrush" },
  { competitor: "activtrak", domain: "activtrak.com", file: "activtrak-moz-pa.csv", type: "moz-pa" },
];

function main() {
  if (!existsSync(RAW)) { console.error(`Missing ${RAW}`); process.exit(1); }
  const competitorOutputs: CompetitorOutput[] = [];
  const mozOutputs: ReturnType<typeof processMozPaCSV>[] = [];

  for (const m of MANIFEST) {
    const filePath = path.join(RAW, m.file);
    if (!existsSync(filePath)) {
      console.log(`Skip ${m.file} (not found)`);
      continue;
    }
    if (m.type === "semrush") {
      console.log(`Processing semrush: ${m.file}...`);
      const out = processSemrushCSV(m.competitor, m.domain, filePath);
      writeFileSync(path.join(OUT_COMPETITORS, `${m.competitor}.json`), JSON.stringify(out, null, 2));
      competitorOutputs.push(out);
      console.log(`  ${m.competitor}: ${out.rows} keyword rows`);
    } else {
      console.log(`Processing moz-pa: ${m.file}...`);
      const out = processMozPaCSV(m.competitor, filePath);
      writeFileSync(path.join(OUT_COMPETITORS, `${m.competitor}-moz-pa.json`), JSON.stringify(out, null, 2));
      mozOutputs.push(out);
      console.log(`  ${m.competitor}: ${out.rows} page rows (PA data)`);
    }
  }

  // Aggregate across semrush competitors
  const agg = buildAggregate(competitorOutputs);
  writeFileSync(path.join(ROOT, "aggregate.json"), JSON.stringify({
    generated_at: new Date().toISOString(),
    competitors: competitorOutputs.map((c) => ({ competitor: c.competitor, domain: c.domain, rows: c.rows })),
    moz_pa_competitors: mozOutputs.map((c) => ({ competitor: c.competitor, page_rows: c.rows })),
    buckets: agg,
  }, null, 2));

  // Pretty summary print
  console.log("\n=== BUCKET COVERAGE (across semrush competitors) ===\n");
  console.log(`${"Bucket".padEnd(22)} ${"Total pages".padEnd(13)} ${"Total volume".padEnd(15)} Per-competitor (pages)`);
  for (const b of agg) {
    if (b.total_competitor_pages === 0 && b.bucket !== "core") continue;
    const perComp = b.competitor_coverage.map((c) => `${c.competitor}=${c.page_count}`).join(", ");
    console.log(`${b.bucket.padEnd(22)} ${String(b.total_competitor_pages).padEnd(13)} ${String(b.total_competitor_volume.toLocaleString()).padEnd(15)} ${perComp}`);
  }
  console.log("\n✅ Wrote per-competitor JSON + aggregate.json under seo-data/");
}

main();
