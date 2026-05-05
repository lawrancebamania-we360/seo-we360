import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyProjectAccess } from "@/lib/auth/verify-access";

// Create blog_task rows from the spokes in a topic cluster.
// POST /api/topic-cluster/[id]/create-tasks
// - Admin-only
// - Only creates tasks for spokes that are NOT already_covered_by an article AND
//   don't already have a task_id set — so re-clicking is safe (idempotent).
// - Each new task is written to `tasks` with kind='blog_task' and the spoke's
//   outline is attached as the brief.
// - Sets `task_id` on each spoke so the UI can show "linked" state.

export const runtime = "nodejs";
export const maxDuration = 30;

function wordTargetFor(kd: string | null | undefined): number {
  if (kd === "low") return 1400;
  if (kd === "medium") return 2000;
  if (kd === "high") return 2800;
  return 1500;
}
function priorityFor(kd: string | null | undefined): "critical" | "high" | "medium" | "low" {
  if (kd === "low") return "high";      // easy-to-rank spokes ship first
  if (kd === "medium") return "medium";
  return "low";
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clusterId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  const role = (profile as { role?: string } | null)?.role;
  if (role !== "super_admin" && role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: cluster } = await admin
    .from("topic_clusters")
    .select("id, project_id, seed_keyword, pillar_title")
    .eq("id", clusterId)
    .single();
  if (!cluster) return NextResponse.json({ error: "cluster not found" }, { status: 404 });

  const c = cluster as { id: string; project_id: string; seed_keyword: string; pillar_title: string };

  // Verify caller belongs to the target project's org before creating tasks
  const access = await verifyProjectAccess(admin, user.id, c.project_id, { minRole: "admin" });
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code });

  // Pull spokes that are (a) not already covered AND (b) not yet linked to a task
  const { data: itemRows } = await admin
    .from("topic_cluster_items")
    .select("id, position, title, target_keyword, intent, kd_estimate, outline, reason, already_covered_by, task_id")
    .eq("cluster_id", clusterId)
    .is("task_id", null)
    .is("already_covered_by", null)
    .order("position", { ascending: true });

  type Spoke = {
    id: string; position: number; title: string; target_keyword: string | null;
    intent: string | null; kd_estimate: string | null; outline: unknown;
    reason: string | null; already_covered_by: unknown; task_id: string | null;
  };
  const spokes = (itemRows ?? []) as Spoke[];

  if (spokes.length === 0) {
    return NextResponse.json({ ok: true, tasks_created: 0, message: "No uncovered spokes left to convert." });
  }

  // Schedule new tasks on subsequent Mondays so the writer queue isn't slammed
  const nextMondayOffset = (d: Date): Date => {
    const copy = new Date(d);
    copy.setDate(copy.getDate() + ((8 - copy.getDay()) % 7 || 7));
    return copy;
  };

  const newTasks = spokes.map((s, i) => {
    const scheduled = new Date();
    scheduled.setDate(scheduled.getDate() + i * 7);
    const monday = nextMondayOffset(scheduled);
    const brief = {
      h1: s.title,
      h2_outline: Array.isArray(s.outline) ? s.outline : [],
      cluster_context: {
        pillar_title: c.pillar_title,
        seed_keyword: c.seed_keyword,
        reason: s.reason,
      },
    };
    return {
      project_id: c.project_id,
      title: `Write article: ${s.title}`,
      kind: "blog_task" as const,
      // tasks.source constraint allows 'manual' | 'cron_audit' | 'ai_suggestion' —
      // topic-cluster spokes are AI-suggested.
      source: "ai_suggestion" as const,
      target_keyword: s.target_keyword,
      competition: s.kd_estimate === "low"
        ? "Low Competition"
        : s.kd_estimate === "medium"
        ? "Medium Competition"
        : s.kd_estimate === "high"
        ? "High Competition"
        : null,
      intent: s.intent,
      word_count_target: wordTargetFor(s.kd_estimate),
      priority: priorityFor(s.kd_estimate),
      brief,
      issue: `Part of topic cluster "${c.pillar_title}" — ${s.reason ?? "planned spoke"}.`,
      impl: "Brief pre-populated from cluster plan. Pillar article links down to this spoke; check the interlinking plan in the cluster detail.",
      scheduled_date: monday.toISOString().slice(0, 10),
    };
  });

  const { data: inserted, error: insertErr } = await admin
    .from("tasks")
    .insert(newTasks)
    .select("id");

  if (insertErr) {
    console.error("[topic-cluster/create-tasks] insert failed", { clusterId, err: insertErr.message });
    return NextResponse.json({ error: "could not create tasks" }, { status: 500 });
  }

  const insertedIds = ((inserted ?? []) as Array<{ id: string }>).map((r) => r.id);

  // Link each inserted task back to its spoke so the UI can show "linked"
  for (let i = 0; i < spokes.length && i < insertedIds.length; i++) {
    await admin
      .from("topic_cluster_items")
      .update({ task_id: insertedIds[i] })
      .eq("id", spokes[i].id);
  }

  return NextResponse.json({
    ok: true,
    tasks_created: insertedIds.length,
    task_ids: insertedIds,
  });
}
