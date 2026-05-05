import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySingleTask } from "@/lib/cron/phase-2-tasks";
import { verifyProjectAccess } from "@/lib/auth/verify-access";
import type { Task, Project } from "@/lib/types/database";

// User-triggered single-task verification.
// Re-fetches the task's URL, runs the audit skills, and if the issue is
// resolved marks the task done + verified_by_ai=true.

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: taskId } = await params;
  const admin = createAdminClient();
  const { data: task } = await admin.from("tasks").select("*").eq("id", taskId).maybeSingle();
  if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });

  // Verify caller is in the project's org with write-equivalent access
  const access = await verifyProjectAccess(admin, user.id, (task as Task).project_id, { minRole: "member" });
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code });

  const { data: project } = await admin.from("projects").select("*").eq("id", (task as Task).project_id).maybeSingle();
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const result = await verifySingleTask(admin, task as Task, project as Project);
  return NextResponse.json(result);
}
