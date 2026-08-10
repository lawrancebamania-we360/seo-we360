-- Per-project opt-in for the monthly AI-visibility auto-refresh cron.
--
-- WHY: ai-visibility-refresh is the single most expensive scheduled job - it runs
-- a full citation pass (chat engines x N=3) per project, spending real AI + Apify
-- credits every time. Previously it processed EVERY project with active prompts,
-- automatically, weekly. That's money leaving the account on a schedule nobody
-- opted into.
--
-- Now the cron is OFF by default and monthly. It processes only projects that
-- have explicitly flipped this on in project settings. The on-demand "Run now"
-- button in the AI-Visibility tab is unaffected - a manual run is the user's own
-- choice to spend, so it never depends on this flag.

alter table public.projects
  add column if not exists ai_visibility_auto_refresh boolean not null default false;

comment on column public.projects.ai_visibility_auto_refresh is
  'Opt-in for the monthly ai-visibility-refresh cron. false (default) = the cron skips this project entirely - zero AI/Apify spend. Manual "Run now" ignores this flag.';
