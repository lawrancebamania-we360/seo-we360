"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { TaskStatus } from "@/lib/types/database";

const TaskSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().min(1),
  url: z.string().url().optional().nullable().or(z.literal("")),
  priority: z.enum(["critical", "high", "medium", "low"]),
  impact: z.string().optional().nullable(),
  scheduled_date: z.string().optional().nullable(),
  issue: z.string().optional().nullable(),
  impl: z.string().optional().nullable(),
  team_member_id: z.string().uuid().optional().nullable().or(z.literal("")),
  timeline: z.string().optional().nullable(),
  pillar: z.enum(["SEO", "AEO", "GEO", "SXO", "AIO"]).optional().nullable(),
});

export async function createTask(input: z.infer<typeof TaskSchema>) {
  const parsed = TaskSchema.parse(input);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const payload = {
    ...parsed,
    url: parsed.url || null,
    team_member_id: parsed.team_member_id || null,
    scheduled_date: parsed.scheduled_date || null,
    pillar: parsed.pillar || null,
    kind: "web_task" as const,
    created_by: user.id,
  };
  const { error } = await supabase.from("tasks").insert(payload);
  if (error) throw error;
  revalidatePath("/dashboard/tasks");
}

export async function toggleTaskDone(taskId: string, done: boolean) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({
      done,
      status: done ? "done" : "todo",
      completed_at: done ? new Date().toISOString() : null,
      verified_by_ai: false,
    })
    .eq("id", taskId);
  if (error) throw error;
  revalidatePath("/dashboard/tasks");
  revalidatePath("/dashboard/sprint");
  revalidatePath("/dashboard/overview");
}

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "done") {
    patch.done = true;
    patch.completed_at = new Date().toISOString();
    patch.verified_by_ai = false;
  } else {
    patch.done = false;
    patch.completed_at = null;
  }
  const { error } = await supabase.from("tasks").update(patch).eq("id", taskId);
  if (error) throw error;
  revalidatePath("/dashboard/tasks");
  revalidatePath("/dashboard/sprint");
  revalidatePath("/dashboard/overview");
}

export async function updateTask(
  taskId: string,
  patch: {
    title?: string;
    priority?: "critical" | "high" | "medium" | "low";
    status?: TaskStatus;
    issue?: string | null;
    impl?: string | null;
    data_backing?: string | null;
    task_type?:
      | "New Post" | "New Page"
      | "Update Post" | "Update Page"
      | "Delete Post" | "Delete Page"
      | "Modify Post" | "Modify Page"
      | null;
    est_volume?: number | null;
    url?: string | null;
    team_member_id?: string | null;
    pillar?: "SEO" | "AEO" | "GEO" | "SXO" | "AIO" | null;
    scheduled_date?: string | null;
    impact?: string | null;
    target_keyword?: string | null;
    word_count_target?: number | null;
    brief?: unknown;
    published_url?: string | null;
    supporting_links?: string[];
    reference_images?: string[];
  }
) {
  const supabase = await createClient();
  const updates: Record<string, unknown> = { ...patch };
  if (patch.status === "done") {
    updates.done = true;
    updates.completed_at = new Date().toISOString();
  } else if (patch.status) {
    updates.done = false;
    updates.completed_at = null;
  }
  const { error } = await supabase.from("tasks").update(updates).eq("id", taskId);
  if (error) throw error;
  revalidatePath("/dashboard/tasks");
  revalidatePath("/dashboard/sprint");
}

export async function deleteTask(taskId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) throw error;
  revalidatePath("/dashboard/tasks");
}

// ----------------------------------------------------------------- Bulk upload
//
// Admin-only bulk insert for the Blog Sprint kanban. Accepts a list of rows
// where only `title` + `target_keyword` are required; everything else falls
// back to a sensible default. Used by the "Upload tasks" dialog.
export interface BulkBlogTaskRow {
  title: string;                  // required
  target_keyword: string;         // required (= H1 keyword)
  format?: string | null;         // optional task type label (e.g. "vs-page")
  priority?: "critical" | "high" | "medium" | "low" | null;
  scheduled_date?: string | null; // ISO date YYYY-MM-DD
  assignee_email?: string | null; // resolved server-side to team_member_id
  word_count_target?: number | null;
  intent?: "informational" | "commercial" | "transactional" | "navigational" | null;
  url?: string | null;
}

export async function bulkCreateBlogTasks(projectId: string, rows: BulkBlogTaskRow[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const myRole = (me as { role?: string } | null)?.role;
  if (!myRole || (myRole !== "super_admin" && myRole !== "admin")) {
    throw new Error("Only admins can bulk-upload tasks");
  }

  if (!rows.length) return { inserted: 0 };

  // Resolve assignee emails → profile IDs in one query
  const emails = Array.from(new Set(
    rows.map((r) => r.assignee_email?.toLowerCase().trim()).filter(Boolean) as string[]
  ));
  const emailToId: Record<string, string> = {};
  if (emails.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email")
      .in("email", emails);
    for (const p of (profiles ?? []) as Array<{ id: string; email: string }>) {
      emailToId[p.email.toLowerCase()] = p.id;
    }
  }

  const insertRows = rows
    .filter((r) => r.title?.trim() && r.target_keyword?.trim())
    .map((r) => ({
      project_id: projectId,
      kind: "blog_task" as const,
      title: r.title.trim(),
      target_keyword: r.target_keyword.trim(),
      url: r.url?.trim() || null,
      priority: r.priority ?? "medium",
      status: "todo" as const,
      scheduled_date: r.scheduled_date?.trim() || null,
      word_count_target: r.word_count_target ?? 1500,
      intent: r.intent ?? "commercial",
      team_member_id: r.assignee_email
        ? emailToId[r.assignee_email.toLowerCase().trim()] ?? null
        : null,
      source: "manual" as const,
      created_by: user.id,
      brief: {
        title: r.title.trim(),
        target_keyword: r.target_keyword.trim(),
        recommended_h1: r.title.trim(),
        recommended_h2s: [],
        recommended_h3s: [],
        paa_questions: [],
        secondary_keywords: [],
        sections_breakdown: [],
        internal_links: [],
        competitor_refs: [],
        writer_notes: r.format ? [`Format: ${r.format}`] : [],
        word_count_target: r.word_count_target ?? 1500,
        intent: r.intent ?? "commercial",
        generated_by: "manual" as const,
      },
    }));

  if (!insertRows.length) {
    throw new Error("No valid rows — every row needs a title AND a target_keyword (H1).");
  }

  const { error } = await supabase.from("tasks").insert(insertRows);
  if (error) {
    // Surface the full Postgres error so the toast tells the user exactly
    // what failed (RLS / FK / check / unique). Otherwise users see "Upload
    // failed" with no context.
    console.error("[bulkCreateBlogTasks] insert failed", { error, sampleRow: insertRows[0] });
    throw new Error(`Insert failed: ${error.message}${error.code ? ` (code ${error.code})` : ""}`);
  }

  revalidatePath("/dashboard/sprint");
  revalidatePath("/dashboard/tasks");
  return { inserted: insertRows.length };
}
