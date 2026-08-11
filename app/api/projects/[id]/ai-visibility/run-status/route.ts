import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLatestRunBatch, reapStaleBatches } from "@/lib/ai-citation/run-state";

// AI-visibility run-status poll. The AI-visibility client polls this while a run
// is in flight so the UI shows the DURABLE run state (real "x of y" progress + a
// truthful succeeded/failed/timed_out terminal state) rather than a client-side
// spinner that dies with the request. State lives in ai_citation_run_batches
// (written by runProjectCitations + the reaper), so the UI converges to the honest
// outcome even if the trigger's own HTTP response was lost.
//
// It is also the driver of the browser-based continuation: when this returns a
// PARKED batch (status 'queued' with work left), the client calls
// resumeAiVisibilityRun to run the next slice — the We360 replacement for Klimb's
// drain cron (see the AI Visibility manual-only design).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ batch: null }, { status: 401 });

  // Reap-on-read (admin write): a stale 'running' row flips to 'timed_out' now so
  // the poller sees the truthful terminal state without waiting for the next run.
  await reapStaleBatches(createAdminClient(), projectId);

  // RLS-scoped read: a caller without access to this project id gets null (no
  // IDOR — the session client only sees the caller's own projects).
  const batch = await getLatestRunBatch(supabase, projectId);
  if (!batch) return NextResponse.json({ batch: null });

  const active = batch.status === "queued" || batch.status === "running";
  return NextResponse.json({ batch: { ...batch, active } });
}
