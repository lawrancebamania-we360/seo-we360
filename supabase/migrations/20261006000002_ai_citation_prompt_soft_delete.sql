-- AI Visibility: deleting a prompt must not delete its answers.
--
-- ai_citation_runs.prompt_id references ai_citation_prompts ON DELETE CASCADE, so
-- a hard delete of a prompt erased every answer (and every cited link) ever
-- collected for it. "Delete" now just stamps deleted_at: the prompt leaves the
-- Buyer Prompts list and every future run (the app also sets active = false), but
-- its row stays, so its answers keep their persona, topic and wording and remain
-- visible on Sample answers and Citation sources.
--
-- Nullable and additive: nothing changes for existing prompts, and the app works
-- without it (a delete then pauses the prompt instead of removing the row, so
-- answers are never lost either way). Re-running is safe.
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Idempotent.

alter table public.ai_citation_prompts add column if not exists deleted_at timestamptz;

-- The Buyer Prompts list and prompt generation read only live (not deleted) rows.
create index if not exists idx_ai_cit_prompts_live
  on public.ai_citation_prompts (project_id, category)
  where deleted_at is null;

notify pgrst, 'reload schema';
