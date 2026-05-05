-- SEO · we360.ai: blog task enrichment + integrations table
-- Blog tasks need richer metadata to render the reference-design cards:
-- keyword_id, intent, competition, word_count_target + link back to article when generated.

alter table public.tasks
  add column if not exists keyword_id uuid references public.keywords(id) on delete set null,
  add column if not exists article_id uuid references public.articles(id) on delete set null,
  add column if not exists intent text
    check (intent in ('informational', 'navigational', 'commercial', 'transactional')),
  add column if not exists competition text
    check (competition in ('Low Competition', 'Medium Competition', 'High Competition')),
  add column if not exists word_count_target int,
  add column if not exists target_keyword text;

create index if not exists idx_tasks_keyword_id on public.tasks(keyword_id);
create index if not exists idx_tasks_article_id on public.tasks(article_id);
create index if not exists idx_tasks_competition on public.tasks(competition);

-- ==================================================================
-- Integrations: per-project connection status for third-party tools.
-- Credentials themselves live in env vars (not stored here for safety)
-- except for optional per-project overrides stored in `config` jsonb.
-- ==================================================================
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,  -- null = global
  provider text not null check (provider in (
    'apify', 'ga4', 'gsc', 'pagespeed', 'claude', 'openai', 'supabase'
  )),
  status text check (status in ('connected', 'setup_required', 'error', 'disabled')) default 'setup_required',
  last_checked_at timestamptz,
  last_error text,
  config jsonb default '{}'::jsonb,
  enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (project_id, provider)
);

create index if not exists idx_integrations_project on public.integrations(project_id);
create index if not exists idx_integrations_provider on public.integrations(provider);

alter table public.integrations enable row level security;
create policy "integrations_admin_access" on public.integrations for all
  using (public.is_admin())
  with check (public.is_admin());

create trigger trg_integrations_updated before update on public.integrations
  for each row execute procedure public.set_updated_at();
