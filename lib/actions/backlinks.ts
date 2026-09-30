"use server";

// Backlinks (Ticket 2): paste-import from a spreadsheet - same idea as Blog
// Clusters' importClusterPaste (header row matched by name case-insensitively,
// order-independent, extra columns tolerated), applied to backlink submissions
// instead of planned posts.
//
// The "Blog Post" column is matched against the project's most recent
// SITEMAP SNAPSHOT (url_metrics_runs.url_list - the same deduped URL list the
// daily GSC/GA4 sync saves, which Blog Audit's "Snapshot from X hours ago"
// badge is built from), NOT against Blog Sprint's task tracker - a sitemap
// match reflects what's actually live on the site rather than what merely
// exists as an internal task. A row whose pasted text doesn't match anything
// still imports fine - it just carries no verified link.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hostFromUrl, cleanHost } from "@/lib/url";

const ImportInput = z.object({
  project_id: z.string().uuid(),
  pasted_text: z.string().min(1),
});

export interface ImportBacklinksResult {
  ok: boolean;
  error?: string;
  itemsCreated?: number;
  itemsSkipped?: number;
  websitesCreated?: number;
}

const HEADER_MAP: Record<string, string> = {
  "website": "website",
  "submission date": "submission_date",
  "submission link": "submission_url",
  "blog post": "blog_post",
  "topic": "topic_name",
  "topic name": "topic_name",
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

interface ParsedRow {
  website: string;
  submission_date: string;
  submission_url: string;
  blog_post: string;
  topic_name: string;
}

function parsePastedRows(pastedText: string): { rows: ParsedRow[]; skipped: number } {
  const lines = pastedText.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], skipped: 0 };

  const headerCells = lines[0].split("\t").map((h) => normalizeHeader(h));
  const colIndex: Record<string, number> = {};
  headerCells.forEach((h, i) => { if (HEADER_MAP[h] != null) colIndex[HEADER_MAP[h]] = i; });

  const rows: ParsedRow[] = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split("\t");
    const get = (key: string): string | undefined => (colIndex[key] != null ? cells[colIndex[key]]?.trim() : undefined);
    const website = get("website");
    const submission_date = get("submission_date");
    const submission_url = get("submission_url");
    if (!website || !submission_date || !submission_url) { skipped++; continue; }
    rows.push({ website, submission_date, submission_url, blog_post: get("blog_post") || "", topic_name: get("topic_name") || "" });
  }
  return { rows, skipped };
}

// Accepts DD-MM-YYYY / DD/MM/YYYY (this team's sheets use day-first dates,
// e.g. "30-09-2026"), an ISO date ("2026-09-29"), or anything else Date can
// parse. DD-MM-YYYY is checked explicitly first because JS's native Date
// parser assumes MM-DD-YYYY for dash/slash strings - it silently returns
// Invalid Date for "30-09-2026" (no month 30), which used to skip every row
// without any visible error. Unparseable dates still skip the row rather
// than crash the whole batch.
function normalizeDate(v: string): string | null {
  const trimmed = v.trim();
  const dayFirst = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dayFirst) {
    const day = Number(dayFirst[1]);
    const month = Number(dayFirst[2]);
    const year = Number(dayFirst[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    return null;
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function importBacklinksPaste(input: z.infer<typeof ImportInput>): Promise<ImportBacklinksResult> {
  const { project_id, pasted_text } = ImportInput.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { rows, skipped: headerSkipped } = parsePastedRows(pasted_text);
  if (!rows.length) {
    return {
      ok: false,
      error: "No rows found. Make sure the first line is the header row (Website, Submission Date, Submission Link, Blog Post, Topic) and there's at least one data row.",
    };
  }

  const admin = createAdminClient();

  // Ticket 1's revision: match against the latest sitemap snapshot, not tasks.
  const { data: latestRun } = await admin
    .from("url_metrics_runs")
    .select("url_list")
    .eq("project_id", project_id)
    .order("run_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sitemapUrls = (latestRun as { url_list: string[] | null } | null)?.url_list ?? [];
  const sitemapByNormalized = new Map<string, string>();
  for (const u of sitemapUrls) sitemapByNormalized.set(cleanHost(u, { lowercase: true }), u);

  let itemsSkipped = headerSkipped;
  let itemsCreated = 0;
  let websitesCreated = 0;
  const websiteIdCache = new Map<string, string>();

  for (const row of rows) {
    const domain = hostFromUrl(row.website) || row.website.trim().toLowerCase();
    const date = normalizeDate(row.submission_date);
    if (!domain || !date) { itemsSkipped++; continue; }

    let websiteId = websiteIdCache.get(domain);
    if (!websiteId) {
      const { data: existing } = await admin
        .from("backlink_websites").select("id").eq("project_id", project_id).eq("domain", domain).maybeSingle();
      if (existing) {
        websiteId = (existing as { id: string }).id;
      } else {
        const { data: created, error: createErr } = await admin
          .from("backlink_websites").insert({ project_id, domain, created_by: user.id }).select("id").single();
        if (createErr || !created) { itemsSkipped++; continue; }
        websiteId = (created as { id: string }).id;
        websitesCreated++;
      }
      websiteIdCache.set(domain, websiteId);
    }

    // Re-pasting the same sheet (or an overlapping range of it) shouldn't
    // double the count - same website + same date + same link is treated as
    // the same submission and skipped rather than inserted again.
    const { data: dup } = await admin
      .from("backlink_submissions")
      .select("id")
      .eq("website_id", websiteId)
      .eq("submission_date", date)
      .eq("submission_url", row.submission_url)
      .maybeSingle();
    if (dup) { itemsSkipped++; continue; }

    const blogPostRaw = row.blog_post.trim();
    let blogPostUrl: string | null = null;
    let blogPostLabel = blogPostRaw || "—";
    if (blogPostRaw) {
      const matched = sitemapByNormalized.get(cleanHost(blogPostRaw, { lowercase: true }));
      if (matched) { blogPostUrl = matched; blogPostLabel = matched; }
    }

    const { error: insertErr } = await admin.from("backlink_submissions").insert({
      website_id: websiteId,
      project_id,
      submission_date: date,
      submission_url: row.submission_url,
      blog_post_url: blogPostUrl,
      blog_post_label: blogPostLabel,
      topic_name: row.topic_name.trim() || null,
      created_by: user.id,
    });
    if (insertErr) { itemsSkipped++; continue; }
    itemsCreated++;
  }

  revalidatePath("/dashboard/backlinks");
  return { ok: true, itemsCreated, itemsSkipped, websitesCreated };
}

const AddWebsitesInput = z.object({
  project_id: z.string().uuid(),
  names: z.string().min(1),
});

export interface AddBacklinkWebsitesResult {
  ok: boolean;
  error?: string;
  websitesCreated?: number;
  websitesSkipped?: number;
}

// Ticket 14: lightweight companion to importBacklinksPaste - adds a website
// with zero submissions (one name per line, no header/date/link required),
// so the team can stock the list with platforms before ever logging activity
// against them. Same find-or-create-by-domain logic as the submissions
// importer, so a name added here and later seen in a submissions paste
// resolve to the identical row.
export async function addBacklinkWebsites(input: z.infer<typeof AddWebsitesInput>): Promise<AddBacklinkWebsitesResult> {
  const { project_id, names } = AddWebsitesInput.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const entries = names.split("\n").map((n) => n.trim()).filter(Boolean);
  if (!entries.length) return { ok: false, error: "Enter at least one platform name." };

  const admin = createAdminClient();
  let websitesCreated = 0;
  let websitesSkipped = 0;
  const seen = new Set<string>();

  for (const entry of entries) {
    const domain = hostFromUrl(entry) || entry.toLowerCase();
    if (!domain || seen.has(domain)) { websitesSkipped++; continue; }
    seen.add(domain);

    const { data: existing } = await admin
      .from("backlink_websites").select("id").eq("project_id", project_id).eq("domain", domain).maybeSingle();
    if (existing) { websitesSkipped++; continue; }

    const { error: createErr } = await admin
      .from("backlink_websites").insert({ project_id, domain, created_by: user.id });
    if (createErr) { websitesSkipped++; continue; }
    websitesCreated++;
  }

  revalidatePath("/dashboard/backlinks");
  return { ok: true, websitesCreated, websitesSkipped };
}
