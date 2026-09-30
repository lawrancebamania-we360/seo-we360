-- Backlinks (Ticket 1): a standalone content-distribution/backlink log,
-- separate from the AI Visibility "Citation Sources" outreach tracker
-- (ai_citation_outreach) - that table is specifically about pitching sites
-- AI already cites; this is the team's general link-building workflow with
-- its own data and its own paste-import flow (mirrors Blog Clusters).
--
-- Two tables, not one, so a website with zero submissions inside a selected
-- date range can still render as a row showing 0 - a SELECT DISTINCT off
-- backlink_submissions alone would make it vanish from the list entirely
-- whenever the range excludes all of its activity.
--
-- blog_post_url is populated only when the pasted "Blog Post" value matches
-- the project's most recent sitemap snapshot (url_metrics_runs.url_list,
-- normalized) - see Ticket 2. blog_post_label is always populated (the
-- matched URL, or the raw pasted text when nothing matched) so the row never
-- fails to import over an unresolved post reference.
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations).

create table if not exists public.backlink_websites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  domain text not null,                 -- normalized: no protocol, no www., lowercased
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (project_id, domain)
);

create table if not exists public.backlink_submissions (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.backlink_websites(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,  -- denormalized for RLS + direct range queries
  submission_date date not null,
  submission_url text not null,
  blog_post_url text,                   -- verified match against the latest sitemap snapshot; null if unmatched
  blog_post_label text not null,        -- always populated: the matched URL, or the raw pasted text
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_backlink_submissions_website
  on public.backlink_submissions(website_id, submission_date desc);
create index if not exists idx_backlink_submissions_project_date
  on public.backlink_submissions(project_id, submission_date desc);

alter table public.backlink_websites enable row level security;
do $$
begin
  execute 'drop policy if exists backlink_websites_access on public.backlink_websites;';
  execute 'create policy backlink_websites_access on public.backlink_websites for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));';
end $$;

alter table public.backlink_submissions enable row level security;
do $$
begin
  execute 'drop policy if exists backlink_submissions_access on public.backlink_submissions;';
  execute 'create policy backlink_submissions_access on public.backlink_submissions for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));';
end $$;
