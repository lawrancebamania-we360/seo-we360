-- AI Citation - per-question Source Tracker.
--
-- The report already answers "which sources does AI cite for US, overall?"
-- (ai_citation_sources rolled up project-wide over the latest batch). This adds
-- the per-QUESTION cut: for one tracked question, which sources are winning it,
-- how that mix moves across check-ins, and whether the brand we care about got
-- cited in that check-in.
--
-- NO new measurement and NO new storage of the numbers themselves: every share
-- is derived at read time from the ai_citation_runs / ai_citation_sources rows
-- already written by each run (a "check-in" == one run_batch_id, which is dated).
-- History therefore backfills instantly from data already in the table - nothing
-- prunes those rows, so the trend is real from day one.
--
-- This migration only stores the two things that CANNOT be derived:
--   1. which brand a question is watching (default: the project's own), and
--   2. the user's manual "double down" / "declining" judgement on a source.
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Reads degrade
-- gracefully before this is applied: the brand-of-interest lookup and the flag
-- lookup are both best-effort and fall back to "project's own brand, no flags",
-- exactly like ai_citation_competitor_hits did (migration 20260629000001).

-- 1. Brand of interest per question.
--
-- NULL (the default, and every pre-existing row) = watch the PROJECT'S OWN brand,
-- which is what project_mentioned / project_cited on ai_citation_runs already
-- record. Set to a tracked competitor to watch THEM on this question instead -
-- their per-run mention/citation is already detected and stored in
-- ai_citation_competitor_hits, so pointing a question at a competitor needs no
-- new detection pass and reads back over the full existing history.
--
-- Deliberately a FK to competitors rather than free text: a free-text brand would
-- have nothing detecting it in the answers, so the "Cited?" column would be
-- permanently unknown. Restricting to tracked competitors keeps every column on
-- the tracker truthful.
alter table public.ai_citation_prompts
  add column if not exists brand_of_interest_competitor_id uuid
    references public.competitors(id) on delete set null;

comment on column public.ai_citation_prompts.brand_of_interest_competitor_id is
  'Whose citation presence this question watches. NULL = the project''s own brand (read from ai_citation_runs.project_cited/project_mentioned). Set = that competitor (read from ai_citation_competitor_hits). Restricted to tracked competitors because only those are detected in answers.';

-- Question-list reads filter on active prompts per project; this covers the
-- tracker''s "all questions + their watched brand" read.
create index if not exists idx_ai_cit_prompts_project_active
  on public.ai_citation_prompts(project_id, active);

-- 2. Manual insight flag per (question, source domain).
--
-- The trend is computed; the JUDGEMENT about it is not. One row per
-- (prompt, domain) records "double down" (this source is rising / worth the
-- effort) or "declining" (losing ground, stop investing). domain is stored in the
-- same canonical form the read layer keys on (lowercased, no scheme, no www,
-- no path) so a flag always matches its row in the table.
create table if not exists public.ai_citation_question_flags (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  prompt_id uuid not null references public.ai_citation_prompts(id) on delete cascade,
  source_domain text not null,
  flag text not null check (flag in ('double_down', 'declining')),
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One flag per (question, domain) - the UI upserts on this.
create unique index if not exists ai_citation_question_flags_uniq
  on public.ai_citation_question_flags(prompt_id, source_domain);
-- The tracker loads every flag for the project in one read.
create index if not exists idx_ai_cit_q_flags_project
  on public.ai_citation_question_flags(project_id);

-- RLS: same multi-tenant gate as every other ai_citation_* table.
alter table public.ai_citation_question_flags enable row level security;
do $$
begin
  execute 'drop policy if exists ai_citation_question_flags_access on public.ai_citation_question_flags';
  execute 'create policy ai_citation_question_flags_access on public.ai_citation_question_flags for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id))';
end $$;

comment on table public.ai_citation_question_flags is
  'Manual "double down" / "declining" judgement on one source domain for one tracked question. The share numbers themselves are derived at read time from ai_citation_sources - only the judgement is stored. See lib/ai-citation/question-tracker.ts.';
