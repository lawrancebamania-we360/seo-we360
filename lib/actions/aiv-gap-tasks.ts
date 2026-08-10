"use server";

// Server actions backing the AI-Visibility GapActionModal: detect whether a gap
// is already tracked as a task (so the modal can deep-link to it) and, if not,
// create it on the right board. Creation reuses the existing task actions
// (createTask / bulkCreateBlogTasks) so all the notification / brief / revalidate
// behaviour stays in one place; this module only adds the gap→task shaping and
// the "already tracked?" lookup.

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createTask } from "@/lib/actions/tasks";
import {
  gapTaskMarker, gapTaskTitle, gapTaskDescription, gapTaskKind, type GapRoute,
} from "@/lib/ai-citation/gap-tasks";

export interface GapTaskRef {
  id: string;
  kind: "web_task" | "blog_task";
  title: string;
  status: string | null;
}

const FindInput = z.object({
  project_id: z.string().uuid(),
  marker: z.string().min(3).max(120),
  kind: z.enum(["web_task", "blog_task"]),
});

/**
 * Find the task (if any) that tracks a gap, matched by the stable marker embedded
 * in its description. Uses the RLS-scoped client so it only ever sees tasks in the
 * caller's org — a guessed project id can't leak another tenant's board.
 *   • web_task  → marker lives in `issue`
 *   • blog_task → marker lives in `data_backing`
 */
export async function findGapTask(input: z.infer<typeof FindInput>): Promise<GapTaskRef | null> {
  const { project_id, marker, kind } = FindInput.parse(input);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const column = kind === "web_task" ? "issue" : "data_backing";
  const { data } = await supabase
    .from("tasks")
    .select("id, kind, title, status")
    .eq("project_id", project_id)
    .eq("kind", kind)
    .ilike(column, `%${marker}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const row = data as { id: string; kind: "web_task" | "blog_task"; title: string; status: string | null };
  return { id: row.id, kind: row.kind, title: row.title, status: row.status };
}

const CreateInput = z.object({
  project_id: z.string().uuid(),
  key: z.string().min(1).max(60),
  label: z.string().min(1).max(200),
  fix: z.string().max(2000).default(""),
  route: z.enum(["web", "blog"]),
  real: z.boolean(),
  why: z.string().max(2000).default(""),
  competitor: z.string().max(200).nullish(),
  example_url: z.string().url().max(2048).nullish(),
});

export interface CreateGapTaskResult {
  ok: boolean;
  error?: string;
  taskId?: string;
  kind?: "web_task" | "blog_task";
}

/**
 * Create the gap as a task on its board (Web Tasks or Blog Sprint), baking the
 * gap context + tracking marker into title/description, then re-query for the new
 * row so the modal can immediately offer "Open in board". Auth is enforced by the
 * underlying createTask / bulkCreateBlogTasks (both require an authenticated user
 * with access to the project; RLS gates the insert).
 */
export async function createGapTask(input: z.infer<typeof CreateInput>): Promise<CreateGapTaskResult> {
  const p = CreateInput.parse(input);
  const route = p.route as GapRoute;
  const marker = gapTaskMarker(p.key, p.competitor);
  const kind = gapTaskKind(route);
  const title = gapTaskTitle({ label: p.label, competitor: p.competitor, route });
  const description = gapTaskDescription({
    key: p.key, fix: p.fix, real: p.real, why: p.why,
    competitor: p.competitor, exampleUrl: p.example_url,
  });

  try {
    if (route === "web") {
      // url stays null on purpose — example_url is the COMPETITOR's page (lives in
      // the description), not our page-to-fix. Leaving url empty avoids a misleading
      // "target page" on the card.
      await createTask({
        project_id: p.project_id,
        title,
        priority: "medium",
        issue: description,
      });
    } else {
      // We360's bulkCreateBlogTasks needs (projectId, rows[]) with a required
      // target_keyword and no data_backing column; a citation gap has neither, so
      // route blog-kind gaps through createTask too (same board write; the gap
      // context rides in `issue`).
      await createTask({
        project_id: p.project_id,
        title,
        priority: "medium",
        issue: description,
      });
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create this task." };
  }

  // Re-query so the modal gets the id (neither action returns it).
  const found = await findGapTask({ project_id: p.project_id, marker, kind });
  return { ok: true, taskId: found?.id, kind };
}
