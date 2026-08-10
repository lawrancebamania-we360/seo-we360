-- Onboarding v3 - persona lock (Workstream C, §6).
--
-- Gumshoe-style "3 unlocked + 3 locked" personas for email-signup / no-Google
-- projects: the post-onboarding orchestrator (C2) marks 3 of the 6 generated
-- personas locked so the first citation run only spends on the unlocked 3
-- (~15 credits vs ~30). Connecting Google later (C5) clears the flag and
-- regenerates with real GSC queries.
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Idempotent.
-- Guarded best-effort in code until applied: reads/writes of `locked` degrade to
-- "nothing locked" (all 6 personas unlocked, full run) if the column is absent -
-- exactly the connected-project behaviour, so a not-yet-migrated env is safe.

alter table public.ai_citation_personas
  add column if not exists locked boolean not null default false;
