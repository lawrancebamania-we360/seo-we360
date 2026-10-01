-- Influencer Collabs: currency + free-collab tracking, added after the fact
-- once the team wanted to log collabs paid in INR (not just a plain
-- amount). Same independent is_free/amount_paid shape as Earned Backlinks'
-- cost migration - a row can honestly represent "don't know the cost yet"
-- (both null, not marked free) vs "confirmed free" (is_free = true) vs
-- "confirmed paid" (amount_paid set). Default currency is INR here (not USD
-- like Earned Backlinks), per explicit instruction - most influencer
-- collabs are paid in INR.
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Idempotent.

alter table public.influencer_collabs add column if not exists is_free boolean not null default false;
alter table public.influencer_collabs add column if not exists currency text not null default 'INR';

do $$
begin
  execute 'alter table public.influencer_collabs drop constraint if exists influencer_collabs_currency_check;';
  execute $c$alter table public.influencer_collabs add constraint influencer_collabs_currency_check check (currency in ('USD','INR'));$c$;
end $$;
