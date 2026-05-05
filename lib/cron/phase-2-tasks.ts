import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project, Task } from "@/lib/types/database";
import { fetchPage } from "@/lib/seo-skills/fetch";
import { technicalSkill } from "@/lib/seo-skills/technical";
import { schemaSkill } from "@/lib/seo-skills/schema";
import { imagesSkill } from "@/lib/seo-skills/images";
import { contentSkill } from "@/lib/seo-skills/content";

// Verify one task — fetches its URL, re-runs the most relevant skills, and if
// the specific issue text no longer appears in any finding, marks the task
// done + verified_by_ai=true. Returns a structured result.
export async function verifySingleTask(
  supabase: SupabaseClient,
  task: Task,
  project: Project
): Promise<{ verified: boolean; reason: string }> {
  if (!task.url) return { verified: false, reason: "Task has no URL to verify against" };
  if (!task.issue) return { verified: false, reason: "Task has no issue text to match against" };

  try {
    const page = await fetchPage(task.url);
    const ctx = {
      url: task.url,
      html: page.html,
      $: page.$,
      responseHeaders: page.headers,
      statusCode: page.statusCode,
      fetchMs: page.fetchMs,
      contentBytes: page.contentBytes,
      project: {
        id: project.id,
        name: project.name,
        domain: project.domain,
        industry: project.industry,
      },
    };
    const findings = [
      ...technicalSkill.run(ctx),
      ...schemaSkill.run(ctx),
      ...imagesSkill.run(ctx),
      ...contentSkill.run(ctx),
    ];

    const stillBroken = findings.some(
      (f) => f.message === task.issue && (f.status === "fail" || f.status === "missing")
    );

    if (!stillBroken) {
      await supabase
        .from("tasks")
        .update({
          done: true,
          status: "done",
          completed_at: new Date().toISOString(),
          verified_by_ai: true,
        })
        .eq("id", task.id);

      await supabase.from("wins").insert({
        project_id: project.id,
        emoji: "✅",
        title: `Auto-verified: ${task.title}`,
        description: `Re-checked ${task.url} — the issue is resolved.`,
        category: "task",
        related_task_id: task.id,
      });

      return { verified: true, reason: "Issue no longer detected on the live page" };
    }
    return { verified: false, reason: `Still present: ${task.issue}` };
  } catch (e) {
    return {
      verified: false,
      reason: `Could not fetch ${task.url}: ${e instanceof Error ? e.message : "unknown error"}`,
    };
  }
}

// Phase 2 (daily cron) — verify ALL open tasks with a URL by delegating to
// verifySingleTask for each.
export async function verifyCompletedTasks(
  supabase: SupabaseClient,
  project: Project
): Promise<{ verified: number; closed: number }> {
  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .eq("project_id", project.id)
    .eq("done", false)
    .not("url", "is", null);

  let closed = 0;
  for (const task of (tasks ?? []) as Task[]) {
    const res = await verifySingleTask(supabase, task, project);
    if (res.verified) closed++;
  }

  return { verified: (tasks ?? []).length, closed };
}
