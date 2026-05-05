import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "@/lib/types/database";
import { auditUrlsParallel, findingsToTasks, upsertSitePages } from "@/lib/seo-skills/orchestrator";

const MAX_URLS_PER_RUN = 120; // fits in 60s with concurrency=8

export async function fetchSitemapUrls(domain: string): Promise<string[]> {
  const tryPaths = [
    `https://${domain}/sitemap_index.xml`,
    `https://www.${domain}/sitemap_index.xml`,
    `https://${domain}/wp-sitemap.xml`,
    `https://${domain}/sitemap.xml`,
    `https://www.${domain}/sitemap.xml`,
  ];

  for (const url of tryPaths) {
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const xml = await res.text();
      if (!xml.includes("<loc>")) continue;
      const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1].trim());

      // If this is a sitemap index, fetch child sitemaps
      if (xml.includes("<sitemapindex")) {
        const childSitemaps = locs.filter((u) => !u.includes("header") && !u.includes("footer") && !u.includes("metform-form"));
        const urls: string[] = [];
        for (const child of childSitemaps.slice(0, 5)) {
          try {
            const r = await fetch(child, { cache: "no-store", signal: AbortSignal.timeout(6000) });
            if (!r.ok) continue;
            const text = await r.text();
            urls.push(...Array.from(text.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1].trim()));
          } catch { /* skip */ }
        }
        return urls;
      }
      return locs;
    } catch { /* try next */ }
  }

  // Fallback: just the homepage
  return [`https://${domain}/`];
}

/**
 * Phase 1 — Full site audit using the /seo-skills orchestrator.
 * Parallel fetch + rule-based analysis. ~12 seconds for 104 URLs at concurrency 8.
 */
export interface RunFullSiteAuditResult {
  pages_checked: number;
  findings: number;              // total findings logged (incl. ok)
  seo_gaps_added: number;        // fail/missing/warn findings visible in SEO Gaps
  new_tasks: number;             // web-infra tasks pushed to Web Tasks Kanban
  pages_indexed: number;
  blogs_indexed: number;
}

export async function runFullSiteAudit(
  supabase: SupabaseClient,
  project: Project,
  opts: { maxUrls?: number; runId?: string } = {}
): Promise<RunFullSiteAuditResult> {
  const urls = (await fetchSitemapUrls(project.domain)).slice(0, opts.maxUrls ?? MAX_URLS_PER_RUN);
  const runId = opts.runId ?? crypto.randomUUID();

  const results = await auditUrlsParallel(urls, project, 8);
  const routing = await findingsToTasks(supabase, project, results, runId);
  const { pages_upserted } = await upsertSitePages(supabase, project, results);

  const blogsIndexed = [...results.values()].filter((r) => r.meta?.is_blog).length;

  return {
    pages_checked: urls.length,
    findings: routing.total_findings,
    seo_gaps_added: routing.seo_gap_findings,
    new_tasks: routing.web_tasks_created,
    pages_indexed: pages_upserted,
    blogs_indexed: blogsIndexed,
  };
}
