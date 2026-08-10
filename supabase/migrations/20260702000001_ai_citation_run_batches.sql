-- AI-citation run lifecycle (P0-5: "first run runs forever with no progress/failure").
--
-- Before this, an AI-visibility run had NO durable lifecycle record. The only
-- trace of a run was the per-answer `ai_citation_runs` rows, written in ONE bulk
-- insert at the very END of runProjectCitations. While the pipeline was in flight
-- (or if it 503'd / was SIGKILLed at the Vercel function ceiling) there was
-- nothing to read: the UI could only show a client-side spinner that died with
-- the request, so a dead run looked identical to a running one - "running
-- forever" with pillars stuck at 0/100. Failures (e.g. the Apify FREE-tier
-- exhaustion that makes google_aio return `status: FAILED`) were invisible.
--
-- This table gives every run a durable row that moves
--   queued -> running (progress: completed_tasks/total_tasks, heartbeat_at) ->
--     succeeded | failed | timed_out
-- with started_at/completed_at + an error reason on failure. It mirrors the
-- existing intelligence_runs / project_kickoff_jobs lifecycle tables exactly
-- (same status-machine + has_project_access RLS), so the AI-citation surface
-- gains the same observability the site-audit surface already has.
--
-- A run that dies mid-way is detected by the stale-heartbeat reaper in
-- lib/ai-citation/run-state.ts (reapStaleBatches), which flips a 'running' row
-- with a heartbeat older than the stale window to 'timed_out' - the same
-- orphan-reaping the intelligence_runs and process-pending-kickoffs reapers do
-- for their own tables. So the UI can always render a truthful terminal state
-- with a Retry action instead of an eternal spinner.
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Reads + writes
-- degrade gracefully before this is applied: run-state.ts swallows the
-- "relation does not exist" error so runProjectCitations still works (it just
-- has no lifecycle row), and the status endpoint returns a null batch (the UI
-- falls back to its data-derived state) - matching how ai_citation_competitor_hits
-- was rolled out (migration 20260629000001).

create table if not exists public.ai_citation_run_batches (
  -- id == the run_batch_id stamped onto ai_citation_runs.run_batch_id, so the
  -- report + the lifecycle row join without an extra column.
  id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  status text not null
    check (status in ('queued', 'running', 'succeeded', 'failed', 'timed_out'))
    default 'queued',
  -- Progress: phase x of y. total_tasks is known up-front (prompts x engines x
  -- samples); completed_tasks is heartbeated as adapter calls settle.
  total_tasks integer not null default 0,
  completed_tasks integer not null default 0,
  engines text[] not null default '{}',
  -- Outcome counters (mirror RunSummary), filled as the run completes.
  cited integer not null default 0,
  mentioned integer not null default 0,
  total_runs integer not null default 0,
  cost_cents integer not null default 0,
  -- true when the wall-clock budget cut the run short (partial success: some
  -- tasks ran, the weekly cron finishes the rest). Distinct from 'timed_out',
  -- which means the whole invocation died before it could record a result.
  truncated boolean not null default false,
  -- What kicked it off: 'on_demand' (user button), 'cron' (weekly refresh),
  -- 'script' (ops). Lets the UI show only user-initiated runs if it wants.
  trigger text not null default 'on_demand',
  user_id uuid,
  error_message text,
  -- Liveness: bumped as tasks settle. A 'running' row whose heartbeat is older
  -- than the stale window is treated as dead by the reaper.
  heartbeat_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- "latest run for this project" (status endpoint) + the reaper's
-- (status, heartbeat_at) scan. created_at desc covers the former.
create index if not exists idx_ai_cit_batches_project
  on public.ai_citation_run_batches(project_id, created_at desc);
create index if not exists idx_ai_cit_batches_stale
  on public.ai_citation_run_batches(status, heartbeat_at)
  where status = 'running';

-- RLS: same multi-tenant gate as every other ai_citation_* table. Reads are
-- has_project_access-scoped; all writes go through the service-role client in
-- run-state.ts (which bypasses RLS), so a member can never mutate a run row.
alter table public.ai_citation_run_batches enable row level security;
do $$
begin
  execute 'drop policy if exists ai_citation_run_batches_access on public.ai_citation_run_batches';
  execute 'create policy ai_citation_run_batches_access on public.ai_citation_run_batches for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id))';
end $$;

comment on table public.ai_citation_run_batches is
  'Durable lifecycle for an AI-citation run (queued->running->succeeded|failed|timed_out). id == ai_citation_runs.run_batch_id. Reaped to timed_out on stale heartbeat. See lib/ai-citation/run-state.ts.';
