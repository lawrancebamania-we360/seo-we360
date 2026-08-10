-- AI Citation feature - Phase 1 storage.
-- Tracks whether a brand is cited / mentioned across AI engines for a set of
-- prompts, sampled N times, rolled up per period, plus a composite visibility
-- score. Every table carries project_id + RLS via has_project_access (the same
-- pattern as the rest of Klimb's multi-tenant tables). See PLAN-ai-citation.md.
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Reads degrade
-- gracefully before this is applied (the AI Visibility section shows an empty
-- state).

-- The prompts we run (seeded from GSC queries + persona x topic, editable).
create table if not exists public.ai_citation_prompts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  text text not null,
  topic text,
  tags text[] not null default '{}',
  country text,
  persona text,
  source text not null default 'gsc_seeded',   -- gsc_seeded | manual | ai_suggested
  demand text,                                  -- low | medium | high (estimated, directional)
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- One row per (prompt x engine x run_index) - the raw sampled answers.
create table if not exists public.ai_citation_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  prompt_id uuid not null references public.ai_citation_prompts(id) on delete cascade,
  engine text not null,                         -- chatgpt | claude | perplexity | google_aio
  run_index int not null default 0,
  run_batch_id uuid,
  answer_text text,
  project_cited boolean not null default false,
  project_mentioned boolean not null default false,
  position int,
  sentiment text,                              -- pos | neu | neg
  cost_credits numeric not null default 0,
  error text,
  created_at timestamptz not null default now()
);

-- The sources each answer cited (one row per cited domain/url).
create table if not exists public.ai_citation_sources (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.ai_citation_runs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  domain text,
  url text,
  title text,
  snippet text,
  is_project boolean not null default false,
  competitor_id uuid references public.competitors(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Per-period rollup (powers trend charts + competitor overlays).
create table if not exists public.ai_citation_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  prompt_id uuid references public.ai_citation_prompts(id) on delete cascade,
  engine text,
  period_date date not null,
  n_runs int not null default 0,
  mention_rate numeric not null default 0,
  citation_rate numeric not null default 0,
  avg_position numeric,
  sentiment_score numeric,
  confidence_low numeric,
  confidence_high numeric,
  created_at timestamptz not null default now()
);

-- The single composite 0-100 "directional index" per period (exec headline).
create table if not exists public.ai_visibility_scores (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  period_date date not null,
  engine text,                                 -- null = all-engines composite
  composite_score numeric not null default 0,
  mention_sov numeric,
  citation_sov numeric,
  readiness_score numeric,
  created_at timestamptz not null default now()
);

-- Indexes for the common reads (latest per project, per prompt, per period).
create index if not exists idx_ai_cit_prompts_project on public.ai_citation_prompts(project_id);
create index if not exists idx_ai_cit_runs_project on public.ai_citation_runs(project_id, created_at desc);
create index if not exists idx_ai_cit_runs_prompt on public.ai_citation_runs(prompt_id);
create index if not exists idx_ai_cit_sources_run on public.ai_citation_sources(run_id);
create index if not exists idx_ai_cit_sources_project on public.ai_citation_sources(project_id);
create index if not exists idx_ai_cit_snapshots_project on public.ai_citation_snapshots(project_id, period_date desc);
create index if not exists idx_ai_vis_scores_project on public.ai_visibility_scores(project_id, period_date desc);

-- RLS: same multi-tenant gate as every other table.
alter table public.ai_citation_prompts enable row level security;
alter table public.ai_citation_runs enable row level security;
alter table public.ai_citation_sources enable row level security;
alter table public.ai_citation_snapshots enable row level security;
alter table public.ai_visibility_scores enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'ai_citation_prompts','ai_citation_runs','ai_citation_sources',
    'ai_citation_snapshots','ai_visibility_scores'
  ]
  loop
    execute format(
      'drop policy if exists %I on public.%I;', t || '_access', t);
    execute format(
      'create policy %I on public.%I for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));',
      t || '_access', t);
  end loop;
end $$;
