-- Blog Clusters: GSC queries per cluster (tickets GC-1..GC-7).
--
-- 1. topic_cluster_gsc_queries - every Search Console query (last 90 days,
--    50+ impressions) that matches one of the cluster's keywords, with the page
--    it currently ranks on and where it should go:
--      assign          -> use it in a cluster post (item_id), as an H2 / FAQ / body mention
--      hub             -> use it on the cluster's hub page
--      update_existing -> it already ranks on another page: update that page (ranking_page)
--      new_post        -> 200+ impressions and no good post: suggest a new post
--      ignore          -> not relevant
--    A refresh only updates the metric columns; assignments made by a person
--    (assigned_by = 'manual') are never overwritten.
-- 2. topic_cluster_items.gsc_queries / anchor_plan - what "Apply all" writes into
--    each post's brief: the queries to cover and the anchor text plan.
-- 3. topic_clusters.gsc_refresh - when the queries were last refreshed and
--    whether the AI step ran (shown on the cluster page).

create table if not exists public.topic_cluster_gsc_queries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  cluster_id uuid not null references public.topic_clusters(id) on delete cascade,
  query text not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr numeric not null default 0,
  position numeric not null default 0,
  ranking_page text,                 -- the page earning the most impressions for this query
  ranking_page_position numeric,
  matched_keyword text,              -- which cluster keyword pulled the query in
  action text not null default 'unassigned'
    check (action in ('unassigned', 'assign', 'hub', 'update_existing', 'new_post', 'ignore')),
  item_id uuid references public.topic_cluster_items(id) on delete set null,
  usage text check (usage in ('h2', 'faq', 'body')),
  anchors text[] not null default '{}',   -- 2-3 anchor-text variants built from the query
  reason text,
  status text not null default 'suggested' check (status in ('suggested', 'accepted', 'rejected')),
  assigned_by text check (assigned_by in ('ai', 'rule', 'keyword', 'manual')),
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (cluster_id, query)
);

create index if not exists idx_cluster_gsc_queries_cluster
  on public.topic_cluster_gsc_queries(cluster_id, impressions desc);
create index if not exists idx_cluster_gsc_queries_item
  on public.topic_cluster_gsc_queries(item_id) where item_id is not null;

alter table public.topic_cluster_gsc_queries enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'topic_cluster_gsc_queries' and policyname = 'topic_cluster_gsc_queries_access') then
    execute 'create policy topic_cluster_gsc_queries_access on public.topic_cluster_gsc_queries for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));';
  end if;
end $$;

alter table public.topic_cluster_items
  add column if not exists gsc_queries jsonb not null default '[]'::jsonb,  -- [{query, usage, impressions, position}]
  add column if not exists anchor_plan jsonb not null default '{}'::jsonb;  -- {toHub, fromHub, variants, naturalToHub, naturalFromHub}

alter table public.topic_clusters
  add column if not exists gsc_refresh jsonb;  -- {at, fetched, added, ai, aiError}
