-- Apply these together in your SEO-We360 Supabase SQL Editor.
-- Safe to re-run: all statements are idempotent.

-- ============================================================
-- (1) Backfill: pull GA4 property_id + GSC property_url from the
--     integrations.config JSONB into the projects row. The overview
--     page + crons consume these from projects, not integrations.
-- ============================================================
update public.projects p
set ga4_property_id = i.config->>'property_id'
from public.integrations i
where i.provider = 'ga4'
  and i.config ? 'property_id'
  and p.is_active = true
  and (p.ga4_property_id is null or p.ga4_property_id <> i.config->>'property_id');

update public.projects p
set gsc_property_url = i.config->>'property_url'
from public.integrations i
where i.provider = 'gsc'
  and i.config ? 'property_url'
  and p.is_active = true
  and (p.gsc_property_url is null or p.gsc_property_url <> i.config->>'property_url');

-- ============================================================
-- (2) New migration: 20260424000004_seed_bof_and_p0_tasks.sql
--     Seeds 5 P0 technical tasks + 50 BoF content tasks from the
--     100K Organic Plan (vs-competitor, alternative-to, integrations,
--     industries, India-specific).
-- ============================================================
do $$
declare
  v_project_id uuid;
  v_created_by uuid;
begin
  select id into v_project_id from public.projects where domain = 'we360.ai' limit 1;
  if v_project_id is null then
    raise notice 'Skipping seed: we360.ai project row missing.';
    return;
  end if;

  select id into v_created_by from public.profiles
    where platform_admin = true or role in ('super_admin', 'admin')
    order by created_at asc limit 1;

  -- P0 fixes (Plan §2.6) ---------------------------------------
  insert into public.tasks (project_id, title, kind, priority, pillar, source, scheduled_date, status, issue, impl, created_by) values
    (v_project_id, 'P0-1 · Fix sitemap.xml parsing error (317 URLs hidden from Google)', 'web_task', 'critical', 'SEO', 'cron_audit', current_date, 'todo',
     'sitemap.xml has 2 concatenated XML documents; the Google parser stops at line 621. Only 103 of 420 URLs are being discovered.',
     'Split sitemap into a single valid XML document (or use an index + child sitemaps). Resubmit in GSC. Expected +30-50% indexed URLs within 4 weeks.',
     v_created_by),
    (v_project_id, 'P0-2 · Resolve indexation crisis (50% of pages not indexed)', 'web_task', 'critical', 'SEO', 'cron_audit', current_date + 3, 'todo',
     '496 of 998 URLs not indexed. 186 crawled-not-indexed = thin content; 152 redirect chains; 78 404s.',
     'Audit & prune 186 thin pages; flatten 152 redirect chains; fix / 301 the 78 404s. Recover crawl budget + link equity.',
     v_created_by),
    (v_project_id, 'P0-3 · Disavow toxic backlinks (teamrelated.com PBN — 924 links)', 'web_task', 'critical', 'SEO', 'cron_audit', current_date + 1, 'todo',
     '72% of external links come from a single PBN (teamrelated.com) with 924 bot-generated exact-match anchors.',
     'Compile disavow file; submit via Google Disavow Tool. DR may dip initially, recovers with cleaner profile.',
     v_created_by),
    (v_project_id, 'P0-4 · Mobile Core Web Vitals (134 URLs, zero good rated)', 'web_task', 'critical', 'SXO', 'cron_audit', current_date + 2, 'todo',
     'Zero mobile URLs rated good by CrUX. Mobile page speed + CLS are the culprits. India = 73% of our traffic, 100% mobile.',
     'Compress hero images, defer non-critical JS, reserve image dimensions to kill CLS. Target 3 good URLs week 1, 50+ by week 4.',
     v_created_by),
    (v_project_id, 'P0-5 · Add JSON-LD schema (Breadcrumbs, FAQ, Product)', 'web_task', 'critical', 'AEO', 'cron_audit', current_date + 2, 'todo',
     'Breadcrumbs on 3% of pages, FAQ on 2%, zero Product/Review schema. Rich results lift SERP CTR 20-40% where shown.',
     'Add Breadcrumbs + FAQ + Product schema to the page template. Validate with schema.org validator. Ship on all templates.',
     v_created_by)
  on conflict do nothing;

  -- 15 vs-competitor pages (§4.1) ------------------------------
  insert into public.tasks (project_id, title, kind, priority, pillar, source, scheduled_date, status, target_keyword, word_count_target, competition, intent, issue, impl, created_by)
  select
    v_project_id,
    'Write vs-competitor page: we360-vs-' || slug,
    'blog_task',
    case when rank <= 6 then 'high' else 'medium' end,
    'SEO',
    'cron_audit',
    (current_date + (30 + rank * 2) * interval '1 day')::date,
    'todo',
    'we360 vs ' || display_name,
    2200,
    'Medium Competition',
    'commercial',
    'Competitor-validated mid-funnel evaluator intent. ' || impressions_note,
    'Feature-by-feature comparison, price table, verdict-by-use-case, ICP fit matrix. Link from /pricing + /features.',
    v_created_by
  from (values
    (1,  'hubstaff',          'Hubstaff',          '2,538 GSC impressions/mo on hubstaff-alt queries.'),
    (2,  'time-doctor',       'Time Doctor',       '1,970 GSC impressions/mo on time-doctor-alt queries.'),
    (3,  'activtrak',         'ActivTrak',         '1,616 GSC impressions/mo on activtrak-alt queries.'),
    (4,  'desktime',          'DeskTime',          '950 GSC impressions/mo on desktime-alternative.'),
    (5,  'insightful',        'Insightful',        '866 GSC impressions/mo on insightful-alt queries.'),
    (6,  'teramind',          'Teramind',          'DR 79 with only 12 blog posts — link-earning leader.'),
    (7,  'controlio',         'Controlio',         'Plan §4.1 BoF list.'),
    (8,  'kickidler',         'Kickidler',         'Plan §4.1 BoF list.'),
    (9,  'veriato',           'Veriato',           'Security-forensics positioned competitor.'),
    (10, 'worktime',          'WorkTime',          'Plan §4.1 BoF list.'),
    (11, 'interguard',        'InterGuard',        'DLP / insider-threat positioning.'),
    (12, 'monitask',          'Monitask',          'SMB-focused competitor.'),
    (13, 'staffcop',          'StaffCop',          'Plan §4.1 BoF list.'),
    (14, 'sapience-analytics','Sapience Analytics','India-founded, enterprise-focused — direct home-market rival.'),
    (15, 'apploye',           'Apploye',           'Freelance/SMB tier competitor.')
  ) as t(rank, slug, display_name, impressions_note)
  on conflict do nothing;

  -- 12 alternative-to pages (§4.2) -----------------------------
  insert into public.tasks (project_id, title, kind, priority, pillar, source, scheduled_date, status, target_keyword, word_count_target, competition, intent, issue, impl, created_by)
  select
    v_project_id,
    'Write alternative-to page: ' || slug,
    'blog_task',
    case when rank <= 5 then 'high' else 'medium' end,
    'SEO',
    'cron_audit',
    (current_date + (60 + rank * 2) * interval '1 day')::date,
    'todo',
    target_kw,
    1800,
    'Medium Competition',
    'transactional',
    'Migration intent — searcher is decided to leave a competitor.',
    'Structure: migration guide, feature mapping, pricing delta, 5-step switch plan, CTA to book a demo.',
    v_created_by
  from (values
    (1,  'hubstaff-alternative',                          'hubstaff alternative'),
    (2,  'time-doctor-alternative',                       'time doctor alternative'),
    (3,  'teramind-alternative',                          'teramind alternative'),
    (4,  'activtrak-alternative',                         'activtrak alternative'),
    (5,  'desktime-alternative',                          'desktime alternative'),
    (6,  'insightful-alternative',                        'insightful alternative'),
    (7,  'kickidler-alternative',                         'kickidler alternative'),
    (8,  'controlio-alternative',                         'controlio alternative'),
    (9,  'veriato-alternative',                           'veriato alternative'),
    (10, 'monitask-alternative',                          'monitask alternative'),
    (11, 'staffcop-alternative',                          'staffcop alternative'),
    (12, 'employee-monitoring-software-alternatives',     'employee monitoring software alternatives')
  ) as t(rank, slug, target_kw)
  on conflict do nothing;

  -- 8 integration pages (§4.3) ---------------------------------
  insert into public.tasks (project_id, title, kind, priority, pillar, source, scheduled_date, status, target_keyword, word_count_target, competition, intent, issue, impl, created_by)
  select
    v_project_id,
    'Write integration page: ' || tool,
    'blog_task',
    'medium',
    'SEO',
    'cron_audit',
    (current_date + (90 + rank * 2) * interval '1 day')::date,
    'todo',
    'we360 ' || tool || ' integration',
    500,
    'Low Competition',
    'commercial',
    'Template-able high-intent page. Insightful scaled to 160 integration pages.',
    'Logo, value prop, 3-5 use cases, setup steps, screenshot. ~400 words unique + shared shell.',
    v_created_by
  from (values
    (1, 'slack'),            (2, 'microsoft-teams'),
    (3, 'google-workspace'), (4, 'asana'),
    (5, 'jira'),             (6, 'zoom'),
    (7, 'notion'),           (8, 'hubspot')
  ) as t(rank, tool)
  on conflict do nothing;

  -- 10 industry pages (§4.4) -----------------------------------
  insert into public.tasks (project_id, title, kind, priority, pillar, source, scheduled_date, status, target_keyword, word_count_target, competition, intent, issue, impl, created_by)
  select
    v_project_id,
    'Write industry page: industries/' || slug,
    'blog_task',
    case when rank <= 4 then 'high' else 'medium' end,
    'SEO',
    'cron_audit',
    (current_date + (105 + rank * 3) * interval '1 day')::date,
    'todo',
    target_kw,
    1800,
    'Medium Competition',
    'commercial',
    'Industry-specific pain point + compliance — India-weighted.',
    'Industry pain, DPDP/compliance angle (IN), feature mapping, 2 case studies, ROI calculator embed.',
    v_created_by
  from (values
    (1, 'bpo-kpo',         'employee monitoring software bpo'),
    (2, 'it-services',     'workforce analytics it services'),
    (3, 'banking-finance', 'employee monitoring banking compliance'),
    (4, 'healthcare',      'employee monitoring healthcare hipaa'),
    (5, 'ecommerce',       'employee productivity software ecommerce'),
    (6, 'legal',           'employee monitoring law firms'),
    (7, 'accounting-firms','workforce analytics accounting firms'),
    (8, 'real-estate',     'employee monitoring real estate'),
    (9, 'manufacturing',   'workforce productivity manufacturing'),
    (10,'consulting',      'employee productivity consulting')
  ) as t(rank, slug, target_kw)
  on conflict do nothing;

  -- 5 India-specific pages (§4.5) ------------------------------
  insert into public.tasks (project_id, title, kind, priority, pillar, source, scheduled_date, status, target_keyword, word_count_target, competition, intent, issue, impl, created_by)
  select
    v_project_id,
    'Write India page: ' || slug,
    'blog_task',
    'high',
    'GEO',
    'cron_audit',
    (current_date + (45 + rank * 2) * interval '1 day')::date,
    'todo',
    target_kw,
    1500,
    'Low Competition',
    'commercial',
    '0/8 competitors localized to India; SERPs weak. Expected top-3 in 60-90 days.',
    'Ship under /in/ or /india/ with hreflang en-IN. Include DPDP + IT Act context, ₹ pricing, Indian case studies.',
    v_created_by
  from (values
    (1, 'employee-monitoring-software-india',       'employee monitoring software india'),
    (2, 'attendance-tracking-software-india',       'attendance tracking software india'),
    (3, 'time-tracking-for-indian-bpo',             'time tracking for indian bpo'),
    (4, 'workforce-analytics-india',                'workforce analytics india'),
    (5, 'productivity-software-for-indian-enterprises', 'productivity software for indian enterprises')
  ) as t(rank, slug, target_kw)
  on conflict do nothing;

end $$;
