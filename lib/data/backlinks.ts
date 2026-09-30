// Backlinks (Ticket 2): reads over backlink_websites / backlink_submissions.
// Every read here is scoped to a date range computed by resolveBacklinkRange -
// the list view's counts and "last submission" are meant to reflect ONLY
// activity inside the selected filter, not all-time totals (a site with zero
// submissions in range still renders as a row showing 0, which is why
// websites are a real table rather than a distinct-list derived from
// submissions - see the migration's own comment for the full reasoning).

import { createClient } from "@/lib/supabase/server";

export type BacklinkRangeKey =
  | "all" | "yesterday" | "today" | "this_week" | "this_month"
  | "last_3_months" | "last_6_months" | "this_year" | "last_year" | "custom";

export interface BacklinkRange { start?: string; end?: string }

const iso = (d: Date): string => d.toISOString().slice(0, 10);

// Server-computed start/end for each preset - mirrors the shape of
// rangeToStart() in app/dashboard/reports/page.tsx, extended with the richer
// preset set + custom bounds task-filters.tsx already uses for its own
// range/start/end URL params. Assumptions (product calls, stated explicitly):
// week starts Monday; year = calendar year Jan 1-Dec 31; "last N months" is a
// rolling window (today minus N calendar months), not aligned month
// boundaries, matching how Reports' existing 30d/90d are rolling windows.
export function resolveBacklinkRange(range: string, customStart?: string, customEnd?: string): BacklinkRange {
  const now = new Date();
  const today = iso(now);
  switch (range as BacklinkRangeKey) {
    case "yesterday": {
      const d = new Date(now); d.setDate(d.getDate() - 1);
      return { start: iso(d), end: iso(d) };
    }
    case "today":
      return { start: today, end: today };
    case "this_week": {
      const d = new Date(now);
      const day = d.getDay(); // 0 = Sunday
      const diffToMonday = day === 0 ? 6 : day - 1;
      d.setDate(d.getDate() - diffToMonday);
      return { start: iso(d), end: today };
    }
    case "this_month": {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: iso(d), end: today };
    }
    case "last_3_months": {
      const d = new Date(now); d.setMonth(d.getMonth() - 3);
      return { start: iso(d), end: today };
    }
    case "last_6_months": {
      const d = new Date(now); d.setMonth(d.getMonth() - 6);
      return { start: iso(d), end: today };
    }
    case "this_year": {
      const d = new Date(now.getFullYear(), 0, 1);
      return { start: iso(d), end: today };
    }
    case "last_year": {
      const s = new Date(now.getFullYear() - 1, 0, 1);
      const e = new Date(now.getFullYear() - 1, 11, 31);
      return { start: iso(s), end: iso(e) };
    }
    case "custom":
      return { start: customStart || undefined, end: customEnd || undefined };
    default: // "all"
      return {};
  }
}

export interface BacklinkWebsiteSummary {
  id: string;
  domain: string;
  submissionCount: number;
  lastSubmissionDate: string | null;
  lastSubmissionUrl: string | null;
}

export async function getBacklinkWebsites(projectId: string, range: BacklinkRange): Promise<BacklinkWebsiteSummary[]> {
  const supabase = await createClient();
  const { data: websitesData } = await supabase
    .from("backlink_websites")
    .select("id, domain")
    .eq("project_id", projectId);
  const websites = (websitesData ?? []) as { id: string; domain: string }[];
  if (!websites.length) return [];

  let q = supabase
    .from("backlink_submissions")
    .select("website_id, submission_date, submission_url")
    .eq("project_id", projectId);
  if (range.start) q = q.gte("submission_date", range.start);
  if (range.end) q = q.lte("submission_date", range.end);
  const { data: subsData } = await q;
  const subs = (subsData ?? []) as { website_id: string; submission_date: string; submission_url: string }[];

  const byWebsite = new Map<string, { count: number; lastDate: string | null; lastUrl: string | null }>();
  for (const s of subs) {
    const entry = byWebsite.get(s.website_id) ?? { count: 0, lastDate: null, lastUrl: null };
    entry.count++;
    if (!entry.lastDate || s.submission_date >= entry.lastDate) { entry.lastDate = s.submission_date; entry.lastUrl = s.submission_url; }
    byWebsite.set(s.website_id, entry);
  }

  // Ticket 15: alphabetical, not "most submissions first" - the list is a
  // fixed platform checklist now (Ticket 14/16 add rows with 0 submissions),
  // so a leaderboard sort would bury the very rows a checklist exists to show.
  return websites
    .map((w) => ({
      id: w.id,
      domain: w.domain,
      submissionCount: byWebsite.get(w.id)?.count ?? 0,
      lastSubmissionDate: byWebsite.get(w.id)?.lastDate ?? null,
      lastSubmissionUrl: byWebsite.get(w.id)?.lastUrl ?? null,
    }))
    .sort((a, b) => a.domain.localeCompare(b.domain));
}

export interface BacklinkSubmissionRow {
  id: string;
  submissionDate: string;
  submissionUrl: string;
  blogPostLabel: string;
  blogPostUrl: string | null;
}

export interface BacklinkWebsiteDetail {
  id: string;
  domain: string;
  submissions: BacklinkSubmissionRow[];
}

export async function getBacklinkWebsiteDetail(
  projectId: string, websiteId: string, range: BacklinkRange,
): Promise<BacklinkWebsiteDetail | null> {
  const supabase = await createClient();
  const { data: website } = await supabase
    .from("backlink_websites")
    .select("id, domain")
    .eq("id", websiteId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!website) return null;
  const w = website as { id: string; domain: string };

  let q = supabase
    .from("backlink_submissions")
    .select("id, submission_date, submission_url, blog_post_label, blog_post_url")
    .eq("website_id", websiteId)
    .eq("project_id", projectId)
    .order("submission_date", { ascending: false });
  if (range.start) q = q.gte("submission_date", range.start);
  if (range.end) q = q.lte("submission_date", range.end);
  const { data: subsData } = await q;
  type Row = { id: string; submission_date: string; submission_url: string; blog_post_label: string; blog_post_url: string | null };
  const submissions = ((subsData ?? []) as Row[]).map((s) => ({
    id: s.id,
    submissionDate: s.submission_date,
    submissionUrl: s.submission_url,
    blogPostLabel: s.blog_post_label,
    blogPostUrl: s.blog_post_url,
  }));

  return { id: w.id, domain: w.domain, submissions };
}
