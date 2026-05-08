-- AI verification queue + history
--
-- When a task moves to "Done" (review status) or "Published" (done status),
-- a row is inserted here. A local Claude Code skill picks up `queued` rows
-- once a day at 10am IST, runs the full pipeline (Google Doc fetch +
-- plagiarism + humanization scoring + quality scoring + LLM brief compliance),
-- and writes the result back. The latest score is also denormalized onto
-- the parent task row for fast UI reads.

do $$ begin
  create type ai_verification_status as enum (
    'queued',        -- waiting for the worker
    'running',       -- worker picked it up
    'verified',      -- passed (green badge)
    'failed',        -- one or more hard fails (red badge)
    'doc_missing'    -- task moved to Done with no Google Doc in supporting_links
  );
exception when duplicate_object then null; end $$;

create table if not exists public.task_verifications (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  status ai_verification_status not null default 'queued',

  -- 'review' = task moved to "Done" (verify against the doc).
  -- 'done'   = task moved to "Published" (verify against the live URL).
  trigger_status text not null check (trigger_status in ('review', 'done')),
  retry_count int not null default 0,

  -- The source the verification ran against.
  source_type text check (source_type in ('google_doc', 'live_url') or source_type is null),
  source_url text,
  doc_text_length int,
  word_count int,

  -- Per-step results (each step writes its own JSONB blob so the dialog can
  -- render a detailed breakdown).
  doc_fetch_result jsonb,
  plagiarism_result jsonb,
  humanization_result jsonb,
  quality_result jsonb,
  llm_compliance_result jsonb,

  -- Final scores and issues.
  overall_score int,                                -- 0-100, higher is better
  prev_score int,                                   -- previous run's score for delta
  hard_fails text[] not null default '{}',
  soft_fails text[] not null default '{}',
  passed boolean,
  issues jsonb,                                     -- array of {severity, category, message, suggestion?}
  summary text,                                     -- one-line for the card

  -- Lifecycle.
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  error_message text
);

create index if not exists idx_task_verifications_task on public.task_verifications(task_id);
create index if not exists idx_task_verifications_pending on public.task_verifications(queued_at)
  where status in ('queued', 'running');
create index if not exists idx_task_verifications_completed on public.task_verifications(completed_at desc)
  where status in ('verified', 'failed');

-- Denormalized latest result on the task itself (for kanban card rendering
-- without joining the verifications table on every read).
alter table public.tasks add column if not exists ai_verification_status ai_verification_status;
alter table public.tasks add column if not exists ai_verified_at timestamptz;
alter table public.tasks add column if not exists ai_score int;
alter table public.tasks add column if not exists ai_score_delta int;
alter table public.tasks add column if not exists ai_verification_summary text;
alter table public.tasks add column if not exists ai_verification_id uuid references public.task_verifications(id) on delete set null;

create index if not exists idx_tasks_ai_status on public.tasks(ai_verification_status)
  where ai_verification_status is not null;

-- ============================================================
-- RLS — anyone with access to the task can read its verifications;
-- only admins can write (mirrors the existing tasks policy shape).
-- ============================================================

alter table public.task_verifications enable row level security;

create policy "task_verifications_select" on public.task_verifications
  for select using (
    exists (
      select 1 from public.tasks t
      where t.id = task_verifications.task_id
        and public.has_project_access(t.project_id)
    )
  );

create policy "task_verifications_write_admin" on public.task_verifications
  for all using (public.is_admin());

-- Helper: insert a queued verification when the task moves to review or done.
-- Returns the inserted row id, or null if the task is missing a doc URL on
-- the review trigger (in which case status='doc_missing' is already set).
create or replace function public.enqueue_task_verification(
  p_task_id uuid,
  p_trigger_status text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_supporting_links text[];
  v_published_url text;
  v_doc_url text;
  v_source_type text;
  v_status ai_verification_status := 'queued';
  v_prev_score int;
begin
  if p_trigger_status not in ('review', 'done') then
    return null;
  end if;

  -- Pull the current supporting_links + published_url from the task.
  select supporting_links, published_url
  into v_supporting_links, v_published_url
  from public.tasks
  where id = p_task_id;

  if p_trigger_status = 'done' then
    v_source_type := 'live_url';
    v_doc_url := v_published_url;
  else
    -- Find the first Google Doc URL in supporting_links.
    v_source_type := 'google_doc';
    select link into v_doc_url
    from unnest(coalesce(v_supporting_links, '{}'::text[])) link
    where link ilike '%docs.google.com%'
    limit 1;
  end if;

  if v_doc_url is null then
    v_status := 'doc_missing';
  end if;

  -- Look up the previous score so the delta can render even if this row
  -- ends up doc_missing.
  select overall_score into v_prev_score
  from public.task_verifications
  where task_id = p_task_id and overall_score is not null
  order by completed_at desc nulls last
  limit 1;

  insert into public.task_verifications (
    task_id, status, trigger_status, source_type, source_url, prev_score
  ) values (
    p_task_id, v_status, p_trigger_status, v_source_type, v_doc_url, v_prev_score
  )
  returning id into v_id;

  -- Mirror the latest status onto the task row for fast UI reads.
  update public.tasks
  set
    ai_verification_status = v_status,
    ai_verification_id = v_id,
    ai_verification_summary = case
      when v_status = 'doc_missing' then 'Doc link missing — paste a Google Doc URL into Supporting links'
      else 'AI review queued — checks tomorrow 10am IST'
    end
  where id = p_task_id;

  return v_id;
end;
$$;

grant execute on function public.enqueue_task_verification(uuid, text) to anon, authenticated, service_role;
