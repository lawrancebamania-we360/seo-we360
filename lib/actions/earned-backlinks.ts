"use server";

// Earned Backlinks: server actions for the flat earned_backlinks table.
// Deliberately NOT reusing importBacklinksPaste/commitBacklinksImport's
// website-resolution logic - there's no backlink_websites table here, no
// find-or-create, no sitemap-match, no headerless-paste heuristic (that
// heuristic specifically relies on matching a cell against a KNOWN platform
// list, which doesn't exist for this feature). Website is just free text.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Accepts DD-MM-YYYY / DD/MM/YYYY (this team's sheets use day-first dates)
// or an ISO date - same logic as lib/actions/backlinks.ts's normalizeDate,
// duplicated rather than shared since these two features' paste-parsing
// otherwise diverges completely (no website/sitemap resolution here).
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

function parseDr(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseInt(v.trim(), 10);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

const AddInput = z.object({
  project_id: z.string().uuid(),
  website: z.string().trim().min(1),
  acquired_date: z.string().min(1),
  domain_rating: z.string().optional(),
  backlink_url: z.string().trim().min(1),
  assigned_to: z.string().uuid().nullable().optional(),
});

export interface AddEarnedBacklinkResult {
  ok: boolean;
  error?: string;
  duplicate?: boolean;
}

// One submit = one row - same "no count multiplier" reasoning as
// addBacklinkSubmission: a batch belongs in Bulk import, not a hidden
// multiplier on the single form.
export async function addEarnedBacklink(input: z.infer<typeof AddInput>): Promise<AddEarnedBacklinkResult> {
  const { project_id, website, acquired_date, domain_rating, backlink_url, assigned_to } = AddInput.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const date = normalizeDate(acquired_date);
  if (!date) return { ok: false, error: "Invalid date." };

  const admin = createAdminClient();

  const { data: dup } = await admin
    .from("earned_backlinks")
    .select("id")
    .eq("project_id", project_id)
    .eq("website", website)
    .eq("acquired_date", date)
    .eq("backlink_url", backlink_url)
    .maybeSingle();
  if (dup) return { ok: false, error: "This exact backlink (same website, date, and link) is already logged.", duplicate: true };

  const { error } = await admin.from("earned_backlinks").insert({
    project_id,
    website,
    acquired_date: date,
    domain_rating: parseDr(domain_rating),
    backlink_url,
    assigned_to: assigned_to ?? null,
    created_by: user.id,
  });
  if (error) return { ok: false, error: "Could not save that backlink." };

  revalidatePath("/dashboard/link-building");
  return { ok: true };
}

// ---- Bulk paste: parse-only preview, then a separate commit ----------

const HEADER_MAP: Record<string, string> = {
  "website": "website",
  "date": "acquired_date",
  "acquired date": "acquired_date",
  "dr": "domain_rating",
  "domain rating": "domain_rating",
  "link": "backlink_url",
  "backlink link": "backlink_url",
  "backlink url": "backlink_url",
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

interface ParsedRow {
  website: string;
  acquired_date: string;
  domain_rating: string;
  backlink_url: string;
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
    const acquired_date = get("acquired_date");
    const backlink_url = get("backlink_url");
    if (!website || !acquired_date || !backlink_url) { skipped++; continue; }
    rows.push({ website, acquired_date, backlink_url, domain_rating: get("domain_rating") || "" });
  }
  return { rows, skipped };
}

const PreviewInput = z.object({
  pasted_text: z.string().min(1),
});

export interface PreviewEarnedBacklinksResult {
  ok: boolean;
  error?: string;
  rows?: (ParsedRow & { tempId: string })[];
  skipped?: number;
}

export async function previewEarnedBacklinksImport(input: z.infer<typeof PreviewInput>): Promise<PreviewEarnedBacklinksResult> {
  const { pasted_text } = PreviewInput.parse(input);
  const { rows, skipped } = parsePastedRows(pasted_text);
  if (!rows.length) {
    return { ok: false, error: "No rows found. Make sure the first line is the header row (Website, Date, DR, Link) and there's at least one data row." };
  }
  return { ok: true, rows: rows.map((r, i) => ({ ...r, tempId: `row-${i}` })), skipped };
}

const CommitRow = z.object({
  website: z.string().min(1),
  acquired_date: z.string().min(1),
  domain_rating: z.string(),
  backlink_url: z.string().min(1),
  assigned_to: z.string().uuid().nullable(),
});

const CommitInput = z.object({
  project_id: z.string().uuid(),
  rows: z.array(CommitRow).min(1),
});

export interface CommitEarnedBacklinksResult {
  ok: boolean;
  error?: string;
  itemsCreated?: number;
  itemsSkipped?: number;
}

export async function commitEarnedBacklinksImport(input: z.infer<typeof CommitInput>): Promise<CommitEarnedBacklinksResult> {
  const { project_id, rows } = CommitInput.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const admin = createAdminClient();
  let itemsCreated = 0;
  let itemsSkipped = 0;

  for (const row of rows) {
    const date = normalizeDate(row.acquired_date);
    if (!date) { itemsSkipped++; continue; }

    const { data: dup } = await admin
      .from("earned_backlinks")
      .select("id")
      .eq("project_id", project_id)
      .eq("website", row.website)
      .eq("acquired_date", date)
      .eq("backlink_url", row.backlink_url)
      .maybeSingle();
    if (dup) { itemsSkipped++; continue; }

    const { error } = await admin.from("earned_backlinks").insert({
      project_id,
      website: row.website,
      acquired_date: date,
      domain_rating: parseDr(row.domain_rating),
      backlink_url: row.backlink_url,
      assigned_to: row.assigned_to,
      created_by: user.id,
    });
    if (error) { itemsSkipped++; continue; }
    itemsCreated++;
  }

  revalidatePath("/dashboard/link-building");
  return { ok: true, itemsCreated, itemsSkipped };
}

// ---- Row actions: assign / delete -------------------------------------

const AssignInput = z.object({
  project_id: z.string().uuid(),
  backlink_id: z.string().uuid(),
  team_member_id: z.string().uuid().nullable(),
});

export async function assignEarnedBacklink(input: z.infer<typeof AssignInput>): Promise<{ ok: boolean; error?: string }> {
  const { project_id, backlink_id, team_member_id } = AssignInput.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { error } = await supabase
    .from("earned_backlinks").update({ assigned_to: team_member_id }).eq("id", backlink_id).eq("project_id", project_id);
  if (error) return { ok: false, error: "Could not assign that backlink." };

  revalidatePath("/dashboard/link-building");
  return { ok: true };
}

const DeleteInput = z.object({
  project_id: z.string().uuid(),
  backlink_id: z.string().uuid(),
});

export async function deleteEarnedBacklink(input: z.infer<typeof DeleteInput>): Promise<{ ok: boolean; error?: string }> {
  const { project_id, backlink_id } = DeleteInput.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { error } = await supabase
    .from("earned_backlinks").delete().eq("id", backlink_id).eq("project_id", project_id);
  if (error) return { ok: false, error: "Could not delete that backlink." };

  revalidatePath("/dashboard/link-building");
  return { ok: true };
}
