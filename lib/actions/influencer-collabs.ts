"use server";

// Influencer Collabs: server actions for the flat influencer_collabs table -
// same shape as lib/actions/earned-backlinks.ts (single-add with dedupe,
// two-step paste: parse-only preview then a separate commit, assign/delete).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeStoredUrl } from "@/lib/url";

const PLATFORMS = ["YouTube", "Instagram", "Facebook", "Twitter", "LinkedIn"] as const;
type Platform = (typeof PLATFORMS)[number];

function parsePlatform(v: string | undefined): Platform | null {
  if (!v) return null;
  const match = PLATFORMS.find((p) => p.toLowerCase() === v.trim().toLowerCase());
  return match ?? null;
}

// Accepts DD-MM-YYYY / DD/MM/YYYY (this team's sheets use day-first dates)
// or an ISO date - same logic as lib/actions/earned-backlinks.ts's
// normalizeDate, duplicated rather than shared (each feature's paste-parsing
// otherwise diverges completely).
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

function parseAmount(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(/[,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function parseCurrency(v: string | undefined): "USD" | "INR" {
  return v?.trim().toUpperCase() === "USD" ? "USD" : "INR";
}

function parseFreeFlag(v: string | undefined): boolean {
  if (!v) return false;
  return /^(y|yes|true|1|free)$/i.test(v.trim());
}

const AddInput = z.object({
  project_id: z.string().uuid(),
  influencer_name: z.string().trim().min(1),
  profile_link: z.string().trim().min(1),
  platform: z.enum(PLATFORMS),
  post_date: z.string().min(1),
  closing_date: z.string().optional(),
  is_free: z.boolean().optional(),
  amount_paid: z.string().optional(),
  currency: z.enum(["USD", "INR"]).optional(),
  post_link: z.string().trim().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
});

export interface AddInfluencerCollabResult {
  ok: boolean;
  error?: string;
  duplicate?: boolean;
}

// One submit = one row - same reasoning as addEarnedBacklink/
// addBacklinkSubmission: a batch belongs in Bulk import.
export async function addInfluencerCollab(input: z.infer<typeof AddInput>): Promise<AddInfluencerCollabResult> {
  const { project_id, influencer_name, profile_link, platform, post_date, closing_date, is_free, amount_paid, currency, post_link, assigned_to } = AddInput.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const postDate = normalizeDate(post_date);
  if (!postDate) return { ok: false, error: "Invalid post date." };
  const closingDate = closing_date?.trim() ? normalizeDate(closing_date) : null;
  if (closing_date?.trim() && !closingDate) return { ok: false, error: "Invalid date of closing." };

  const admin = createAdminClient();

  const { data: dup } = await admin
    .from("influencer_collabs")
    .select("id")
    .eq("project_id", project_id)
    .eq("influencer_name", influencer_name)
    .eq("platform", platform)
    .eq("post_date", postDate)
    .maybeSingle();
  if (dup) return { ok: false, error: "This exact collab (same influencer, platform, and post date) is already logged.", duplicate: true };

  const { error } = await admin.from("influencer_collabs").insert({
    project_id,
    influencer_name,
    profile_link: normalizeStoredUrl(profile_link) ?? profile_link,
    platform,
    post_date: postDate,
    closing_date: closingDate,
    is_free: is_free ?? false,
    amount_paid: is_free ? null : parseAmount(amount_paid),
    currency: currency ?? "INR",
    post_link: normalizeStoredUrl(post_link),
    assigned_to: assigned_to ?? null,
    created_by: user.id,
  });
  if (error) return { ok: false, error: "Could not save that collab." };

  revalidatePath("/dashboard/influencer-collabs");
  return { ok: true };
}

// ---- Bulk paste: parse-only preview, then a separate commit ----------

const HEADER_MAP: Record<string, string> = {
  "influencer name": "influencer_name",
  "name": "influencer_name",
  "profile link": "profile_link",
  "platform": "platform",
  "post date": "post_date",
  "date of closing": "closing_date",
  "closing date": "closing_date",
  "amount paid": "amount_paid",
  "amount": "amount_paid",
  "currency": "currency",
  "free": "is_free",
  "is free": "is_free",
  "post link": "post_link",
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

interface ParsedRow {
  influencer_name: string;
  profile_link: string;
  platform: string;
  post_date: string;
  closing_date: string;
  amount_paid: string;
  currency: string;
  is_free: string;
  post_link: string;
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
    const influencer_name = get("influencer_name");
    const profile_link = get("profile_link");
    const platform = get("platform");
    const post_date = get("post_date");
    if (!influencer_name || !profile_link || !platform || !post_date) { skipped++; continue; }
    rows.push({
      influencer_name, profile_link, platform, post_date,
      closing_date: get("closing_date") || "",
      amount_paid: get("amount_paid") || "",
      currency: get("currency") || "",
      is_free: get("is_free") || "",
      post_link: get("post_link") || "",
    });
  }
  return { rows, skipped };
}

const PreviewInput = z.object({
  pasted_text: z.string().min(1),
});

export interface PreviewInfluencerCollabsResult {
  ok: boolean;
  error?: string;
  rows?: (ParsedRow & { tempId: string })[];
  skipped?: number;
}

export async function previewInfluencerCollabsImport(input: z.infer<typeof PreviewInput>): Promise<PreviewInfluencerCollabsResult> {
  const { pasted_text } = PreviewInput.parse(input);
  const { rows, skipped } = parsePastedRows(pasted_text);
  if (!rows.length) {
    return { ok: false, error: "No rows found. Make sure the first line is the header row (Influencer Name, Profile Link, Platform, Post Date) and there's at least one data row." };
  }
  return { ok: true, rows: rows.map((r, i) => ({ ...r, tempId: `row-${i}` })), skipped };
}

const CommitRow = z.object({
  influencer_name: z.string().min(1),
  profile_link: z.string().min(1),
  platform: z.string().min(1),
  post_date: z.string().min(1),
  closing_date: z.string(),
  amount_paid: z.string(),
  currency: z.string(),
  is_free: z.string(),
  post_link: z.string(),
  assigned_to: z.string().uuid().nullable(),
});

const CommitInput = z.object({
  project_id: z.string().uuid(),
  rows: z.array(CommitRow).min(1),
});

export interface CommitInfluencerCollabsResult {
  ok: boolean;
  error?: string;
  itemsCreated?: number;
  itemsSkipped?: number;
}

export async function commitInfluencerCollabsImport(input: z.infer<typeof CommitInput>): Promise<CommitInfluencerCollabsResult> {
  const { project_id, rows } = CommitInput.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const admin = createAdminClient();
  let itemsCreated = 0;
  let itemsSkipped = 0;

  for (const row of rows) {
    const postDate = normalizeDate(row.post_date);
    const platform = parsePlatform(row.platform);
    if (!postDate || !platform) { itemsSkipped++; continue; }
    const closingDate = row.closing_date.trim() ? normalizeDate(row.closing_date) : null;

    const { data: dup } = await admin
      .from("influencer_collabs")
      .select("id")
      .eq("project_id", project_id)
      .eq("influencer_name", row.influencer_name)
      .eq("platform", platform)
      .eq("post_date", postDate)
      .maybeSingle();
    if (dup) { itemsSkipped++; continue; }

    const isFree = parseFreeFlag(row.is_free);
    const { error } = await admin.from("influencer_collabs").insert({
      project_id,
      influencer_name: row.influencer_name,
      profile_link: normalizeStoredUrl(row.profile_link) ?? row.profile_link,
      platform,
      post_date: postDate,
      closing_date: closingDate,
      is_free: isFree,
      amount_paid: isFree ? null : parseAmount(row.amount_paid),
      currency: parseCurrency(row.currency),
      post_link: normalizeStoredUrl(row.post_link),
      assigned_to: row.assigned_to,
      created_by: user.id,
    });
    if (error) { itemsSkipped++; continue; }
    itemsCreated++;
  }

  revalidatePath("/dashboard/influencer-collabs");
  return { ok: true, itemsCreated, itemsSkipped };
}

// ---- Row actions: assign / delete -------------------------------------

const AssignInput = z.object({
  project_id: z.string().uuid(),
  collab_id: z.string().uuid(),
  team_member_id: z.string().uuid().nullable(),
});

export async function assignInfluencerCollab(input: z.infer<typeof AssignInput>): Promise<{ ok: boolean; error?: string }> {
  const { project_id, collab_id, team_member_id } = AssignInput.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { error } = await supabase
    .from("influencer_collabs").update({ assigned_to: team_member_id }).eq("id", collab_id).eq("project_id", project_id);
  if (error) return { ok: false, error: "Could not assign that collab." };

  revalidatePath("/dashboard/influencer-collabs");
  return { ok: true };
}

const DeleteInput = z.object({
  project_id: z.string().uuid(),
  collab_id: z.string().uuid(),
});

export async function deleteInfluencerCollab(input: z.infer<typeof DeleteInput>): Promise<{ ok: boolean; error?: string }> {
  const { project_id, collab_id } = DeleteInput.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { error } = await supabase
    .from("influencer_collabs").delete().eq("id", collab_id).eq("project_id", project_id);
  if (error) return { ok: false, error: "Could not delete that collab." };

  revalidatePath("/dashboard/influencer-collabs");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Post tracking: hand edits (anyone on the project) + a manual "refresh now".
// ---------------------------------------------------------------------------

const TRACKING_HINT = "This needs migration 20261118000001 applied in Supabase first.";
const isMissing = (m: string) => /column .* does not exist|could not find the '.+' column|schema cache|relation .* does not exist/i.test(m);

const LinksInput = z.object({
  project_id: z.string().uuid(),
  collab_id: z.string().uuid(),
  post_body_link: z.string().trim().max(2000).nullable(),
  comment_link: z.string().trim().max(2000).nullable(),
});

/** Correct the we360.ai links found in the post / comment. Also marks the
 *  one-time link lookup done, so the scraper never touches them again. */
export async function saveInfluencerPostLinks(input: z.infer<typeof LinksInput>): Promise<{ ok: boolean; error?: string }> {
  const parsed = LinksInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the links." };
  const { project_id, collab_id, post_body_link, comment_link } = parsed.data;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { error } = await supabase.from("influencer_collabs").update({
    post_body_link: post_body_link || null,
    comment_link: comment_link || null,
    links_scraped_at: new Date().toISOString(),
  }).eq("id", collab_id).eq("project_id", project_id);
  if (error) return { ok: false, error: isMissing(error.message) ? TRACKING_HINT : "Could not save the links." };

  revalidatePath("/dashboard/influencer-collabs");
  return { ok: true };
}

const count = z.union([z.number().int().min(0).max(100_000_000), z.null()]);
const MetricInput = z.object({
  project_id: z.string().uuid(),
  collab_id: z.string().uuid(),
  captured_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  reactions: count,
  comments: count,
  reposts: count,
});

/** Enter or correct one day's numbers by hand. Saved as 'manual', which the
 *  daily scraper never overwrites. */
export async function saveInfluencerPostMetric(input: z.infer<typeof MetricInput>): Promise<{ ok: boolean; error?: string }> {
  const parsed = MetricInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the numbers." };
  const { project_id, collab_id, captured_on, reactions, comments, reposts } = parsed.data;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { error } = await supabase.from("influencer_post_metrics").upsert({
    project_id, collab_id, captured_on, reactions, comments, reposts,
    source: "manual", updated_by: user.id, updated_at: new Date().toISOString(),
  }, { onConflict: "collab_id,captured_on" });
  if (error) return { ok: false, error: isMissing(error.message) ? TRACKING_HINT : "Could not save those numbers." };

  revalidatePath("/dashboard/influencer-collabs");
  return { ok: true };
}

const RefreshInput = z.object({ project_id: z.string().uuid() });

/** Run today's sync now for this project (the same job the daily cron runs):
 *  engagement for posts in their first 15 days + the one-time link lookup. */
export async function refreshInfluencerPosts(input: z.infer<typeof RefreshInput>): Promise<{ ok: boolean; error?: string; message?: string }> {
  const parsed = RefreshInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bad request." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };
  // RLS: only someone with access to the project can see it.
  const { data: project } = await supabase.from("projects").select("id").eq("id", parsed.data.project_id).maybeSingle();
  if (!project) return { ok: false, error: "No access to this project." };

  const { runInfluencerPostSync } = await import("@/lib/cron/influencer-posts");
  const s = await runInfluencerPostSync(createAdminClient(), { projectId: parsed.data.project_id });
  if (!s.ok) return { ok: false, error: s.note ?? "Refresh failed." };

  revalidatePath("/dashboard/influencer-collabs");
  return {
    ok: true,
    message: s.checked === 0
      ? "Nothing to refresh — no LinkedIn post is in its first 15 days or waiting for its links."
      : `Updated ${s.metricsSaved} post${s.metricsSaved === 1 ? "" : "s"}${s.linksFound ? ` · found links for ${s.linksFound}` : ""}${s.keptManual ? ` · kept ${s.keptManual} hand-entered` : ""}${s.errors ? ` · ${s.errors} couldn't be read` : ""}.`,
  };
}

const PostLinkInput = z.object({
  project_id: z.string().uuid(),
  collab_id: z.string().uuid(),
  post_link: z.string().trim().max(2000).nullable(),
});

/** Set / fix the LinkedIn post link. A new post means a fresh one-time link
 *  lookup, so links_scraped_at and the last error are cleared. */
export async function saveInfluencerPostLink(input: z.infer<typeof PostLinkInput>): Promise<{ ok: boolean; error?: string }> {
  const parsed = PostLinkInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the link." };
  const { project_id, collab_id, post_link } = parsed.data;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const link = post_link ? normalizeStoredUrl(post_link) : null;
  let { error } = await supabase.from("influencer_collabs").update({
    post_link: link, links_scraped_at: null, scrape_error: null,
  }).eq("id", collab_id).eq("project_id", project_id);
  // Before the tracking migration only post_link exists.
  if (error && isMissing(error.message)) {
    ({ error } = await supabase.from("influencer_collabs").update({ post_link: link }).eq("id", collab_id).eq("project_id", project_id));
  }
  if (error) return { ok: false, error: "Could not save the post link." };

  revalidatePath("/dashboard/influencer-collabs");
  return { ok: true };
}
