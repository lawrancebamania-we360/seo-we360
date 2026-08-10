-- Onboarding revamp - data layer (WS-2).
--
-- Adds the storage the reworked onboarding flow needs:
--   1. ai_citation_personas: AI-inferred / user personas persisted WITH their
--      description (today generatePromptSet produces rich persona descriptions
--      but saveGeneratedPrompts drops everything but the label). Powers the
--      "Review your AI-inferred personas" step + the per-persona prompt
--      accordions, and lets a user edit / disable / add personas.
--   2. projects.{analysis_focus, geo_focus, content_language, brand_summary}:
--      the focus area, geographic + language market, and the editable AI brand
--      summary the onboarding flow now collects. These feed persona + prompt
--      generation (buildGenPrompt) and the AI-citation country. Distinct from
--      projects.supports_multi_language (that's the hreflang skill toggle).
--   3. ai_citation_run_batches.progress (jsonb): per-engine progress counters
--      for the live run banner (authored here for WS-4; the banner degrades to
--      total-only progress if this column is absent).
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Every read
-- degrades gracefully before this is applied: persona reads fall back to the
-- distinct persona labels on ai_citation_prompts, the new project columns read
-- as null, and the run banner shows total-only progress. Idempotent.

-- 1. Personas ---------------------------------------------------------------
create table if not exists public.ai_citation_personas (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null,
  description text,
  source text not null default 'ai_inferred',   -- ai_inferred | user
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_cit_personas_project
  on public.ai_citation_personas(project_id, position);

alter table public.ai_citation_personas enable row level security;

-- RLS: same multi-tenant gate as every other project-scoped table
-- (see 20260623000001_ai_citation.sql).
do $$
begin
  execute 'drop policy if exists ai_citation_personas_access on public.ai_citation_personas;';
  execute 'create policy ai_citation_personas_access on public.ai_citation_personas for all using (public.has_project_access(project_id)) with check (public.has_project_access(project_id));';
end $$;

-- 2. Project focus / market / brand summary ---------------------------------
alter table public.projects add column if not exists analysis_focus text;
alter table public.projects add column if not exists geo_focus text;
alter table public.projects add column if not exists content_language text;
alter table public.projects add column if not exists brand_summary text;

-- 3. Per-engine run progress (WS-4 live banner) -----------------------------
-- Shape: { "chatgpt": {"done": 6, "total": 20}, ... }. Filled by the run
-- heartbeat; nullable-safe default so existing rows read as "no per-engine data".
alter table public.ai_citation_run_batches
  add column if not exists progress jsonb not null default '{}'::jsonb;
