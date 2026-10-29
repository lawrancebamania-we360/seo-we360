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
import { normalizeStoredUrl, urlVariants } from "@/lib/url";
import { isMissingColumn } from "@/lib/ai-citation/run-state";

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

function parseAmount(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(/[,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function parseCurrency(v: string | undefined): "USD" | "INR" {
  return v?.trim().toUpperCase() === "INR" ? "INR" : "USD";
}

function parseFreeFlag(v: string | undefined): boolean {
  if (!v) return false;
  return /^(y|yes|true|1|free)$/i.test(v.trim());
}

// Spam score as a percent 0-100. Accepts "1", "1%", "1.5%".
function parseSpam(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(/[%\s,]/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

function strOrNull(v: string | undefined | null): string | null {
  const t = (v ?? "").trim();
  return t.length ? t : null;
}

// The sheet has no Website column - it's the host of the "Live we got" URL.
function deriveWebsite(url: string): string | null {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// The exchange fields land in migration 20261029000001. Every write includes
// them, then retries without on a missing-column error so a save before the
// migration still persists the core row (lossy for the new fields only).
interface ExchangeFields {
  link_type?: string;
  spam_score?: string;
  anchor_text?: string;
  anchor_target?: string;
  contact_email?: string;
  given_url?: string;
  given_anchor_text?: string;
  given_anchor_target?: string;
  given_domain_rating?: string;
  given_spam_score?: string;
  given_date?: string;
}

function buildExchangePayload(x: ExchangeFields): Record<string, unknown> {
  return {
    link_type: strOrNull(x.link_type),
    spam_score: parseSpam(x.spam_score),
    anchor_text: strOrNull(x.anchor_text),
    anchor_target: strOrNull(x.anchor_target),
    contact_email: strOrNull(x.contact_email),
    given_url: strOrNull(x.given_url),
    given_anchor_text: strOrNull(x.given_anchor_text),
    given_anchor_target: strOrNull(x.given_anchor_target),
    given_domain_rating: parseDr(x.given_domain_rating),
    given_spam_score: parseSpam(x.given_spam_score),
    given_date: x.given_date ? normalizeDate(x.given_date) : null,
  };
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function insertWithExchange(admin: AdminClient, base: Record<string, unknown>, exchange: Record<string, unknown>): Promise<{ message?: string } | null> {
  let { error } = await admin.from("earned_backlinks").insert({ ...base, ...exchange });
  if (error && isMissingColumn(error.message)) {
    ({ error } = await admin.from("earned_backlinks").insert(base));
  }
  return error;
}

const ExchangeShape = {
  link_type: z.string().optional(),
  spam_score: z.string().optional(),
  anchor_text: z.string().optional(),
  anchor_target: z.string().optional(),
  contact_email: z.string().optional(),
  given_url: z.string().optional(),
  given_anchor_text: z.string().optional(),
  given_anchor_target: z.string().optional(),
  given_domain_rating: z.string().optional(),
  given_spam_score: z.string().optional(),
  given_date: z.string().optional(),
};

const AddInput = z.object({
  project_id: z.string().uuid(),
  website: z.string().trim().min(1),
  acquired_date: z.string().min(1),
  domain_rating: z.string().optional(),
  backlink_url: z.string().trim().min(1),
  assigned_to: z.string().uuid().nullable().optional(),
  is_free: z.boolean().optional(),
  amount_paid: z.string().optional(),
  currency: z.enum(["USD", "INR"]).optional(),
  ...ExchangeShape,
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
  const parsed = AddInput.parse(input);
  const { project_id, website, acquired_date, domain_rating, backlink_url, assigned_to, is_free, amount_paid, currency } = parsed;
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
    .in("backlink_url", urlVariants(backlink_url))
    .limit(1)
    .maybeSingle();
  if (dup) return { ok: false, error: "This exact backlink (same website, date, and link) is already logged.", duplicate: true };

  const base = {
    project_id,
    website,
    acquired_date: date,
    domain_rating: parseDr(domain_rating),
    backlink_url: normalizeStoredUrl(backlink_url) ?? backlink_url,
    assigned_to: assigned_to ?? null,
    is_free: is_free ?? false,
    amount_paid: is_free ? null : parseAmount(amount_paid),
    currency: currency ?? "USD",
    created_by: user.id,
  };
  const error = await insertWithExchange(admin, base, buildExchangePayload(parsed));
  if (error) return { ok: false, error: "Could not save that backlink." };

  revalidatePath("/dashboard/link-building");
  return { ok: true };
}

// ---- Edit a single row ------------------------------------------------

const UpdateInput = z.object({
  project_id: z.string().uuid(),
  backlink_id: z.string().uuid(),
  website: z.string().trim().min(1),
  acquired_date: z.string().min(1),
  domain_rating: z.string().optional(),
  backlink_url: z.string().trim().min(1),
  assigned_to: z.string().uuid().nullable().optional(),
  is_free: z.boolean().optional(),
  amount_paid: z.string().optional(),
  currency: z.enum(["USD", "INR"]).optional(),
  ...ExchangeShape,
});

export async function updateEarnedBacklink(input: z.infer<typeof UpdateInput>): Promise<AddEarnedBacklinkResult> {
  const parsed = UpdateInput.parse(input);
  const { project_id, backlink_id, website, acquired_date, domain_rating, backlink_url, assigned_to, is_free, amount_paid, currency } = parsed;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const date = normalizeDate(acquired_date);
  if (!date) return { ok: false, error: "Invalid date." };

  const admin = createAdminClient();

  // Same dedupe guard as add, but exclude this row itself.
  const { data: dup } = await admin
    .from("earned_backlinks")
    .select("id")
    .eq("project_id", project_id)
    .eq("website", website)
    .eq("acquired_date", date)
    .in("backlink_url", urlVariants(backlink_url))
    .neq("id", backlink_id)
    .limit(1)
    .maybeSingle();
  if (dup) return { ok: false, error: "Another logged backlink already has this exact website, date, and link.", duplicate: true };

  const base = {
    website,
    acquired_date: date,
    domain_rating: parseDr(domain_rating),
    backlink_url: normalizeStoredUrl(backlink_url) ?? backlink_url,
    assigned_to: assigned_to ?? null,
    is_free: is_free ?? false,
    amount_paid: is_free ? null : parseAmount(amount_paid),
    currency: currency ?? "USD",
  };
  const upd = (payload: Record<string, unknown>) =>
    admin.from("earned_backlinks").update(payload).eq("id", backlink_id).eq("project_id", project_id);

  let { error } = await upd({ ...base, ...buildExchangePayload(parsed) });
  if (error && isMissingColumn(error.message)) {
    ({ error } = await upd(base));
  }
  if (error) return { ok: false, error: "Could not save your changes." };

  revalidatePath("/dashboard/link-building");
  return { ok: true };
}

// ---- Bulk paste: parse-only preview, then a separate commit ----------

// Headers that appear ONCE and map straight to a field.
const UNIQUE_HEADER_MAP: Record<string, string> = {
  "website": "website",
  "live we got": "backlink_url",
  "live url": "backlink_url",
  "link": "backlink_url",
  "backlink link": "backlink_url",
  "backlink url": "backlink_url",
  "link type": "link_type",
  "type": "link_type",
  "link we gave": "given_url",
  "we gave": "given_url",
  "our link": "given_url",
  "email": "contact_email",
  "contact": "contact_email",
  "contact email": "contact_email",
  "amount": "amount_paid",
  "amount paid": "amount_paid",
  "currency": "currency",
  "free": "is_free",
  "is free": "is_free",
};

// Headers that appear TWICE in this team's exchange sheet - the FIRST
// occurrence is the link we got, the SECOND is the reciprocal link we gave.
const DUP_FIRST: Record<string, string> = {
  "dr": "domain_rating", "domain rating": "domain_rating",
  "spam": "spam_score", "spam score": "spam_score", "spam %": "spam_score",
  "anchor text": "anchor_text",
  "anchor link": "anchor_target", "anchor url": "anchor_target", "anchor target": "anchor_target",
  "date": "acquired_date", "acquired date": "acquired_date",
};
const DUP_SECOND: Record<string, string> = {
  "dr": "given_domain_rating", "domain rating": "given_domain_rating",
  "spam": "given_spam_score", "spam score": "given_spam_score", "spam %": "given_spam_score",
  "anchor text": "given_anchor_text",
  "anchor link": "given_anchor_target", "anchor url": "given_anchor_target", "anchor target": "given_anchor_target",
  "date": "given_date", "acquired date": "given_date",
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

interface ParsedRow {
  website: string;
  acquired_date: string;
  domain_rating: string;
  backlink_url: string;
  amount_paid: string;
  currency: string;
  is_free: string;
  link_type: string;
  spam_score: string;
  anchor_text: string;
  anchor_target: string;
  contact_email: string;
  given_url: string;
  given_anchor_text: string;
  given_anchor_target: string;
  given_domain_rating: string;
  given_spam_score: string;
  given_date: string;
}

function parsePastedRows(pastedText: string): { rows: ParsedRow[]; skipped: number } {
  const lines = pastedText.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], skipped: 0 };

  const headerCells = lines[0].split("\t").map((h) => normalizeHeader(h));
  const colIndex: Record<string, number> = {};
  const dupSeen: Record<string, number> = {};
  headerCells.forEach((h, i) => {
    if (DUP_FIRST[h] != null) {
      // First sighting -> "got" field, second -> reciprocal "gave" field.
      const field = (dupSeen[h] ?? 0) === 0 ? DUP_FIRST[h] : DUP_SECOND[h];
      dupSeen[h] = (dupSeen[h] ?? 0) + 1;
      if (colIndex[field] == null) colIndex[field] = i;
    } else if (UNIQUE_HEADER_MAP[h] != null) {
      if (colIndex[UNIQUE_HEADER_MAP[h]] == null) colIndex[UNIQUE_HEADER_MAP[h]] = i;
    }
  });

  const rows: ParsedRow[] = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split("\t");
    const get = (key: string): string => (colIndex[key] != null ? (cells[colIndex[key]]?.trim() ?? "") : "");
    const backlink_url = get("backlink_url");
    const acquired_date = get("acquired_date");
    // Website column is optional in the exchange sheet - derive it from the URL.
    const website = get("website") || (backlink_url ? deriveWebsite(backlink_url) ?? "" : "");
    if (!website || !acquired_date || !backlink_url) { skipped++; continue; }
    rows.push({
      website, acquired_date, backlink_url,
      domain_rating: get("domain_rating"),
      amount_paid: get("amount_paid"),
      currency: get("currency"),
      is_free: get("is_free"),
      link_type: get("link_type"),
      spam_score: get("spam_score"),
      anchor_text: get("anchor_text"),
      anchor_target: get("anchor_target"),
      contact_email: get("contact_email"),
      given_url: get("given_url"),
      given_anchor_text: get("given_anchor_text"),
      given_anchor_target: get("given_anchor_target"),
      given_domain_rating: get("given_domain_rating"),
      given_spam_score: get("given_spam_score"),
      given_date: get("given_date"),
    });
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
  amount_paid: z.string(),
  currency: z.string(),
  is_free: z.string(),
  link_type: z.string().optional(),
  spam_score: z.string().optional(),
  anchor_text: z.string().optional(),
  anchor_target: z.string().optional(),
  contact_email: z.string().optional(),
  given_url: z.string().optional(),
  given_anchor_text: z.string().optional(),
  given_anchor_target: z.string().optional(),
  given_domain_rating: z.string().optional(),
  given_spam_score: z.string().optional(),
  given_date: z.string().optional(),
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
      .in("backlink_url", urlVariants(row.backlink_url))
      .limit(1)
      .maybeSingle();
    if (dup) { itemsSkipped++; continue; }

    const isFree = parseFreeFlag(row.is_free);
    const base = {
      project_id,
      website: row.website,
      acquired_date: date,
      domain_rating: parseDr(row.domain_rating),
      backlink_url: normalizeStoredUrl(row.backlink_url) ?? row.backlink_url,
      assigned_to: row.assigned_to,
      is_free: isFree,
      amount_paid: isFree ? null : parseAmount(row.amount_paid),
      currency: parseCurrency(row.currency),
      created_by: user.id,
    };
    const error = await insertWithExchange(admin, base, buildExchangePayload(row));
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
