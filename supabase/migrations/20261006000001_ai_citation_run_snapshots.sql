-- AI Visibility: remember what was asked, and where it was asked from.
--
-- prompt_text: the EXACT wording sent to the engine for this answer. Editing a
--   prompt rewrites ai_citation_prompts.text in place (same id), which used to
--   silently relabel every older answer with the new wording. Readers now show
--   prompt_text and fall back to the prompt's current text only when it is null.
-- country: the ISO-3166 alpha-2 geography this answer was requested for (a run
--   can now cover several countries; each answer is its own row).
--
-- Both columns are nullable and additive: nothing breaks before this is applied
-- (the app falls back to the old behaviour), and re-running it is safe.
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Idempotent.

alter table public.ai_citation_runs add column if not exists prompt_text text;
alter table public.ai_citation_runs add column if not exists country text;

-- Backfill with the prompt's CURRENT wording. An answer to a prompt that was
-- already edited before this migration keeps the NEW wording here (the old one
-- was overwritten and can't be recovered automatically); see the one-off fix in
-- the hand-off note if you know the original text.
update public.ai_citation_runs r
   set prompt_text = p.text
  from public.ai_citation_prompts p
 where p.id = r.prompt_id
   and r.prompt_text is null;

-- Past runs were localized with prompt.country, else the project's country.
-- Stamp that (only when it is a valid two-letter code).
update public.ai_citation_runs r
   set country = upper(btrim(coalesce(nullif(btrim(p.country), ''), pr.country)))
  from public.ai_citation_prompts p, public.projects pr
 where p.id = r.prompt_id
   and pr.id = r.project_id
   and r.country is null
   and upper(btrim(coalesce(nullif(btrim(p.country), ''), pr.country))) ~ '^[A-Z]{2}$';

create index if not exists idx_ai_cit_runs_prompt_created
  on public.ai_citation_runs (prompt_id, created_at desc);

notify pgrst, 'reload schema';
