-- SEO · we360.ai: topic cluster plans generated from the BYOK Topic Cluster Builder.
-- A cluster = 1 pillar + 8-12 spokes + interlinking rules + roadmap.
-- Each spoke can later be "converted" into a blog task via the Blog Sprint UI.

-- ====================================================================
-- topic_clusters — one row per generated plan
-- ====================================================================
create table if not exists public.topic_clusters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  seed_keyword text not null,

  -- Pillar page spec
  pillar_title text not null,
  pillar_slug text,
  pillar_primary_keyword text,
  pillar_outline jsonb not null default '[]'::jsonb,       -- ["H2 #1", "H2 #2", ...]
  pillar_word_target integer default 2800,
  pillar_summary text,

  -- Strategy artifacts
  interlinking jsonb not null default '[]'::jsonb,         -- [{from, to, anchor_text, reason}]
  roadmap jsonb not null default '[]'::jsonb,              -- [{order, spoke_title, rationale}]

  -- Coverage scorecard
  coverage_total integer default 0,
  coverage_new integer default 0,
  coverage_already_covered integer default 0,
  coverage_pct numeric(5,2) default 0,

  -- Provenance
  provider text check (provider in ('claude', 'openai')),
  generated_by uuid references auth.users(id) on delete set null,
  cost_estimate_usd numeric(6,4) default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_topic_clusters_project on public.topic_clusters(project_id, created_at desc);
create index if not exists idx_topic_clusters_seed on public.topic_clusters(project_id, seed_keyword);

alter table public.topic_clusters enable row level security;
create policy "topic_clusters_select" on public.topic_clusters
  for select using (has_project_access(project_id));
create policy "topic_clusters_insert" on public.topic_clusters
  for insert with check (has_project_access(project_id));
create policy "topic_clusters_update" on public.topic_clusters
  for update using (has_project_access(project_id));
create policy "topic_clusters_delete" on public.topic_clusters
  for delete using (has_project_access(project_id));

-- ====================================================================
-- topic_cluster_items — one row per spoke article in a cluster
-- ====================================================================
create table if not exists public.topic_cluster_items (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.topic_clusters(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,

  position integer not null default 0,                     -- roadmap order (1-based)
  title text not null,
  target_keyword text,
  intent text check (intent in ('informational', 'commercial', 'transactional', 'navigational')),
  kd_estimate text check (kd_estimate in ('low', 'medium', 'high')),
  word_count_target integer,
  outline jsonb default '[]'::jsonb,                       -- ["H2 #1", "H2 #2", ...]
  reason text,

  -- If the spoke is already covered by an existing article, store the ref here.
  already_covered_by jsonb,                                -- {title, url}

  -- When the user converts the spoke into an actual blog task, this links them.
  task_id uuid references public.tasks(id) on delete set null,

  created_at timestamptz not null default now()
);

create index if not exists idx_cluster_items_cluster on public.topic_cluster_items(cluster_id, position);
create index if not exists idx_cluster_items_project on public.topic_cluster_items(project_id, created_at desc);
create index if not exists idx_cluster_items_task on public.topic_cluster_items(task_id)
  where task_id is not null;

alter table public.topic_cluster_items enable row level security;
create policy "cluster_items_select" on public.topic_cluster_items
  for select using (has_project_access(project_id));
create policy "cluster_items_insert" on public.topic_cluster_items
  for insert with check (has_project_access(project_id));
create policy "cluster_items_update" on public.topic_cluster_items
  for update using (has_project_access(project_id));
create policy "cluster_items_delete" on public.topic_cluster_items
  for delete using (has_project_access(project_id));
