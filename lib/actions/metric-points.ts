"use server";

// Executive Dashboard: add/delete hand-entered DR & Traffic points
// (seo_metric_points). Append-only - a DR reading is a new row each time, so
// the chart shows a real trajectory. Writes are admin-only (the exec view is
// leadership's); reads are open to the team via RLS. Fixing a mistake = delete
// the row, there is no edit.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserContext } from "@/lib/auth/get-user";
import { isMissingTable, isMissingColumn } from "@/lib/ai-citation/run-state";

const MIGRATION_HINT = "This needs the 20261112000002 migration applied in Supabase first.";

const AddInput = z.object({
  project_id: z.string().uuid(),
  metric: z.enum(["dr", "traffic"]),
  kind: z.enum(["actual", "target"]),
  value: z.coerce.number().finite().min(0).max(100_000_000),
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
  note: z.string().trim().max(200).optional(),
});

export async function addMetricPoint(input: z.infer<typeof AddInput>): Promise<{ ok: boolean; error?: string }> {
  const parsed = AddInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the values." };
  const { project_id, metric, kind, value, as_of, note } = parsed.data;

  // DR is a 0-100 score; guard against a fat-fingered traffic number landing in DR.
  if (metric === "dr" && value > 100) return { ok: false, error: "Domain Rating is 0-100." };

  const ctx = await getUserContext();
  if (!ctx.canManageTeam) return { ok: false, error: "Only admins can edit executive metrics." };

  const supabase = await createClient();
  const { error } = await supabase.from("seo_metric_points").insert({
    project_id, metric, kind, value, as_of, note: note || null, created_by: ctx.userId,
  });
  if (error) {
    return { ok: false, error: isMissingTable(error.message) || isMissingColumn(error.message) ? MIGRATION_HINT : error.message };
  }
  revalidatePath("/dashboard/executive");
  return { ok: true };
}

const DeleteInput = z.object({
  project_id: z.string().uuid(),
  id: z.string().uuid(),
});

export async function deleteMetricPoint(input: z.infer<typeof DeleteInput>): Promise<{ ok: boolean; error?: string }> {
  const parsed = DeleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Could not delete that point." };
  const { project_id, id } = parsed.data;

  const ctx = await getUserContext();
  if (!ctx.canManageTeam) return { ok: false, error: "Only admins can edit executive metrics." };

  const supabase = await createClient();
  const { error } = await supabase.from("seo_metric_points").delete().eq("id", id).eq("project_id", project_id);
  if (error) {
    return { ok: false, error: isMissingTable(error.message) || isMissingColumn(error.message) ? MIGRATION_HINT : error.message };
  }
  revalidatePath("/dashboard/executive");
  return { ok: true };
}
