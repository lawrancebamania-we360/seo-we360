---
name: sync-url-metrics
version: 1.0.0
description: |
  Daily sync of GSC + GA4 metrics for every tracked URL on the we360.ai
  project. Uses Composio MCP (already configured for Google Analytics +
  Google Search Console) to pull data for 30/60/90 day windows, writes
  results to the Postgres url_metrics table. The dashboard reads from
  that table — blog audit decisions, task detail performance panels,
  data_backing auto-fill, etc.

  Trigger this skill once a day around 10am IST. The user has already
  registered it via the schedule skill — this file is the per-invocation
  instruction sheet.
license: internal
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
---

# Sync URL metrics via Composio

You're pulling fresh GSC + GA4 data for every URL the SEO We360 dashboard
tracks, then writing the results to Postgres so the dashboard surfaces
them in real time.

## Configuration

These values live in `.env.local` and the Composio MCP config — you don't
need to know the secrets, but reference them as variables here:

- **Project ID**: `11111111-1111-4111-8111-000000000001` (we360.ai)
- **GA4 property ID**: `273620287`
- **GSC site URL**: `https://we360.ai/`

The Composio MCP server is registered as `composio` in
`.claude/settings.local.json` and exposes Google Analytics + Google Search
Console tools — call them by their Composio action names.

## Step 1 — open the run

```bash
npx tsx scripts/composio/start-sync-run.ts 11111111-1111-4111-8111-000000000001
```

Capture the printed UUID; that's your `<run_id>`. Every metric write needs it.

## Step 2 — list URLs to sync

```bash
npx tsx scripts/composio/list-target-urls.ts 11111111-1111-4111-8111-000000000001
```

Returns a JSON array of URLs. In Phase 1 this is task-linked URLs plus the
homepage and a few key landing pages — usually 50-100 URLs.

## Step 3 — for each URL × each period (30d / 60d / 90d), pull data

For each URL, do these three windows. Three GSC calls + three GA4 calls per URL.

### 3a. Google Search Console — performance query

Use the Composio GSC tool (the action that runs a Search Analytics query).
Parameters:

- `siteUrl`: `https://we360.ai/` (the GSC property)
- `startDate` / `endDate`: today − N days / today, where N is 30, 60, or 90
- `dimensions`: `["query"]` — so we get per-query breakdown
- `dimensionFilterGroups`: filter `page` equals the URL we're checking
- `rowLimit`: 25 (top 25 queries)

Aggregate the response:
- `gsc_clicks` = sum of clicks across all returned rows
- `gsc_impressions` = sum of impressions
- `gsc_position` = avg position (clicks-weighted if you want fidelity)
- `gsc_ctr` = gsc_clicks / max(1, gsc_impressions)
- `gsc_top_queries` = first 10 rows formatted as `{query, clicks, impressions, position}`

### 3b. Google Analytics 4 — runReport

Use the Composio GA4 tool (the action that calls `runReport` on a property).
Parameters:

- `property`: `properties/273620287`
- `dateRanges`: `[{ startDate: "Ndaysago", endDate: "today" }]`
- `dimensions`: `[{ name: "pagePath" }]`
- `metrics`: `sessions`, `engagedSessions`, `engagementRate`, `averageSessionDuration`, `bounceRate`, `conversions`
- `dimensionFilter`: filter `pagePath` matches the URL's path

Aggregate:
- `ga_sessions` = sum of sessions
- `ga_engaged_sessions` = sum of engagedSessions
- `ga_engagement_rate` = engaged / max(1, sessions)
- `ga_avg_engagement_time` = avg (or weighted avg) — in seconds
- `ga_bounce_rate` = avg bounce rate
- `ga_conversions` = sum

Also fetch top referrers with a second tiny report:
- `dimensions`: `[{ name: "sessionSource" }]`
- `metrics`: `sessions`
- Limit 5

### 3c. Write the row

For each (url × period), build a metric JSON object:

```json
{
  "url": "https://we360.ai/blog/something",
  "period": "30d",
  "gsc_clicks": 142,
  "gsc_impressions": 5210,
  "gsc_ctr": 0.0273,
  "gsc_position": 12.3,
  "gsc_top_queries": [
    { "query": "...", "clicks": 30, "impressions": 800, "position": 8.5 }
  ],
  "ga_sessions": 220,
  "ga_engaged_sessions": 165,
  "ga_engagement_rate": 0.75,
  "ga_avg_engagement_time": 142,
  "ga_bounce_rate": 0.25,
  "ga_conversions": 3,
  "ga_top_referrers": [{ "source": "google", "sessions": 200 }]
}
```

Save it to `/tmp/metric_<idx>.json` using the `Write` tool, then:

```bash
npx tsx scripts/composio/write-metric.ts <run_id> 11111111-1111-4111-8111-000000000001 /tmp/metric_<idx>.json
```

## Step 4 — close out

After every URL × period is processed (or failed):

```bash
npx tsx scripts/composio/finish-sync-run.ts <run_id> <total_urls_attempted>
```

If a fatal error stopped the run mid-way, pass the error message as the
third argument and the run will be marked `failed`.

## Step 5 — report

Print a one-line summary:

```
✅ Sync complete · 87 URLs × 3 periods = 261 metrics · 3 failed
```

## Notes

- **Be conservative with API calls.** Composio free tier is ~500 actions/month.
  87 URLs × 3 periods × 2 calls (GSC + GA4) = 522 calls — already at the
  edge. Plus referrers = closer to 700. Watch the quota; if we hit it,
  drop the 60d window for Phase 1 (only do 30d and 90d) and revisit later.
- **Sleep 200ms between calls** so Google's rate limit doesn't kick us out
  mid-run.
- **URL → pagePath conversion.** GA4 wants `/blog/foo`, GSC wants the full
  URL. Strip the origin when sending to GA4.
- **Empty results are valid.** If a URL has zero impressions, the row should
  still be written with zeros — that's how the blog audit knows to flag it
  for prune.
