-- SEO · we360.ai: per-user default AI model preference.
-- Users can change it in Profile; every AI dialog also lets them override per-task.
-- Enum-style TEXT column kept flexible so admin can add new models without another migration.

alter table public.profiles
  add column if not exists preferred_ai_model text default 'sonnet';

-- Constraint keeps bad values out but still lets us ship new models by updating the
-- check constraint via a follow-up migration when Anthropic/OpenAI release them.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_preferred_ai_model_check'
  ) then
    alter table public.profiles
      add constraint profiles_preferred_ai_model_check
      check (preferred_ai_model in ('sonnet', 'opus', 'gpt-4o', 'gpt-4o-mini'));
  end if;
end $$;
