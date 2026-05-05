-- SEO · we360.ai: blog brief column + backfill for existing blog tasks
-- Stores the full article brief (H1/H2/H3/sections/PAA/links/notes) for blog tasks.
-- Generated programmatically by the Apify cron; editable in the UI.

alter table public.tasks
  add column if not exists brief jsonb;

create index if not exists idx_tasks_brief_gin on public.tasks using gin (brief);

-- ============================================================
-- Backfill a default brief for seeded SkyHigh blog tasks
-- ============================================================
update public.tasks t
set brief = jsonb_build_object(
  'title', t.title,
  'target_keyword', t.target_keyword,
  'secondary_keywords', jsonb_build_array(
    t.target_keyword || ' india',
    t.target_keyword || ' cost',
    t.target_keyword || ' near me'
  ),
  'intent', coalesce(t.intent, 'informational'),
  'recommended_h1',
    case
      when t.target_keyword ilike 'is %' then initcap(t.target_keyword) || '? Everything You Need to Know in 2026'
      when t.target_keyword ilike 'how to %' then initcap(t.target_keyword) || ': Step-by-Step Guide (2026)'
      when t.target_keyword ilike 'best %' then initcap(t.target_keyword) || ': Top Picks for 2026'
      else initcap(t.target_keyword) || ': The Complete 2026 Guide'
    end,
  'recommended_h2s', jsonb_build_array(
    'What is ' || t.target_keyword || '?',
    'How ' || t.target_keyword || ' works',
    'Benefits and what to expect',
    'Best locations and pricing in India',
    'How SkyHigh India gets you there'
  ),
  'recommended_h3s', jsonb_build_array(
    'Safety standards and equipment',
    'Age, weight and fitness requirements',
    'First-timer vs experienced jumper',
    'Weather conditions and best season',
    'Booking and preparation',
    'What happens during the jump',
    'After-jump experience and certificate',
    'Common myths debunked'
  ),
  'sections_breakdown', jsonb_build_array(
    'Introduction: why this topic matters for adventure seekers',
    'Section 1: what the keyword actually means + quick summary (TL;DR)',
    'Section 2: detailed step-by-step / explanation',
    'Section 3: pros, cons, considerations',
    'Section 4: locations / pricing / booking in India',
    'Section 5: how SkyHigh India delivers this experience',
    'FAQ: 5 PAA questions with schema-ready answers',
    'Conclusion: clear CTA to book or read related article'
  ),
  'word_count_target', coalesce(t.word_count_target, 1500),
  'paa_questions', jsonb_build_array(
    'How much does ' || t.target_keyword || ' cost in India?',
    'Is ' || t.target_keyword || ' safe for beginners?',
    'What is the best age for ' || t.target_keyword || '?',
    'Where can I do ' || t.target_keyword || ' in India?',
    'How long does the whole experience take?'
  ),
  'internal_links', jsonb_build_array(
    '/tandem-skydiving',
    '/locations/mysore',
    '/pricing',
    '/faq'
  ),
  'competitor_refs', jsonb_build_array(
    'Thrillophilia skydiving India guide',
    'Indian Skydiving Federation official rules',
    'Local Dropzone regulations'
  ),
  'writer_notes', jsonb_build_array(
    'Use first-person reassurance in intro — skydiving triggers fear, address it early',
    'Include a visible safety-standards callout block',
    'Cite DGCA regulations for India section',
    'Add 2–3 images: hero drop shot, instructor briefing, landing',
    'Strong CTA: "Book Your First Jump" with /online-shop link'
  ),
  'generated_by', 'heuristic'
)
where t.kind = 'blog_task'
  and t.brief is null
  and t.project_id = '00000000-0000-4000-8000-000000000001';
