-- Earned Backlinks: full link-exchange record. Extends the flat
-- earned_backlinks row so one row can hold BOTH halves of a link exchange -
-- the link we GOT (already modelled: website/backlink_url/domain_rating/
-- acquired_date) plus the enrichment fields and the reciprocal link we GAVE
-- back. For a one-directional guest post the given_* columns stay null.
--
-- All columns are nullable and additive - the app degrades to the prior
-- field set until this is applied (reads fall back, the Add/Edit forms hide
-- the exchange fields behind a "apply migration" notice), so nothing breaks
-- if a row is saved before this runs.
--
-- spam_score / given_spam_score are the domain spam PERCENT (e.g. 1 = 1%),
-- stored numeric to allow a fractional percent. link_type is free text with
-- a dropdown in the UI (Link exchange / Guest post / PR / Paid / HARO /
-- Resource page / Other) - kept as text, not an enum, so a new type never
-- needs a migration.
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Idempotent.

alter table public.earned_backlinks add column if not exists link_type text;
alter table public.earned_backlinks add column if not exists spam_score numeric(5,2);
alter table public.earned_backlinks add column if not exists anchor_text text;
alter table public.earned_backlinks add column if not exists anchor_target text;
alter table public.earned_backlinks add column if not exists contact_email text;

-- Reciprocal side: the link WE GAVE back (only set for a link exchange).
alter table public.earned_backlinks add column if not exists given_url text;
alter table public.earned_backlinks add column if not exists given_anchor_text text;
alter table public.earned_backlinks add column if not exists given_anchor_target text;
alter table public.earned_backlinks add column if not exists given_domain_rating int;
alter table public.earned_backlinks add column if not exists given_spam_score numeric(5,2);
alter table public.earned_backlinks add column if not exists given_date date;

do $$
begin
  execute 'alter table public.earned_backlinks drop constraint if exists earned_backlinks_spam_range;';
  execute 'alter table public.earned_backlinks add constraint earned_backlinks_spam_range check (spam_score is null or (spam_score >= 0 and spam_score <= 100));';
  execute 'alter table public.earned_backlinks drop constraint if exists earned_backlinks_given_spam_range;';
  execute 'alter table public.earned_backlinks add constraint earned_backlinks_given_spam_range check (given_spam_score is null or (given_spam_score >= 0 and given_spam_score <= 100));';
  execute 'alter table public.earned_backlinks drop constraint if exists earned_backlinks_given_dr_range;';
  execute 'alter table public.earned_backlinks add constraint earned_backlinks_given_dr_range check (given_domain_rating is null or (given_domain_rating >= 0 and given_domain_rating <= 100));';
end $$;
