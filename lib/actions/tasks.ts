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
