---
name: sync-url-metrics
version: 2.0.0
description: |
  Daily sync of GSC + GA4 metrics for every tracked URL on the we360.ai
  project. Pulls via Composio REST API (no MCP), writes results to the
  Postgres url_metrics table. Read by blog audit, task detail panels,
  Web Tasks list, and the brief data_backing auto-fill.

  Trigger this skill once a day around 10am IST. Pre-registered via the
  schedule skill — this file just orchestrates a single Node call.
license: internal
allowed-tools:
  - Bash
---

# Sync URL metrics via Composio REST API

The sync runs as a single Node script. No MCP, no orchestration loop —
the script handles everything (queue insert, per-URL GA4 + GSC pulls,
DB writes, run-status updates) end to end.

## Run

```bash
npx tsx scripts/composio/sync-url-metrics.ts
```

The script reads `COMPOSIO_API_KEY` from `.env.local` and writes to the
project's `url_metrics` and `url_metrics_runs` tables. Expected runtime:
~5-10 minutes for the current URL count (we sleep 350ms between calls to
stay well under Composio's rate limits).

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

  • Composio API key is valid (run a single test execute via the docs)
  • GA4 property ID 273620287 is correct
  • GSC site URL https://we360.ai/ is correct
  • The connected accounts in Composio dashboard are still Active

## Failure modes

  • `Composio GOOGLE_ANALYTICS_RUN_REPORT: HTTP 404` — the slug name is
    wrong for that tool. Look up the exact slug at
    https://app.composio.dev/toolkits/google_analytics and update
    `lib/integrations/composio.ts`.

  • `Composio GOOGLE_SEARCH_CONSOLE_QUERY_ANALYTICS: HTTP 403` — the
    service account or OAuth connection lost access to that GSC property.
    Reconnect in Composio dashboard.

  • Some URLs show all-zero metrics — that page genuinely has no traffic
    in the window (normal for new posts) OR the URL format mismatches
    what GSC/GA4 stores (e.g., trailing slash, http vs https). Inspect
    the URL in GSC directly to confirm.
