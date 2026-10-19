-- Team Targets: who owns which recurring output (e.g. "Listicles, Lokesh,
-- 4 daily") and the number each person reports for a week, which a different
-- admin then verifies.
--
-- Two tables:
--   team_targets          one row per recurring target (task + owner + goal)
--   team_target_entries   one row per target per week: the reported number,
--                         its proof, and its review status
--
-- Removing a target only stamps removed_at, so every number ever reported
-- stays. Re-adding the same task for the same owner restores it.
--
-- WRITES go through server actions that use the service role after checking
-- who the caller is (owner / co-owner / admin, and "not your own number" for
-- verification). So RLS here is read-only for signed-in users: nobody can
-- mark their own number verified by calling the API directly.
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Idempotent.

create table if not exists public.team_targets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  task text not null,
  owner_id uuid references public.profiles(id) on delete set null,
  co_owner_id uuid references public.profiles(id) on delete set null,
  target integer not null check (target > 0),
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  removed_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_team_targets_project
  on public.team_targets(project_id) where removed_at is null;
create index if not exists idx_team_targets_owner
  on public.team_targets(owner_id);

create table if not exists public.team_target_entries (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.team_targets(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  week_start date not null,                 -- the Monday of the reported week
  achieved integer not null check (achieved >= 0),
  note text,
  proof_url text,
  status text not null default 'pending' check (status in ('pending', 'verified', 'sent_back')),
  reported_by uuid references public.profiles(id) on delete set null,
  reported_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,                         -- why it was sent back
  unique (target_id, week_start)
);

create index if not exists idx_team_target_entries_project_week
  on public.team_target_entries(project_id, week_start desc);

alter table public.team_targets enable row level security;
alter table public.team_target_entries enable row level security;
do $$
begin
  execute 'drop policy if exists team_targets_read on public.team_targets;';
  execute 'create policy team_targets_read on public.team_targets for select using (public.has_project_access(project_id));';
  execute 'drop policy if exists team_target_entries_read on public.team_target_entries;';
  execute 'create policy team_target_entries_read on public.team_target_entries for select using (public.has_project_access(project_id));';
end $$;
