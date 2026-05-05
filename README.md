# Klimb — SEO Command Dashboard

Agency-managed, multi-tenant SEO dashboard with a 5-pillar optimization health model (SEO, AEO, GEO, SXO, AIO). Built for GoodLives to track client sites like [skyhighindia.com](https://skyhighindia.com).

## Stack

- **Next.js 16** (App Router, React 19, TypeScript)
- **Tailwind v4** + **shadcn/ui** (Base UI primitives)
- **motion** (motion.dev/react) for animations
- **Supabase** (Postgres, Auth, Storage) — multi-tenant via `project_id` + RLS
- **Vercel Hobby** for hosting + daily cron (free tier)

## First-time setup

### 1. Install dependencies

```bash
npm install
```

### 2. Supabase — create project & run migrations

1. Supabase project is already provisioned. Copy the `service_role` key from **Dashboard → Project Settings → API → Secret keys**.
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

### 4. First super admin (sakshi@goodlives.in)

Two ways:

**Option A (recommended):** Sign up via the login screen using the password `GoodLives@123` (or Google with a `@goodlives.in` workspace account). The DB trigger `handle_new_user()` automatically assigns `role = 'super_admin'` when the email matches `sakshi@goodlives.in`.

**Option B:** Insert directly via Supabase dashboard if you want a pre-set password.

### 5. Run dev

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

## Daily cron (Vercel)

`vercel.json` schedules `/api/cron/daily-audit` at **5:30 UTC = 11:00 AM IST**, every day.

The cron runs 8 phases per project:

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

Project switching in the sidebar writes a cookie (`klimb.active_project_id`) + updates `profiles.active_project_id` so it persists across devices.

## Article generation (BYOK)

Klimb **never stores AI API keys**. When a user clicks "Generate article":

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
GOOGLE_SERVICE_ACCOUNT_JSON
PAGESPEED_API_KEY
NEXT_PUBLIC_APP_URL
```

## Free-tier constraints

- **Vercel Hobby**: 1 cron/day, 60s function timeout. Phase 1 caps at 30 URLs per run; longer audits move to Supabase Edge Functions.
- **Supabase Free**: 500MB DB, 2GB bandwidth. `prune_cwv_snapshots()` and `prune_pillar_scores()` keep history bounded (30 and 90 days respectively).
- **Apify**: $5/month → 5–6 keywords/Monday run max.

## Directory guide

```
app/
  (dashboard)/        → protected section group
    layout.tsx        → sidebar + main shell
    page.tsx          → Overview (pillar cards + radar)
    tasks/            → task management
    keywords/         → tracked + GKP upload
    seo-gaps/         → per-page audit results
    technical/        → CWV mobile vs desktop
    competitors/      → competitor cards
    sprint/           → weekly schedule
    wins/             → milestone feed
    articles/         → article writer with BYOK
    team/             → admin-only team management
    projects/         → admin-only project list
    profile/          → user settings
  auth/               → login, forgot password, OAuth callback
  api/
    cron/daily-audit  → 8-phase cron endpoint
    articles/generate → BYOK AI proxy (Claude or OpenAI)

components/
  ui/                 → shadcn/Base UI primitives
  dashboard/          → sidebar, project switcher, user menu, theme toggle
  sections/           → section-specific components (pillar-card, task-row, ...)

lib/
  supabase/           → client, server, admin, middleware
  auth/               → getUserContext, permissions
  actions/            → server actions (auth, project, tasks, team, articles, profile)
  cron/               → 8 phase modules
  data/               → server-side data loaders
  ui-helpers.ts       → color/formatting helpers
  utils.ts            → shadcn `cn` helper
  types/database.ts   → handwritten Supabase types

supabase/migrations/  → SQL schema, RLS, triggers, seed
```
