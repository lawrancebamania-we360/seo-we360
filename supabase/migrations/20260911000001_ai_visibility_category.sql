-- AI Visibility "categories" — Employee Monitoring / Workforce Analytics.
--
-- We360 sells two distinct products; the founder wants each scanned and
-- reported on independently (its own composite score, its own prompts/runs),
-- with room for more categories later. Additive category column across the
-- 4 tables that carry a prompt/run/score, following this repo's existing
-- lightweight text+CHECK pattern (see provider on integrations, status on
-- run_batches) rather than a new relational table.
--
-- Existing rows backfilled to 'workforce_analytics' (today's only real
-- category) so nothing breaks before the split UI ships.
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Idempotent.

alter table public.ai_citation_prompts
  add column if not exists category text not null default 'workforce_analytics';
alter table public.ai_citation_prompts drop constraint if exists ai_citation_prompts_category_check;
alter table public.ai_citation_prompts add constraint ai_citation_prompts_category_check
  check (category in ('employee_monitoring', 'workforce_analytics'));

alter table public.ai_citation_runs
  add column if not exists category text not null default 'workforce_analytics';
alter table public.ai_citation_runs drop constraint if exists ai_citation_runs_category_check;
alter table public.ai_citation_runs add constraint ai_citation_runs_category_check
  check (category in ('employee_monitoring', 'workforce_analytics'));

alter table public.ai_citation_run_batches
  add column if not exists category text not null default 'workforce_analytics';
alter table public.ai_citation_run_batches drop constraint if exists ai_citation_run_batches_category_check;
alter table public.ai_citation_run_batches add constraint ai_citation_run_batches_category_check
  check (category in ('employee_monitoring', 'workforce_analytics'));

alter table public.ai_visibility_scores
  add column if not exists category text not null default 'workforce_analytics';
alter table public.ai_visibility_scores drop constraint if exists ai_visibility_scores_category_check;
alter table public.ai_visibility_scores add constraint ai_visibility_scores_category_check
  check (category in ('employee_monitoring', 'workforce_analytics'));

-- Indexes for the common read: latest per (project, category).
create index if not exists idx_ai_cit_prompts_category on public.ai_citation_prompts(project_id, category);
create index if not exists idx_ai_cit_runs_category on public.ai_citation_runs(project_id, category, created_at desc);
create index if not exists idx_ai_cit_run_batches_category on public.ai_citation_run_batches(project_id, category, created_at desc);
create index if not exists idx_ai_vis_scores_category on public.ai_visibility_scores(project_id, category, period_date desc);
