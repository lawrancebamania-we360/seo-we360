---
name: sync-url-metrics
version: 3.0.0
description: |
  Daily sync of GSC + GA4 metrics for every tracked URL on the we360.ai
  project. Pulls via the app's own native "Connect with Google" OAuth token
  (lib/google/auth.ts), writes results to the Postgres url_metrics table.
  Read by blog audit, task detail panels, Web Tasks list, and the brief
  data_backing auto-fill.

  Trigger this skill once a day around 10am IST. Pre-registered via the
  schedule skill — this file just orchestrates a single Node call.
license: internal
allowed-tools:
  - Bash
---

# Sync URL metrics via native GA4 + GSC APIs

The sync runs as a single Node script. No MCP, no orchestration loop, no
third-party broker — the script handles everything (queue insert, per-URL
GA4 + GSC pulls, DB writes, run-status updates) end to end, authenticating
via the same "Connect with Google" OAuth connection the live app uses.

## Run

```bash
npx tsx scripts/sync-url-metrics.ts
```

The script needs `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and
`OAUTH_TOKEN_ENCRYPTION_KEY` in `.env.local` (same values as Vercel) to
decrypt the refresh token stored in the `integrations` table, and writes to
the project's `url_metrics` and `url_metrics_runs` tables. Expected runtime:
~5-10 minutes for the current URL count (a light 150ms delay between calls
keeps well under GA4/GSC's own rate limits).

## Report

When the script finishes, report:

1. The `run_id` printed at the start.
2. How many URLs were processed and how many failed.
3. The final line of output.

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

## Failure modes

  • `GA4 URL-snapshot query failed (404)` — the GA4 property ID is wrong,
    or the connected Google account lost access to that property.

  • `GSC URL-snapshot query failed (403)` — the connected Google account
    lost access to that Search Console property. Reconnect via the
    Integrations page.

  • `Google not connected...` — the OAuth refresh token is missing or
    invalid. Reconnect via the Integrations page's "Connect with Google"
    card, or check that `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET` still match
    what's in Google Cloud Console (a rotated secret breaks this).

  • Some URLs show all-zero metrics — that page genuinely has no traffic
    in the window (normal for new posts) OR the URL format mismatches
    what GSC/GA4 stores (e.g., trailing slash, http vs https). Inspect
    the URL in GSC directly to confirm.
