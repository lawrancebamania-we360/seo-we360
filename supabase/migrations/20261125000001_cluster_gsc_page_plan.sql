-- Blog Clusters - GSC queries, round 3 (GC-15..GC-19): read our page and
-- Google's top 3 before suggesting changes, and plan one title per page.
--   topic_cluster_gsc_queries.serp        - Google's US mobile top 3 + "people also ask"
--   topic_cluster_gsc_queries.serp_at     - when it was checked (re-checked after 30 days)
--   topic_cluster_gsc_queries.target_url  - the live page this term's changes go on
--   topic_cluster_gsc_queries.planned_at  - when Claude last planned this term's drafts
--   topic_clusters.gsc_plan               - last weekly planning run per cluster
--   seo_page_scans                        - quick reads of pages (ours and the top 3),
--                                           shared across clusters, refreshed weekly
-- The app works before this is applied (no top 3 / page read; drafts as before).

alter table public.topic_cluster_gsc_queries
  add column if not exists serp jsonb,
  add column if not exists serp_at timestamptz,
  add column if not exists target_url text,
  add column if not exists planned_at timestamptz;

alter table public.topic_clusters
  add column if not exists gsc_plan jsonb;

create table if not exists public.seo_page_scans (
  project_id uuid not null references public.projects(id) on delete cascade,
  url text not null,
  ok boolean not null default false,
  scan jsonb,
  fetched_at timestamptz not null default now(),
  primary key (project_id, url)
);

alter table public.seo_page_scans enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'seo_page_scans' and policyname = 'seo_page_scans_access') then
    execute 'create policy seo_page_scans_access on public.seo_page_scans for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));';
  end if;
end $$;
