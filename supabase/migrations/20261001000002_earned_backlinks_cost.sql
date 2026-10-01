-- Earned Backlinks: cost tracking - what (if anything) was paid for each
-- backlink. is_free and amount_paid are deliberately independent columns
-- (not "amount_paid = 0 means free") so a row can honestly represent "we
-- don't know the cost yet" (both null, not marked free) vs "confirmed free"
-- (is_free = true) vs "confirmed paid" (amount_paid set).
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Idempotent.

alter table public.earned_backlinks add column if not exists is_free boolean not null default false;
alter table public.earned_backlinks add column if not exists amount_paid numeric(10,2);
alter table public.earned_backlinks add column if not exists currency text not null default 'USD';

do $$
begin
  execute 'alter table public.earned_backlinks drop constraint if exists earned_backlinks_currency_check;';
  execute $c$alter table public.earned_backlinks add constraint earned_backlinks_currency_check check (currency in ('USD','INR'));$c$;
end $$;
