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
//
// Ticket 31-36: the whole entry point is one "+ Add submission" form now,
// not three separate buttons. Bulk paste lives behind that form's "Bulk
// import" link, and paste is a two-step flow - previewBacklinksImport parses
// ONLY (no DB write), the team assigns each parsed row to someone in a review
// screen, then commitBacklinksImport does the actual find-or-create/dedupe/
// sitemap-match/insert work the old one-shot importBacklinksPaste used to do
// in a single call.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hostFromUrl, cleanHost } from "@/lib/url";

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

// Ticket 29: if the first line doesn't name any recognized column, it isn't a
// header - it's data, and the team pastes without one often enough that
// erroring out ("No rows found") isn't the right default anymore. Classify
// every cell in every line instead: a cell matching an EXISTING website on
// this project's list wins the Website slot (this is what makes headerless
// paste reliable - a bare "1" or "2" can't be confused for a platform name
// when we already know what the real platform names are); a date-shaped cell
// is the date; a dotted, space-free cell is the link; whatever's left becomes
// Blog Post then Topic, in that order.
function classifyHeaderlessRow(cells: string[], knownDomains: Set<string>): ParsedRow | null {
  const trimmed = cells.map((c) => c.trim());
  let dateIdx = -1;
  let websiteIdx = -1;
  let linkIdx = -1;

  for (let i = 0; i < trimmed.length; i++) {
    if (dateIdx === -1 && normalizeDate(trimmed[i])) dateIdx = i;
  }
  for (let i = 0; i < trimmed.length; i++) {
    if (i === dateIdx) continue;
    const dom = hostFromUrl(trimmed[i]) || trimmed[i].toLowerCase();
    if (knownDomains.has(dom)) { websiteIdx = i; break; }
  }
  for (let i = 0; i < trimmed.length; i++) {
    if (i === dateIdx || i === websiteIdx) continue;
    if (/\./.test(trimmed[i]) && !/\s/.test(trimmed[i])) { linkIdx = i; break; }
  }
  if (websiteIdx === -1) {
    for (let i = 0; i < trimmed.length; i++) {
      if (i !== dateIdx && i !== linkIdx && trimmed[i]) { websiteIdx = i; break; }
    }
  }
  if (dateIdx === -1 || websiteIdx === -1 || linkIdx === -1) return null;

  const rest = trimmed.filter((_, i) => i !== dateIdx && i !== websiteIdx && i !== linkIdx);
  return {
    website: trimmed[websiteIdx],
    submission_date: trimmed[dateIdx],
    submission_url: trimmed[linkIdx],
    blog_post: rest[0] ?? "",
    topic_name: rest[1] ?? "",
  };
}

function parsePastedRows(pastedText: string, knownDomains: Set<string>): { rows: ParsedRow[]; skipped: number } {
  const lines = pastedText.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  if (!lines.length) return { rows: [], skipped: 0 };

  const headerCells = lines[0].split("\t").map((h) => normalizeHeader(h));
  const colIndex: Record<string, number> = {};
  headerCells.forEach((h, i) => { if (HEADER_MAP[h] != null) colIndex[HEADER_MAP[h]] = i; });

  if (Object.keys(colIndex).length === 0) {
    // No recognized header - every line, including the first, is data.
    const rows: ParsedRow[] = [];
    let skipped = 0;
    for (const line of lines) {
      const row = classifyHeaderlessRow(line.split("\t"), knownDomains);
      if (!row) { skipped++; continue; }
      rows.push(row);
    }
    return { rows, skipped };
  }

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

const PreviewInput = z.object({
  project_id: z.string().uuid(),
  pasted_text: z.string().min(1),
});

export interface PreviewBacklinksImportResult {
  ok: boolean;
  error?: string;
  rows?: (ParsedRow & { tempId: string })[];
  skipped?: number;
}

// Ticket 35 (step 1 of 2): parse ONLY - no website find-or-create, no
// dedupe check, no insert. Those all need a resolved website_id / exact
// duplicate match that's cheap to redo at commit time, so there's no reason
// to write anything before the team has assigned each row to someone.
export async function previewBacklinksImport(input: z.infer<typeof PreviewInput>): Promise<PreviewBacklinksImportResult> {
  const { project_id, pasted_text } = PreviewInput.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: knownWebsites } = await supabase
    .from("backlink_websites").select("domain").eq("project_id", project_id);
  const knownDomains = new Set(((knownWebsites ?? []) as { domain: string }[]).map((w) => w.domain));

  const { rows, skipped } = parsePastedRows(pasted_text, knownDomains);
  if (!rows.length) {
    return {
      ok: false,
      error: "No rows found. Make sure the first line is the header row (Website, Submission Date, Submission Link, Blog Post, Topic) and there's at least one data row - or, without a header, that each row's platform name matches one already on your list.",
    };
  }

  return { ok: true, rows: rows.map((r, i) => ({ ...r, tempId: `row-${i}` })), skipped };
}

const CommitRow = z.object({
  website: z.string().min(1),
  submission_date: z.string().min(1),
  submission_url: z.string().min(1),
  blog_post: z.string(),
  topic_name: z.string(),
  assigned_to: z.string().uuid().nullable(),
});

const CommitInput = z.object({
  project_id: z.string().uuid(),
  rows: z.array(CommitRow).min(1),
});

export interface CommitBacklinksImportResult {
  ok: boolean;
  error?: string;
  itemsCreated?: number;
  itemsSkipped?: number;
  websitesCreated?: number;
}

// Ticket 35 (step 2 of 2): the actual write - same find-or-create/dedupe/
// sitemap-match logic the old one-shot importBacklinksPaste used to run
// inline, now fed the rows the team already reviewed and assigned.
export async function commitBacklinksImport(input: z.infer<typeof CommitInput>): Promise<CommitBacklinksImportResult> {
  const { project_id, rows } = CommitInput.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const admin = createAdminClient();

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

  let itemsSkipped = 0;
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
      assigned_to: row.assigned_to,
      created_by: user.id,
    });
    if (insertErr) { itemsSkipped++; continue; }
    itemsCreated++;
  }

  revalidatePath("/dashboard/backlinks");
  return { ok: true, itemsCreated, itemsSkipped, websitesCreated };
}

const AddWebsiteInput = z.object({
  project_id: z.string().uuid(),
  name: z.string().min(1),
});

export interface AddBacklinkWebsiteResult {
  ok: boolean;
  error?: string;
  id?: string;
  domain?: string;
}

// Ticket 32: inline "+ Add new platform" inside the Add-submission form's
// Website dropdown - same find-or-create-by-domain as the paste importer, so
// a platform created here and later seen in a paste resolve to the same row.
// Singular (one name), unlike the old bulk multi-name AddPlatformButton it
// replaces - that button no longer has a header slot to live in, and one new
// platform at a time is the common case right before logging a submission to
// it.
export async function addBacklinkWebsite(input: z.infer<typeof AddWebsiteInput>): Promise<AddBacklinkWebsiteResult> {
  const { project_id, name } = AddWebsiteInput.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const domain = hostFromUrl(name) || name.trim().toLowerCase();
  if (!domain) return { ok: false, error: "Enter a platform name." };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("backlink_websites").select("id, domain").eq("project_id", project_id).eq("domain", domain).maybeSingle();
  if (existing) {
    const e = existing as { id: string; domain: string };
    return { ok: true, id: e.id, domain: e.domain };
  }

  const { data: created, error: createErr } = await admin
    .from("backlink_websites").insert({ project_id, domain, created_by: user.id }).select("id, domain").single();
  if (createErr || !created) return { ok: false, error: "Could not add that platform." };
  const c = created as { id: string; domain: string };

  revalidatePath("/dashboard/backlinks");
  return { ok: true, id: c.id, domain: c.domain };
}

const DeleteSubmissionInput = z.object({
  project_id: z.string().uuid(),
  submission_id: z.string().uuid(),
});

// Ticket 24: delete a single submission row (e.g. a miskeyed paste). Scoped
// by project_id in the WHERE clause, not just the id, so this can't be used
// to delete another project's row even with a guessed/leaked id.
export async function deleteBacklinkSubmission(input: z.infer<typeof DeleteSubmissionInput>): Promise<{ ok: boolean; error?: string }> {
  const { project_id, submission_id } = DeleteSubmissionInput.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { error } = await supabase
    .from("backlink_submissions").delete().eq("id", submission_id).eq("project_id", project_id);
  if (error) return { ok: false, error: "Could not delete that submission." };

  revalidatePath("/dashboard/backlinks");
  return { ok: true };
}

const AssignSubmissionInput = z.object({
  project_id: z.string().uuid(),
  submission_id: z.string().uuid(),
  team_member_id: z.string().uuid().nullable(),
});

// Ticket 25: who's responsible for this submission - same "assign a person to
// a row" shape as ClusterItemAssignee, minus the Sprint-task-linking part
// (a backlink submission has no task to create/attach).
export async function assignBacklinkSubmission(input: z.infer<typeof AssignSubmissionInput>): Promise<{ ok: boolean; error?: string }> {
  const { project_id, submission_id, team_member_id } = AssignSubmissionInput.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { error } = await supabase
    .from("backlink_submissions").update({ assigned_to: team_member_id }).eq("id", submission_id).eq("project_id", project_id);
  if (error) return { ok: false, error: "Could not assign that submission." };

  revalidatePath("/dashboard/backlinks");
  return { ok: true };
}

const VerifySubmissionInput = z.object({
  project_id: z.string().uuid(),
  submission_id: z.string().uuid(),
});

export interface VerifyBacklinkSubmissionResult {
  ok: boolean;
  error?: string;
  status?: string;
  note?: string;
}

// Ticket 23: "AI verified" - fetches the live submission link and asks the
// platform LLM whether the page exists and actually discusses the logged
// topic. Manual, per-row (a fetch + LLM call has a real cost) - same
// confirm-first pattern as AI Visibility's run-test flow, not something that
// fires automatically on import.
//
// Several of these platforms (G2, Quora, LinkedIn-adjacent sites) block plain
// HTTP scraping or sit behind a login wall - a failed/near-empty fetch is
// reported as 'inconclusive', NOT 'not_found', so the team is never told a
// live link is dead just because our bot got blocked.
export async function verifyBacklinkSubmission(input: z.infer<typeof VerifySubmissionInput>): Promise<VerifyBacklinkSubmissionResult> {
  const { project_id, submission_id } = VerifySubmissionInput.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: row } = await supabase
    .from("backlink_submissions")
    .select("id, submission_url, topic_name, blog_post_label")
    .eq("id", submission_id)
    .eq("project_id", project_id)
    .maybeSingle();
  if (!row) return { ok: false, error: "Submission not found." };
  const submission = row as { id: string; submission_url: string; topic_name: string | null; blog_post_label: string | null };

  const topic = submission.topic_name?.trim() || submission.blog_post_label?.trim();
  if (!topic || topic === "—") {
    return { ok: false, error: "No topic logged for this submission - add a Topic before verifying." };
  }

  const admin = createAdminClient();
  let status: string;
  let note: string;

  try {
    const { fetchPage } = await import("@/lib/seo-skills/fetch");
    const page = await fetchPage(submission.submission_url, 12000);
    if (page.statusCode >= 400) {
      status = "not_found";
      note = `Page returned HTTP ${page.statusCode}.`;
    } else {
      const bodyText = page.$("body").text().replace(/\s+/g, " ").trim().slice(0, 6000);
      if (bodyText.length < 200) {
        status = "inconclusive";
        note = "Page loaded but returned almost no readable text - likely blocked scraping or needs JavaScript. Check manually.";
      } else {
        const { callPlatformLLM } = await import("@/lib/ai/platform-llm");
        const result = await callPlatformLLM({
          model: "sonnet",
          jsonMode: true,
          maxTokens: 300,
          prompt: `A team submitted a link claiming it discusses the topic "${topic}". Below is the visible text scraped from that live page. Decide whether the page substantively discusses that topic (not just mentions it in passing/navigation).\n\nRespond with ONLY this JSON shape: {"discussesTopic": boolean, "note": "one short sentence explaining why"}\n\nPage text:\n"""\n${bodyText}\n"""`,
        });
        const parsed = JSON.parse(result.text) as { discussesTopic?: boolean; note?: string };
        status = parsed.discussesTopic ? "verified" : "topic_mismatch";
        note = parsed.note?.trim() || (parsed.discussesTopic ? "Confirmed by AI." : "AI could not confirm the page discusses this topic.");
      }
    }
  } catch (e) {
    status = "inconclusive";
    note = `Could not fetch this link (${e instanceof Error ? e.message : "unknown error"}). Check manually.`;
  }

  const { error: updateErr } = await admin
    .from("backlink_submissions")
    .update({ verification_status: status, verification_note: note, verified_at: new Date().toISOString() })
    .eq("id", submission_id)
    .eq("project_id", project_id);
  if (updateErr) return { ok: false, error: "Verified, but could not save the result." };

  revalidatePath("/dashboard/backlinks");
  return { ok: true, status, note };
}

const AddSubmissionInput = z.object({
  project_id: z.string().uuid(),
  website_id: z.string().uuid(),
  submission_date: z.string().min(1),
  submission_url: z.string().min(1),
  blog_post: z.string().optional(),
  topic_name: z.string().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
});

export interface AddBacklinkSubmissionResult {
  ok: boolean;
  error?: string;
  duplicate?: boolean;
}

// Ticket 30 (+ Ticket 33's assigned_to): the no-paste alternative - pick an
// existing platform, a date (calendar defaults to today), paste one link,
// optionally assign it. One submit = one submission, same as a single row of
// the paste-import - deliberately NOT a "log N at once" batch entry, since a
// count multiplier would either need several distinct links or collide with
// the exact-duplicate check below.
export async function addBacklinkSubmission(input: z.infer<typeof AddSubmissionInput>): Promise<AddBacklinkSubmissionResult> {
  const { project_id, website_id, submission_date, submission_url, blog_post, topic_name, assigned_to } = AddSubmissionInput.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const date = normalizeDate(submission_date);
  if (!date) return { ok: false, error: "Invalid submission date." };

  const admin = createAdminClient();

  const { data: website } = await admin
    .from("backlink_websites").select("id").eq("id", website_id).eq("project_id", project_id).maybeSingle();
  if (!website) return { ok: false, error: "That platform wasn't found on this project." };

  const { data: dup } = await admin
    .from("backlink_submissions")
    .select("id")
    .eq("website_id", website_id)
    .eq("submission_date", date)
    .eq("submission_url", submission_url)
    .maybeSingle();
  if (dup) return { ok: false, error: "This exact submission (same platform, date, and link) is already logged.", duplicate: true };

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

  const blogPostRaw = (blog_post ?? "").trim();
  let blogPostUrl: string | null = null;
  let blogPostLabel = blogPostRaw || "—";
  if (blogPostRaw) {
    const matched = sitemapByNormalized.get(cleanHost(blogPostRaw, { lowercase: true }));
    if (matched) { blogPostUrl = matched; blogPostLabel = matched; }
  }

  const { error: insertErr } = await admin.from("backlink_submissions").insert({
    website_id,
    project_id,
    submission_date: date,
    submission_url,
    blog_post_url: blogPostUrl,
    blog_post_label: blogPostLabel,
    topic_name: (topic_name ?? "").trim() || null,
    assigned_to: assigned_to ?? null,
    created_by: user.id,
  });
  if (insertErr) return { ok: false, error: "Could not save that submission." };

  revalidatePath("/dashboard/backlinks");
  return { ok: true };
}
