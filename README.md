# SEO-We360 — Internal SEO Command Dashboard

The internal SEO ops dashboard for **[we360.ai](https://we360.ai)** — a 5-pillar
optimization health model (SEO, AEO, GEO, SXO, AIO) that tracks the
we360.ai marketing site, runs daily audits, and drives the 100K-organic-traffic
content plan.

## Stack

- **Next.js 16** (App Router, React 19, TypeScript)
- **Tailwind v4** + **shadcn/ui** (Base UI primitives)
- **motion** (motion.dev/react) for animations
- **Supabase** (Postgres, Auth, Storage) — multi-tenant via `project_id` + RLS
- **Vercel** for hosting + scheduled cron

## First-time setup

### 1. Install dependencies

```bash
npm install
```

### 2. Supabase — create project & run migrations

1. Create a Supabase project, then copy the `service_role` key from **Dashboard → Project Settings → API → Secret keys**.
2. Copy `.env.local.example` → `.env.local` and fill in `SUPABASE_SERVICE_ROLE_KEY` (anon key is pre-filled).
3. Run the migrations in order via the Supabase SQL editor:
   - `supabase/migrations/20260418000001_initial_schema.sql`
   - `supabase/migrations/20260418000002_rls_policies.sql`
   - `supabase/migrations/20260418000003_triggers_and_functions.sql`
   - `supabase/migrations/20260418000004_seed.sql`

### 3. Google OAuth

**Supabase Dashboard → Authentication → Providers → Google** — enable and paste your Google Cloud OAuth client ID + secret. Set the authorized redirect URI to:

```
https://<your-supabase-ref>.supabase.co/auth/v1/callback
```

The app domain-gates auth — only `@we360.ai` accounts can sign in.

### 4. First super admin

The DB trigger `handle_new_user()` automatically assigns `role = 'super_admin'`
when the email matches the bootstrap address configured in
`supabase/migrations/20260418000003_triggers_and_functions.sql`. Sign up via
Google with a `@we360.ai` workspace account that matches that address and
you'll land in the dashboard as super admin.

### 5. Run dev

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

## Scheduled cron (Vercel)

`vercel.json` schedules three jobs:

| Path | Schedule | Purpose |
|------|----------|---------|
| `/api/cron/daily-audit` | `30 5 * * *` (05:30 UTC ≈ 11:00 IST) | 8-phase site audit |
| `/api/cron/blog-discovery` | `30 3 * * 1` (Mondays) | Apify keyword discovery |
| `/api/cron/monthly-intelligence` | `0 3 1 * *` (1st of month) | Competitor + SERP refresh |

The daily cron runs 8 phases per project:

| Phase | What it does | When |
|-------|--------------|------|
| 1 | Site crawl + SEO audit (title/meta/H1/canonical/OG/schema/robots/images) | Daily |
| 2 | Task verification (auto-close completed work) | Daily |
| 3 | Discover new issues, create tasks | Daily |
| 4 | PageSpeed Insights (mobile + desktop) | Daily |
| 5 | Keyword ranking updates via GSC | Daily |
| 6 | Apify keyword discovery (5–6 new keywords/week) | Mondays only |
| 7 | Recalculate 5 pillar scores (deterministic, with breakdown) | Daily |
| 8 | Competitor check (DA, traffic, new keywords) | Wednesdays only |

### Cron auth

Generate a secret and set `CRON_SECRET` in your Vercel env vars:

```bash
openssl rand -base64 32
```

Vercel sends `Authorization: Bearer <CRON_SECRET>` automatically for scheduled cron paths when the env var is set.

### Manual trigger (for testing)

```bash
curl -X POST https://your-domain.vercel.app/api/cron/daily-audit \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Multi-tenancy

Every row in every data table carries `project_id`. RLS policies enforce:

- **Super admins & admins** see everything across all projects.
- **Members** see only projects they're in `project_memberships` for, and only for sections they have `member_permissions` enabled for (app layer check).

Project switching in the sidebar writes a cookie (`seo-we360.active_project_id`) + updates `profiles.active_project_id` so it persists across devices.

## Article generation (BYOK)

The dashboard **never stores AI API keys**. When a user clicks "Generate article":

1. A modal asks for their Claude or OpenAI key.
2. The key is sent to `/api/articles/generate` for that single request only.
3. Users can opt to remember the key in `sessionStorage` (wiped on tab close) — never written to disk, never sent to any third party.

Users can also upload a pre-written `.md` article or paste one in.

Approval workflow: `draft → review → approved/rejected → published`. Admins and super-admins can transition states.

## Adding a new project

Click the project switcher in the sidebar (super admins & admins only) → **New project**. You'll be asked for:

- Name + domain
- Industry
- GA4 property ID (optional, will be wired in on first cron run)
- GSC property (optional)

## Deployment

Git push to `main` → Vercel auto-deploys. Make sure these env vars are set on Vercel:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
CRON_SECRET
APIFY_TOKEN
APIFY_ACTOR_ID
GOOGLE_SERVICE_ACCOUNT_JSON
PAGESPEED_API_KEY
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_APP_NAME
NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED
```

## Free-tier constraints

- **Vercel Hobby**: 1 cron/day on free tier, 60s function timeout. Phase 1 caps at 30 URLs per run; longer audits move to Supabase Edge Functions.
- **Supabase Free**: 500MB DB, 2GB bandwidth. `prune_cwv_snapshots()` and `prune_pillar_scores()` keep history bounded (30 and 90 days respectively).
- **Apify**: ~$5/month → 5–6 keywords/Monday run max.

## Directory guide

```
app/
  dashboard/          → protected dashboard pages (overview, tasks, keywords, sprint, wins…)
  admin/              → super-admin views (users, projects, settings, audit-trail)
  auth/               → login, forgot password, OAuth callback
  api/
    cron/             → daily-audit, blog-discovery, monthly-intelligence
    articles/generate → BYOK AI proxy (Claude or OpenAI)

components/
  ui/                 → shadcn/Base UI primitives
  dashboard/          → sidebar, project switcher, user menu, theme toggle
  sections/           → section-specific components (pillar-card, task-row, …)

lib/
  supabase/           → client, server, admin, middleware
  auth/               → getUserContext, permissions
  actions/            → server actions (auth, project, tasks, team, articles, profile)
  cron/               → cron phase modules
  data/               → server-side data loaders
  seo-skills/         → orchestrator + per-pillar skill modules
  ai/                 → BYOK AI client wrappers

scripts/              → standalone TS scripts (keyword analysis, content brief generator)
seo-data/             → CSV / JSON inputs for content planning scripts
supabase/migrations/  → SQL schema, RLS, triggers, seed
```

## Brand

Visual specs live in `BRAND_GUIDELINES.md` — palette, typography, motion, and
component canon. Anything in `app/`, `components/`, or `lib/` should match
that doc. If a component disagrees with the guide, the component is wrong.
