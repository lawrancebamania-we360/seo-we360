-- AI-citation run continuation (the P0-5 follow-up: truncated runs RESUME
-- instead of staying truncated).
--
-- P0-5 (migration 20260702000001) made runs honest: a durable
-- ai_citation_run_batches row with heartbeat + reaper + Retry. But a run cut
-- short by Vercel's 60s function ceiling stayed cut short - status
-- 'succeeded' + truncated=true, with the un-run prompt x engine tasks simply
-- dropped until the weekly cron happened to re-run everything.
--
-- This migration adds the two columns that make a batch RESUMABLE, copying the
-- pattern the kickoff pipeline already proved out (projects.pending_kickoff_phases
-- + the process-pending-kickoffs drain cron - NOT after()/self-fetch chains,
-- which were fragile on Vercel Hobby):
--
--   run_spec (jsonb): the batch's full task recipe, written when the batch
--     OPENS - { promptIds, engines, nByEngine, aioPromptCap, skipGate }. The
--     remaining work is never stored explicitly; it is recomputed as
--       (tasks derivable from run_spec) MINUS (ai_citation_runs rows already
--        stamped with this run_batch_id, keyed on prompt_id x engine x run_index)
--     which makes resume idempotent by construction: a task with a persisted
--     row can never run - or be billed - twice, and a batch whose function was
--     SIGKILLed mid-slice (nothing parked) is STILL resumable because the spec
--     was written up-front.
--
--   resume_count (int): how many continuation slices have claimed this batch.
--     Bounds the drain (MAX_RESUME_PASSES in lib/ai-citation/run-state.ts) so a
--     deterministically-crashing batch closes out with what it has instead of
--     burning budget forever.
--
-- Lifecycle with continuation (lib/ai-citation/run.ts + run-state.ts):
--   running --(wall-clock budget hit, work remains)--> queued   [parked]
--   queued  --(drain cron claims, resume_count++)-----> running [next slice]
--   running --(all tasks have rows)-------------------> succeeded
-- The stale-heartbeat reaper now REQUEUES a resumable dead run (spec present,
-- attempts left, young enough) instead of flipping it straight to timed_out;
-- non-resumable rows keep the P0-5 timed_out behavior. Queued rows the drain
-- never picked up expire terminal after the resume window so the UI can never
-- sit on an active banner forever.
--
-- The drain cron is app/api/cron/process-pending-citation-runs (registered in
-- vercel.json; cadence driven externally like process-pending-kickoffs).
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Degrades
-- gracefully before it is applied: startRunBatch retries its insert without
-- run_spec when the column is missing (so the P0-5 lifecycle row still opens),
-- truncated runs fall back to today's truncate-and-finish, and the drain
-- helpers no-op on the missing-column error. Idempotent.

alter table public.ai_citation_run_batches
  add column if not exists run_spec jsonb;
alter table public.ai_citation_run_batches
  add column if not exists resume_count integer not null default 0;

-- The drain's scan: parked batches, oldest heartbeat first (fair rotation -
-- park/requeue bump heartbeat_at, so a just-sliced batch falls to the back).
create index if not exists idx_ai_cit_batches_queued
  on public.ai_citation_run_batches(status, heartbeat_at)
  where status = 'queued';

comment on column public.ai_citation_run_batches.run_spec is
  'Task recipe for continuation: {promptIds, engines, nByEngine, aioPromptCap, skipGate}. Remaining work = spec tasks minus existing ai_citation_runs rows for this batch (prompt_id x engine x run_index). See lib/ai-citation/run.ts.';
comment on column public.ai_citation_run_batches.resume_count is
  'Continuation slices that have claimed this batch. Bounded by MAX_RESUME_PASSES (run-state.ts); over the cap the batch closes with what it has.';
