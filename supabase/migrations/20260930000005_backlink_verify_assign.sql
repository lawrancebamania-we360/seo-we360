-- Backlinks (Tickets 23-25): per-submission assignment + AI verification.
--
-- verification_status starts 'unverified' and moves to one of:
--   'verified'       - page fetched OK and its content discusses the topic
--   'topic_mismatch' - page fetched OK but doesn't seem to discuss the topic
--   'not_found'      - page returned a non-2xx status (dead/removed link)
--   'inconclusive'   - couldn't fetch real content (bot/login wall - several
--                      of these platforms block simple scraping) - deliberately
--                      distinct from not_found so a blocked fetch is never
--                      reported to the team as "link is dead".
-- Verification is triggered manually per row (a fetch + LLM call per click),
-- not automatically on import - same cost-conscious, confirm-first pattern
-- already used for AI Visibility's run-test flow.
--
-- assigned_to follows tasks.team_member_id's exact convention (nullable FK,
-- on delete set null - losing a team member should orphan the assignment,
-- not the submission).
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Idempotent.

alter table public.backlink_submissions add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
create index if not exists idx_backlink_submissions_assignee on public.backlink_submissions(assigned_to);

alter table public.backlink_submissions add column if not exists verification_status text not null default 'unverified';
alter table public.backlink_submissions add column if not exists verification_note text;
alter table public.backlink_submissions add column if not exists verified_at timestamptz;

do $$
begin
  execute 'alter table public.backlink_submissions drop constraint if exists backlink_submissions_verification_status_check;';
  execute $c$alter table public.backlink_submissions add constraint backlink_submissions_verification_status_check check (verification_status in ('unverified','verified','topic_mismatch','not_found','inconclusive'));$c$;
end $$;
