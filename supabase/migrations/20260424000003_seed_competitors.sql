-- SEO · we360.ai
-- Seed the initial competitor set for the we360.ai project.
--
-- Sources:
--   - 100K Organic Plan v4 §4.1 (15 vs-competitor targets + §3 archetype matrix)
--   - GSC "Alternative+VS queries" sheet (validated impression demand per brand)
--
-- Tier split:
--   * Tier 1 — GSC-validated demand (alt/vs queries earning impressions).
--   * Tier 2 — BoF list from the plan, no direct brand-search signal yet.
--
-- `da` column holds Ahrefs Domain Rating (DR) where known (schema only has `da`,
-- the Moz scale is abandoned — we only track DR consistently with the plan).
-- `traffic` left NULL; enrich via Apify domain-authority actor + SimilarWeb.

insert into public.competitors (project_id, name, url, da, traffic, top_keywords, opportunities, notes)
values
  -- =====================================================================
  -- Tier 1 — Validated by GSC alternative/vs queries (real demand)
  -- =====================================================================
  (
    '11111111-1111-4111-8111-000000000001', 'Hubstaff', 'https://hubstaff.com', 79, null,
    '["time tracking software", "employee monitoring software", "remote work tracking", "workforce analytics"]'::jsonb,
    '[
      {"title": "Ship we360-vs-hubstaff + hubstaff-alternative pages", "reason": "2,538 GSC impressions/mo on hubstaff-alternative queries — validated mid-funnel intent."},
      {"title": "Close DR gap via link earning (we360 DR 50 vs 79)", "reason": "Backlinks, not blog volume, drives their ranking advantage (571 posts → DR 79). Data-study PR is the lever."}
    ]'::jsonb,
    'Top-of-mind brand in alt/vs queries. Ahrefs DR 79; 571 blog posts. Plan §4.1 rank #1 target.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'Time Doctor', 'https://www.timedoctor.com', 79, null,
    '["time doctor", "time tracking", "employee time tracking", "productivity monitoring"]'::jsonb,
    '[
      {"title": "Ship we360-vs-time-doctor + time-doctor-alternative", "reason": "1,970 GSC impressions/mo on time-doctor-alt queries (754 + 688 + 528)."},
      {"title": "Content pruning & topical clustering", "reason": "TD has 1,971 blogs yet DR 79 — Google rewards topical authority over volume. Our blog pruning plan (120 kill/merge) directly targets this."}
    ]'::jsonb,
    'DR 79, 1,971 blog posts. Heavy content footprint. Plan §4.1 rank #2.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'ActivTrak', 'https://www.activtrak.com', null, null,
    '["workforce analytics", "employee productivity", "remote work visibility", "user behavior analytics"]'::jsonb,
    '[
      {"title": "Ship we360-vs-activtrak + activtrak-alternative", "reason": "1,616 GSC impressions/mo across activtrak-alt/alternatives/competitors."},
      {"title": "Position on data-privacy + India compliance", "reason": "ActivTrak leans enterprise US; we can win on DPDP + India data residency."}
    ]'::jsonb,
    'Strong enterprise positioning in US. No India localization. Plan §4.1.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'DeskTime', 'https://desktime.com', null, null,
    '["desktime", "time tracking app", "auto time tracking", "productivity tracker"]'::jsonb,
    '[
      {"title": "Ship desktime-alternative page", "reason": "950 GSC impressions/mo on one query — decisive migration intent."},
      {"title": "Highlight our BPO + KPO fit vs their SMB focus", "reason": "DeskTime targets solo/SMB. We360 owns mid-market India BPO."}
    ]'::jsonb,
    'SMB-focused, lean on industry verticals. Plan §4.1.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'Insightful', 'https://www.insightful.io', null, null,
    '["workpuls", "employee monitoring", "remote team monitoring", "activity tracking"]'::jsonb,
    '[
      {"title": "Ship we360-vs-insightful + insightful-alternative", "reason": "866 GSC impressions/mo on insightful-alt queries."},
      {"title": "Counter their 160-integration scaled-page play", "reason": "Insightful programmatically scaled 160 integrations + 1,604 Spanish pages. Match the integration template (plan §4.3), skip ES localization."}
    ]'::jsonb,
    'Formerly Workpuls. 2,633 blog posts + 160 integration pages. Plan §3 archetype matrix flagged them as the programmatic leader.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'Prohance', 'https://www.prohance.net', null, null,
    '["prohance", "workforce management india", "operations analytics", "operational efficiency"]'::jsonb,
    '[
      {"title": "Own the India workforce-analytics SERP", "reason": "Prohance is our closest India rival — 203 impressions on prohance-competitors already. India is uncontested per plan §3.1(c)."},
      {"title": "Ship industries/bpo-kpo + workforce-analytics-india", "reason": "Both in the India-specific BoF list (plan §4.5)."}
    ]'::jsonb,
    'India-based operations analytics. Closest geographic + ICP match. Plan §3.1(c) India GTM anchor.'
  ),

  -- =====================================================================
  -- Tier 2 — Strategic (BoF list), awaiting Apify enrichment
  -- =====================================================================
  (
    '11111111-1111-4111-8111-000000000001', 'Teramind', 'https://www.teramind.co', 79, null,
    '["insider threat", "user activity monitoring", "data loss prevention", "employee monitoring enterprise"]'::jsonb,
    '[
      {"title": "Ship we360-vs-teramind with security + privacy framing", "reason": "Teramind is security-first — we differentiate on productivity-first workforce analytics."},
      {"title": "Link-earning focus (DR 79 with only 12 blogs = all links)", "reason": "Proves the thesis: blog volume is not the lever. Mirror their PR/data-study muscle."}
    ]'::jsonb,
    'DR 79 with just 12 blog posts — link-earning dominant. Plan §3.1(d) key evidence.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'Controlio', 'https://controlio.net', null, null,
    '["controlio", "employee monitoring cloud", "remote employee monitoring"]'::jsonb,
    '[{"title": "Ship controlio-alternative", "reason": "Listed in BoF plan §4.2."}]'::jsonb,
    'Plan §4 BoF list.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'Kickidler', 'https://www.kickidler.com', null, null,
    '["kickidler", "computer monitoring software", "live screen viewing"]'::jsonb,
    '[{"title": "Ship kickidler-alternative + we360-vs-kickidler", "reason": "Plan §4.1 / §4.2 BoF list."}]'::jsonb,
    'Plan §4 BoF list.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'Veriato', 'https://www.veriato.com', null, null,
    '["veriato", "insider risk", "employee investigation"]'::jsonb,
    '[{"title": "Ship veriato-alternative + we360-vs-veriato", "reason": "Plan §4.1 / §4.2 BoF list."}]'::jsonb,
    'Security-forensics positioned. Plan §4 BoF list.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'WorkTime', 'https://www.worktime.com', null, null,
    '["worktime", "non-invasive employee monitoring"]'::jsonb,
    '[{"title": "Ship we360-vs-worktime", "reason": "Plan §4.1 BoF list."}]'::jsonb,
    'Plan §4 BoF list.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'InterGuard', 'https://www.interguardsoftware.com', null, null,
    '["interguard", "insider threat monitoring", "DLP"]'::jsonb,
    '[{"title": "Ship we360-vs-interguard", "reason": "Plan §4.1 BoF list."}]'::jsonb,
    'Plan §4 BoF list.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'Monitask', 'https://www.monitask.com', null, null,
    '["monitask", "timesheet software", "screenshot monitoring"]'::jsonb,
    '[{"title": "Ship monitask-alternative + we360-vs-monitask", "reason": "Plan §4.1 / §4.2 BoF list."}]'::jsonb,
    'SMB-focused. Plan §4 BoF list.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'StaffCop', 'https://www.staffcop.com', null, null,
    '["staffcop", "employee monitoring software", "DLP"]'::jsonb,
    '[{"title": "Ship staffcop-alternative + we360-vs-staffcop", "reason": "Plan §4.1 / §4.2 BoF list."}]'::jsonb,
    'Plan §4 BoF list.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'Sapience Analytics', 'https://www.sapience.net', null, null,
    '["sapience", "workforce analytics enterprise", "work pattern analytics"]'::jsonb,
    '[{"title": "Ship we360-vs-sapience-analytics", "reason": "Plan §4.1 BoF list. India roots — direct competitor in our home market."}]'::jsonb,
    'India founded, now enterprise-focused. Adjacent positioning. Plan §4.1.'
  ),
  (
    '11111111-1111-4111-8111-000000000001', 'Apploye', 'https://apploye.com', null, null,
    '["apploye", "freelance time tracking", "simple time tracker"]'::jsonb,
    '[{"title": "Ship we360-vs-apploye", "reason": "Plan §4.1 BoF list."}]'::jsonb,
    'Freelance/SMB tier. Plan §4 BoF list.'
  )
on conflict do nothing;
