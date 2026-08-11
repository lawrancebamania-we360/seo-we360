-- Google OAuth (user-delegated) connection support.
--
-- The "Connect with Google" flow stores a GLOBAL (project_id IS NULL) integration
-- row under a new provider 'google', whose config jsonb holds the AES-256-GCM
-- encrypted refresh token + the connected email. GA4/GSC reads prefer this OAuth
-- token over the service account, so no robot email has to be added to each
-- property — the dashboard reads as the connected Google user.
--
-- Additive + idempotent: only widens the provider CHECK constraint.

alter table public.integrations drop constraint if exists integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check
  check (provider in (
    'apify', 'ga4', 'gsc', 'pagespeed', 'claude', 'openai', 'supabase', 'google'
  ));
