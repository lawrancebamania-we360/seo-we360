import { createClient } from "@/lib/supabase/server";
import type { SeoGap } from "@/lib/types/database";

export async function getSeoGaps(projectId: string): Promise<SeoGap[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("seo_gaps")
    .select("*")
    .eq("project_id", projectId)
    .order("last_checked", { ascending: false });
  return (data ?? []) as SeoGap[];
}

// ---- Rich per-page view backed by audit_findings ----

export interface AuditFinding {
  id: string;
  url: string;
  skill: string;
  check_name: string;
  status: "ok" | "warn" | "fail" | "missing";
  pillar: "SEO" | "AEO" | "GEO" | "SXO" | "AIO" | null;
  priority: "critical" | "high" | "medium" | "low" | null;
  message: string | null;
  impl: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface PageGapDetail {
  url: string;
  page_title: string | null;
  h1_text: string | null;
  is_blog: boolean;
  last_checked: string | null;

  // true if the audit actually ran on this URL (has findings OR last_seen_at set).
  // false = URL exists in seo_gaps from seed data but the crawler hasn't reached it yet.
  audit_ran: boolean;

  // Counts across all findings for this page
  counts: { fail: number; missing: number; warn: number; ok: number };

  // Findings grouped by skill, only fail/missing/warn (ok is implied by absence)
  findings_by_skill: Record<string, AuditFinding[]>;

  // Flat list, sorted by priority (critical > high > medium > low)
  top_findings: AuditFinding[];

  // Legacy 8-check status grid (kept for the at-a-glance row)
  legacy_status: Pick<SeoGap,
    "title_status" | "meta_status" | "h1_status" | "canonical_status" |
    "og_status" | "schema_status" | "robots_status" | "images_status"
  > | null;
}

const PRIORITY_WEIGHT: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

export async function getPageGapDetails(projectId: string): Promise<{
  pages: PageGapDetail[];
  summary: {
    pages_audited: number;
    pages_with_issues: number;
    pages_clean: number;
    findings: { fail: number; missing: number; warn: number };
    last_checked: string | null;
  };
}> {
  const supabase = await createClient();

  // Pull the latest snapshot of findings AND the seo_gaps legacy status for titles
  const [findingsResp, gapsResp] = await Promise.all([
    supabase
      .from("audit_findings")
      .select("id, url, skill, check_name, status, pillar, priority, message, impl, details, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase
      .from("seo_gaps")
      .select("page_url, page_title, h1_text, is_blog, last_checked, last_seen_at, title_status, meta_status, h1_status, canonical_status, og_status, schema_status, robots_status, images_status")
      .eq("project_id", projectId),
  ]);

  const allFindings = (findingsResp.data ?? []) as AuditFinding[];
  type GapRow = {
    page_url: string; page_title: string | null; h1_text: string | null;
    is_blog: boolean | null; last_checked: string | null; last_seen_at: string | null;
    title_status: SeoGap["title_status"]; meta_status: SeoGap["meta_status"];
    h1_status: SeoGap["h1_status"]; canonical_status: SeoGap["canonical_status"];
    og_status: SeoGap["og_status"]; schema_status: SeoGap["schema_status"];
    robots_status: SeoGap["robots_status"]; images_status: SeoGap["images_status"];
  };
  const gapsByUrl = new Map<string, GapRow>(
    ((gapsResp.data ?? []) as GapRow[]).map((g) => [g.page_url, g])
  );

  // Keep only the latest finding per (url, skill, check_name)
  const latestKey = new Map<string, AuditFinding>();
  for (const f of allFindings) {
    const key = `${f.url}::${f.skill}::${f.check_name}`;
    if (!latestKey.has(key)) latestKey.set(key, f); // allFindings is already ordered desc
  }
  const latestFindings = [...latestKey.values()];

  // Group by URL
  const urlGroups = new Map<string, AuditFinding[]>();
  for (const f of latestFindings) {
    if (!urlGroups.has(f.url)) urlGroups.set(f.url, []);
    urlGroups.get(f.url)!.push(f);
  }
  // Also include URLs that exist in seo_gaps but have no findings yet
  for (const url of gapsByUrl.keys()) {
    if (!urlGroups.has(url)) urlGroups.set(url, []);
  }

  const pages: PageGapDetail[] = [];
  let totalFail = 0, totalMissing = 0, totalWarn = 0;
  let pagesWithIssues = 0;
  let latestTs: string | null = null;

  for (const [url, findings] of urlGroups) {
    const gap = gapsByUrl.get(url);

    const counts = { fail: 0, missing: 0, warn: 0, ok: 0 };
    const issueFindings: AuditFinding[] = [];
    for (const f of findings) {
      counts[f.status]++;
      if (f.status !== "ok") issueFindings.push(f);
    }

    // Group issue findings by skill
    const findingsBySkill: Record<string, AuditFinding[]> = {};
    for (const f of issueFindings) {
      if (!findingsBySkill[f.skill]) findingsBySkill[f.skill] = [];
      findingsBySkill[f.skill].push(f);
    }

    // Top findings sorted by priority
    const topFindings = [...issueFindings].sort((a, b) => {
      const aw = (a.priority && PRIORITY_WEIGHT[a.priority]) ?? 0;
      const bw = (b.priority && PRIORITY_WEIGHT[b.priority]) ?? 0;
      return bw - aw;
    });

    totalFail += counts.fail;
    totalMissing += counts.missing;
    totalWarn += counts.warn;
    if (counts.fail + counts.missing > 0) pagesWithIssues++;

    const checkedAt = gap?.last_seen_at ?? gap?.last_checked ?? null;
    if (checkedAt && (!latestTs || checkedAt > latestTs)) latestTs = checkedAt;

    // Real audit ran if (a) we have findings for this URL OR (b) last_seen_at
    // is set (written by upsertSitePages during the audit). Seed-only rows only
    // have last_checked, no last_seen_at and no findings — those show "awaiting".
    const auditRan = findings.length > 0 || gap?.last_seen_at != null;

    pages.push({
      url,
      page_title: gap?.page_title ?? null,
      h1_text: gap?.h1_text ?? null,
      is_blog: gap?.is_blog ?? false,
      last_checked: checkedAt,
      audit_ran: auditRan,
      counts,
      findings_by_skill: findingsBySkill,
      top_findings: topFindings,
      legacy_status: gap ? {
        title_status: gap.title_status,
        meta_status: gap.meta_status,
        h1_status: gap.h1_status,
        canonical_status: gap.canonical_status,
        og_status: gap.og_status,
        schema_status: gap.schema_status,
        robots_status: gap.robots_status,
        images_status: gap.images_status,
      } : null,
    });
  }

  // Sort: pages with most critical issues first, then by fail count, then URL
  pages.sort((a, b) => {
    const aCritical = a.top_findings.filter((f) => f.priority === "critical").length;
    const bCritical = b.top_findings.filter((f) => f.priority === "critical").length;
    if (aCritical !== bCritical) return bCritical - aCritical;
    const aIssues = a.counts.fail + a.counts.missing;
    const bIssues = b.counts.fail + b.counts.missing;
    if (aIssues !== bIssues) return bIssues - aIssues;
    return a.url.localeCompare(b.url);
  });

  return {
    pages,
    summary: {
      pages_audited: pages.length,
      pages_with_issues: pagesWithIssues,
      pages_clean: pages.length - pagesWithIssues,
      findings: { fail: totalFail, missing: totalMissing, warn: totalWarn },
      last_checked: latestTs,
    },
  };
}
