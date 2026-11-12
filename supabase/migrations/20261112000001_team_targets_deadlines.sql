-- Team Targets, round 3: targets that aren't a steady weekly/monthly cadence.
-- Adds, all nullable/defaulted so existing rows and reads are untouched:
--   detail        free text shown under the task (ranges, quality rules, notes
--                 like "DR 40+, SaaS only" or "make the English better")
--   due_date      a deadline; drives pace for a one-time deliverable
--   one_time      true = a single deliverable of `target` units by due_date
--                 (not N per day/week/month); false = recurring, as before
--   co_owner_2_id a second co-owner (some tasks are shared three ways)
--
-- The app still enforces who may write; RLS stays read-only for signed-in users.
-- Apply MANUALLY in Supabase, AFTER 20261019000002. Idempotent.

alter table public.team_targets add column if not exists detail text;
alter table public.team_targets add column if not exists due_date date;
alter table public.team_targets add column if not exists one_time boolean not null default false;
alter table public.team_targets
  add column if not exists co_owner_2_id uuid references public.profiles(id) on delete set null;
