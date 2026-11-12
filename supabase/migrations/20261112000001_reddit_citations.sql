-- Reddit Citations: a monthly plan of AI-answer prompts where we want a We360
-- citation inside the Reddit thread an AI Overview / LLM pulls from. Each month
-- is a cluster (e.g. "Oct 26"); contributors (Namrata, Lokesh, Naveen) each add
-- 5 prompt+thread rows, and Leena posts the comment on Reddit and marks each one
-- published. Adding a row, and publishing one, feed the matching Team Target
-- (round 2) automatically, so this tab and Team Targets stay one source of truth.
--
-- Reads degrade before this is applied (the tab shows a "database update needed"
-- notice rather than crashing). Tables are read-only for signed-in users (RLS
-- select only); every write goes through a server action that checks the caller.
-- Apply MANUALLY in Supabase, AFTER 20261019000002. Idempotent.

-- 1. month clusters ---------------------------------------------------------
create table if not exists public.reddit_citation_clusters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  month_key text not null,                 -- 'YYYY-MM', the month this cluster covers
  title text,                              -- optional custom label; else derived from month_key
  keyword_plan_url text,                   -- the keyword plan handed to Leena
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
-- One live cluster per month per project.
create unique index if not exists reddit_citation_clusters_month_uniq
  on public.reddit_citation_clusters(project_id, month_key) where removed_at is null;

-- 2. the citations ----------------------------------------------------------
create table if not exists public.reddit_citation_items (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.reddit_citation_clusters(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  position integer not null default 0,
  prompt text not null,                    -- the AI prompt / keyword (e.g. "Reddit Alternatives")
  source text,                             -- where the answer came from (free text, e.g. "AIO")
  reddit_link text,                        -- the Reddit thread we want to be cited in
  reddit_link_key text,                    -- normalized host+path, for de-dup / the target log
  example text,                            -- the drafted comment, or a status note
  owner_id uuid references public.profiles(id) on delete set null,  -- the contributor who owns this row
  published boolean not null default false,
  published_url text,                      -- the live Reddit comment URL, once posted
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete set null,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists reddit_citation_items_cluster on public.reddit_citation_items(cluster_id, position);
create index if not exists reddit_citation_items_project on public.reddit_citation_items(project_id);
create index if not exists reddit_citation_items_owner on public.reddit_citation_items(owner_id);

-- 3. RLS: read for project members; writes go through server actions ---------
alter table public.reddit_citation_clusters enable row level security;
alter table public.reddit_citation_items enable row level security;
do $$
begin
  execute 'drop policy if exists rcc_read on public.reddit_citation_clusters;';
  execute 'create policy rcc_read on public.reddit_citation_clusters for select using (public.has_project_access(project_id));';
  execute 'drop policy if exists rci_read on public.reddit_citation_items;';
  execute 'create policy rci_read on public.reddit_citation_items for select using (public.has_project_access(project_id));';
end $$;

-- 4. seed the Team Targets this tab feeds (monthly) --------------------------
-- Matched to real members by FIRST NAME (like 20261019000002), skipping any that
-- already exist so this is safe to run more than once. Contributors add 5/month;
-- Leena publishes 15/month; the keyword plan for Leena is 1/month.
do $$
declare
  v_project uuid;
  v_owner uuid;
  r record;
begin
  select id into v_project from public.projects where lower(domain) = 'we360.ai' order by created_at limit 1;
  if v_project is null then select id into v_project from public.projects order by created_at limit 1; end if;
  if v_project is null then return; end if;

  for r in
    select * from (values
      ('Reddit citations',                         'Namrata',  5,  'monthly'),
      ('Reddit citations',                         'Lokesh',   5,  'monthly'),
      ('Reddit citations',                         'Naveen',   5,  'monthly'),
      ('Publish Reddit citations',                 'Leena',    15, 'monthly'),
      ('Keyword plan to Leena (Reddit citations)', 'Lawrance', 1,  'monthly')
    ) as t(task, owner_name, target, frequency)
  loop
    select id into v_owner from public.profiles
      where lower(split_part(name, ' ', 1)) = lower(r.owner_name) and role <> 'client' limit 1;
    if v_owner is null then continue; end if;  -- no such person: leave for a manual add

    if not exists (
      select 1 from public.team_targets tt
      where tt.project_id = v_project and lower(tt.task) = lower(r.task)
        and tt.owner_id = v_owner and tt.removed_at is null
    ) then
      insert into public.team_targets (project_id, task, owner_id, target, frequency, log_mode, is_volume)
      values (v_project, r.task, v_owner, r.target::int, r.frequency, 'link', false);
    end if;
  end loop;
end $$;
