"use server";

// Influencer Collabs: server actions for the flat influencer_collabs table -
// same shape as lib/actions/earned-backlinks.ts (single-add with dedupe,
// two-step paste: parse-only preview then a separate commit, assign/delete).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

const AddInput = z.object({
  project_id: z.string().uuid(),
  influencer_name: z.string().trim().min(1),
  profile_link: z.string().trim().min(1),
  platform: z.enum(PLATFORMS),
  post_date: z.string().min(1),
  closing_date: z.string().optional(),
  amount_paid: z.string().optional(),
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
  const { project_id, influencer_name, profile_link, platform, post_date, closing_date, amount_paid, post_link, assigned_to } = AddInput.parse(input);
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
    profile_link,
    platform,
    post_date: postDate,
    closing_date: closingDate,
    amount_paid: parseAmount(amount_paid),
    post_link: post_link?.trim() || null,
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

    const { error } = await admin.from("influencer_collabs").insert({
      project_id,
      influencer_name: row.influencer_name,
      profile_link: row.profile_link,
      platform,
      post_date: postDate,
      closing_date: closingDate,
      amount_paid: parseAmount(row.amount_paid),
      post_link: row.post_link.trim() || null,
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
