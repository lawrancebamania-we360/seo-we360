// Show how many tasks each team member is assigned to. If Ishaan has 0,
// his Blog Sprint with the "Assigned to: Ishaan" filter naturally shows 0.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);

(async () => {
  const { data: tasks } = await admin
    .from("tasks")
    .select("id, title, kind, status, team_member_id, scheduled_date")
    .eq("kind", "blog_task")
    .order("scheduled_date", { ascending: true });

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, name, email, role");

  type T = { id: string; title: string; kind: string; status: string; team_member_id: string | null; scheduled_date: string | null };
  type P = { id: string; name: string; email: string; role: string };

  const profMap = new Map<string, P>();
  for (const p of (profiles ?? []) as P[]) profMap.set(p.id, p);

  // Count by assignee
  const byAssignee: Record<string, { name: string; total: number; todo: number; in_progress: number; review: number; done: number }> = {};
  let unassigned = 0;
  for (const t of (tasks ?? []) as T[]) {
    if (!t.team_member_id) {
      unassigned++;
      continue;
    }
    const p = profMap.get(t.team_member_id);
    const name = p?.name ?? `?(${t.team_member_id.slice(0, 8)})`;
    if (!byAssignee[t.team_member_id]) {
      byAssignee[t.team_member_id] = { name, total: 0, todo: 0, in_progress: 0, review: 0, done: 0 };
    }
    byAssignee[t.team_member_id].total++;
    const s = (t.status ?? "todo") as keyof typeof byAssignee[string];
    if (s === "todo" || s === "in_progress" || s === "review" || s === "done") byAssignee[t.team_member_id][s]++;
  }

  console.log(`\nTotal blog_tasks: ${tasks?.length}`);
  console.log(`Unassigned: ${unassigned}\n`);
  console.log("Per assignee:");
  console.table(byAssignee);

  // Specifically check Ishaan
  const ishaan = (profiles ?? []).find((p) => (p as P).email === "ishaan.mathur@we360.ai") as P | undefined;
  if (ishaan) {
    console.log(`\nIshaan's id: ${ishaan.id}`);
    const ishaanTasks = ((tasks ?? []) as T[]).filter((t) => t.team_member_id === ishaan.id);
    console.log(`Ishaan tasks: ${ishaanTasks.length}`);
  }
})().catch((e) => { console.error("Crash:", e); process.exit(1); });
