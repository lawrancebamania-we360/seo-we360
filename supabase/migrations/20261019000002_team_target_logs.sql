-- Team Targets, round 2: the model moves from "report one number per week" to
-- "log each thing you did (usually a link), and the link gets checked". The
-- weekly table (team_target_entries) from 20261019000001 is left in place,
-- untouched; nothing writes to it any more.
--
-- This migration:
--   1. adds team_targets.log_mode ('link' for things with a URL, 'count' for
--      the two 800/month tasks that are a quantity, not a page)
--   2. preloads the 25 fixed targets, matching owners/co-owners to real team
--      members by FIRST NAME (so "Dinesh sir" -> Dinesh Neede), skipping any
--      that already exist so this is safe to run more than once
--   3. creates team_target_logs: one row per logged achievement, with its AI
--      (or owner) verification outcome
--
-- Tables stay read-only for signed-in users (RLS select only); every write goes
-- through a server action that checks who the caller is. Apply MANUALLY in
-- Supabase, AFTER 20261019000001. Idempotent.

-- 1. log_mode + is_volume on the targets ------------------------------------
-- log_mode: 'link' (the achievement is a URL) or 'count' (just a quantity).
-- is_volume: high-cardinality targets (44/week, 800/month) whose unit totals
-- would swamp a blended figure, so the dashboard shows them as a separate
-- "volume" total rather than mixing them into the "content" total.
alter table public.team_targets
  add column if not exists log_mode text not null default 'link'
  check (log_mode in ('link', 'count'));
alter table public.team_targets
  add column if not exists is_volume boolean not null default false;

-- 2. preload the 25 fixed targets ------------------------------------------
do $$
declare
  v_project uuid;
  v_owner uuid;
  v_co uuid;
  r record;
begin
  -- The we360.ai project (the only one today); fall back to the oldest project.
  select id into v_project from public.projects where lower(domain) = 'we360.ai' order by created_at limit 1;
  if v_project is null then select id into v_project from public.projects order by created_at limit 1; end if;
  if v_project is null then return; end if;

  for r in
    select * from (values
      ('Listicles',                           'Lokesh',  null::text, 4,   'daily',   'link',  false),
      ('Guides',                              'Lokesh',  null,       2,   'daily',   'link',  false),
      ('New Blogs',                           'Lokesh',  null,       2,   'weekly',  'link',  false),
      ('Update old blogs',                    'Lokesh',  null,       3,   'weekly',  'link',  false),
      ('Listicles',                           'Naveen',  null,       5,   'daily',   'link',  false),
      ('Guides',                              'Naveen',  null,       2,   'daily',   'link',  false),
      ('Listicles',                           'Namrata', null,       5,   'daily',   'link',  false),
      ('Guides',                              'Namrata', null,       2,   'daily',   'link',  false),
      ('LinkedIn Articles',                   'Namrata', 'Tanu',     1,   'daily',   'link',  false),
      ('LinkedIn Newsletter',                 'Namrata', 'Tanu',     1,   'daily',   'link',  false),
      ('Blog Submissions on 11 platforms',    'Tanu',    null,       44,  'weekly',  'link',  true),
      ('Article Writing',                     'Leena',   null,       1,   'weekly',  'link',  false),
      ('Article Writing',                     'Aditya',  null,       1,   'weekly',  'link',  false),
      ('Backlinks Exchange',                  'Namrata', null,       5,   'monthly', 'link',  false),
      ('Backlinks Exchange',                  'Naveen',  null,       5,   'monthly', 'link',  false),
      ('Backlinks Exchange',                  'Lokesh',  null,       5,   'monthly', 'link',  false),
      ('Upload Blogs to website',             'Dinesh',  null,       4,   'weekly',  'link',  false),
      ('Upload Guides to website',            'Dinesh',  null,       6,   'daily',   'link',  false),
      ('Write & Upload Blogs',                'Lawrance',null,       2,   'weekly',  'link',  false),
      ('Write Marketing Pages content',       'Lawrance',null,       2,   'weekly',  'link',  false),
      ('Write & Upload Guides',               'Lawrance',null,       2,   'weekly',  'link',  false),
      ('Write Newsletter',                    'Lawrance',null,       1,   'weekly',  'link',  false),
      ('YouTube playbook videos',             'Aditya',  'Tanu',     1,   'weekly',  'link',  false),
      ('Backlinks Exchange Emails',           'Leena',   null,       800, 'monthly', 'count', true),
      ('Backlinks Exchange LinkedIn Request', 'Leena',   null,       800, 'monthly', 'count', true)
    ) as t(task, owner_name, co_name, target, frequency, log_mode, is_volume)
  loop
    select id into v_owner from public.profiles
      where lower(split_part(name, ' ', 1)) = lower(r.owner_name) and role <> 'client' limit 1;
    if v_owner is null then continue; end if;  -- no such person: leave for a manual add

    v_co := null;
    if r.co_name is not null then
      select id into v_co from public.profiles
        where lower(split_part(name, ' ', 1)) = lower(r.co_name) and role <> 'client' limit 1;
    end if;

    if not exists (
      select 1 from public.team_targets tt
      where tt.project_id = v_project and lower(tt.task) = lower(r.task)
        and tt.owner_id = v_owner and tt.removed_at is null
    ) then
      insert into public.team_targets (project_id, task, owner_id, co_owner_id, target, frequency, log_mode, is_volume)
      values (v_project, r.task, v_owner, v_co, r.target::int, r.frequency, r.log_mode, r.is_volume);
    end if;
  end loop;
end $$;

-- 3. the log of achievements ------------------------------------------------
create table if not exists public.team_target_logs (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.team_targets(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  log_date date not null,
  link text,                           -- the published work; null on a pure-count log
  link_key text,                       -- normalized host+path, for the dedupe index; null when no link
  quantity integer not null default 1 check (quantity > 0),
  note text,
  -- pending (just logged) / ai_verified / owner_verified / not_found / mismatch /
  -- unreachable (blocked, e.g. a login wall) / failed (fetch error)
  verification_status text not null default 'pending'
    check (verification_status in ('pending','ai_verified','owner_verified','not_found','mismatch','unreachable','failed')),
  verification_reason text,
  verification_kind text check (verification_kind in ('own_site','third_party','count')),
  checked_at timestamptz,
  reported_by uuid references public.profiles(id) on delete set null,
  reported_at timestamptz not null default now(),
  verified_by uuid references public.profiles(id) on delete set null,  -- owner manual verify
  verified_at timestamptz
);

-- The same link can't be logged twice against the same target.
create unique index if not exists team_target_logs_link_uniq
  on public.team_target_logs(target_id, link_key) where link_key is not null;
create index if not exists team_target_logs_target_date
  on public.team_target_logs(target_id, log_date desc);
create index if not exists team_target_logs_project_date
  on public.team_target_logs(project_id, log_date desc);

alter table public.team_target_logs enable row level security;
do $$
begin
  execute 'drop policy if exists team_target_logs_read on public.team_target_logs;';
  execute 'create policy team_target_logs_read on public.team_target_logs for select using (public.has_project_access(project_id));';
end $$;
