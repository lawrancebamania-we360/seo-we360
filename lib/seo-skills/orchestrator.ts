import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPage, buildContext } from "./fetch";
import { technicalSkill } from "./technical";
import { schemaSkill } from "./schema";
import { imagesSkill } from "./images";
import { contentSkill } from "./content";
import { localSkill } from "./local";
import { geoSkill } from "./geo";
import { aioSkill } from "./aio";
import { aeoSkill } from "./aeo";
import { aiCitabilitySkill } from "./ai-citability";
import { speedSkill } from "./speed";
import { sitemapSkill } from "./sitemap";
import { hreflangSkill } from "./hreflang";
import { programmaticSkill } from "./programmatic";
import type { Finding, Skill } from "./types";
import type { Project, Pillar, Priority, TaskKind } from "@/lib/types/database";

export const ALL_SKILLS: Skill[] = [
  technicalSkill,
  schemaSkill,
  imagesSkill,
  contentSkill,
  localSkill,
  geoSkill,
  aioSkill,
  aeoSkill,              // page-level answer-engine readiness (feeds AEO pillar)
  aiCitabilitySkill,     // page-level AI citation score (feeds AIO pillar)
  speedSkill,
  sitemapSkill,
  programmaticSkill,
  hreflangSkill, // only runs when project.supports_multi_language (guarded below)
];

// ------------------------------------------------------------
// Fetch llms.txt + robots.txt once per domain, bake into context headers
// so per-page skills have the info without extra HTTP calls.
// ------------------------------------------------------------
interface DomainContext {
  llmsTxtPresent: boolean;
  botsBlocked: string[];
  sitemapStatus: "ok" | "missing" | "invalid";
  sitemapUrlCount: number;
  robotsHasSitemap: boolean;
}

async function checkSitemap(base: string): Promise<{ status: "ok" | "missing" | "invalid"; urlCount: number }> {
  const candidates = [`${base}/sitemap_index.xml`, `${base}/sitemap.xml`, `${base}/wp-sitemap.xml`];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
      if (!res.ok) continue;
      const xml = await res.text();
      if (!xml.includes("<loc>")) return { status: "invalid", urlCount: 0 };
      const matches = xml.match(/<loc>/g);
      return { status: "ok", urlCount: matches?.length ?? 0 };
    } catch { /* try next */ }
  }
  return { status: "missing", urlCount: 0 };
}

export async function fetchDomainContext(domain: string): Promise<DomainContext> {
  const base = `https://${domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  const [llms, robots, sitemap] = await Promise.all([
    fetch(`${base}/llms.txt`, { cache: "no-store", signal: AbortSignal.timeout(6000) }).then((r) => r.ok).catch(() => false),
    fetch(`${base}/robots.txt`, { cache: "no-store", signal: AbortSignal.timeout(6000) }).then((r) => (r.ok ? r.text() : "")).catch(() => ""),
    checkSitemap(base),
  ]);

  const botsBlocked: string[] = [];
  const aiBots = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "anthropic-ai"];
  for (const bot of aiBots) {
    const pattern = new RegExp(`user-agent:\\s*${bot}[\\s\\S]*?disallow:\\s*/\\s*$`, "im");
    if (pattern.test(robots)) botsBlocked.push(bot);
  }

  const robotsHasSitemap = /^sitemap:\s*https?:\/\//im.test(robots);

  return {
    llmsTxtPresent: llms,
    botsBlocked,
    sitemapStatus: sitemap.status,
    sitemapUrlCount: sitemap.urlCount,
    robotsHasSitemap,
  };
}

// ------------------------------------------------------------
// Page metadata captured during the audit
// ------------------------------------------------------------
export interface PageMeta {
  url: string;
  page_title: string | null;
  h1_text: string | null;
  is_blog: boolean;
}

const BLOG_URL_PATTERN = /\/blog|\/news|\/article|\/post|\/guide/;

function extractPageMeta(url: string, ctx: { $: import("cheerio").CheerioAPI }): PageMeta {
  const title = ctx.$("head > title").first().text().trim() || null;
  const h1 = ctx.$("h1").first().text().trim() || null;
  let pathname = "";
  try { pathname = new URL(url).pathname; } catch { /* bad url */ }
  return {
    url,
    page_title: title ? title.slice(0, 500) : null,
    h1_text: h1 ? h1.slice(0, 500) : null,
    is_blog: BLOG_URL_PATTERN.test(pathname),
  };
}

// ------------------------------------------------------------
// Run all skills for one URL
// ------------------------------------------------------------
export interface AuditResult {
  findings: Finding[];
  meta: PageMeta | null;
}

export async function auditUrl(url: string, project: Project, domainCtx: DomainContext): Promise<AuditResult> {
  try {
    const page = await fetchPage(url);
    const ctx = buildContext(url, page, {
      id: project.id,
      name: project.name,
      domain: project.domain,
      industry: project.industry,
    });
    // Inject domain-level data into responseHeaders so skills can read it
    ctx.responseHeaders["x-klimb-llmstxt"] = domainCtx.llmsTxtPresent ? "present" : "missing";
    ctx.responseHeaders["x-klimb-bots-blocked"] = JSON.stringify(domainCtx.botsBlocked);
    ctx.responseHeaders["x-klimb-sitemap-status"] = domainCtx.sitemapStatus;
    ctx.responseHeaders["x-klimb-sitemap-url-count"] = String(domainCtx.sitemapUrlCount);
    ctx.responseHeaders["x-klimb-robots-has-sitemap"] = domainCtx.robotsHasSitemap ? "yes" : "no";

    const findings: Finding[] = [];
    for (const skill of ALL_SKILLS) {
      // Hreflang is opt-in per project
      if (skill.name === "hreflang" && !project.supports_multi_language) continue;
      try {
        findings.push(...skill.run(ctx));
      } catch (e) {
        findings.push({
          skill: skill.name,
          check: "__skill_error__",
          status: "fail",
          pillar: skill.pillars[0] ?? "SEO",
          priority: "low",
          message: `Skill "${skill.name}" threw: ${e instanceof Error ? e.message : String(e)}`,
          impl: "Investigate the skill implementation.",
        });
      }
    }
    const meta = extractPageMeta(url, ctx);
    return { findings, meta };
  } catch (e) {
    return {
      findings: [{
        skill: "fetch",
        check: "fetch_failed",
        status: "fail",
        pillar: "SEO",
        priority: "high",
        message: `Could not fetch ${url}: ${e instanceof Error ? e.message : "unknown error"}`,
        impl: "Check the URL is reachable from the auditor (firewall, geo-blocking, 5xx).",
      }],
      meta: null,
    };
  }
}

// ------------------------------------------------------------
// Run many URLs with concurrency control
// ------------------------------------------------------------
export async function auditUrlsParallel(
  urls: string[],
  project: Project,
  concurrency = 8
): Promise<Map<string, AuditResult>> {
  const domainCtx = await fetchDomainContext(project.domain);
  const results = new Map<string, AuditResult>();
  const queue = [...urls];

  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) break;
      const result = await auditUrl(url, project, domainCtx);
      results.set(url, result);
    }
  });
  await Promise.all(workers);
  return results;
}

// ------------------------------------------------------------
// Persist per-page metadata (title, h1, is_blog) to seo_gaps.
// Upsert by (project_id, page_url) — keeps the latest snapshot.
// ------------------------------------------------------------
export async function upsertSitePages(
  supabase: SupabaseClient,
  project: Project,
  resultsByUrl: Map<string, AuditResult>
): Promise<{ pages_upserted: number }> {
  const rows = [...resultsByUrl.values()]
    .filter((r): r is AuditResult & { meta: PageMeta } => r.meta !== null)
    .map((r) => ({
      project_id: project.id,
      page_url: r.meta.url,
      page_title: r.meta.page_title,
      h1_text: r.meta.h1_text,
      is_blog: r.meta.is_blog,
      last_seen_at: new Date().toISOString(),
    }));
  if (rows.length === 0) return { pages_upserted: 0 };

  // Batch in chunks of 100 to stay well under PostgREST payload limits
  let upserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await supabase
      .from("seo_gaps")
      .upsert(chunk, { onConflict: "project_id,page_url" });
    if (!error) upserted += chunk.length;
  }
  return { pages_upserted: upserted };
}

// ------------------------------------------------------------
// Routing: which findings become actionable Web Tasks vs stay as
// informational SEO Gap entries only.
//
// Philosophy:
//   - SEO Gaps page = the full audit report (every finding, grouped per URL)
//   - Web Tasks Kanban = infrastructure + performance work dev team actually ships
//
// Findings that BECOME web_tasks = anything a developer owns:
//   - skill=speed        (Core Web Vitals, performance)
//   - skill=sitemap      (sitemap health)
//   - skill=hreflang     (multi-language infra)
//   - skill=technical + specific checks (broken page, viewport, robots meta blocking)
//   - any finding with priority=critical   (true blockers, regardless of skill)
//
// Everything else (title/meta/h1/schema/content/local/geo/aio/aeo/ai-citability)
// is SEO work — appears in the SEO Gaps drilldown only, without cluttering Web Tasks.
// ------------------------------------------------------------
const WEB_TASK_SKILLS = new Set(["speed", "sitemap", "hreflang"]);
const WEB_TASK_TECHNICAL_CHECKS = new Set(["http_status", "viewport", "robots"]);
const WEB_TASK_FETCH_CHECKS = new Set(["fetch_failed"]);

function shouldBecomeWebTask(f: Finding): boolean {
  if (f.priority === "critical") return true;
  if (WEB_TASK_SKILLS.has(f.skill)) return true;
  if (f.skill === "technical" && WEB_TASK_TECHNICAL_CHECKS.has(f.check)) return true;
  if (f.skill === "fetch" && WEB_TASK_FETCH_CHECKS.has(f.check)) return true;
  return false;
}

// ------------------------------------------------------------
// Persist findings. Returns split counts so the UI can tell the user exactly
// what landed where ("X SEO gaps + Y web tasks").
// ------------------------------------------------------------
export interface FindingsRoutingResult {
  total_findings: number;        // everything inserted into audit_findings
  seo_gap_findings: number;      // fail/missing/warn findings visible in SEO Gaps
  web_tasks_created: number;     // new rows inserted into tasks (web_task kind)
}

export async function findingsToTasks(
  supabase: SupabaseClient,
  project: Project,
  resultsByUrl: Map<string, AuditResult>,
  runId: string
): Promise<FindingsRoutingResult> {
  let totalFindings = 0;
  let seoGapFindings = 0;
  let createdTasks = 0;

  // Dedupe tasks against what's already open so re-running the audit is idempotent
  const { data: existing } = await supabase
    .from("tasks")
    .select("url, issue")
    .eq("project_id", project.id)
    .eq("done", false);
  const existingKeys = new Set(
    (existing ?? []).map((t: { url?: string | null; issue?: string | null }) =>
      `${t.url ?? ""}::${t.issue ?? ""}`.toLowerCase()
    )
  );

  const findingRows: Record<string, unknown>[] = [];
  const newTasks: Record<string, unknown>[] = [];

  for (const [url, result] of resultsByUrl) {
    for (const f of result.findings) {
      totalFindings++;
      findingRows.push({
        project_id: project.id,
        url,
        skill: f.skill,
        check_name: f.check,
        status: f.status,
        pillar: f.pillar,
        priority: f.priority,
        message: f.message,
        impl: f.impl,
        details: f.details ?? {},
        run_id: runId,
      });

      // Only fail/missing/warn countable as "SEO gaps" — ok findings are noise
      if (f.status === "fail" || f.status === "missing" || f.status === "warn") {
        seoGapFindings++;
      }

      // Skip anything that isn't actionable, then skip anything that isn't a
      // web-infra finding — the rest stays visible in SEO Gaps only.
      if (f.status !== "fail" && f.status !== "missing") continue;
      if (!shouldBecomeWebTask(f)) continue;

      const pathName = (() => { try { return new URL(url).pathname; } catch { return url; } })();
      const title = `${f.skill}: ${f.message} on ${pathName}`;
      const key = `${url}::${f.message}`.toLowerCase();
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);

      newTasks.push({
        project_id: project.id,
        title,
        url,
        priority: f.priority,
        impact: null,
        issue: f.message,
        impl: f.impl,
        pillar: f.pillar,
        kind: "web_task" satisfies TaskKind,
        source: "cron_audit",
      });
      createdTasks++;
    }
  }

  // Insert findings in batches
  for (let i = 0; i < findingRows.length; i += 200) {
    await supabase.from("audit_findings").insert(findingRows.slice(i, i + 200));
  }
  if (newTasks.length > 0) {
    for (let i = 0; i < newTasks.length; i += 100) {
      await supabase.from("tasks").insert(newTasks.slice(i, i + 100));
    }
  }

  return {
    total_findings: totalFindings,
    seo_gap_findings: seoGapFindings,
    web_tasks_created: createdTasks,
  };
}

// ------------------------------------------------------------
// Export pillar utilities for the orchestrator's callers
// ------------------------------------------------------------
export { technicalSkill, schemaSkill, imagesSkill, contentSkill, localSkill, geoSkill, aioSkill, aeoSkill, aiCitabilitySkill, speedSkill };
export type { Finding, Skill, Pillar, Priority };
