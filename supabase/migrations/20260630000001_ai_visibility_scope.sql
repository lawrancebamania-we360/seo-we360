-- Per-project AI Visibility "tracking scope": which competitors + topic angles to
-- run, the sampling depth, and how many times the user has confirmed a run (for the
-- confirm-then-fade UX). One row per project. Degrades gracefully to inferred
-- defaults when absent (the app never hard-requires this row).
create table if not exists public.ai_visibility_scope (
  project_id uuid primary key references public.projects(id) on delete cascade,
  competitor_ids uuid[] not null default '{}',     -- subset of the shared competitors table to track
  topics text[] not null default '{}',             -- selected INTENT_BUCKET keys (best-of/comparison/...)
  depth_n int not null default 3 check (depth_n between 1 and 7),
  runs_confirmed int not null default 0,           -- drives confirm-first-few-then-fade
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.ai_visibility_scope enable row level security;

-- Mirror the project-access policy used by the ai_citation_* tables.
do $$ begin
  create policy ai_vis_scope_access on public.ai_visibility_scope
    for all
    using (public.has_project_access(project_id))
    with check (public.has_project_access(project_id));
exception when duplicate_object then null; end $$;
