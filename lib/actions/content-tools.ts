"use server";

// Calculator / Tool library actions. A tool is a reusable spec (free text) plus
// an uploaded HTML bundle (.zip, in the content-tool-bundles Storage bucket).
// Everything goes through the signed-in client so RLS (has_project_access on
// content_tools / topic_cluster_items) decides who may read or write; the
// project_id scope is a second guard. The .zip itself is uploaded from the
// browser straight to Storage; these actions only persist its path + name.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toExternalUrl } from "@/lib/url";
import { isMissingColumn, isMissingTable } from "@/lib/ai-citation/run-state";
import { TOOL_BUNDLE_BUCKET, type ContentTool } from "@/lib/content-pipeline/tool";

const MIGRATION_NOTICE =
  "This needs a one-time database update first. Apply the 20261028000001 migration in Supabase, then try again.";

type Result = { ok: boolean; error?: string };

function missing(message: string | undefined): boolean {
  return isMissingColumn(message) || isMissingTable(message);
}

const TOOL_COLS = "id, name, content, inputs, output, formula, bundle_path, bundle_name, embed_url";

function toTool(r: Record<string, unknown>): ContentTool {
  return {
    id: r.id as string,
    name: (r.name as string) ?? "",
    content: (r.content as string | null) ?? null,
    inputs: (r.inputs as string | null) ?? null,
    output: (r.output as string | null) ?? null,
    formula: (r.formula as string | null) ?? null,
    bundlePath: (r.bundle_path as string | null) ?? null,
    bundleName: (r.bundle_name as string | null) ?? null,
    embedUrl: (r.embed_url as string | null) ?? null,
  };
}

// The reusable library for a project — what the "pick existing tool" list shows.
export async function listContentTools(projectId: string): Promise<{ ok: boolean; tools: ContentTool[]; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, tools: [], error: "Not authenticated." };

  const { data, error } = await supabase
    .from("content_tools").select(TOOL_COLS)
    .eq("project_id", projectId).order("name", { ascending: true });
  if (error) return { ok: false, tools: [], error: missing(error.message) ? MIGRATION_NOTICE : "Could not load tools." };
  return { ok: true, tools: (data ?? []).map((r) => toTool(r as Record<string, unknown>)) };
}

const SpecInput = z.object({
  name: z.string().trim().min(1, "Give the tool a name.").max(200),
  content: z.string().trim().max(5000).optional().default(""),
  inputs: z.string().trim().max(5000).optional().default(""),
  output: z.string().trim().max(5000).optional().default(""),
  formula: z.string().trim().max(5000).optional().default(""),
  embed_url: z.string().trim().max(2000).optional().default(""),
  bundle_path: z.string().trim().max(500).optional(),
  bundle_name: z.string().trim().max(300).optional(),
});

function cleanSpec(d: z.infer<typeof SpecInput>): { row: Record<string, unknown>; error?: string } {
  let embed: string | null = null;
  if (d.embed_url) {
    embed = toExternalUrl(d.embed_url) ?? null;
    if (!embed) return { row: {}, error: "That embed link doesn't look like a web address." };
  }
  return {
    row: {
      name: d.name,
      content: d.content || null,
      inputs: d.inputs || null,
      output: d.output || null,
      formula: d.formula || null,
      embed_url: embed,
    },
  };
}

const CreateInput = SpecInput.extend({ project_id: z.string().uuid() });

// Create a new tool (and, when the item is given, attach it in the same step).
export async function createContentTool(
  input: z.infer<typeof CreateInput> & { item_id?: string },
): Promise<Result & { tool?: ContentTool }> {
  const parsed = CreateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Those details aren't valid." };
  const { row, error: specErr } = cleanSpec(parsed.data);
  if (specErr) return { ok: false, error: specErr };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const insert = {
    ...row,
    project_id: parsed.data.project_id,
    bundle_path: parsed.data.bundle_path ?? null,
    bundle_name: parsed.data.bundle_name ?? null,
    created_by: user.id,
  };
  const { data, error } = await supabase.from("content_tools").insert(insert).select(TOOL_COLS).single();
  if (error) return { ok: false, error: missing(error.message) ? MIGRATION_NOTICE : "Could not save the tool." };
  const tool = toTool(data as Record<string, unknown>);

  if (input.item_id) {
    const r = await attachToolToItem({ item_id: input.item_id, tool_id: tool.id });
    if (!r.ok) return { ok: false, error: r.error };
  }
  revalidatePath("/dashboard/blog-clusters");
  revalidatePath("/dashboard/to-publish");
  return { ok: true, tool };
}

const UpdateInput = SpecInput.extend({ tool_id: z.string().uuid(), project_id: z.string().uuid() });

// Edit a tool — changes apply on EVERY post it's linked to (it's shared).
// A new bundle is passed only when the user uploaded one; otherwise it's kept.
export async function updateContentTool(input: z.infer<typeof UpdateInput>): Promise<Result & { tool?: ContentTool }> {
  const parsed = UpdateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Those details aren't valid." };
  const { row, error: specErr } = cleanSpec(parsed.data);
  if (specErr) return { ok: false, error: specErr };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const update: Record<string, unknown> = { ...row, updated_at: new Date().toISOString() };
  if (parsed.data.bundle_path !== undefined) {
    update.bundle_path = parsed.data.bundle_path || null;
    update.bundle_name = parsed.data.bundle_name || null;
  }
  const { data, error } = await supabase
    .from("content_tools").update(update)
    .eq("id", parsed.data.tool_id).eq("project_id", parsed.data.project_id).select(TOOL_COLS).single();
  if (error) return { ok: false, error: missing(error.message) ? MIGRATION_NOTICE : "Could not save the tool." };

  revalidatePath("/dashboard/blog-clusters");
  revalidatePath("/dashboard/to-publish");
  return { ok: true, tool: toTool(data as Record<string, unknown>) };
}

const AttachInput = z.object({ item_id: z.string().uuid(), tool_id: z.string().uuid() });

// Link an existing tool to a post. RLS on the item row gates who may do this.
export async function attachToolToItem(input: z.infer<typeof AttachInput>): Promise<Result> {
  const parsed = AttachInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick a tool." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data, error } = await supabase
    .from("topic_cluster_items").update({ tool_id: parsed.data.tool_id })
    .eq("id", parsed.data.item_id).select("id, cluster_id");
  if (error) return { ok: false, error: missing(error.message) ? MIGRATION_NOTICE : "Could not attach the tool." };
  if (!data?.length) return { ok: false, error: "That item wasn't found." };

  for (const c of new Set((data as { cluster_id: string }[]).map((r) => r.cluster_id))) revalidatePath(`/dashboard/blog-clusters/${c}`);
  revalidatePath("/dashboard/to-publish");
  return { ok: true };
}

const DetachInput = z.object({ item_id: z.string().uuid() });

// Unlink the tool from this post only (the tool itself stays in the library).
export async function detachToolFromItem(input: z.infer<typeof DetachInput>): Promise<Result> {
  const parsed = DetachInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That item wasn't found." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data, error } = await supabase
    .from("topic_cluster_items").update({ tool_id: null })
    .eq("id", parsed.data.item_id).select("id, cluster_id");
  if (error) return { ok: false, error: missing(error.message) ? MIGRATION_NOTICE : "Could not remove the tool." };

  for (const c of new Set((data as { cluster_id: string }[] ?? []).map((r) => r.cluster_id))) revalidatePath(`/dashboard/blog-clusters/${c}`);
  revalidatePath("/dashboard/to-publish");
  return { ok: true };
}

const DeleteInput = z.object({ tool_id: z.string().uuid(), project_id: z.string().uuid() });

// Delete a tool from the library entirely. The FK (on delete set null) unlinks
// it from every post automatically; its bundle is removed from Storage best-effort.
export async function deleteContentTool(input: z.infer<typeof DeleteInput>): Promise<Result> {
  const parsed = DeleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That tool wasn't found." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: existing } = await supabase
    .from("content_tools").select("bundle_path").eq("id", parsed.data.tool_id).eq("project_id", parsed.data.project_id).maybeSingle();
  const bundlePath = (existing as { bundle_path: string | null } | null)?.bundle_path ?? null;

  const { error } = await supabase
    .from("content_tools").delete().eq("id", parsed.data.tool_id).eq("project_id", parsed.data.project_id);
  if (error) return { ok: false, error: missing(error.message) ? MIGRATION_NOTICE : "Could not delete the tool." };

  if (bundlePath) {
    try { await supabase.storage.from(TOOL_BUNDLE_BUCKET).remove([bundlePath]); } catch { /* best-effort */ }
  }
  revalidatePath("/dashboard/blog-clusters");
  revalidatePath("/dashboard/to-publish");
  return { ok: true };
}

// A short-lived signed download URL for a tool's private bundle (whoever builds
// the page grabs the .zip). Returns null rather than throwing if it's gone.
export async function signBundleUrl(bundlePath: string): Promise<string | null> {
  if (!bundlePath) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.storage.from(TOOL_BUNDLE_BUCKET).createSignedUrl(bundlePath, 600);
  if (error) return null;
  return data?.signedUrl ?? null;
}
