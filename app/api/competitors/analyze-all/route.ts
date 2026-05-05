import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Admin-only fan-out: fires /api/competitors/[id]/analyze for every competitor
// in the we360.ai project in parallel (capped at 5 concurrent so we don't
// saturate the Apify quota). Each sub-call re-uses its own auth via the
// Authorization header passed from the browser request.

export const runtime = "nodejs";
export const maxDuration = 60;

const CONCURRENCY = 5;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (me as { role?: string } | null)?.role;
  if (role !== "super_admin" && role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const projectId = url.searchParams.get("project_id") ?? "11111111-1111-4111-8111-000000000001";

  const admin = createAdminClient();
  const { data: competitors } = await admin
    .from("competitors")
    .select("id, name, url, analysis_status")
    .eq("project_id", projectId);
  const rows = (competitors ?? []) as Array<{ id: string; name: string; url: string; analysis_status: string }>;
  if (rows.length === 0) return NextResponse.json({ ok: true, analyzed: 0 });

  // Forward the caller's session cookie so the per-competitor analyzer keeps
  // them authenticated. A service-to-service token would also work but since
  // we're entirely local-first here, the session cookie is simplest.
  const cookie = request.headers.get("cookie") ?? "";
  const base = url.origin;

  const queue = [...rows];
  const results: Array<{ id: string; name: string; status: "ok" | "error"; detail: unknown }> = [];

  async function worker() {
    while (queue.length > 0) {
      const c = queue.shift();
      if (!c) return;
      try {
        const r = await fetch(`${base}/api/competitors/${c.id}/analyze`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
        });
        const body = await r.json().catch(() => ({}));
        results.push({ id: c.id, name: c.name, status: r.ok ? "ok" : "error", detail: body });
      } catch (e) {
        results.push({ id: c.id, name: c.name, status: "error", detail: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, () => worker()));

  return NextResponse.json({
    ok: true,
    analyzed: results.length,
    succeeded: results.filter((r) => r.status === "ok").length,
    failed: results.filter((r) => r.status === "error").length,
    results,
  });
}
