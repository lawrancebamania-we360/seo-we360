-- Ticket 9: budget-cap tracking for the 3 AI-Visibility-specific engine keys
-- (distinct from the existing 'claude'/'openai' BYOK article-gen providers -
-- these are OUR platform keys with real ongoing spend, not a per-request pasted
-- key). Google-AIO reuses the EXISTING 'apify' provider (same vendor account).
--
-- Apply MANUALLY in Supabase (Vercel does not run migrations). Idempotent.

alter table public.integrations drop constraint if exists integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check
  check (provider in (
    'apify', 'ga4', 'gsc', 'pagespeed', 'claude', 'openai', 'supabase', 'google',
    'ai_visibility_chatgpt', 'ai_visibility_claude', 'ai_visibility_gemini'
  ));
