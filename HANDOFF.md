# Klimb — Session Handoff

**Last active:** 2026-04-20 · **State:** type-check clean · dev server stopped · pending migrations listed below.

## What Klimb is

Agency-managed multi-tenant SEO dashboard. First client: SkyHigh India (skydiving). Stack: Next.js 16 + TypeScript + Tailwind v4 + shadcn/ui (base-nova, uses **@base-ui/react** not @radix-ui) + Supabase (Postgres + Auth + RLS) + motion/react + Razorpay + Apify + Vercel Hobby.

**Core model:** `organizations` (billing entity) owns `projects` (websites). Users are members of orgs via `organization_members`. RLS via `has_org_access(org_id)` + legacy `has_project_access(project_id)`.

**Four plans (DB-driven, admin-editable):**
- `internal` — GoodLives staff (hidden, unlimited, auto-assigned to `*@goodlives.in`)
- `hobby` — free, 1 project, 3 Apify refresh cycles/mo, BYOK AI only
- `agency` — $20/mo or $200/yr, 5 projects, $5/mo combined Apify+AI budget
- `trial` — 15 days Agency-equivalent, auto-assigned on non-goodlives signup, soft-downgrades to Hobby via daily cron

## Architecture quick reference

**Routes:**
- `/` — marketing landing (data-driven pricing from DB)
- `/login`, `/signup/*` — auth flows (`/signup` email → `/verify` OTP → `/complete` password+username → `/project` first-project setup)
- `/auth/callback` — OAuth (kept at `/auth/` to avoid re-registering Google redirect)
- `/forgot-password`, `/privacy`, `/terms`, `/security` — public
- `/dashboard/*` — authed customer surface (overview, tasks, keywords, seo-gaps, technical, competitors, sprint, wins, articles, team, projects, integrations, profile, billing, billing/checkout)
- `/admin/*` — platform admins (sakshi@goodlives.in + `platform_admin=true`) — overview, organizations, users, plans CRUD, subscriptions, invoices, webhooks, settings, audit-trail

**Middleware:** [lib/supabase/middleware.ts](lib/supabase/middleware.ts) — unauthed `/dashboard/*` → `/login?next=`; authed on `/login` or `/signup` email-step → `/dashboard/overview`; `/signup/complete` + `/signup/project` allow authed.

**`getUserContext()`** [lib/auth/get-user.ts](lib/auth/get-user.ts) returns `{ profile, projects, activeProject, memberships, activeOrgId, billing: { subscription, plan, org_name, is_internal }, isPlatformAdmin }`. Every server component has this free.

## Pending migrations (run in Supabase SQL editor, in order)

1. `20260418000001-4` — initial schema (done)
2. `20260419*` — 10 migrations: pillar/kind, verified_by_ai, blog_meta/integrations, blog briefs, client role, multilang/publish/competitor, blog-images bucket, Apify intelligence tables, cannibalization/freshness/eeat, page_meta, topic_clusters (done)
3. `20260420000001_subscriptions_and_orgs.sql` — orgs, plans, subscriptions, usage, invoices, webhooks, audit trail, `profiles.platform_admin`, `projects.org_id`. Seeds 4 plans + backfills existing users to personal orgs. Updates `handle_new_user` trigger to create org+sub on signup. **(done per user)**
4. `20260420000002_profile_ai_model.sql` — `profiles.preferred_ai_model` column **(done per user)**
5. **`20260420000003_annual_billing.sql`** — `plans.price_annual_usd_cents` + `price_annual_inr_cents`, `subscriptions.billing_period`. Seeds Agency annual at $200 / ₹16,700. **NOT YET RUN** — user needs to run this.

## Environment variables (already in .env.local per user)

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
CRON_SECRET
GOOGLE_SERVICE_ACCOUNT_JSON (optional GA4/GSC)
PAGESPEED_API_KEY (optional)
APIFY_TOKEN, APIFY_ACTOR_ID (optional)
RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET
RAZORPAY_WEBHOOK_SECRET
NEXT_PUBLIC_RAZORPAY_KEY_ID
NEXT_PUBLIC_APP_URL
```

Razorpay webhook URL to register in dashboard: `https://<domain>/api/billing/webhook` · events `payment.authorized|captured|failed`, `refund.created`.

## Recently shipped (last 3-4 turns — context matters for new chat)

**Subscription system (Phases 1–4):** full Razorpay integration (HMAC-verified webhooks, idempotent via `webhook_events.razorpay_event_id`), BYOK pattern preserved for AI, org-model migration, admin dashboard at `/admin/*`, trial banner + countdown, data-driven landing pricing, trial-expiry cron (daily 06:00 UTC at `/api/cron/trial-expiry`), AI model picker (`components/billing/ai-model-picker.tsx` — 4 models: Opus/Sonnet/GPT-4o/GPT-4o-mini).

**This turn specifically:**
1. Moved Billing + Integrations from sidebar → user-menu dropdown.
2. Shipped [BRAND_GUIDELINES.md](BRAND_GUIDELINES.md) — canonical doc with colors, typography, spacing, motion, breakpoints, component specs. Personality dial confirmed at 6–7 (Vercel-polished with earned playful moments).
3. Built Claude-style plan grid at `/dashboard/billing`:
   - New [components/billing/plan-grid.tsx](components/billing/plan-grid.tsx) with sliding monthly/annual toggle (spring physics)
   - Current-plan emerald ring, Agency has "Most popular" badge
   - Auto-labels CTAs (Upgrade/Downgrade/Switch-period) based on price delta + period match
   - Features auto-derived from entitlements JSON — admin edits flow through
   - Free-plan changes immediate; paid plans route to existing `/dashboard/billing/checkout`
4. Migration 3 above (annual billing) — **NOT RUN YET**.
5. New [app/api/billing/change-plan/route.ts](app/api/billing/change-plan/route.ts) — handles upgrade path (`requires_checkout: true`) vs downgrade path (immediate sub flip for free plans).
6. Period plumbed through `create-order` → `verify` → `webhook` → `subscription.billing_period`. `razorpay_orders.notes.klimb_period` is the source of truth between order creation and capture.
7. Admin plan editor: added Annual USD + Annual INR fields with clear labeling. API (`/api/admin/plans[/id]`) accepts new fields.
8. Installed `playwright` + `tsx` as devDeps. New [scripts/screenshot-audit.ts](scripts/screenshot-audit.ts) — drives Chromium across mobile 390 / tablet 820 / desktop 1440 on all public pages, logs overflow offenders, screenshots to `/visual-audit/<page>/<viewport>.png`. Set `KLIMB_TEST_COOKIE` env to include authed pages.
9. Ran audit. All overflow "offenders" flagged were ambient gradient orbs inside `overflow-hidden` parents — **no real layout breaks**. Screenshots in `/visual-audit/` for review.
10. New [components/ui/animated-number.tsx](components/ui/animated-number.tsx) — scroll-triggered count-up (`useInView` + cubic ease, `prefers-reduced-motion` honored). Wired into Dashboard Overview stat cards + Admin Overview state cells.

## User preferences locked in (critical context for new chat)

- **Autonomous mode:** user said "don't ask for permission, keep shipping." Only pause for hard forks in design/legal/data. They're busy; efficiency > deference.
- **Voice:** Sakshi @ GoodLives, super_admin. Deep product vision. Treats Claude as a senior IC.
- **Build pattern:** ship in phases with a type-check + summary at each phase boundary. Don't batch.
- **AI model picker:** users pick per-task; `profiles.preferred_ai_model` is global default. `providerForModel()` maps model → Claude/OpenAI API.
- **Currencies:** USD displayed globally, INR auto-picked for Indian IPs via `pickCurrencyFromHeaders()` (uses `x-vercel-ip-country` / `cf-ipcountry`). Dual-priced plans required.
- **Compliance:** honest claims only. `/security` page explicitly says **not HIPAA**, **not E2E encrypted** (server can read data). GDPR-ready + data export/delete endpoints shipped.
- **Boilerplate usage:** ~30% of `D:\personal-projects\NextJS-Boilerplates-main\razorpay-payment-boilerplate` ported (HMAC verifiers, webhook event switch, order-creation pattern, receipt-ID generator). MongoDB + NextAuth skipped.

## Open work (next chat should pick up here)

**P0 — unblocks user:**
1. Run migration `20260420000003_annual_billing.sql` in Supabase. User will do this; new chat can verify by checking `plans.price_annual_usd_cents` on Agency row = 20000.

**P1 — brand + animations polish (user asked for this but deprioritized):**
2. Full brand audit of authed pages (dashboard + admin) — user wants Playwright screenshots fed back with specific fixes. They'll paste 3-4 screenshots that look off; fix those.
3. Topic cluster + keyword-suggest dialogs still use provider-only dropdowns → upgrade to `AiModelPicker` like E-E-A-T and article-gen dialogs.
4. Hero dashboard mockup in landing is decorative-only. If conversion tells them it's weak, replace with an actual live preview.

**P2 — hardening deferred across Phase 4:**
5. Resend email integration (payment success, trial ending, quota exceeded) — needs Resend API key + templates.
6. PDF invoice downloads — server route with html→pdf (pdfkit or puppeteer).
7. Upstash rate limiter on `/api/billing/*` — in-memory won't work on serverless.
8. Dunning flow — past_due → 3-day grace → downgrade to Hobby. Stub pattern in `trial-expiry` cron.
9. Razorpay native Subscriptions API (auto-renewal). Current flow is order-per-period; works but requires manual renewal.

**P3 — exploratory:**
10. Internal linking auditor skill (mentioned in earlier turns, not built)
11. SERP feature ownership tracker (mentioned, not built)
12. Team-invite magic-link emails (already have team CRUD, no invite email yet)

## Critical gotchas for new chat

- **Shell cwd resets to D:\personal-projects\tymezone** after every command. Use absolute paths (`D:/personal-projects/klimb/...`) in all Bash calls.
- **Dev server on port 3000** — if user reports 500s, check for stale dev server from prior session holding the port. `netstat -ano | findstr :3000` + taskkill the PID.
- **Base UI not Radix.** Buttons use `render={<Link .../>}` not `asChild`. `Select.onValueChange` receives `string | null` — guard with `(v) => v && setX(v)`.
- **lucide-react 1.x** doesn't export `Twitter`, `Github`, `Linkedin` — use alternates (`Globe`, `Rss`, `Send`, `Mail` pattern).
- **zod record** in current version: `z.record(z.string(), z.unknown())` not `z.record(z.unknown())`.
- **Supabase FK join types:** inferred as arrays. Use `Array.isArray(x) ? x[0] : x` when flattening `organizations` / similar 1-to-1 joins.
- **Type check command:** `"D:/personal-projects/klimb/node_modules/.bin/tsc" --noEmit -p "D:/personal-projects/klimb/tsconfig.json"` (don't rely on `npx tsc` — shell cwd issues).
- **Migration data backfill** in `20260420000001` creates personal orgs for existing profiles + attaches projects. If rerunning, the `on conflict do nothing` clauses prevent duplicates but don't re-attach projects correctly — only run once.
- **tasks.source CHECK constraint** only allows `'manual' | 'cron_audit' | 'ai_suggestion'`. Topic-cluster-spawned tasks file under `ai_suggestion`.
- **Razorpay Checkout.js** loaded via `next/script` in [components/billing/checkout-client.tsx](components/billing/checkout-client.tsx). SDK attaches to `window.Razorpay`.

## How to pick up in a new chat

```
Read:
1. This file (HANDOFF.md) for state
2. BRAND_GUIDELINES.md for design direction
3. CLAUDE.md for user prefs + auto-memory pointers
4. `git log --oneline -20` in D:\personal-projects\klimb if initialized — not initialized per user memory

First action: ask user "what's top of mind today?" — don't start a random refactor. Let them direct.

If they say "keep going on X," check open work list above for context.
```

## Project structure pointers

```
app/
  api/
    admin/        — plan CRUD, org migrate, user platform_admin toggle, settings, webhook replay
    billing/     — plans, subscription, create-order, verify, webhook, change-plan
    cron/        — blog-discovery (Mon 3:30 UTC), daily-audit (05:30), monthly-intelligence (1st 03:00), trial-expiry (06:00 daily)
    profile/     — export, delete, preferences
    projects/[id]/ — kickoff, refresh-intelligence
    eeat/analyze, topic-cluster/generate, competitors/[id]/analyze, keywords/suggest, articles/generate
  admin/         — overview, organizations, users, plans, subscriptions, invoices, webhooks, settings, audit-trail
  dashboard/    — overview, tasks, keywords, seo-gaps, technical, competitors, sprint, wins, articles, team, projects, integrations, profile, billing/checkout
  (landing)      — app/page.tsx (the "/" route) + /privacy, /terms, /security
  login, signup/*, forgot-password, auth/callback

components/
  admin/ — admin-sidebar, plan-editor, force-migrate-button, settings-editor, user-admin-actions, webhook-replay-button
  auth/ — auth-shell, brand-mark, google-button, password-field, signup-stepper
  billing/ — plan-grid, usage-meter, checkout-client, ai-model-picker
  dashboard/ — sidebar, mobile-nav, user-menu, project-switcher, health-card, trial-banner, page-header, empty-project, theme-toggle
  landing/ — navbar, hero, features, trust-section, pricing-cta-footer
  marketing/ — policy-layout
  sections/ — (large) the dashboard's feature cards, dialogs, kanbans
  ui/ — shadcn base + animated-number (new)

lib/
  admin/ — audit (logAudit), guard (requireAdminCaller)
  auth/ — get-user (getUserContext, requirePlatformAdmin), permissions
  billing/ — types, plans, entitlements (can + getUsageSummary), usage, ai-pricing, signatures, razorpay, gate
  cron/ — phase-1-audit, phase-2-tasks, phase-4-cwv, phase-5-rankings, phase-6-apify, phase-7-pillars, phase-8-competitors, phase-9-intelligence, phase-10-gsc-ga4-weekly
  data/ — overview, tasks, wins, seo-gaps, health, admin-metrics, integrations
  google/ — auth, ga4, gsc, pagespeed
  seo-skills/ — 15 skills + orchestrator + topic-cluster builder + blog-brief
  apify/ — intelligence (5 actors: SERP, AI Overview, backlinks, DA, content gap)
  supabase/ — server, admin, client, middleware

supabase/migrations/ — 16 migrations total, last is 20260420000003_annual_billing.sql
scripts/screenshot-audit.ts — Playwright visual audit runner
```

## One-liner summary for the new chat's first message

> "Klimb is a multi-tenant SEO SaaS (Next.js 16 + Supabase + Razorpay). Subscription system, admin dashboard, brand guidelines, visual audit rig all shipped. User prefers autonomous execution. One pending migration (`20260420000003_annual_billing.sql`). Brand polish pass is the next likely ask. Read HANDOFF.md + BRAND_GUIDELINES.md before starting."
