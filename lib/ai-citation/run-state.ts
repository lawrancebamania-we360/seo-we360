// AI-citation run lifecycle helpers (P0-5 + run continuation).
//
// Every AI-citation run - on-demand, weekly cron, or ops script - opens a row in
// ai_citation_run_batches (queued->running->succeeded|failed|timed_out), bumps a
// progress heartbeat as adapter calls settle, and closes it with a terminal
// status. This is the durable, truthful state the UI polls, replacing the
// client-side spinner that died with the request and left "running forever".
//
// CONTINUATION (the P0-5 follow-up): a run cut short by the wall-clock budget no
// longer stays truncated. The batch row carries a run_spec (its full task recipe,
// written when the batch OPENS, migration 20260704000001) and 'queued' doubles as
// the PARKED state: a slice that runs out of budget parks the batch back to
// 'queued'; the drain cron (app/api/cron/process-pending-citation-runs) claims it
// and runs the next slice until every task has a persisted ai_citation_runs row.
// Remaining work is never stored - it is recomputed as spec-tasks minus existing
// rows (prompt_id x engine x run_index), which makes resume idempotent: a
// persisted task can never run or bill twice. Same architecture the kickoff
// pipeline proved out (projects.pending_kickoff_phases + process-pending-kickoffs);
// deliberately NOT after()/self-fetch chains (fragile on Vercel Hobby) and NOT an
// external queue vendor.
//
// GRACEFUL DEGRADATION: the batches table AND the continuation columns are
// applied MANUALLY in Supabase (Vercel does not run migrations). Until the table
// exists, every write here swallows the "relation ... does not exist" error and
// returns without throwing, so runProjectCitations keeps working exactly as
// before (it simply has no lifecycle row). Until the continuation columns exist,
// startRunBatch retries its insert without run_spec so the P0-5 lifecycle row
// still opens, and the park/claim/requeue helpers no-op on the missing-column
// error - runs fall back to P0-5's truncate-and-finish. Mirrors how
// ai_citation_competitor_hits was rolled out (run.ts logs + continues when that
// table is missing).
//
// All writes use the caller's admin (service-role) client, so they bypass RLS -
// a member can never mutate a run row; reads are RLS-scoped via has_project_access.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiEngine } from "./types";

export type RunBatchStatus = "queued" | "running" | "succeeded" | "failed" | "timed_out";
export type RunTrigger = "on_demand" | "cron" | "script";

// Per-engine progress for the live banner: engine key -> {done, total}. Written to
// the ai_citation_run_batches.progress jsonb (migration 20260703000001) on each
// heartbeat; the banner degrades to total-only when it's absent (pre-migration or
// an older run).
export type EngineProgress = Record<string, { done: number; total: number }>;

// How long a 'running' row may go without a heartbeat before the reaper treats
// it as dead and flips it to 'timed_out'. The run wall-clock budget is ~38s and
// the whole invocation is capped under the 60s Vercel ceiling, so a 'running'
// row untouched for 3min could only exist because the function was SIGKILLed
// (OOM / 60s hard-timeout / deploy mid-flight / a 503 that dropped the request)
// before it wrote its terminal status. Matches the 5-min orphan window the
// intelligence_runs + process-pending-kickoffs reapers use, trimmed to 3min
// because an AI-citation run is much shorter than an intelligence phase.
export const STALE_HEARTBEAT_MS = 3 * 60 * 1000;

// Continuation bounds. A batch may be CLAIMED for at most MAX_RESUME_PASSES
// continuation slices - a batch that still is not done after that (a
// deterministically-crashing task, an engine that never answers) closes out with
// whatever it has instead of burning budget forever. RESUME_MAX_AGE_MS bounds how
// long after creation a dead run is still worth resuming (reap-to-queued) and how
// long a parked 'queued' row may wait for the drain before it terminal-expires -
// the drain cadence is external (cron-job.org, like process-pending-kickoffs), so
// without this cap a never-drained batch would show an active banner forever.
export const MAX_RESUME_PASSES = 4;
export const RESUME_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h

// The batch's full task recipe, written when the batch opens so a run is
// resumable even after a SIGKILL that parked nothing. nByEngine holds the
// RESOLVED per-engine sample counts (post-clamp) so a continuation slice builds
// the exact same task list the first slice did.
export interface RunBatchSpec {
  promptIds: string[];
  engines: AiEngine[];
  nByEngine: Partial<Record<AiEngine, number>>;
  aioPromptCap?: number | null;
  skipGate?: boolean; // ops scripts meter elsewhere; a continued slice must match
}

// A missing-table Postgres error (42P01) must not break the run. Detect it so we
// can no-op silently pre-migration while still surfacing real write failures.
function isMissingTable(message: string | undefined): boolean {
  return !!message && (/relation .* does not exist/i.test(message) || /schema cache/i.test(message) || /could not find the table/i.test(message));
}

// A missing-COLUMN error (42703 via PostgREST, or the schema-cache variant
// "Could not find the 'run_spec' column ..."). The continuation columns land in
// migration 20260704000001, applied manually - until then every helper that
// touches them must degrade, not break the run. Checked BEFORE isMissingTable
// where both could match (the schema-cache phrasing contains "schema cache").
function isMissingColumn(message: string | undefined): boolean {
  return !!message && (/column .* does not exist/i.test(message) || /could not find the '.+' column/i.test(message));
}

export interface StartBatchInput {
  projectId: string;
  batchId: string;          // == the run_batch_id stamped on ai_citation_runs
  totalTasks: number;       // prompts x engines x samples (known up-front)
  engines: AiEngine[];
  trigger: RunTrigger;
  userId?: string | null;
  /** Task recipe for continuation. Optional so callers degrade gracefully. */
  spec?: RunBatchSpec;
}

/**
 * Open the lifecycle row as 'running'. Best-effort: no-ops if the table is
 * absent. Returns specPersisted so the caller knows whether the batch is
 * RESUMABLE: only a batch whose run_spec landed may be parked for the drain -
 * without it, truncation falls back to P0-5's truncate-and-finish. When the
 * run_spec column is missing (continuation migration not applied yet) the insert
 * is retried WITHOUT it so the P0-5 lifecycle row still opens.
 */
export async function startRunBatch(admin: SupabaseClient, input: StartBatchInput): Promise<{ specPersisted: boolean }> {
  const now = new Date().toISOString();
  const base: Record<string, unknown> = {
    id: input.batchId,
    project_id: input.projectId,
    status: "running",
    total_tasks: input.totalTasks,
    completed_tasks: 0,
    engines: input.engines,
    trigger: input.trigger,
    user_id: input.userId ?? null,
    heartbeat_at: now,
    started_at: now,
  };
  const withSpec = input.spec ? { ...base, run_spec: input.spec } : base;
  let { error } = await admin.from("ai_citation_run_batches").insert(withSpec);
  let specPersisted = !error && !!input.spec;
  if (error && input.spec && isMissingColumn(error.message)) {
    // Continuation column not applied yet: keep the P0-5 behavior intact.
    ({ error } = await admin.from("ai_citation_run_batches").insert(base));
    specPersisted = false;
  }
  if (error && !isMissingTable(error.message)) {
    // Non-fatal: a lifecycle-write failure must never abort the actual run.
    console.error("[ai-citation] startRunBatch:", error.message);
  }
  return { specPersisted: specPersisted && !error };
}

/**
 * Heartbeat progress. Called periodically from the run loop (NOT once per task -
 * that would be a DB write per adapter call). Bumps completed_tasks + heartbeat_at
 * so the poller sees "x of y" advancing and the reaper sees the run is alive.
 * Best-effort + throttled by the caller.
 */
export async function heartbeatRunBatch(
  admin: SupabaseClient,
  batchId: string,
  completedTasks: number,
  progress?: EngineProgress,
): Promise<void> {
  const patch: Record<string, unknown> = { completed_tasks: completedTasks, heartbeat_at: new Date().toISOString() };
  if (progress) patch.progress = progress; // per-engine x/y for the live banner
  const { error } = await admin.from("ai_citation_run_batches")
    .update(patch)
    .eq("id", batchId)
    .eq("status", "running"); // never resurrect a row the reaper already closed
  if (error && !isMissingTable(error.message)) {
    console.error("[ai-citation] heartbeatRunBatch:", error.message);
  }
}

export interface FinishBatchInput {
  status: Exclude<RunBatchStatus, "queued" | "running">;
  completedTasks?: number;
  cited?: number;
  mentioned?: number;
  totalRuns?: number;
  costCents?: number;
  truncated?: boolean;
  errorMessage?: string | null;
}

/**
 * Close the lifecycle row with a terminal status + outcome counters.
 * Guarded on status='running' so it can't overwrite a row the reaper already
 * flipped to 'timed_out' (avoids a late-returning zombie request clobbering the
 * honest timed-out state). Best-effort: no-ops if the table is absent.
 */
export async function finishRunBatch(
  admin: SupabaseClient,
  batchId: string,
  input: FinishBatchInput,
): Promise<void> {
  const patch: Record<string, unknown> = {
    status: input.status,
    completed_at: new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
  };
  if (input.completedTasks != null) patch.completed_tasks = input.completedTasks;
  if (input.cited != null) patch.cited = input.cited;
  if (input.mentioned != null) patch.mentioned = input.mentioned;
  if (input.totalRuns != null) patch.total_runs = input.totalRuns;
  if (input.costCents != null) patch.cost_cents = input.costCents;
  if (input.truncated != null) patch.truncated = input.truncated;
  if (input.errorMessage !== undefined) patch.error_message = input.errorMessage;

  const { error } = await admin.from("ai_citation_run_batches")
    .update(patch)
    .eq("id", batchId)
    .eq("status", "running");
  if (error && !isMissingTable(error.message)) {
    console.error("[ai-citation] finishRunBatch:", error.message);
  }
}

/**
 * Park a batch that ran out of wall-clock budget with work remaining: back to
 * 'queued' for the drain cron to claim. Guarded on status='running' (same guard
 * as finishRunBatch) so a late zombie slice can't resurrect a row the reaper
 * already closed. The remaining work is NOT stored - it is recomputed on resume
 * from run_spec minus the ai_citation_runs rows this slice just inserted.
 */
export async function parkRunBatchForResume(
  admin: SupabaseClient,
  batchId: string,
  input: { completedTasks: number; progress?: EngineProgress },
): Promise<void> {
  const patch: Record<string, unknown> = {
    status: "queued",
    completed_tasks: input.completedTasks,
    truncated: true, // cut short at least once; the drain finishes it
    heartbeat_at: new Date().toISOString(),
  };
  if (input.progress) patch.progress = input.progress;
  const { error } = await admin.from("ai_citation_run_batches")
    .update(patch)
    .eq("id", batchId)
    .eq("status", "running");
  if (error && !isMissingTable(error.message)) {
    console.error("[ai-citation] parkRunBatchForResume:", error.message);
  }
}

/**
 * Atomically claim a parked batch for the next continuation slice:
 * queued -> running with resume_count bumped. The expectedResumeCount guard is
 * optimistic concurrency - two drains (or a drain racing anything else) can
 * never both claim the same pass, on top of the drain's own cron lock. Returns
 * false when the claim raced, the row moved on, or the columns are missing.
 */
export async function claimBatchForResume(
  admin: SupabaseClient,
  batchId: string,
  expectedResumeCount: number,
): Promise<boolean> {
  const { data, error } = await admin.from("ai_citation_run_batches")
    .update({
      status: "running",
      resume_count: expectedResumeCount + 1,
      heartbeat_at: new Date().toISOString(),
    })
    .eq("id", batchId)
    .eq("status", "queued")
    .eq("resume_count", expectedResumeCount)
    .select("id");
  if (error) {
    if (!isMissingColumn(error.message) && !isMissingTable(error.message)) {
      console.error("[ai-citation] claimBatchForResume:", error.message);
    }
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Requeue (instead of killing) resumable dead runs: a stale 'running' row that
 * HAS a run_spec, attempts left, and is young enough was SIGKILLed mid-slice -
 * park it back to 'queued' so the drain RESUMES it. This is the reaper-interplay
 * rule: pending work + stale heartbeat = resume, not timed_out. Rows this skips
 * (no spec pre-migration, resume budget spent, too old) still time out via
 * reapStaleBatches' final step. Optionally scoped to one project (the reap-on-read
 * path); the drain calls it unscoped.
 */
export async function requeueStaleResumableBatches(admin: SupabaseClient, projectId?: string): Promise<void> {
  const staleCutoff = new Date(Date.now() - STALE_HEARTBEAT_MS).toISOString();
  const youngestAllowed = new Date(Date.now() - RESUME_MAX_AGE_MS).toISOString();
  let q = admin.from("ai_citation_run_batches")
    .update({ status: "queued", heartbeat_at: new Date().toISOString() })
    .eq("status", "running")
    .lt("heartbeat_at", staleCutoff)
    .not("run_spec", "is", null)
    .lt("resume_count", MAX_RESUME_PASSES)
    .gte("created_at", youngestAllowed);
  if (projectId) q = q.eq("project_id", projectId);
  const { error } = await q;
  if (error && !isMissingColumn(error.message) && !isMissingTable(error.message)) {
    console.error("[ai-citation] requeueStaleResumableBatches:", error.message);
  }
}

/**
 * Terminal-expire parked batches the drain never picked up within the resume
 * window, so the UI can't sit on an active "finishing in the background" banner
 * forever when the external drain trigger is down. Partial results landed ->
 * succeeded (truncated, honest partial); nothing landed -> timed_out with Retry.
 */
async function expireOverdueQueuedBatches(admin: SupabaseClient, projectId: string): Promise<void> {
  const cutoff = new Date(Date.now() - RESUME_MAX_AGE_MS).toISOString();
  const completedAt = new Date().toISOString();
  const { error: e1 } = await admin.from("ai_citation_run_batches")
    .update({
      status: "succeeded",
      truncated: true,
      completed_at: completedAt,
      error_message: "The background continuation never ran; keeping the partial results.",
    })
    .eq("project_id", projectId)
    .eq("status", "queued")
    .lt("heartbeat_at", cutoff)
    .gt("completed_tasks", 0);
  const { error: e2 } = await admin.from("ai_citation_run_batches")
    .update({
      status: "timed_out",
      completed_at: completedAt,
      error_message: "The run was queued to continue in the background but the continuation never ran. Retry to run it again.",
    })
    .eq("project_id", projectId)
    .eq("status", "queued")
    .lt("heartbeat_at", cutoff)
    .eq("completed_tasks", 0);
  for (const error of [e1, e2]) {
    if (error && !isMissingTable(error.message)) {
      console.error("[ai-citation] expireOverdueQueuedBatches:", error.message);
    }
  }
}

/** A parked batch the drain can pick up. */
export interface ResumableBatch {
  id: string;
  projectId: string;
  resumeCount: number;
  spec: RunBatchSpec;
}

/**
 * Parked batches for the drain cron, oldest heartbeat first (fair rotation:
 * park/requeue bump heartbeat_at, so a just-sliced batch falls behind others).
 * Returns [] pre-migration or when nothing is parked.
 */
export async function listResumableBatches(admin: SupabaseClient, limit: number): Promise<ResumableBatch[]> {
  const { data, error } = await admin.from("ai_citation_run_batches")
    .select("id, project_id, resume_count, run_spec")
    .eq("status", "queued")
    .not("run_spec", "is", null)
    .order("heartbeat_at", { ascending: true })
    .limit(limit);
  if (error || !data) {
    if (error && !isMissingColumn(error.message) && !isMissingTable(error.message)) {
      console.error("[ai-citation] listResumableBatches:", error.message);
    }
    return [];
  }
  return (data as Array<{ id: string; project_id: string; resume_count: number | null; run_spec: RunBatchSpec | null }>)
    .filter((r) => !!r.run_spec?.promptIds?.length && !!r.run_spec?.engines?.length)
    .map((r) => ({ id: r.id, projectId: r.project_id, resumeCount: r.resume_count ?? 0, spec: r.run_spec as RunBatchSpec }));
}

/**
 * Reap orphaned runs. Called at the START of every new run (and by the status
 * endpoint) so a dead run for a project can never keep the UI stuck on
 * "running". Order matters:
 *   1. Resumable stale runs (spec + attempts left + young) go back to 'queued'
 *      for the drain to RESUME - their completed work is kept and the rest still
 *      runs (the continuation promise).
 *   2. Parked runs the drain never drained within the resume window
 *      terminal-expire (partial -> succeeded+truncated, empty -> timed_out).
 *   3. Whatever is STILL stale-running is flipped to 'timed_out' with a Retry -
 *      unchanged P0-5 behavior for non-resumable rows.
 * Scoped to one project. Best-effort: no-ops if the table is absent.
 */
export async function reapStaleBatches(admin: SupabaseClient, projectId: string): Promise<void> {
  await requeueStaleResumableBatches(admin, projectId);
  await expireOverdueQueuedBatches(admin, projectId);
  const cutoff = new Date(Date.now() - STALE_HEARTBEAT_MS).toISOString();
  const { error } = await admin.from("ai_citation_run_batches")
    .update({
      status: "timed_out",
      completed_at: new Date().toISOString(),
      error_message: "The run stopped responding and was marked timed out. This usually means it exceeded the platform time limit or a provider (e.g. Google AI Overviews) failed. Retry to run it again.",
    })
    .eq("project_id", projectId)
    .eq("status", "running")
    .lt("heartbeat_at", cutoff);
  if (error && !isMissingTable(error.message)) {
    console.error("[ai-citation] reapStaleBatches:", error.message);
  }
}

export interface LatestRunBatch {
  id: string;
  status: RunBatchStatus;
  totalTasks: number;
  completedTasks: number;
  engines: string[];
  progress: EngineProgress;
  cited: number;
  mentioned: number;
  totalRuns: number;
  truncated: boolean;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

/**
 * The most recent run for a project (for the status poller). Returns null when
 * the table is absent (pre-migration) or the project has never run - the UI
 * falls back to its data-derived state in both cases.
 *
 * Takes an RLS-scoped client so a caller can only read runs for a project their
 * org owns (the status route passes the user-scoped client).
 */
export async function getLatestRunBatch(
  supabase: SupabaseClient,
  projectId: string,
): Promise<LatestRunBatch | null> {
  const { data, error } = await supabase.from("ai_citation_run_batches")
    .select("id, status, total_tasks, completed_tasks, engines, progress, cited, mentioned, total_runs, truncated, error_message, started_at, completed_at, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null; // missing table / no row / RLS miss -> null
  const r = data as Record<string, unknown>;
  return {
    id: r.id as string,
    status: r.status as RunBatchStatus,
    totalTasks: (r.total_tasks as number) ?? 0,
    completedTasks: (r.completed_tasks as number) ?? 0,
    engines: (r.engines as string[]) ?? [],
    progress: (r.progress as EngineProgress) ?? {},
    cited: (r.cited as number) ?? 0,
    mentioned: (r.mentioned as number) ?? 0,
    totalRuns: (r.total_runs as number) ?? 0,
    truncated: (r.truncated as boolean) ?? false,
    errorMessage: (r.error_message as string | null) ?? null,
    startedAt: (r.started_at as string | null) ?? null,
    completedAt: (r.completed_at as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}
