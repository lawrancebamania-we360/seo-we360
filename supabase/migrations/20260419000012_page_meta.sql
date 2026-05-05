-- SEO · we360.ai: page metadata for every crawled URL.
-- The audit already fetches every sitemap URL. We just weren't saving the
-- title / h1 / is-it-a-blog signal. Topic Cluster coverage analysis needs
-- this to detect pre-existing blogs (written outside the app) so the plan
-- doesn't recommend duplicates.

alter table public.seo_gaps
  add column if not exists page_title text,
  add column if not exists h1_text text,
  add column if not exists is_blog boolean default false,
  add column if not exists last_seen_at timestamptz default now();

create index if not exists idx_seo_gaps_is_blog on public.seo_gaps(project_id, is_blog)
  where is_blog = true;

create index if not exists idx_seo_gaps_last_seen on public.seo_gaps(project_id, last_seen_at desc);
