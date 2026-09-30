-- AI Visibility self-serve categories (Ticket 1).
--
-- Today "categories" are a hardcoded TypeScript union (employee_monitoring /
-- workforce_analytics) with a matching CHECK constraint on every table that
-- carries a category column - adding a third category needed a code change
-- and a deploy. This makes categories a real per-project table so a team
-- member can create their own from the UI.
--
-- Deliberately NO foreign key from category text columns to this table -
-- keeps the existing "degrade gracefully if unmigrated" pattern this repo
-- uses everywhere (e.g. ai_citation_personas), and an FK would force
-- validating every historical row for little benefit on a low-write table.
-- The two existing categories are backfilled as is_builtin rows so they
-- render through the same dynamic path as anything created after them.
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Idempotent.

create table if not exists public.ai_visibility_categories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  key text not null,          -- snake_case, matches the existing free-text category columns exactly
  label text not null,        -- display name
  description text,           -- replaces the old hardcoded CATEGORY_FOCUS map; feeds AI-generation framing
  is_builtin boolean not null default false,
  position int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (project_id, key)
);

alter table public.ai_visibility_categories enable row level security;
do $$
begin
  execute 'drop policy if exists ai_visibility_categories_access on public.ai_visibility_categories;';
  execute 'create policy ai_visibility_categories_access on public.ai_visibility_categories for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));';
end $$;

-- Backfill the 2 legacy categories for every existing project.
insert into public.ai_visibility_categories (project_id, key, label, is_builtin, position)
select id, 'employee_monitoring', 'Employee Monitoring', true, 0 from public.projects
on conflict (project_id, key) do nothing;

insert into public.ai_visibility_categories (project_id, key, label, is_builtin, position)
select id, 'workforce_analytics', 'Workforce Analytics', true, 1 from public.projects
on conflict (project_id, key) do nothing;

-- Drop the 4 CHECK constraints that hard-lock category to exactly those two
-- values (added in 20260911000001_ai_visibility_category.sql) - without
-- this, the first prompt/run/score insert for a new category throws.
alter table public.ai_citation_prompts drop constraint if exists ai_citation_prompts_category_check;
alter table public.ai_citation_runs drop constraint if exists ai_citation_runs_category_check;
alter table public.ai_citation_run_batches drop constraint if exists ai_citation_run_batches_category_check;
alter table public.ai_visibility_scores drop constraint if exists ai_visibility_scores_category_check;
