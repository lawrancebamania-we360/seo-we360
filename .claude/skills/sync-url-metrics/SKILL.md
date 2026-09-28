---
name: sync-url-metrics
version: 4.0.0
description: |
  Daily sync of GSC + GA4 metrics for every tracked URL on the we360.ai
  project. Runs as 5 hour-staggered Vercel Cron invocations of
  /api/cron/url-metrics (native "Connect with Google" OAuth, no
  third-party broker), each resuming from a DB cursor where the last one
  left off, writing to the Postgres url_metrics table. Read by blog
  audit, task detail panels, Web Tasks list, and the brief data_backing
  auto-fill.

  Production runs itself daily via vercel.json's cron entries - this
  skill is for a manual/local full drain (backfill, testing, or checking
  in on a stuck day), not something to trigger on a schedule yourself.
license: internal
allowed-tools:
  - Bash
---

# Sync URL metrics (native GA4 + GSC, resumable)

Production sync is fully automatic: 5 cron entries in `vercel.json`
(`10 22/23/0/1/2 * * *` UTC) each hit `/api/cron/url-metrics`, which calls
`runUrlMetricsTick()` in `lib/cron/url-metrics.ts`. The first tick of a day
builds the URL list and starts a `url_metrics_runs` row; every later tick
that day resumes from its persisted `next_index` cursor. No MCP, no
third-party broker - auth is the same native OAuth token every other live
GA4/GSC read in the app uses.

## Manual / local full drain

```bash
npx tsx scripts/sync-url-metrics.ts
```

This loops calling the same `runUrlMetricsTick()` the cron route uses,
with a generous local budget, until today's run reports `completed`. Safe
to run anytime - it's idempotent: if today's run is already `completed`
(production already finished it), this exits immediately as a no-op.

Needs `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and
`OAUTH_TOKEN_ENCRYPTION_KEY` in `.env.local` (same values as Vercel) to
decrypt the refresh token stored in the `integrations` table.

## Report

When it finishes, report:

1. The `run_id` from the last pass.
2. `next_index`/`tasksTotal` and how many URLs were covered.
3. Whether it finished `completed` or is still `in_progress` (ran out of
   local budget - just run it again to continue).

Then run this SQL to verify a few sample rows landed correctly:

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!.trim());
(async () => {
  const { data } = await a
    .from('url_metrics_latest')
    .select('url, period, gsc_clicks, gsc_impressions, ga_sessions')
    .eq('project_id', '11111111-1111-4111-8111-000000000001')
    .order('gsc_clicks', { ascending: false })
    .limit(10);
  console.table(data);
})();
"
```

If you see URLs with non-zero GSC clicks and GA4 sessions, the sync is
working. If everything is zero, check:

  • The "Connect with Google" connection is still active on the
    Integrations page (Reconnect if it shows disconnected).
  • GA4 property ID 273620287 is correct.
  • GSC site URL https://we360.ai/ is correct.
  • The scopes granted include `analytics.readonly` and
    `webmasters.readonly` (Google Cloud Console -> OAuth consent screen ->
    Data access).

## Checking whether today's cron ticks actually ran

```bash
npx tsx -e "
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });
const a = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!.trim());
(async () => {
  const { data } = await a.from('url_metrics_runs')
    .select('run_date, status, next_index, urls_total, urls_succeeded, urls_failed, started_at, finished_at')
    .order('run_date', { ascending: false }).limit(5);
  console.table(data);
})();
"
```

`status='running'` with `next_index` below the total after all 5 scheduled
ticks have passed for the day means the batches aren't keeping up (rare -
would mean the URL list grew a lot, or GA4/GSC latency spiked) - run the
manual drain above to catch it up, and consider adding a 6th staggered
cron entry to `vercel.json` if it happens repeatedly.

## Failure modes

  • `status='failed'` for today - a task-level error crashed the tick
    (shouldn't happen normally; GSC/GA4 per-task errors are caught and
    counted, not thrown). Check the Vercel function logs for
    `/api/cron/url-metrics` for the stack trace. That day is skipped;
    tomorrow starts a fresh run automatically.

  • `GA4 URL-snapshot query failed (403)` / `GSC URL-snapshot query failed
    (403)` - the connected Google account lost access to that property.
    Reconnect via the Integrations page.

  • `Google not connected...` - the OAuth refresh token is missing or
    invalid. Reconnect via the Integrations page's "Connect with Google"
    card, or check that `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET` still match
    what's in Google Cloud Console (a rotated secret breaks this).

  • Some URLs show all-zero metrics - that page genuinely has no traffic
    in the window (normal for new posts) OR the URL format mismatches
    what GSC/GA4 stores (e.g., trailing slash, http vs https). Inspect
    the URL in GSC directly to confirm.
