"use server";

// Blog Clusters (Ticket 2): paste-import from a content-planning spreadsheet
// (Google Sheets / Excel) straight into the existing topic_clusters /
// topic_cluster_items tables - reusing the same tables the AI "Plan topic
// cluster" flow writes to (see app/api/topic-cluster/generate/route.ts),
// tagged source='import' instead of 'ai_generated'.
//
// Paste format: the FIRST row is a header row (tab-separated column names),
// every row after is one planned blog post. Column order doesn't matter -
// headers are matched by name (case-insensitive). "Supporting Keyword N" /
// "Volume N" pairs (N = 1..15) are collected into supporting_keywords.
// Semicolon-separated cells (H2 Candidates, FAQ Candidates, Interlinks
// To/From) are split into arrays. This is a straightforward tab+newline
// split, not full RFC4180 CSV parsing - a cell containing a literal newline
// would misalign rows, an accepted limitation for a paste tool (the sample
// data this was built against never has one).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const ImportInput = z.object({
  project_id: z.string().uuid(),
  cluster_name: z.string().trim().min(1).max(160),
  pasted_text: z.string().min(1),
});

export interface ImportClusterResult {
  ok: boolean;
  error?: string;
  clusterId?: string;
  itemsCreated?: number;
  itemsSkipped?: number;
}

// Canonical header -> normalized key. Matched case-insensitively, trimmed.
const HEADER_MAP: Record<string, string> = {
  "content title": "title",
  "category": "category",
  "blog category": "blog_category", // read for cross-check only, not stored (cluster comes from the caller's own cluster_name)
  "funnel stage": "funnel_stage",
  "content type": "content_type",
  "primary keyword": "primary_keyword",
  "vol/mo": "vol_mo",
  "serp verdict": "serp_verdict",
  "h2 candidates": "h2_candidates",
  "faq candidates": "faq_candidates",
  "interlinks to (slugs)": "interlinks_to",
  "interlinks from (slugs)": "interlinks_from",
  "meta description": "meta_description",
  "url slug": "url_slug",
  "primary cta": "primary_cta",
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function splitSemicolon(v: string | undefined): string[] {
  if (!v) return [];
  return v.split(";").map((s) => s.trim()).filter(Boolean);
}

function parseVolume(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseInt(v.replace(/[,\s]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

interface ParsedRow {
  title: string;
  category: string | null;
  funnel_stage: string | null;
  content_type: string | null;
  target_keyword: string | null;
  vol_mo: number | null;
  serp_verdict: string | null;
  supporting_keywords: Array<{ keyword: string; volume: number | null }>;
  outline: string[]; // H2 candidates
  faq_candidates: string[];
  interlinks_to: string[];
  interlinks_from: string[];
  meta_description: string | null;
  url_slug: string | null;
  primary_cta: string | null;
}

function parsePastedRows(pastedText: string): { rows: ParsedRow[]; skipped: number } {
  const lines = pastedText.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], skipped: 0 };

  const headerCells = lines[0].split("\t").map((h) => normalizeHeader(h));
  // Map column index -> canonical key (or a "Supporting Keyword N" / "Volume N" slot).
  const colKey: Array<{ key: string; n?: number } | null> = headerCells.map((h) => {
    if (HEADER_MAP[h]) return { key: HEADER_MAP[h] };
    const skMatch = h.match(/^supporting keyword (\d+)$/);
    if (skMatch) return { key: "supporting_keyword", n: parseInt(skMatch[1], 10) };
    const volMatch = h.match(/^volume (\d+)$/);
    if (volMatch) return { key: "volume", n: parseInt(volMatch[1], 10) };
    return null; // unrecognized column - ignored, not an error (tolerates extra columns)
  });

  const rows: ParsedRow[] = [];
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split("\t");
    const get = (key: string): string | undefined => {
      const idx = colKey.findIndex((c) => c?.key === key);
      return idx >= 0 ? cells[idx]?.trim() : undefined;
    };
    const title = get("title");
    if (!title) { skipped++; continue; }

    const skByN = new Map<number, string>();
    const volByN = new Map<number, string>();
    colKey.forEach((c, idx) => {
      if (c?.key === "supporting_keyword" && c.n != null) { const v = cells[idx]?.trim(); if (v) skByN.set(c.n, v); }
      if (c?.key === "volume" && c.n != null) { const v = cells[idx]?.trim(); if (v) volByN.set(c.n, v); }
    });
    const supporting_keywords = [...skByN.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([n, keyword]) => ({ keyword, volume: parseVolume(volByN.get(n)) }));

    rows.push({
      title,
      category: get("category") || null,
      funnel_stage: get("funnel_stage") || null,
      content_type: get("content_type") || null,
      target_keyword: get("primary_keyword") || null,
      vol_mo: parseVolume(get("vol_mo")),
      serp_verdict: get("serp_verdict") || null,
      supporting_keywords,
      outline: splitSemicolon(get("h2_candidates")),
      faq_candidates: splitSemicolon(get("faq_candidates")),
      interlinks_to: splitSemicolon(get("interlinks_to")),
      interlinks_from: splitSemicolon(get("interlinks_from")),
      meta_description: get("meta_description") || null,
      url_slug: get("url_slug") || null,
      primary_cta: get("primary_cta") || null,
    });
  }
  return { rows, skipped };
}

export async function importClusterPaste(input: z.infer<typeof ImportInput>): Promise<ImportClusterResult> {
  const { project_id, cluster_name, pasted_text } = ImportInput.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { rows, skipped } = parsePastedRows(pasted_text);
  if (!rows.length) {
    return { ok: false, error: "No rows found. Make sure the first line is the header row (copied from the sheet) and the pasted block has at least one data row." };
  }

  // Find-or-create the named cluster. seed_keyword/pillar_title are NOT NULL
  // on topic_clusters (built for the single-pillar AI flow) - for an import,
  // use whichever row is explicitly the pillar page (content_type mentions
  // "pillar"), else the first row, else the cluster name itself.
  const { data: existing } = await supabase
    .from("topic_clusters")
    .select("id")
    .eq("project_id", project_id)
    .eq("cluster_name", cluster_name)
    .maybeSingle();

  let clusterId = (existing as { id: string } | null)?.id ?? null;

  if (!clusterId) {
    const pillarRow = rows.find((r) => r.content_type?.toLowerCase().includes("pillar")) ?? rows[0];
    const { data: created, error: createErr } = await supabase
      .from("topic_clusters")
      .insert({
        project_id,
        cluster_name,
        seed_keyword: pillarRow.target_keyword || cluster_name,
        pillar_title: pillarRow.title || cluster_name,
        pillar_slug: pillarRow.url_slug || null,
        pillar_primary_keyword: pillarRow.target_keyword || null,
        source: "import",
        generated_by: user.id,
      })
      .select("id")
      .single();
    if (createErr || !created) return { ok: false, error: createErr?.message ?? "Could not create the cluster." };
    clusterId = (created as { id: string }).id;
  }

  const itemRows = rows.map((r, i) => ({
    cluster_id: clusterId,
    project_id,
    position: i + 1,
    title: r.title,
    target_keyword: r.target_keyword,
    outline: r.outline,
    category: r.category,
    funnel_stage: r.funnel_stage,
    content_type: r.content_type,
    vol_mo: r.vol_mo,
    serp_verdict: r.serp_verdict,
    supporting_keywords: r.supporting_keywords,
    faq_candidates: r.faq_candidates,
    interlinks_to: r.interlinks_to,
    interlinks_from: r.interlinks_from,
    meta_description: r.meta_description,
    url_slug: r.url_slug,
    primary_cta: r.primary_cta,
  }));

  const { error: insertErr } = await supabase.from("topic_cluster_items").insert(itemRows);
  if (insertErr) return { ok: false, error: insertErr.message, clusterId };

  revalidatePath("/dashboard/blog-clusters");
  revalidatePath(`/dashboard/blog-clusters/${clusterId}`);
  return { ok: true, clusterId, itemsCreated: itemRows.length, itemsSkipped: skipped };
}

// ---- Ticket 5: assign a team member, promoting the row to a real task -----

const AssignInput = z.object({
  item_id: z.string().uuid(),
  team_member_id: z.string().uuid().nullable(),
});

export interface AssignClusterItemResult {
  ok: boolean;
  error?: string;
  taskId?: string;
}

/**
 * Assigns a team member to a cluster item. If the item has no task yet, this
 * CREATES one (same shape the existing "Plan topic cluster" create-tasks
 * route uses, extended with the richer imported fields packed into `brief`)
 * and links it back via topic_cluster_items.task_id - so assigning is what
 * turns a planned row into a real Sprint task, in one action. If a task
 * already exists, this just reassigns it.
 */
export async function assignClusterItem(input: z.infer<typeof AssignInput>): Promise<AssignClusterItemResult> {
  const { item_id, team_member_id } = AssignInput.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: itemData, error: itemErr } = await supabase
    .from("topic_cluster_items")
    .select(`
      id, cluster_id, project_id, title, target_keyword, outline, faq_candidates,
      supporting_keywords, serp_verdict, meta_description, url_slug, primary_cta,
      interlinks_to, interlinks_from, task_id,
      topic_clusters ( cluster_name )
    `)
    .eq("id", item_id)
    .maybeSingle();
  if (itemErr || !itemData) return { ok: false, error: itemErr?.message ?? "Item not found." };

  type ItemRow = {
    id: string; cluster_id: string; project_id: string; title: string; target_keyword: string | null;
    outline: string[] | null; faq_candidates: string[] | null;
    supporting_keywords: Array<{ keyword: string; volume: number | null }> | null;
    serp_verdict: string | null; meta_description: string | null; url_slug: string | null; primary_cta: string | null;
    interlinks_to: string[] | null; interlinks_from: string[] | null; task_id: string | null;
    topic_clusters: { cluster_name: string } | null;
  };
  const item = itemData as unknown as ItemRow;

  // Already promoted - just reassign the existing task.
  if (item.task_id) {
    const { error } = await supabase.from("tasks").update({ team_member_id }).eq("id", item.task_id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/dashboard/sprint");
    revalidatePath(`/dashboard/blog-clusters/${item.cluster_id}`);
    return { ok: true, taskId: item.task_id };
  }

  // Not yet promoted - create the task now, carrying over everything the
  // import captured, then link + assign in the same write.
  const brief = {
    h1: item.title,
    h2_outline: item.outline ?? [],
    faq_candidates: item.faq_candidates ?? [],
    supporting_keywords: item.supporting_keywords ?? [],
    serp_verdict: item.serp_verdict,
    meta_description: item.meta_description,
    url_slug: item.url_slug,
    primary_cta: item.primary_cta,
    interlinks_to: item.interlinks_to ?? [],
    interlinks_from: item.interlinks_from ?? [],
    cluster_context: { cluster_name: item.topic_clusters?.cluster_name ?? null },
  };

  const { data: created, error: createErr } = await supabase
    .from("tasks")
    .insert({
      project_id: item.project_id,
      kind: "blog_task" as const,
      title: `Write article: ${item.title}`,
      target_keyword: item.target_keyword,
      source: "manual" as const,
      priority: "medium" as const,
      brief,
      issue: `Part of the "${item.topic_clusters?.cluster_name ?? "planned"}" content cluster.`,
      impl: "Brief pre-populated from the imported cluster row - see the brief for supporting keywords, FAQ candidates, and interlink targets.",
      team_member_id,
    })
    .select("id")
    .single();
  if (createErr || !created) return { ok: false, error: createErr?.message ?? "Could not create the task." };
  const taskId = (created as { id: string }).id;

  const { error: linkErr } = await supabase.from("topic_cluster_items").update({ task_id: taskId }).eq("id", item_id);
  if (linkErr) return { ok: false, error: linkErr.message, taskId };

  revalidatePath("/dashboard/sprint");
  revalidatePath(`/dashboard/blog-clusters/${item.cluster_id}`);
  return { ok: true, taskId };
}

// ---- Delete a cluster -------------------------------------------------

const DeleteClusterInput = z.object({
  project_id: z.string().uuid(),
  cluster_id: z.string().uuid(),
});

/**
 * Deletes the cluster and every planned row in it (topic_cluster_items has
 * ON DELETE CASCADE on cluster_id). Any row already promoted to a real
 * Sprint task is left alone - deleting the plan shouldn't delete a writer's
 * in-progress work, only the item row that pointed at it.
 */
export async function deleteBlogCluster(input: z.infer<typeof DeleteClusterInput>): Promise<{ ok: boolean; error?: string }> {
  const { project_id, cluster_id } = DeleteClusterInput.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { error } = await supabase
    .from("topic_clusters").delete().eq("id", cluster_id).eq("project_id", project_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/blog-clusters");
  return { ok: true };
}
