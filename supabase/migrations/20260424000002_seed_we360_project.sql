-- SEO · we360.ai
-- Single-project seed. The dashboard is locked to one project (we360.ai) —
-- no UI to create additional projects. Upserts so re-running is safe.

insert into public.projects (id, name, domain, industry, country, timezone, is_active)
values (
  '11111111-1111-4111-8111-000000000001',
  'we360.ai',
  'we360.ai',
  'Workforce Analytics SaaS',
  'IN',
  'Asia/Kolkata',
  true
)
on conflict (domain) do update set
  name       = excluded.name,
  industry   = excluded.industry,
  is_active  = true;

-- Seed one pillar_score row per pillar so Overview renders immediately (scores
-- start at 0 and get recomputed by the weekly cron).
insert into public.pillar_scores (project_id, pillar, score, breakdown, top_issues)
select
  '11111111-1111-4111-8111-000000000001'::uuid,
  p.pillar::text,
  0,
  '{}'::jsonb,
  '["Awaiting first audit"]'::jsonb
from unnest(array['SEO', 'AEO', 'GEO', 'SXO', 'AIO']) as p(pillar)
on conflict do nothing;
