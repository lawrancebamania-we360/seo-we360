-- AI-Visibility trust features: transcript evidence drawer + brand-sentiment
-- tiers + persona x funnel-stage matrix.
--
-- IMPORTANT: nothing here is REQUIRED for the code to work. Full answer
-- transcripts already live in ai_citation_runs.answer_text (stored since
-- 20260623000001, capped at 8000 chars at write time), and the sentiment pass
-- reuses that migration's until-now-unused ai_citation_runs.sentiment column.
-- This migration only (a) documents the new sentiment vocabulary and (b) adds
-- two indexes that keep the new reads cheap as run history grows.
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Safe to apply
-- any time, before or after the code deploys.

-- The post-hoc classifier writes plain-English tiers (Otterly-style framing),
-- superseding the original pos|neu|neg idea that was never implemented.
comment on column public.ai_citation_runs.sentiment is
  'Brand-mention sentiment tier, classified post-hoc by the lazy sentiment pass: recommended | with_caveats | dismissed. NULL = not yet classified. Only rows with project_mentioned = true are classified.';

-- The report, the evidence drawer and the sentiment pass all read a whole batch
-- by run_batch_id; until now that scanned the project index.
create index if not exists idx_ai_cit_runs_batch
  on public.ai_citation_runs(run_batch_id);

-- The sentiment pass looks up "mentioned but not yet classified" rows per
-- project; partial index keeps it O(todo) instead of O(all runs).
create index if not exists idx_ai_cit_runs_sentiment_todo
  on public.ai_citation_runs(project_id)
  where project_mentioned and sentiment is null and error is null;
