#!/usr/bin/env tsx
/**
 * Master importer for We360_100K_Organic_Plan_8Month_v2.pdf (Apr 27, 2026).
 *
 * Bifurcates the 8-month plan into:
 *   - WEB tasks (kind='web_task') — dev/SEO-lead operational work
 *   - BLOG tasks (kind='blog_task') — writer content production
 *
 * Schedule:
 *   - Tech (web) sprint: Apr 28 → end of June 2026 (Months 1-2 of plan are
 *     mostly tech foundation; tech work continues through M3 for templates).
 *   - Blog sprint: May 1 → Dec 31, 2026 (Months 1-8 spread across calendar).
 *
 * Idempotency:
 *   - Each task has a stable `key` (used as title prefix `[K1.1]`, `[B1.4a]`).
 *   - On re-run we UPDATE existing rows by title prefix, INSERT missing.
 *   - Existing PSI tasks (titled "PSI · ...") get re-dated into Apr 28 → May 14.
 *
 * Run:
 *   1. Apply supabase/migrations/20260427000001_task_data_backing.sql first.
 *   2. npx tsx scripts/import-100k-plan.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env"); process.exit(1);
}
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.trim());
const PROJECT_ID = "11111111-1111-4111-8111-000000000001";

// =============================================================================
// Type definitions
// =============================================================================
type Priority = "critical" | "high" | "medium" | "low";
type TaskStatus = "todo" | "in_progress" | "review" | "done";
type Pillar = "SEO" | "AEO" | "GEO" | "SXO" | "AIO";

// Action makes the type-of-work obvious in the title + 1-line preamble.
// Inferred from key prefix unless explicitly set on a task (rare).
type Action =
  | "REFRESH"        // Rewrite existing live URL — same URL, fresh content
  | "NEW"            // Brand-new URL — no prior content
  | "MERGE/PRUNE"    // 301 or 410 multiple existing URLs (no new article)
  | "DEPLOY"         // Ship code / config change to the website
  | "CONFIGURE"      // External service setup (GSC / GA4 / GBP / DNS)
  | "AUDIT"          // Review-then-fix pass across many URLs
  | "OPS";           // Study / report / review / PR — output is NOT a page

type TaskType =
  | "New Post" | "New Page"
  | "Update Post" | "Update Page"
  | "Delete Post" | "Delete Page"
  | "Modify Post" | "Modify Page";

interface BaseTask {
  key: string;            // Stable identifier, e.g. "K1.1" — used in title prefix
  title: string;          // Plain-English title, no prefix or action label
  action?: Action;        // Optional override; inferred from key by default
  task_type?: TaskType;   // Override; inferred from kind+action+slug otherwise. Null for dev/ops tasks.
  est_volume?: number;    // Estimated monthly search volume for the target keyword (rendered in title prefix)
  scheduled_date: string; // YYYY-MM-DD
  priority: Priority;
  status?: TaskStatus;    // default 'todo'
  pillar: Pillar;
  data_backing: string;   // GSC / GA4 / PSI evidence (yellow callout)
  // What's wrong / why we care. For dev tasks, prefer `laymanIssue` so a
  // non-engineer can understand and delegate. If laymanIssue is set, it
  // becomes the rendered "What's wrong" text and `issue` is ignored.
  issue: string;
  laymanIssue?: string;   // Plain-English explanation; replaces `issue` when present
  impl: string;           // How to do it / acceptance criteria (technical, for the dev)
}

interface WebTask extends BaseTask {
  kind: "web_task";
}

interface BlogBriefSeed {
  target_keyword: string;
  intent: "informational" | "commercial" | "transactional" | "navigational";
  word_count_target: number;
  recommended_h1: string;
  recommended_h2s: string[];
  recommended_h3s: string[];
  sections_breakdown: string[];
  paa_questions: string[];
  internal_links: string[];
  competitor_refs: string[];
  writer_notes: string[];
  // "manual" = seeded by import script, "apify-enrich" = touched by enrich
  // script. The merge logic preserves the apify-enrich tag so we don't lose
  // signal that an actor pass already ran.
  generated_by: "manual" | "apify-enrich";
  secondary_keywords: string[];
}

interface BlogTask extends BaseTask {
  kind: "blog_task";
  url?: string;                       // Existing URL if refresh, else slug
  target_keyword: string;
  competition?: "Low Competition" | "Medium Competition" | "High Competition";
  brief: BlogBriefSeed;
}

type Task = WebTask | BlogTask | SeoOpsTask;

// Forward declare so the union above is resolvable. Concrete shape below.
interface SeoOpsTask extends BaseTask {
  kind: "blog_task";
}

// =============================================================================
// WEB / DEV TRACK — Apr 28 onward (kind=web_task)
// =============================================================================
//
// "Web tasks" = work that touches CODE, TEMPLATES, or SCHEMA. Engineering
// owns these. Excludes ops/configuration work (GBP, GA4 cleanup, disavow,
// reports, reviews, internal-linking audits) — those moved to SEO_OPS_TASKS
// below and are inserted as kind=blog_task so they appear under the "SEO
// tasks" filter in the timeline.
//
// Existing PSI tasks already cover the granular CWV work. We:
//   - Keep all 17 PSI tasks (re-dated below)
//   - Add NEW web tasks for items NOT covered by PSI: sitemap fix, indexation
//     cleanup redirects, schema templates (breadcrumb/SoftwareApp/FAQ),
//     schema audit pass.
// =============================================================================

export const WEB_TASKS: WebTask[] = [
  // --- Month 1 — Tech foundation (Apr 28 → May 14) ---
  {
    key: "K1.1", kind: "web_task",
    title: "Fix sitemap.xml so Google can find all 420 of our pages (30-min dev fix)",
    scheduled_date: "2026-04-28", priority: "critical", pillar: "SEO",
    data_backing: `GSC > Sitemaps: "Sitemap can be read, but has errors — Parsing error on Line 621". Direct fetch of https://we360.ai/sitemap.xml on 24 Apr 2026 confirmed two concatenated XML documents. Currently discovered: 103 of 420 URLs (24.5%). Of the 317 URLs in the broken second <urlset>, 309 are unique blog posts Google has NEVER seen. After fix: GSC discovered count → 400+ within 14 days; +50 unique blog landing pages in next 30 days of GA4.`,
    laymanIssue: `Google can only see 103 of our 420 pages right now — and ZERO of our 314 blog posts.

The file that tells Google what's on our site (sitemap.xml) has a formatting error halfway through. Google's reader stops at line 621 and never sees the rest of the file. That's why our blog content is basically invisible to search.

After this 30-minute dev fix, Google will discover the missing pages within 14 days. We expect ~50 blog posts to start earning organic traffic immediately.`,
    issue: `sitemap.xml is 82 KB / 2,523 lines / 420 <url> entries. Lines 1–620 are a valid <urlset> with 103 URLs. Line 621 is a SECOND <?xml version="1.0"?> declaration followed by <sitemapindex>. XML spec allows ONE root element + ONE xml declaration. Google's parser fails at line 621, so 314 blog posts + ~300 other URLs are invisible to Google.`,
    impl: `Option A (recommended, 30 min): rebuild sitemap.xml as one valid <urlset> containing all 420 URLs. Delete lines 621+. Validate at xml-sitemaps.com/validate-xml-sitemap.html. Resubmit in GSC > Sitemaps.

Option B (more scalable): convert sitemap.xml into a true <sitemapindex> referencing two working sub-sitemaps (website_sitemap.xml + blog_sitemap.xml). Each sub-sitemap returns HTTP 200.

Acceptance:
- xml-sitemaps.com validator returns "Valid sitemap"
- GSC > Sitemaps shows discovered URLs go from 103 to 400 within 14 days
- GA4 organic landing pages over the 30 days post-fix include at least 50 unique blog URLs (vs ~5 today)`,
  },
  // K1.2 (disavow), K1.6 (GBP), K1.7 (GA4 cleanup), K1.8 (monthly report),
  // K3.1 (internal-linking sweep), K6.4 (6-month review) MOVED to SEO_OPS_TASKS
  // below (kind=blog_task) — they're ops/admin/audit work, not code.
  // K2.2 / K2.3 / K2.4 page templates DELETED — not in PDF; writers build the
  // structure when shipping the first page in each category, no separate
  // dev task needed.
  {
    key: "K1.3a", kind: "web_task",
    title: "Redirect ~22 outdated URLs to their current equivalents (cleanup)",
    scheduled_date: "2026-04-30", priority: "high", pillar: "SEO",
    data_backing: `GSC > Indexing > Pages: 186 "Crawled - currently not indexed" URLs. Categorized buckets include: 4 /features-old/* (redirect to /features/<slug>), 6 /new-* legacy industry pages (301 to /solutions/* or /industries/*), 4 /lp-* orphan landing pages (kill or merge into solution pages), 4 /productivity-league/* (decide integrate-or-kill), 4 /vs- and /alternative/ orphans (noindex), 13 trailing-slash duplicates.`,
    laymanIssue: `We have ~22 leftover URLs from older versions of the site that are dragging down our reputation with Google.

These URLs (old /features-old/, /new-, /lp-, plus a few orphans) have been crawled by Google, judged low-quality, and Google now penalises our entire site quality score because of them. The dev needs to redirect each one to its modern equivalent — for example, /new-edtech-industry should send visitors to /solutions/employee-monitoring (full mapping in "How to fix" below).

After the redirects ship, Google forgets about the old URLs and our site quality recovers. Search Console's "low-quality URL" count drops from 186 to ~120 within 30 days.`,
    issue: `50% of pages on the site are NOT indexed (496 of ~1,000): 186 crawled-but-not-indexed (low quality signal from Google), 152 redirects, 78 404s. Most of the 186 CNI are technical legacy URLs that the dev team can resolve in one sprint without writer involvement.`,
    impl: `Per Section 3.2 of the 100K plan:

/features-old/* (4 URLs) → 301 to /features/<same-slug> if exists, else /features
/new-* legacy (6 URLs) → 301 mapping:
  /new-edtech-industry → /solutions/employee-monitoring (or new /industries/edtech in M4)
  /new-it---industry → /industries/it-services
  /new-digital-marketing-agency-industry → /industries/agencies
  /new-security-and-compliance → /security
  /new-time-doctor-alternative → /vs/time-doctor
  /new-partnership-program → /partnership-program (already exists)
/lp-* (4 URLs) → kill or merge: /lp-workforce-planning-software, /lp---monitoring-software-l3, /lp-new, /time-tracking-software-lp
/vs- and /alternative orphans (4 URLs) → noindex,follow: /alternative/hubstaff-alternative, /vs-activtrak, /vs-activtrak/, /activtrak-alternative%2F
/tags + /categories (3) → noindex,follow
Trailing-slash dupes (13) → add canonical to non-slash version + fix internal links

Acceptance: GSC indexation report 30 days post-deploy shows CNI count drops from 186 to ~120.`,
  },
  {
    key: "K1.3b", kind: "web_task",
    title: "Stop Google from indexing duplicate /blogs?page=2, ?page=3 archive URLs",
    scheduled_date: "2026-05-01", priority: "high", pillar: "SEO",
    data_backing: `GSC CNI bucket: 65 raw archive-pagination URLs (1 unique base = /blogs/all-articles?page=N) — adds bloat without value. Plus 13 trailing-slash duplicates of pricing/features-old URLs.`,
    laymanIssue: `Our blog archive has duplicate URLs that confuse Google.

When you scroll through /blogs/all-articles, the URL changes to ?page=2, ?page=3, etc. Google treats each numbered page as a separate URL but the content is similar, so it flags them all as "low-quality". We also have 13 URLs that exist twice — with AND without a trailing slash (e.g. both /pricing AND /pricing/) — which splits search-credit between the two versions.

The dev adds a "don't index this" tag on the page-2+ URLs and picks one canonical version for each trailing-slash dupe. Pure config change, no content needed.`,
    issue: `Paginated archive pages /blogs/all-articles?page=2..N are crawled as separate URLs and judged thin. Trailing-slash duplicates split link equity between /pricing and /pricing/.`,
    impl: `1. Add <meta name="robots" content="noindex,follow"> on /blogs/all-articles?page=N for N > 1.
2. Pick a canonical form (no trailing slash) and 301 the slash variants.
3. Add canonical tag to /pricing pointing to /pricing (no slash) and similar for the 13 trailing-slash dupes listed in plan Section 3.2.

Acceptance: 30 days post-deploy CNI bucket "archive pagination" drops to 0; trailing-slash dupes drop from 13 to 0 in GSC indexation report.`,
  },
  {
    key: "K1.4", kind: "web_task",
    title: "Add breadcrumb trails so search results show 'Home > Solutions > X' (instead of raw URLs)",
    scheduled_date: "2026-05-04", priority: "high", pillar: "AEO",
    data_backing: `Schema baseline (Section 3.4): Breadcrumbs valid pages = 15 of 502 indexed (3%). Potential ~400 (all non-home). Rich results lift CTR by 20-40% on pages where they show. Sitewide breadcrumb addition is a single template change.`,
    laymanIssue: `When Google shows our pages in search results, it shows the raw URL — ugly, hard to read, lower trust.

With "breadcrumb" code added, Google instead shows a nice trail like "we360.ai > solutions > employee monitoring" right under the page title. Pages with breadcrumbs get 20-40% more clicks because the result looks more trustworthy and visitors can see exactly where the page sits in our site.

Right now only 3% of our pages have this. The dev adds it once at the layout-template level and it covers all ~400 non-homepage pages in one shot.`,
    issue: `Almost no rich results coverage. Breadcrumb structured data is missing from 97% of pages, costing CTR on every SERP placement.`,
    impl: `1. Pick a layout template (Webflow site-wide custom head OR Next-style root layout).
2. Inject <script type="application/ld+json"> with BreadcrumbList that derives the breadcrumb chain from the current URL path.
3. Validate on /, /pricing, /solutions/employee-monitoring, /blog/<any>, /vs/<any> via Google Rich Results Test.
4. Confirm no errors in GSC > Enhancements > Breadcrumbs after 14 days.

Acceptance: Rich Results Test confirms breadcrumbs render on every non-home URL pattern; GSC reports 400+ valid breadcrumb pages within 14 days.`,
  },
  {
    key: "K1.5", kind: "web_task",
    title: "Tag homepage / pricing / features as 'a software product' so AI Overviews can cite us",
    scheduled_date: "2026-05-05", priority: "high", pillar: "AEO",
    data_backing: `Schema gap (Section 3.4): SoftwareApplication coverage = 0 of 502 pages. AI Overviews trigger on 48% of B2B queries (Search Engine Land Mar 2026); SoftwareApplication schema on /pricing + /features + homepage is required for AI Overviews to cite us as a tool. ~2 hrs dev effort.`,
    laymanIssue: `AI Overviews — the AI-generated summary at the top of Google results — appears on 48% of B2B searches today. We are completely invisible to it.

To get our brand cited in those AI summaries, our key product pages need to be tagged as "this is a software product" using a small piece of structured-data code. Right now we have ZERO pages tagged this way, so when ChatGPT-style answers describe our category, they cite competitors and skip us entirely.

The dev adds the tag to our 3 most important pages: homepage, /pricing, /features. Takes ~2 hours total.`,
    issue: `Zero SoftwareApplication / Product schema means we are uncitable in AI Overviews and ineligible for "software" rich results in regular SERPs.`,
    impl: `1. Author one SoftwareApplication JSON-LD block with: name="We360.ai", applicationCategory="BusinessApplication", operatingSystem="Web/Windows/macOS", offers (priceRange + currency), aggregateRating (if review counts available), screenshot URLs.
2. Add to /, /pricing, /features as a static <script> in head (NOT layout-wide — these 3 pages only).
3. Validate via Rich Results Test for SoftwareApplication.

Acceptance: All 3 pages return "Eligible for: SoftwareApplication" in Rich Results Test; GSC > Enhancements adds new "Software App" report within 14 days.`,
  },
  // K1.6 / K1.7 / K1.8 moved to SEO_OPS_TASKS (kind=blog_task)

  // --- Month 2 — Schema FAQ + structural dev work (May 15 → May 31) ---
  {
    key: "K2.1", kind: "web_task",
    title: "Add FAQ code to pricing/features/solutions pages (so search results show expandable Q&A)",
    scheduled_date: "2026-05-18", priority: "high", pillar: "AEO",
    data_backing: `Schema gap (Section 3.4): FAQ valid pages = 9 of 502 (2%). Potential ~50 (solution + pricing + comparison). FAQ rich results occupy 30-50% more SERP real estate; CTR lift 20-40%. AI Overviews preferentially cite pages with FAQ schema.`,
    laymanIssue: `When pages have FAQ code, Google shows the questions and answers as an expandable block right in the search results — taking up 30-50% more space and getting 20-40% more clicks.

We already have FAQ-style content written on /pricing, /features, /solutions/*, and the new /vs/ + /alternative/ pages we're shipping. We just don't have the FAQ marker code, so Google can't render the rich result.

The dev wraps the existing Q&A content in JSON-LD code on each page (4-6 Q&As per page). After deploy, the rich result starts showing in search within ~21 days.`,
    issue: `Almost no FAQ schema. Pages that DO have FAQ content (in body) aren't marked up so Google doesn't render the rich result.`,
    impl: `1. Audit each target page for existing FAQ-style content (Q + A pairs in headings).
2. Generate JSON-LD FAQPage block per page with 4-6 Q&As — use the answer-capsule format from Section 9 of the plan.
3. Pages to wire: /pricing, /features, /solutions/employee-monitoring, /solutions/employee-tracking, /solutions/field-tracking, /solutions/time-tracker, /vs/* (5 new from blog M2), /alternative/* (5 new from blog M3).
4. Validate via Rich Results Test FAQ.

Acceptance: GSC > Enhancements > FAQ shows 15+ valid FAQ pages within 21 days; SERP screenshot shows FAQ rich result on /pricing, /solutions/employee-monitoring within 30 days.`,
  },
  // K2.2 / K2.3 / K2.4 (page templates) DELETED — see comment at top of array.
  // K3.1 internal linking sweep MOVED to SEO_OPS_TASKS (kind=blog_task).

  // --- Month 3 — Mid-plan dev verification (June) ---
  {
    key: "K3.2", kind: "web_task",
    title: "Mid-year health check: make sure all 'rich result' code still works on every BoF page",
    scheduled_date: "2026-06-22", priority: "medium", pillar: "AEO",
    data_backing: `Mid-plan checkpoint per Section 6.2. After M2-M3 wiring of FAQ + SoftwareApplication + breadcrumbs, need a verification pass to catch silent regressions. Pages that lose schema validation drop their rich result placement within 7 days.`,
    laymanIssue: `Mid-year health check on all the "rich result" code we shipped in K1.4 / K1.5 / K2.1.

A typo in the JSON code can silently drop a page out of rich results within 7 days, and we won't notice unless we test. After 3 months of new pages shipping, we need to verify nothing is silently broken.

The dev runs Google's Rich Results Test on every BoF page (vs/alternative/integration/industry/in/) + all /solutions/* pages, fixes any errors found, redeploys. ~1 day of work. Optional bonus: schedule it as a monthly automated check via the audit cron.`,
    issue: `Schema can break silently when content is edited (typo in JSON, missing required field). No automated check exists.`,
    impl: `1. Use the Rich Results Test API (programmatic) on every URL listed in the BoF inventory + all /solutions/*.
2. Flag any page that returns warnings or errors.
3. Fix the broken JSON-LD inline; redeploy.
4. Optional: schedule this as a monthly cron via the existing audit infrastructure.

Acceptance: 100% of BoF + solution pages pass Rich Results Test with zero errors and no warnings.`,
  },
  // K6.4 6-month review MOVED to SEO_OPS_TASKS (kind=blog_task)
];

// =============================================================================
// SEO OPS TRACK — admin/setup/audit work that doesn't touch code or templates
// =============================================================================
//
// Stored as kind=blog_task in the DB so they appear under the "SEO tasks"
// filter in the timeline. They have NO target_keyword / brief — the detail
// dialog hides the writing fields when target_keyword is null.
// =============================================================================

// (SeoOpsTask interface declared near Task union above — no url/keyword/brief)

export const SEO_OPS_TASKS: SeoOpsTask[] = [
  {
    key: "K1.2", kind: "blog_task",
    title: "Disavow toxic backlinks from teamrelated.com PBN (924 of 1,275 links)",
    scheduled_date: "2026-04-29", priority: "critical", pillar: "SEO",
    action: "CONFIGURE",
    data_backing: `GSC > Links > External > Top linking sites: teamrelated.com → 924 links (72% of all backlinks). Top 5 anchor texts are exact-match article titles ("we360 ai", "employee analytics use cases every hr team should implement", "how to calculate workforce productivity a step by step guide", "remote business ideas that actually make money in 2026", "time blocking technique how top performers plan their day for peak productivity") — bot-generated PBN signature.`,
    issue: `Toxic backlink profile dominated by one PBN domain. Ahrefs DR is currently propped up artificially; Google may already be discounting these links. Need a clean profile BEFORE Month 3 study-led link building so new high-quality links compound on a clean baseline.`,
    impl: `1. Export external links CSV from GSC (Links > Export > Download CSV).
2. Filter rows where source domain = teamrelated.com.
3. Build disavow.txt with one line: domain:teamrelated.com
4. Upload via https://search.google.com/search-console/disavow-links
5. Wait 4-6 weeks for re-crawl + DR recalibration.

Acceptance: disavow.txt accepted by Google. Ahrefs DR may temporarily drop 50→~40, then re-stabilize as new natural links land in M3-5.`,
  },
  {
    key: "K1.6", kind: "blog_task",
    title: "Set up Google Business Profile + request 25 customer reviews",
    scheduled_date: "2026-05-06", priority: "medium", pillar: "GEO",
    action: "CONFIGURE",
    data_backing: `GBP is a separate ranking system surfacing in Maps, branded SERPs, and Gemini answers. Setup time: 4 hrs. 25 customer reviews lifts visibility 3-5×. Costs nothing. Currently no GBP listing for We360.ai.`,
    issue: `Branded "we360" searches surface generic SERP without the GBP knowledge panel. Maps queries near Pune/Bengaluru for "employee monitoring software" don't show We360.`,
    impl: `(a) Create + claim GBP for "We360.ai" via business.google.com.
(b) Add 5 categories: Software Company, Computer Software Vendor, Business Productivity, Workforce Analytics Software, SaaS Company.
(c) Write description with primary 5 keywords (employee monitoring software, productivity tracking, attendance software India, workforce analytics, BPO monitoring).
(d) Add 10 photos: logo, team, product UI screenshots, office, awards.
(e) Email template to current customers requesting reviews — target 25 reviews, 4.5+ rating average.
(f) Post 4 GBP posts (one per week) tied to Month 1 content launches.

Acceptance: GBP live + verified; 25 reviews; GBP knowledge panel appears for "we360" branded SERP; Maps listing rank top 3 for "employee monitoring software near Pune" and "near Bengaluru" within 30 days.`,
  },
  {
    key: "K1.7", kind: "blog_task",
    title: "Clean up GA4 channel grouping — exclude APP/LOGIN URLs from Organic Search",
    scheduled_date: "2026-05-07", priority: "high", pillar: "SEO",
    action: "CONFIGURE",
    data_backing: `GA4 90-day organic landing pages (27 Jan – 26 Apr 2026): top 4 are /user-detail (3,009 sessions), /dashboard (3,919), /realms/ind-prod/protocol/openid-connect/auth (2,682), /signin (1,001). These are auth/app URLs, NOT real organic. Excluding them moves real commercial organic from inflated 10,787/mo down to ~5,063/mo (90-day avg) — Tier 2 KPI must be wired to commercial pages only.`,
    issue: `Tier 2 (commercial sessions) KPI is currently corrupted by app/login URLs that show up as "Organic Search" because users land on them via Google. Decisions made on this number are wrong.`,
    impl: `1. GA4 > Admin > Data Streams > Web > Configure tag settings > List unwanted referrals — does NOT solve this.
2. GA4 > Admin > Channel groups > Create custom channel group "Organic – Commercial" with rule:
   - Source/Medium matches google/organic AND
   - Page path NOT contains: /user-detail, /dashboard, /realms/, /signin, /screenshot, /reports, /timeline, /downloads
3. Wire all Tier 2 reports to the new channel group.
4. Update Looker / dashboard cards to point at "Organic – Commercial" instead of "Organic Search".

Acceptance: Tier 2 KPI report shows ~5,063 sessions/mo (90-day avg) instead of 10,787/mo. Demo conversion rate jumps from 0.31% to ~0.65% on commercial-only base.`,
  },
  {
    key: "K1.8", kind: "blog_task",
    title: "Build monthly performance report v1 (Tier 1 + Tier 2 + striking distance)",
    scheduled_date: "2026-05-13", priority: "medium", pillar: "SEO",
    action: "OPS",
    data_backing: `8-month plan target: Tier 1 = 100K GA4 organic sessions/mo (stretch) or 40-50K realistic; Tier 2 = 5K-8K non-brand commercial sessions/mo + 150-300 demos/mo. We need a recurring report that surfaces movement against both tiers + the 132-query rank tracker.`,
    issue: `No standardized monthly report exists. Stakeholders ask ad-hoc "how are we doing" questions. Need one canonical view.`,
    impl: `Build a Looker / Sheets template with 4 sections:
1. Tier 1 trend: GA4 organic sessions/mo last 12 months, line chart.
2. Tier 2 trend: Non-brand commercial sessions (using channel group from K1.7) + demo count + demo conversion rate.
3. Striking-distance position movements: 132-query rank tracker — % moved up, % stayed, % moved down.
4. Page-level wins: top 10 movers (delta clicks vs prior 28 days).

Distribution: emailed first Monday of each month to leadership + posted in #seo-channel.

Acceptance: First report delivered on first Monday of June 2026 (template + 1 month of data).`,
  },
  {
    key: "K3.1", kind: "blog_task",
    title: "Internal linking sweep — every BoF page gets 5+ internal links",
    scheduled_date: "2026-06-15", priority: "high", pillar: "SEO",
    action: "AUDIT",
    data_backing: `Plan Section 6.1 acceptance criteria: each BoF page needs 5 internal links from other BoF pages and 3 from blog posts. Plan Task 6.1: every blog with >2,000 imp/16mo links to a relevant solution or BoF page. Internal linking is the cheapest CTR + topical-authority lift available.`,
    issue: `BoF pages shipping in M2-M5 will be orphaned without an explicit internal-linking sweep. New pages take 60-90 days to rank when they have <3 internal links pointing to them.`,
    impl: `1. Audit: list every BoF page (vs/alternative/integration/industry/in/) that exists or is planned.
2. For each page, ensure at least 5 internal links from related BoF pages.
3. For each blog with >2,000 imp/16mo (from GSC export), find a relevant solution or BoF page and add an internal link.
4. For each solution page, add 3 BoF + 3 alternative page links in body.
5. Track in spreadsheet: page, link from, link to, date added.

Acceptance: 100% of BoF pages have ≥5 internal links pointing to them by end of June. GSC > Internal links report shows BoF pages each have 8+ inbound internal links.`,
  },
  {
    key: "K6.4", kind: "blog_task",
    title: "Mid-plan review (6 months in) + write H2 re-plan memo",
    scheduled_date: "2026-10-30", priority: "high", pillar: "SEO",
    action: "OPS",
    data_backing: `Plan Task 6.4 — re-pull GSC + GA4 at end of M6. Compare actuals vs Tier 1 (100K stretch / 40-50K realistic) and Tier 2 (5-8K commercial + 150-300 demos/mo) targets. Decide H2 (M7-M8) priorities based on what worked.`,
    issue: `8-month plan is half-spent at end of M6. Without an explicit checkpoint we'll keep executing M7-M8 even if direction needs to shift.`,
    impl: `1. Re-pull: GSC 6-month performance + indexation + striking-distance progress; GA4 channel + landing pages + demo conversion.
2. Compare actuals vs targets per tier.
3. Identify top 3 worked / top 3 didn't.
4. Decide H2: accelerate, change focus, or kill underperformers?
5. Write a 1-page memo + present to leadership.

Acceptance: Memo delivered Oct 30; H2 plan adjustments rolled into Sprint board by Nov 1.`,
  },
];

// =============================================================================
// BLOG TRACK — May 1 onward, distributed Months 1-8
// =============================================================================
//
// Each blog task corresponds to one writer page-equivalent. We capture the
// data backing + brief seed (target keyword, intent, recommended H1/H2/H3,
// PAA placeholders, internal links, competitor refs) — Apify enrichment in
// the follow-up phase will fill in any gaps from live SERP data.
// =============================================================================

const emptyBrief = (
  target_keyword: string,
  recommended_h1: string,
  intent: BlogBriefSeed["intent"],
  word_count_target = 1500,
  extra: Partial<BlogBriefSeed> = {}
): BlogBriefSeed => ({
  target_keyword,
  intent,
  word_count_target,
  recommended_h1,
  recommended_h2s: [],
  recommended_h3s: [],
  sections_breakdown: [],
  paa_questions: [],
  internal_links: [],
  competitor_refs: [],
  writer_notes: [],
  generated_by: "manual",
  secondary_keywords: [],
  ...extra,
});

export const BLOG_TASKS: BlogTask[] = [
  // ===========================================================================
  // MONTH 1 (May 1-31) — Blog rewrites + striking-distance refreshes
  // ===========================================================================

  // Task 1.4 — 6 P0 blog rewrites
  {
    key: "B1.4a", kind: "blog_task",
    title: "Rewrite: /blog/remote-screen-monitoring-software-a-game-changer-for-work-from-home-teams",
    scheduled_date: "2026-05-04", priority: "critical", pillar: "SEO",
    url: "https://we360.ai/blog/remote-screen-monitoring-software-a-game-changer-for-work-from-home-teams",
    target_keyword: "remote screen monitoring software",
    competition: "Medium Competition",
    data_backing: `GSC 16-mo: 47,642 impressions, 72 clicks, CTR 0.15%, average position 34.74. Page is the highest impressions/click gap on the entire site. Target queries already in pool: "live screen monitoring software" (2,084 imp, pos 19.07) — striking distance for top-10. Refresh to top 10 expected to lift to ~4% CTR = ~1,900 clicks/month.`,
    issue: `47,642 impressions over 16 months but only 72 clicks — Google ranks us at position 34.74. The current article doesn't match "live screen monitoring software" query intent. Title is fluff ("a game changer for work-from-home teams") rather than direct keyword + year.`,
    impl: `Refresh playbook (per URL):
1. Check current top-3 SERP for "remote screen monitoring software" + "live screen monitoring software".
2. Identify content gaps vs those top-3 (table of comparisons, pricing, screenshots).
3. Rewrite intro: 200-word answer-capsule with verdict in first 60 words.
4. Update title to: "Remote Screen Monitoring Software [2026]: Live View, Recording, and Privacy"
5. Add comparison table (We360 vs Hubstaff vs Teramind vs ActivTrak), 8-row min.
6. Add 6-question FAQ block + FAQPage JSON-LD.
7. Add 3-5 internal links FROM other blogs + TO /vs/we360-vs-hubstaff + /solutions/employee-monitoring.
8. Republish with updated date; submit GSC URL Inspection > Request indexing.
9. Track position weekly in 132-query rank tracker.

Acceptance: position moves to top 10 within 21 days; CTR rises to 3%; weekly tracking dashboard shows the move.`,
    brief: emptyBrief(
      "remote screen monitoring software",
      "Remote Screen Monitoring Software [2026]: Live View, Recording, and Privacy",
      "commercial",
      2200,
      {
        secondary_keywords: ["live screen monitoring software", "screen monitoring tools", "monitor remote employees screen"],
        recommended_h2s: [
          "What is remote screen monitoring software?",
          "Why teams use live screen monitoring (4 use cases)",
          "We360.ai vs Hubstaff vs Teramind vs ActivTrak — comparison table",
          "Privacy + compliance: what's legal in India, US, EU",
          "Pricing: how the leading tools price screen monitoring",
          "FAQ",
        ],
        internal_links: ["/vs/we360-vs-hubstaff", "/solutions/employee-monitoring", "/in/employee-monitoring-software-india"],
        writer_notes: ["Open with 60-word answer-capsule + verdict.", "Add 4-6 PAA Qs + FAQPage schema."],
      }
    ),
  },
  {
    key: "B1.4b", kind: "blog_task",
    title: "Rewrite: /blog/best-work-from-home-monitoring-software",
    scheduled_date: "2026-05-05", priority: "critical", pillar: "SEO",
    url: "https://we360.ai/blog/best-work-from-home-monitoring-software",
    target_keyword: "best work from home monitoring software",
    competition: "High Competition",
    data_backing: `GSC 16-mo: 50,947 impressions, 27 clicks, CTR 0.05%, average position 43.17. Highest impression/click gap on the site after B1.4a. "work from home monitoring tools" striking distance: 549 imp at pos 19.30.`,
    issue: `50K impressions, 27 clicks — search intent mismatch. The page is generic; needs to be a structured "best of" list with recent product comparisons.`,
    impl: `Per refresh playbook above. Specific steps:
1. New H1: "Best Work-From-Home Monitoring Software [2026]: 8 Tools Compared"
2. Build a ranked comparison list (We360 + 7 competitors).
3. Add filter table (price / privacy / India support / integrations).
4. Each tool gets: 2-line summary, "best for" tag, pricing, pros/cons.
5. Add 6-Q FAQ + FAQPage schema.
6. Internal links: /solutions/employee-monitoring, /vs/we360-vs-hubstaff, /alternative/hubstaff-alternative.

Acceptance: position 8 within 30 days; CTR 3%+; +1,500 clicks/mo from this URL alone.`,
    brief: emptyBrief(
      "best work from home monitoring software",
      "Best Work-From-Home Monitoring Software [2026]: 8 Tools Compared",
      "commercial",
      2500,
      {
        secondary_keywords: ["work from home monitoring tools", "best wfh tracking software", "remote employee monitoring"],
        recommended_h2s: ["TL;DR — Top 3 picks", "Why WFH monitoring is back in 2026", "8 tools compared (table)", "Tool-by-tool reviews", "Privacy + compliance", "FAQ"],
        internal_links: ["/solutions/employee-monitoring", "/vs/we360-vs-hubstaff", "/alternative/hubstaff-alternative"],
      }
    ),
  },
  {
    key: "B1.4c", kind: "blog_task",
    title: "Rewrite: /blog/top-5-prohance-alternatives-in-2025",
    scheduled_date: "2026-05-06", priority: "critical", pillar: "SEO",
    url: "https://we360.ai/blog/top-5-prohance-alternatives-in-2025",
    target_keyword: "prohance alternative",
    competition: "Medium Competition",
    data_backing: `GSC 16-mo: 16,942 impressions, 71 clicks, CTR 0.42%, average position 9.64. Already striking distance for top-10. Validates BoF /alternative/prohance-alternative (M3 Section 6.2). "prohance competitors" 203 imp validates demand.`,
    issue: `Already at position 9 — small refresh + retitle should push it into top 5. Current title ends in "in 2025" — outdated.`,
    impl: `1. Update title: "Top 5 Prohance Alternatives [2026]: Honest Comparison".
2. Refresh competitor list — verify each tool still exists and pricing is current.
3. Add We360 as #1 with explicit reasoning.
4. Add "Why teams switch from Prohance" callout.
5. Add 4-Q FAQ + schema.
6. Internal links: /alternative/prohance-alternative (M3), /solutions/employee-monitoring.

Acceptance: position 5 within 21 days; CTR 5%+; +200 clicks/mo upside.`,
    brief: emptyBrief(
      "prohance alternative",
      "Top 5 Prohance Alternatives [2026]: Honest Comparison",
      "commercial",
      1800,
      {
        secondary_keywords: ["prohance competitors", "alternatives to prohance", "prohance vs"],
        internal_links: ["/alternative/prohance-alternative", "/solutions/employee-monitoring"],
      }
    ),
  },
  {
    key: "B1.4d", kind: "blog_task",
    title: "Rewrite: /blog/how-to-measure-productivity-formula-metrics-and-best-methods",
    scheduled_date: "2026-05-07", priority: "high", pillar: "SEO",
    url: "https://we360.ai/blog/how-to-measure-productivity-formula-metrics-and-best-methods",
    target_keyword: "how to measure productivity",
    competition: "Medium Competition",
    data_backing: `GSC 16-mo: 29,427 impressions, 53 clicks, CTR 0.18%, position 17.51. Striking distance. Plus zero-click bucket: "what causes low productivity" 25,378 imp at pos 10.89, "how is productivity measured" 119 imp at pos 12.9.`,
    issue: `Page covers measurement BUT doesn't directly answer "what causes low productivity" which has 25K imp/16mo at position 10.89. Need a sister-section that targets that intent.`,
    impl: `1. Restructure into a pillar: 4 H2s (definition, formulas, metrics, what-if-low).
2. Add explicit "What causes low productivity" H2 with 5-cause list (matches the 25K-imp query).
3. Add a productivity formula calculator widget (link to /employee-productivity-roi-calculator).
4. Add comparison table of leading productivity methods.
5. Add 5-Q FAQ + schema.
6. Internal links: /solutions/employee-monitoring, /employee-productivity-roi-calculator, /blog/team-dynamics-at-workplace.

Acceptance: ranks top 8 for "how to measure productivity" AND top 8 for "what causes low productivity" within 45 days.`,
    brief: emptyBrief(
      "how to measure productivity",
      "How to Measure Productivity [2026]: 7 Formulas + Methods + Causes of Low Output",
      "informational",
      2800,
      {
        secondary_keywords: ["what causes low productivity", "productivity formula", "how is productivity measured"],
        internal_links: ["/solutions/employee-monitoring", "/employee-productivity-roi-calculator", "/blog/team-dynamics-at-workplace"],
      }
    ),
  },
  {
    key: "B1.4e", kind: "blog_task",
    title: "Rewrite: /blog/team-dynamics-at-workplace",
    scheduled_date: "2026-05-08", priority: "medium", pillar: "SEO",
    url: "https://we360.ai/blog/team-dynamics-at-workplace",
    target_keyword: "team dynamics at workplace",
    competition: "Low Competition",
    data_backing: `GSC 16-mo: 21,710 impressions, 101 clicks, CTR 0.47%, position 15.76. Already getting 100+ clicks/16mo from this URL. Refresh to position 5 should ~3× the clicks.`,
    issue: `Decent CTR but stuck at pos 15. Content is generic — needs frameworks, examples, and visual diagrams to compete with HBR + Gallup at the top.`,
    impl: `1. Add Tuckman framework explainer with diagram.
2. Add "5 signs of dysfunctional team dynamics" checklist.
3. Add 3 mini case studies (real or fictionalized).
4. Add survey template link → /templates/employee-recognition-survey-form.
5. 4-Q FAQ + schema.
6. Internal links to other blogs + survey template.

Acceptance: position 7 within 45 days; CTR 4%+.`,
    brief: emptyBrief(
      "team dynamics at workplace",
      "Team Dynamics at the Workplace [2026]: Frameworks, Signs of Dysfunction, Fixes",
      "informational",
      2000,
      {
        secondary_keywords: ["workplace team dynamics", "team dynamics framework", "tuckman model"],
        internal_links: ["/templates/employee-recognition-survey-form", "/blog/how-to-measure-productivity-formula-metrics-and-best-methods"],
      }
    ),
  },
  {
    key: "B1.4f", kind: "blog_task",
    title: "Rewrite: /blog/zoho-people-vs-keka-hr",
    scheduled_date: "2026-05-11", priority: "high", pillar: "SEO",
    url: "https://we360.ai/blog/zoho-people-vs-keka-hr",
    target_keyword: "zoho people vs keka",
    competition: "Medium Competition",
    data_backing: `GSC 16-mo: 7,851 impressions, 76 clicks, CTR 0.97%, position 10.59. Already top-10 with ~1% CTR. Validates the BoF /vs/keka-vs-zoho ambition (also at pos 3.5 with 218 imp/16mo).`,
    issue: `Already top-10 — but stuck at 10.59. CTR is decent (0.97%). Needs a refresh + answer-capsule to push to top 5.`,
    impl: `1. Add 60-word answer-capsule with explicit verdict.
2. Refresh comparison table — confirm features, pricing, integrations are current as of 2026.
3. Add "best for" callouts for each tool.
4. Add 4-Q FAQ + schema.
5. Internal links: /vs/keka-vs-zoho (canonical BoF), /vs/zoho-vs-keka.

Acceptance: position 5 within 30 days; CTR 4%+.`,
    brief: emptyBrief(
      "zoho people vs keka",
      "Zoho People vs Keka HR [2026]: Honest Comparison + Pricing",
      "commercial",
      1800,
      {
        secondary_keywords: ["keka vs zoho people", "zoho people vs keka hr", "keka or zoho"],
        internal_links: ["/vs/keka-vs-zoho", "/vs/zoho-vs-keka"],
      }
    ),
  },

  // Task 1.5 — Striking-distance batch 1 (top 10 by impressions)
  {
    key: "B1.5a", kind: "blog_task",
    title: "Striking-distance refresh: /blog-generator (\"blog generator\")",
    scheduled_date: "2026-05-12", priority: "high", pillar: "SEO",
    url: "https://we360.ai/blog-generator",
    target_keyword: "blog generator",
    competition: "Medium Competition",
    data_backing: `GSC 16-mo: 4,346 imp, 57 clicks, position 12.85 — striking distance. Cluster: "blog generator" 4,346 imp + "ai blog generator" 2,792 imp + "blog generator ai" 576 imp + "blog generator tool" 476 imp = 8,190 imp combined. Move to pos 5 → +282 clicks/mo just on the head term.`,
    issue: `Page exists but doesn't target "ai blog generator" intent (currently second-strongest cluster query). Title needs to absorb both intents.`,
    impl: `Refresh playbook applied:
1. Title: "Free AI Blog Generator [2026]: Generate SEO Posts in 30 Seconds".
2. Add 60-word answer-capsule with verdict.
3. Add "How our AI blog generator works" diagram.
4. Add 5-Q FAQ + schema.
5. Add 3 sample outputs.
6. Internal links: /blog/best-ai-productivity-tools, /templates/* (relevant), homepage.

Acceptance: pos 5 within 30 days; CTR 6%+; +200-300 clicks/mo.`,
    brief: emptyBrief(
      "blog generator",
      "Free AI Blog Generator [2026]: Generate SEO Posts in 30 Seconds",
      "commercial",
      1500,
      {
        secondary_keywords: ["ai blog generator", "blog generator ai", "blog generator tool", "free ai blog generator", "blog text generator"],
      }
    ),
  },
  {
    key: "B1.5b", kind: "blog_task",
    title: "Striking-distance refresh: /automated-attendance (\"cloud-based attendance system\")",
    scheduled_date: "2026-05-13", priority: "high", pillar: "SEO",
    url: "https://we360.ai/automated-attendance",
    target_keyword: "cloud based attendance system",
    competition: "Medium Competition",
    data_backing: `GSC 16-mo cluster: "cloud based attendance system" (3,132 imp, pos 14.67) + "cloud-based attendance system" (1,872 imp, pos 15.86) + "automated attendance system" (1,686 imp, pos 11.36) + "ai attendance tracker" (530 imp, pos 11.32) = 7,220 imp combined. Move to pos 5 → +400 clicks/mo.`,
    issue: `Page targets "automated attendance" — needs to absorb "cloud based attendance system" intent (highest impressions in cluster).`,
    impl: `1. Update H1 + meta to lead with "Cloud-Based Attendance System".
2. Add comparison: cloud vs on-prem vs biometric.
3. Add India-specific compliance section (DPDPA + ESI/PF integration).
4. Add 5-Q FAQ + schema.
5. Internal links: /in/attendance-tracking-software-india, /solutions/employee-monitoring.

Acceptance: pos 5 within 30 days for "cloud-based attendance system" + "automated attendance system"; CTR 6%+.`,
    brief: emptyBrief(
      "cloud based attendance system",
      "Cloud-Based Attendance System [2026]: Setup, Pricing, India Compliance",
      "commercial",
      2000,
      {
        secondary_keywords: ["automated attendance system", "ai attendance tracker", "ai attendance tracking", "automate attendance tracking"],
        internal_links: ["/in/attendance-tracking-software-india", "/solutions/employee-monitoring"],
      }
    ),
  },
  {
    key: "B1.5c", kind: "blog_task",
    title: "Striking-distance refresh: /job-descriptions/crm-specialist (\"crm specialist\")",
    scheduled_date: "2026-05-14", priority: "medium", pillar: "SEO",
    url: "https://we360.ai/job-descriptions/crm-specialist-job-descriptions",
    target_keyword: "crm specialist",
    competition: "Low Competition",
    data_backing: `GSC 16-mo: 2,497 imp, 4 clicks, position 17.03. Move to pos 5 → +162 clicks/mo. Already exists as a JD template — just needs refresh.`,
    issue: `JD template at pos 17 because content is short and lacks salary/skills detail that competing pages have.`,
    impl: `1. Expand: salary range (India + US), required skills (10), preferred skills (5), interview questions (8).
2. Add downloadable PDF.
3. 4-Q FAQ + schema.
4. Internal links to /job-descriptions index + 2 related JDs.

Acceptance: pos 5 within 30 days; CTR 6%+.`,
    brief: emptyBrief(
      "crm specialist",
      "CRM Specialist Job Description [2026]: Salary, Skills, Interview Questions",
      "informational",
      1500,
      { secondary_keywords: ["crm specialist job description", "crm specialist salary"] }
    ),
  },

  // ===========================================================================
  // MONTH 2 (June) — Solution refreshes + first 5 BoF vs-pages + blog prune
  // ===========================================================================

  {
    key: "B2.1", kind: "blog_task",
    title: "Prune 41 thin/duplicate blog posts — execute keep/merge/410 decisions",
    scheduled_date: "2026-06-01", priority: "high", pillar: "SEO",
    target_keyword: "blog pruning audit",
    data_backing: `GSC indexation: 186 URLs "Crawled - currently not indexed" — 41 are blog posts (full URL list in plan Section 3.2). Each gets a keep/merge/410 decision. Acceptance: 30+ URLs resolved; CNI count drops 186 → 120 within 30 days.`,
    issue: `41 thin/duplicate blog posts dilute topical authority and trigger Google's quality filter on the entire blog subfolder.`,
    impl: `Decision tree per URL:
- Has higher-traffic post on same topic? → 301 to that post
- 0 organic clicks last 12 months and not topical for our ICP? → 410 (gone)
- High imp / low pos and content can be salvaged? → assign to refresh sprint M3-M4
- Otherwise: keep, but add internal links + improve schema

Spreadsheet output: URL | 12mo clicks | 12mo imp | decision | merge target (if 301) | refresh sprint date (if salvage) | done date.

Full URL list (41) in plan Section 3.2. Top 5 prune candidates:
- /blog/what-does-hybrid-remote-work-mean-the-2026-guide-every-business-needs-to-read
- /blog/you-think-hiring-is-enough-heres-why-workforce-planning-is-important-in-2026
- /blog/ways-performance-benchmarking-can-improve-business-the-growth-hack-most-companies-ignore
- /blog/before-you-offer-flexible-work-know-these-9-critical-pros-and-cons
- /blog/10-proven-ways-to-improve-remote-working-well-being-without-slowing-teams-down

Acceptance: 30+ URLs resolved; CNI count drops 186 → 120 in GSC indexation report 30 days post-execute.`,
    brief: emptyBrief(
      "blog pruning audit",
      "Blog Pruning Audit — 41 thin posts decided",
      "informational",
      0,
      { writer_notes: ["This is a content-ops task, not a writing task. Output is a decision spreadsheet, not a blog post."] }
    ),
  },
  {
    key: "B2.2a", kind: "blog_task",
    title: "Solution-page refresh: /solutions/employee-monitoring",
    scheduled_date: "2026-06-02", priority: "critical", pillar: "SEO",
    url: "https://we360.ai/solutions/employee-monitoring",
    target_keyword: "employee monitoring software",
    competition: "High Competition",
    data_backing: `GA4 90-day: 1,178 sessions (393/mo), 24s engage, 7.1% engagement rate (short bounce). GSC 16-mo: 26,236 imp, position 31.10. This is our TOP organic landing page after homepage — single biggest revenue lever in the plan. Refresh to pos 8 + CTR 4% → 1,000 sessions/mo, 90s+ engage, 10 demos/mo attributable.`,
    issue: `Top BoF page but engagement rate is only 7.1% (industry healthy = 50%+). Content doesn't match commercial intent. Position 31 means most searchers never see us.`,
    impl: `Refresh spec:
1. Rewrite hero + value-prop in answer-capsule format (40-60 word definition with verdict).
2. Add SoftwareApplication JSON-LD (covered by K1.5).
3. Add 6 FAQ items + FAQPage schema.
4. Add 3 customer logos + testimonial cards.
5. Add comparison table vs top 3 competitors (Hubstaff, Teramind, ActivTrak).
6. Add visible pricing teaser → CTA "See Plans".
7. Add 5 internal links to vs/alternative/integration pages shipping in M2-M4.

Acceptance: 90 days post-refresh — 1,000 sessions/mo, 90s+ engage, 10 demos/mo attributable, position 8.`,
    brief: emptyBrief(
      "employee monitoring software",
      "Employee Monitoring Software [2026]: Live View, Privacy, Pricing — We360.ai",
      "commercial",
      2500,
      {
        secondary_keywords: ["employee productivity monitoring software", "remote employee monitoring software", "employee monitoring tools"],
        internal_links: ["/vs/we360-vs-hubstaff", "/vs/we360-vs-teramind", "/vs/we360-vs-activtrak", "/alternative/hubstaff-alternative", "/in/employee-monitoring-software-india"],
      }
    ),
  },
  {
    key: "B2.2b", kind: "blog_task",
    title: "Solution-page refresh: /attendance-tracking-software",
    scheduled_date: "2026-06-03", priority: "high", pillar: "SEO",
    url: "https://we360.ai/attendance-tracking-software",
    target_keyword: "attendance tracking software",
    competition: "High Competition",
    data_backing: `GSC 16-mo: 75,376 impressions, 132 clicks, CTR 0.18%, position 34.86. Highest latent demand on solution pages — 75K imp wasted at pos 35.`,
    issue: `75K impressions and only 132 clicks. Position 35 on a query with high commercial intent. Page needs structural overhaul.`,
    impl: `Same refresh spec as B2.2a, plus:
- Position chart (vs Hubstaff, Time Doctor, ActivTrak) — feature parity table
- India-specific section (link to /in/attendance-tracking-software-india)
- ROI calculator widget link

Acceptance: position 15 within 90 days (was 35); CTR 2%+; +1,500 clicks/mo lift.`,
    brief: emptyBrief(
      "attendance tracking software",
      "Attendance Tracking Software [2026]: Cloud, Biometric, India Compliance",
      "commercial",
      2200,
      {
        secondary_keywords: ["employee attendance software", "attendance tracking system", "online attendance system"],
        internal_links: ["/in/attendance-tracking-software-india", "/automated-attendance", "/solutions/employee-monitoring"],
      }
    ),
  },
  {
    key: "B2.2c", kind: "blog_task",
    title: "Solution-page refresh: /remote-employee-monitoring",
    scheduled_date: "2026-06-04", priority: "high", pillar: "SEO",
    url: "https://we360.ai/remote-employee-monitoring",
    target_keyword: "remote employee monitoring",
    competition: "High Competition",
    data_backing: `GSC 16-mo: 82,211 impressions, 63 clicks, position 39.21. Highest impressions on any solution page. Sister query "remote employee monitoring software" 3,168 imp at pos 45.6.`,
    issue: `82K impressions, 63 clicks. Position 39 = invisible. Page needs hero rewrite + comparison table + FAQ.`,
    impl: `Same refresh spec as B2.2a, plus:
- "Live screenshot vs no-screenshot" privacy choice positioning
- WFH-specific use cases (3 cards)
- Customer testimonial from a remote-first company

Acceptance: position 12 within 90 days; CTR 1.5%+; +800 clicks/mo lift.`,
    brief: emptyBrief(
      "remote employee monitoring",
      "Remote Employee Monitoring Software [2026]: WFH, Privacy, Pricing",
      "commercial",
      2200,
      {
        secondary_keywords: ["remote employee monitoring software", "wfh monitoring", "remote workforce monitoring"],
        internal_links: ["/solutions/employee-monitoring", "/blog/remote-screen-monitoring-software-a-game-changer-for-work-from-home-teams"],
      }
    ),
  },

  // First 5 BoF vs-pages
  ...buildVsPages([
    { slug: "we360-vs-hubstaff", competitor: "Hubstaff", date: "2026-06-08", priority: "critical",
      data: `Cluster validation: hubstaff alternative=1,326 imp/16mo, hubstaff alternatives=990 imp. We360-branded "vs hubstaff" doesn't exist in GSC yet — forward bet. Industry benchmark: well-built vs-pages capture 200-500 sessions/mo within 90 days because evaluator searchers are funnel-bottom.` },
    { slug: "we360-vs-time-doctor", competitor: "Time Doctor", date: "2026-06-09", priority: "critical",
      data: `Cluster: timedoctor alternative=528 imp + time doctor alternative=754 + time doctor alternatives=688. Combined 1,970 imp/16mo on adjacent queries.` },
    { slug: "we360-vs-teramind", competitor: "Teramind", date: "2026-06-10", priority: "high",
      data: `Forward bet — no GSC validation yet, but Teramind is one of the top 4 enterprise EM competitors and shows in zero-click queries.` },
    { slug: "we360-vs-activtrak", competitor: "ActivTrak", date: "2026-06-11", priority: "critical",
      data: `Cluster: activtrak alternatives=734 + activtrak alternative=404 + activtrak competitors=478 = 1,616 imp/16mo. Strongest alternative-pattern signal in our pool.` },
    { slug: "we360-vs-desktime", competitor: "DeskTime", date: "2026-06-12", priority: "high",
      data: `Cluster: desktime alternative=950 imp at pos 18.98. High-impression validation.` },
  ]),

  // Plan Section 6.1 additions — keka-vs-zoho + zoho-vs-keka are P0 refresh-existing
  // (already at pos 3.5 / 3.3 with imp 218/137). we360-vs-monitask is the 15th
  // we360-as-actor vs-page from the plan that I missed in the first pass.
  ...buildVsPages([
    { slug: "keka-vs-zoho", competitor: "Zoho", date: "2026-06-15", priority: "high", customH1: "Keka vs Zoho People",
      data: `GSC 16-mo: keka vs zoho — already ranking position 3.5 with 218 impressions. Refresh-existing — page is alive, just needs an answer-capsule + FAQ schema to push CTR. Sister query "zoho people vs keka" 137 imp at pos 3.3 (B-VS.zoho-vs-keka).` },
    { slug: "zoho-vs-keka", competitor: "Keka", date: "2026-06-16", priority: "high", customH1: "Zoho People vs Keka",
      data: `GSC 16-mo: zoho vs keka — already ranking position 3.3 with 137 impressions. Refresh-existing companion to /vs/keka-vs-zoho. Both pages are ranking together because Google sees them as the canonical comparison pair for the keka↔zoho pattern.` },
    { slug: "we360-vs-monitask", competitor: "Monitask", date: "2026-09-04", priority: "medium",
      data: `Forward bet — Monitask is a price-led competitor often considered alongside Hubstaff/Time Doctor. Plan Section 6.1 #15. Captures price-conscious buyers in the 5-50 FTE band.` },
  ]),

  // Plan Section 6.1 head-to-head triplet (M5 final 12) — we are NOT an actor in
  // these comparisons but we capture top-of-funnel evaluators researching the
  // category before they hear about us. Each links into the relevant /alternative
  // and /vs/we360-vs-X pages so visitors funnel into our pool.
  ...buildVsPages([
    { slug: "hubstaff-vs-activtrak", competitor: "ActivTrak", date: "2026-09-08", priority: "medium", customH1: "Hubstaff vs ActivTrak",
      data: `Two top-tier competitors in the EM space — searchers comparing them are evaluator-stage. Combined cluster: hubstaff alternative (1,326 imp) + activtrak alternatives (734) = 2,060 imp/16mo on adjacent queries. Internal link funnel into /alternative/hubstaff-alternative and /alternative/activtrak-alternative captures spillover.` },
    { slug: "time-doctor-vs-activtrak", competitor: "ActivTrak", date: "2026-09-09", priority: "medium", customH1: "Time Doctor vs ActivTrak",
      data: `Same head-to-head pattern — Time Doctor + ActivTrak are both common shortlist entries. Cluster: time doctor alternative (754) + activtrak alternatives (734) = 1,488 imp/16mo on adjacent queries.` },
    { slug: "desktime-vs-hubstaff", competitor: "Hubstaff", date: "2026-09-10", priority: "medium", customH1: "DeskTime vs Hubstaff",
      data: `Head-to-head completing the M5 vs-pages set. Cluster: desktime alternative (950) + hubstaff alternative (1,326) = 2,276 imp/16mo on adjacent queries.` },
  ]),

  // Striking-distance batch 2 (queries 11-15)
  {
    key: "B2.4a", kind: "blog_task",
    title: "Striking-distance refresh: /blog/canva-alternative (\"canva alternatives\")",
    scheduled_date: "2026-06-15", priority: "high", pillar: "SEO",
    url: "https://we360.ai/blog/canva-alternative",
    target_keyword: "canva alternatives",
    competition: "Medium Competition",
    data_backing: `GSC 16-mo: 1,020 imp at pos 11.65. Sister queries: "canva alternatives free" 277 imp pos 13.4, "canva alternative" 384 imp pos 39.3, "apps like canva" 539 imp pos 46.9, "websites like canva" 486 imp pos 40.7. Combined cluster 2,706 imp.`,
    issue: `Adjacent intent (graphic design tools) — but proves we can rank for "alternatives" queries. Refresh keeps this win + boosts cluster.`,
    impl: `Refresh playbook applied. Add free-tools comparison table; add "best for" tags; add internal link to /templates index (we have 24 templates which is design-adjacent).

Acceptance: pos 5 within 30 days; CTR 5%+.`,
    brief: emptyBrief("canva alternatives", "Top 10 Canva Alternatives [2026]: Free + Paid Compared", "commercial", 1800,
      { secondary_keywords: ["canva alternatives free", "apps like canva", "websites like canva", "alternatives to canva"] }
    ),
  },
  {
    key: "B2.4b", kind: "blog_task",
    title: "New blog: \"AI employee monitoring software\" (924 imp/16mo)",
    scheduled_date: "2026-06-16", priority: "high", pillar: "SEO",
    target_keyword: "ai employee monitoring software",
    competition: "Medium Competition",
    data_backing: `GSC 16-mo: 924 imp at pos 15.55 (no current dedicated page). "ai tracking employee productivity" 676 imp pos 14.1. Combined ~1,600 imp/16mo. New page targeting AI angle of EM space.`,
    issue: `No dedicated page targets the "AI" qualifier on monitoring queries. Generic /solutions/employee-monitoring doesn't surface for AI intent.`,
    impl: `1. New post at /blog/ai-employee-monitoring-software.
2. H1 + 60-word answer-capsule.
3. Section: How AI changes employee monitoring (computer vision, anomaly detection, predictive flagging).
4. Section: We360.ai's AI features (link to /features/agentic-ai).
5. Comparison table: 5 AI-first EM tools.
6. 5-Q FAQ + schema.

Acceptance: pos 10 within 60 days; +60 clicks/mo upside.`,
    brief: emptyBrief("ai employee monitoring software", "AI Employee Monitoring Software [2026]: How It Works + 5 Tools", "commercial", 2200,
      {
        secondary_keywords: ["ai tracking employee productivity", "ai monitoring tools", "ai workforce monitoring"],
        internal_links: ["/features/agentic-ai", "/solutions/employee-monitoring"],
      }
    ),
  },
  {
    key: "B2.4c", kind: "blog_task",
    title: "Striking-distance refresh: /professional-invoice-generator (\"ai invoice generator\")",
    scheduled_date: "2026-06-17", priority: "medium", pillar: "SEO",
    url: "https://we360.ai/professional-invoice-generator",
    target_keyword: "ai invoice generator",
    competition: "Medium Competition",
    data_backing: `GSC 16-mo: 894 imp at pos 11.57. Sister "invoice ai" 399 imp pos 15.0, "ai bill generator free" 245 imp pos 11.4. Combined 1,538 imp/16mo. Tool already exists.`,
    issue: `Tool page exists but doesn't lean into "AI" framing.`,
    impl: `1. Refresh title to lead with "AI Invoice Generator".
2. Add 60-word answer-capsule.
3. Add 4 sample outputs (different invoice templates).
4. Add 5-Q FAQ + schema.

Acceptance: pos 5 within 30 days; CTR 6%+.`,
    brief: emptyBrief("ai invoice generator", "Free AI Invoice Generator [2026]: Templates + PDF Export", "commercial", 1500,
      { secondary_keywords: ["ai bill generator", "free invoice generator", "online invoice maker"] }
    ),
  },

  // ===========================================================================
  // MONTH 3 (July) — BoF batch 2 (alternative pages) + India 5 + Study #1
  // ===========================================================================

  ...buildAlternativePages([
    { slug: "hubstaff-alternative", competitor: "Hubstaff", date: "2026-07-01", priority: "critical",
      data: `GSC: hubstaff alternative=1,326 imp/16mo, hubstaff alternatives=990. Combined 2,316 imp at avg pos ~22. Industry benchmark for alternative-pages: 30% of impressions captured within 90 days at top-10 → ~700 sessions/mo achievable from this single page.` },
    { slug: "time-doctor-alternative", competitor: "Time Doctor", date: "2026-07-02", priority: "critical",
      data: `GSC: time doctor alternative=754 + timedoctor alternative=528 + time doctor alternatives=688 = 1,970 imp/16mo combined.` },
    { slug: "desktime-alternative", competitor: "DeskTime", date: "2026-07-03", priority: "critical",
      data: `GSC: desktime alternative=950 imp at pos 18.98. Single-query validation.` },
    { slug: "activtrak-alternative", competitor: "ActivTrak", date: "2026-07-06", priority: "critical",
      data: `GSC: activtrak alternatives=734 + activtrak alternative=404 + activtrak competitors=478 = 1,616 imp/16mo. Strongest alternative cluster in our pool.` },
    { slug: "insightful-alternative", competitor: "Insightful", date: "2026-07-07", priority: "high",
      data: `GSC: insightful alternative=544 imp at pos 17.4.` },
    { slug: "teramind-alternative", competitor: "Teramind", date: "2026-07-08", priority: "high",
      data: `Forward bet — no current GSC data on "teramind alternative" but Teramind is top-4 enterprise EM player. Industry benchmark + Hubstaff/Time Doctor data both validate the alternative-pattern.` },
    { slug: "controlio-alternative", competitor: "Controlio", date: "2026-07-09", priority: "medium",
      data: `Forward bet — Controlio is a niche enterprise EM player. Lower volume but lower competition.` },
    { slug: "keka-alternative", competitor: "Keka", date: "2026-07-10", priority: "high",
      data: `GSC: keka alternative=246 imp. Combined with our existing /vs/keka-vs-zoho ranking pos 3.5 (218 imp), plus /blog/zoho-people-vs-keka-hr (76 clicks/16mo), shows we can earn keka-related queries.` },
  ]),

  // India 5 pages (writers — content side; templates ready from K2.4)
  {
    key: "B3.2a", kind: "blog_task",
    title: "Build /in/employee-monitoring-software-india (India BoF)",
    scheduled_date: "2026-07-13", priority: "critical", pillar: "GEO",
    target_keyword: "employee monitoring software india",
    competition: "Medium Competition",
    data_backing: `India = 73% of our existing organic clicks (10,550 of 14,400 over 16 mo). Average position there is 13.84 vs sitewide 25.9 — favored-supplier signal. Across 9,000+ competitor URLs ZERO are India-localized landing pages — uncontested. Realistic 90-day projection: top-3 ranking; +60-120 sessions/mo from this single page.`,
    issue: `No India-localized employee-monitoring landing page despite 73% of clicks coming from India.`,
    impl: `Use /in/* template (K2.4). Content sections:
1. H1: "Employee Monitoring Software India [2026] — Privacy-First, DPDPA-Compliant"
2. 80-word answer-capsule with INR pricing teaser
3. DPDPA compliance section (mandatory for India)
4. Why Indian companies choose We360 (4 use cases: BPO, IT services, banks, agencies)
5. India customer logos (3) + testimonials (2)
6. INR pricing table
7. India-specific FAQ (5 Qs: DPDPA, ESI/PF integration, INR billing, hindi support, India support hours)
8. India phone number visible
9. CTA: book India demo

Acceptance: top-3 ranking for "employee monitoring software india" within 90 days; +60-120 sessions/mo.`,
    brief: emptyBrief("employee monitoring software india", "Employee Monitoring Software India [2026]: DPDPA, INR Pricing", "commercial", 2000,
      {
        secondary_keywords: ["employee monitoring india", "india employee tracking", "employee productivity india"],
        internal_links: ["/solutions/employee-monitoring", "/in/attendance-tracking-software-india", "/pricing"],
      }
    ),
  },
  {
    key: "B3.2b", kind: "blog_task",
    title: "Build /in/attendance-tracking-software-india",
    scheduled_date: "2026-07-14", priority: "high", pillar: "GEO",
    target_keyword: "attendance tracking software india",
    competition: "Medium Competition",
    data_backing: `India strategy validation (Section 6.5 + 2.3): India = 73% of clicks, avg pos 13.84. Plus parent /attendance-tracking-software has 75K imp/16mo at pos 35 — India-specific page captures the India share of that demand.`,
    issue: `No India-localized attendance page. India compliance + ESI/PF integration is a major buyer requirement we don't address on the global page.`,
    impl: `Same /in/* template as B3.2a, content adjusted for attendance:
- DPDPA + ESI/PF + biometric integration
- India payroll integration callouts
- BPO + IT services + banking attendance use cases
- India FAQ (Aadhaar attendance, hybrid attendance, multi-shift)

Acceptance: top-3 within 90 days; +50-100 sessions/mo.`,
    brief: emptyBrief("attendance tracking software india", "Attendance Tracking Software India [2026]: ESI, PF, Biometric Integration", "commercial", 1800,
      {
        secondary_keywords: ["india attendance system", "online attendance india", "attendance tracker india"],
        internal_links: ["/in/employee-monitoring-software-india", "/automated-attendance"],
      }
    ),
  },
  {
    key: "B3.2c", kind: "blog_task",
    title: "Build /in/time-tracking-for-indian-bpo",
    scheduled_date: "2026-07-15", priority: "high", pillar: "GEO",
    target_keyword: "time tracking for indian bpo",
    competition: "Low Competition",
    data_backing: `India = 73% of clicks; Philippines (also a BPO hub) is #3 country (110K imp/16mo). Combined India+Philippines = ~75% of impressions. BPO-specific page targets a vertical with no competitor coverage.`,
    issue: `No BPO-vertical India page. BPO is one of the highest-conversion industries for EM tools.`,
    impl: `Same /in/* template, BPO-vertical content:
- Multi-shift attendance support
- Agent productivity tracking (call center metrics)
- Compliance: India + Philippines BPO regulations
- 3 BPO customer logos (e.g., a known India BPO)
- BPO-specific FAQ (24/7 support, multi-shift, AHT tracking)

Acceptance: top-3 within 90 days; +30-80 sessions/mo from a niche-but-conversion-heavy vertical.`,
    brief: emptyBrief("time tracking for indian bpo", "Time Tracking for Indian BPO [2026]: Multi-Shift, Agent Productivity, AHT", "commercial", 1700,
      { secondary_keywords: ["bpo time tracking india", "call center monitoring india", "bpo productivity india"],
        internal_links: ["/industries/bpo", "/in/employee-monitoring-software-india"] }
    ),
  },
  {
    key: "B3.2d", kind: "blog_task",
    title: "Build /in/workforce-analytics-india",
    scheduled_date: "2026-07-16", priority: "medium", pillar: "GEO",
    target_keyword: "workforce analytics india",
    competition: "Low Competition",
    data_backing: `Sister-query "workforce analytics" 3,737 imp/16mo at pos 73 (zero-click bucket). India-specific spin captures the India share at lower competition.`,
    issue: `Workforce analytics is a high-impression query (3,737 imp) with no good page. India-specific is uncontested + matches our user base.`,
    impl: `Same /in/* template. Sections: India HR analytics use cases, attrition risk for Indian markets, productivity benchmarks (BPO + IT services).`,
    brief: emptyBrief("workforce analytics india", "Workforce Analytics India [2026]: HR + Productivity Benchmarks", "commercial", 1700,
      { internal_links: ["/in/employee-monitoring-software-india", "/features/business-intelligence"] }
    ),
  },
  {
    key: "B3.2e", kind: "blog_task",
    title: "Build /in/productivity-software-for-indian-enterprises",
    scheduled_date: "2026-07-17", priority: "medium", pillar: "GEO",
    target_keyword: "productivity software for indian enterprises",
    competition: "Low Competition",
    data_backing: `Enterprise India tier (500+ FTE) — high-AOV but lower volume than the SMB queries. Differentiated landing page so enterprise buyers don't bounce off the SMB-priced /pricing page.`,
    issue: `No enterprise-specific India page. Enterprise buyers want compliance, SLAs, and dedicated support evidence.`,
    impl: `Template + enterprise content:
- SLA + dedicated support callout
- Compliance: ISO 27001, SOC 2, DPDPA
- Custom-pricing CTA (no public pricing for enterprise)
- 2 enterprise customer logos (e.g., 500+ FTE companies)

Acceptance: 10+ enterprise-tier demos/mo by Month 5.`,
    brief: emptyBrief("productivity software for indian enterprises", "Productivity Software for Indian Enterprises [2026]: SLA, Compliance, Support", "commercial", 1700,
      { internal_links: ["/in/employee-monitoring-software-india", "/security-and-compliance"] }
    ),
  },

  // Industry pages M3 (2 pages: BPO + IT services)
  {
    key: "B3.1i1", kind: "blog_task",
    title: "Build /industries/bpo (BPO + call-center vertical)",
    scheduled_date: "2026-07-20", priority: "high", pillar: "SEO",
    target_keyword: "employee monitoring bpo",
    competition: "Medium Competition",
    data_backing: `BPO-specific data: Philippines (BPO hub) is our #3 country with 110K imp/16mo. Combined with India BPO = significant audience. No GSC keyword data yet on "employee monitoring bpo" — forward bet justified by country split.`,
    issue: `No BPO industry page despite BPO being our highest-converting vertical (per existing case studies).`,
    impl: `/industries/* template (K2.4). BPO-specific content:
- Multi-shift agent productivity
- Call-center-specific metrics (AHT, CSAT correlation)
- 3 BPO logos
- BPO compliance section (PCI DSS for finance BPOs)
- Pricing teaser per-agent`,
    brief: emptyBrief("employee monitoring bpo", "Employee Monitoring for BPO [2026]: Agents, Multi-Shift, Compliance", "commercial", 1800,
      { internal_links: ["/in/time-tracking-for-indian-bpo", "/solutions/employee-monitoring"] }
    ),
  },
  {
    key: "B3.1i2", kind: "blog_task",
    title: "Build /industries/it-services (replaces /new-it---industry redirect)",
    scheduled_date: "2026-07-21", priority: "high", pillar: "SEO",
    target_keyword: "employee monitoring for it services",
    competition: "Medium Competition",
    data_backing: `IT services is one of our top customer verticals. Captures the /new-it---industry CNI URL (Section 3.2) when redirected. India IT services is a $250B sector — high-value vertical.`,
    issue: `Old URL /new-it---industry was a thin landing page — it's in the CNI bucket. Need a real page so the 301 has a quality destination.`,
    impl: `/industries/* template, IT-services content. Cover: project-time correlation (Jira integration teaser), client-billable hours, hybrid IT-team monitoring, GDPR for international clients.`,
    brief: emptyBrief("employee monitoring for it services", "Employee Monitoring for IT Services [2026]: Project Time, Client Billing", "commercial", 1800,
      { internal_links: ["/integrations/jira", "/solutions/employee-monitoring"] }
    ),
  },

  // Striking-distance batch 3 (queries 21-25)
  {
    key: "B3.3a", kind: "blog_task",
    title: "Striking-distance: \"efficiency tracking using ai tools\" (636 imp)",
    scheduled_date: "2026-07-23", priority: "medium", pillar: "SEO",
    target_keyword: "efficiency tracking using ai tools",
    competition: "Low Competition",
    data_backing: `GSC 16-mo: 636 imp at pos 14.1. Adjacent: "ai tracking employee productivity" 676 imp at pos 14.1. New blog post or refresh existing AI-themed content.`,
    issue: `No dedicated content for this AI-tracking intent.`,
    impl: `New blog at /blog/ai-efficiency-tracking-tools. Cover: 5 AI tools that track team efficiency, comparison table, We360.ai positioning. Internal link to /features/agentic-ai.`,
    brief: emptyBrief("efficiency tracking using ai tools", "AI Efficiency Tracking Tools [2026]: 5 Tools Compared", "commercial", 1700,
      { internal_links: ["/features/agentic-ai", "/blog/ai-employee-monitoring-software"] }
    ),
  },
  {
    key: "B3.3b", kind: "blog_task",
    title: "Striking-distance: \"track remote workers\" (631 imp)",
    scheduled_date: "2026-07-24", priority: "medium", pillar: "SEO",
    target_keyword: "track remote workers",
    competition: "Medium Competition",
    data_backing: `GSC 16-mo: 631 imp at pos 18.9. Adjacent to /blog/remote-screen-monitoring (B1.4a) but different intent angle (broader "tracking" vs specific "screen monitoring").`,
    issue: `Generic "track remote workers" intent — needs a how-to-style guide page.`,
    impl: `New blog at /blog/how-to-track-remote-workers. Cover: 5 ways to track (productivity, time, attendance, output, sentiment), tool comparison, ethics. Internal link to /solutions/employee-monitoring.`,
    brief: emptyBrief("track remote workers", "How to Track Remote Workers [2026]: 5 Methods + Best Tools", "informational", 2000,
      { internal_links: ["/solutions/employee-monitoring", "/blog/remote-screen-monitoring-software-a-game-changer-for-work-from-home-teams"] }
    ),
  },
  {
    key: "B3.3c", kind: "blog_task",
    title: "Striking-distance: \"insightful alternative\" (544 imp)",
    scheduled_date: "2026-07-27", priority: "medium", pillar: "SEO",
    target_keyword: "insightful alternative",
    competition: "Medium Competition",
    data_backing: `GSC 16-mo: 544 imp at pos 17.4. Direct alternative-query that maps to /alternative/insightful-alternative (BoF B3.1e shipping same week).`,
    issue: `Already shipping the BoF page — this striking-distance task is the supporting blog that internally links INTO the BoF page.`,
    impl: `New supporting blog post: "Switching from Insightful to We360.ai — what changed". Personal-voice migration story with specifics (pricing, features, support). Internal link DEEP into /alternative/insightful-alternative.`,
    brief: emptyBrief("insightful alternative", "Insightful Alternative [2026]: Why Teams Switch to We360.ai", "commercial", 1500,
      { internal_links: ["/alternative/insightful-alternative", "/solutions/employee-monitoring"] }
    ),
  },

  // Data study #1
  {
    key: "B3.4", kind: "blog_task",
    title: "Data Study #1 — \"We360 Workforce Productivity Index 2026 (India H1)\"",
    scheduled_date: "2026-07-28", priority: "high", pillar: "SEO",
    target_keyword: "workforce productivity index india 2026",
    competition: "Low Competition",
    data_backing: `Data studies are the highest-yield link-building format for B2B SaaS in 2024-2026 (Backlinko studies). Average study earns 50-150 referring domains in 6 months. Demand validated by GSC: "what causes low productivity" 25,378 imp at pos 10.89 — high-volume query with no good destination today.`,
    issue: `No flagship data asset. Backlinks are flat post-disavow (K1.2). Need a study that earns 30+ referring domains in 60 days to compound on a clean profile.`,
    impl: `1. Pull anonymized aggregate data from We360 user base (productivity trends, hybrid-vs-onsite gap, BPO sector benchmarks).
2. Output: data report PDF + 1 long-form blog post.
3. PR pitches to TechCrunch India + YourStory + ET + Inc42 + Mint (5 pubs).
4. Build interactive chart embed for the blog.

Acceptance: PR coverage in 3 publications; 30 referring domains within 60 days; supporting blog ranks pos 20 for 2 study-related queries within 90 days.`,
    brief: emptyBrief("workforce productivity index india 2026", "We360 Workforce Productivity Index 2026 — India H1 Edition", "informational", 3500,
      {
        recommended_h2s: ["Methodology", "Headline findings (5 charts)", "Hybrid vs onsite gap", "BPO sector benchmarks", "Productivity by company size", "Implications for HR + Ops leaders"],
        internal_links: ["/solutions/employee-monitoring", "/in/employee-monitoring-software-india"],
      }
    ),
  },

  // ===========================================================================
  // MONTH 4 (August) — 8 integrations + 8 industries + striking 31-50
  // ===========================================================================

  // Phase B (Apr 29) — only 5 REAL integrations exist as of today: Keka,
  // Zoho, GreyTHR, Jira, MS Teams. We removed the 6 promotional pages
  // (Slack, Salesforce, Asana, Zoom, HubSpot, Google Workspace) since we
  // don't actually integrate with those — see DELETED_KEYS below.
  ...buildIntegrationPages([
    { tool: "microsoft-teams", title: "Microsoft Teams", date: "2026-06-22", priority: "high",
      data: `MS Teams is dominant in enterprise India (replaces Slack in most large orgs). Real working integration with We360 — activity feed + Teams app + bot. Drives demos from MS Teams shops.` },
    { tool: "jira", title: "Jira", date: "2026-06-23", priority: "high",
      data: `Engineering teams (especially India IT services — see /industries/it-services) use Jira heavily. Integration enables engineering productivity correlation. Real working integration.` },
    { tool: "keka", title: "Keka", date: "2026-06-24", priority: "high",
      data: `Keka is one of the top India HR/payroll platforms — heavy overlap with our ICP. Real working integration with We360 attendance + productivity data flowing into Keka. Adjacent demand: /vs/keka-vs-zoho already at GSC pos 3.5 with 218 imp/16mo.` },
    { tool: "zoho", title: "Zoho People", date: "2026-06-25", priority: "high",
      data: `Zoho People is the second-most-installed India HR platform after Keka. Real working integration. Adjacent: /vs/zoho-vs-keka at GSC pos 3.3 (137 imp/16mo). Captures Zoho-shop buyers.` },
    { tool: "greythr", title: "greytHR", date: "2026-06-26", priority: "medium",
      data: `greytHR is a top India payroll + HR platform with strong SMB+mid-market footprint. Real working integration. Niche but high-conversion India audience.` },
  ]),

  // 8 remaining industry pages (August)
  ...["banking", "healthcare", "agencies", "edtech", "insurance", "saas", "retail", "manufacturing"].map((vertical, i): BlogTask => ({
    key: `B4.2.${i + 1}`, kind: "blog_task",
    title: `Build /industries/${vertical}`,
    scheduled_date: `2026-08-${String(17 + i).padStart(2, "0")}`,
    priority: vertical === "banking" || vertical === "healthcare" ? "high" : "medium",
    pillar: "SEO",
    target_keyword: `employee monitoring for ${vertical}`,
    competition: "Medium Competition",
    data_backing: `Industry-page strategy from Section 6.4. Each page targets ~50-150 sessions/mo at top-10. Combined 8 pages → ~600-1,200 sessions/mo by 90 days.`,
    issue: `No ${vertical}-vertical industry page exists.`,
    impl: `Use /industries/* template (K2.4). Adapt content for ${vertical}: industry-specific use cases, compliance section, customer logos from same vertical, vertical-specific FAQ.`,
    brief: emptyBrief(`employee monitoring for ${vertical}`, `Employee Monitoring for ${vertical[0].toUpperCase() + vertical.slice(1)} [2026]: Compliance, Use Cases, Pricing`, "commercial", 1700,
      { internal_links: ["/solutions/employee-monitoring", "/in/employee-monitoring-software-india"] }
    ),
  })),

  // ===========================================================================
  // MONTH 5 (September) — Final 12 BoF + US pilot + Study #2
  // ===========================================================================

  ...buildVsPages([
    { slug: "we360-vs-insightful", competitor: "Insightful", date: "2026-09-01", priority: "high",
      data: `Cluster: insightful alternative=544 imp. Aligns with B3.1e BoF and B3.3c striking-distance.` },
    { slug: "we360-vs-controlio", competitor: "Controlio", date: "2026-09-02", priority: "medium",
      data: `Forward bet — Controlio is a niche enterprise EM player. Lower volume, lower competition.` },
    { slug: "hubstaff-vs-time-doctor", competitor: "Time Doctor", date: "2026-09-03", priority: "medium", customH1: "Hubstaff vs Time Doctor",
      data: `Head-to-head competitor comparison. Validates broader competitive demand even though we're not a primary actor in the comparison. Captures top-of-funnel buyers researching the category.` },
    { slug: "teramind-vs-activtrak", competitor: "ActivTrak", date: "2026-09-07", priority: "medium", customH1: "Teramind vs ActivTrak",
      data: `Same head-to-head pattern as above. Two enterprise players competitors evaluate.` },
  ]),

  // US-specific pilot (4 pages)
  {
    key: "B5.2a", kind: "blog_task",
    title: "Build /blog/employee-monitoring-laws-by-us-state",
    scheduled_date: "2026-09-10", priority: "high", pillar: "SEO",
    target_keyword: "employee monitoring laws by state",
    competition: "Medium Competition",
    data_backing: `US = 45% of impressions but 5.6% of clicks (avg pos 31.7) — unmonetized demand. US-specific compliance content fills a gap competing tools cover but we don't.`,
    issue: `No US-state-by-state employee monitoring legality content. US buyers go to competitor pages for this.`,
    impl: `Long-form pillar (3,500+ words). Per-state legality table (50 states). Federal vs state breakdown. Notice + consent requirements. We360.ai's US-mode features (auto-blur sensitive content, etc.).`,
    brief: emptyBrief("employee monitoring laws by state", "Employee Monitoring Laws by US State [2026]: Complete Legal Guide", "informational", 3500,
      { internal_links: ["/blog/california-cpra-and-employee-monitoring", "/solutions/employee-monitoring"] }
    ),
  },
  {
    key: "B5.2b", kind: "blog_task",
    title: "Build /blog/california-cpra-and-employee-monitoring",
    scheduled_date: "2026-09-11", priority: "high", pillar: "SEO",
    target_keyword: "california cpra employee monitoring",
    competition: "Low Competition",
    data_backing: `California CPRA is the strictest US privacy law affecting employee monitoring. US California buyers need explicit guidance. Forward bet on a specific niche query.`,
    issue: `No CCPA/CPRA-specific monitoring content.`,
    impl: `Long-form (2,500 words). CPRA basics. Employee data rights under CPRA. Compliance checklist. We360.ai's CPRA-mode settings.`,
    brief: emptyBrief("california cpra employee monitoring", "California CPRA + Employee Monitoring [2026]: Compliance Guide", "informational", 2500,
      { internal_links: ["/blog/employee-monitoring-laws-by-us-state", "/security-and-compliance"] }
    ),
  },
  {
    key: "B5.2c", kind: "blog_task",
    title: "Build /blog/best-employee-monitoring-for-small-business-us",
    scheduled_date: "2026-09-14", priority: "medium", pillar: "SEO",
    target_keyword: "best employee monitoring for small business us",
    competition: "Medium Competition",
    data_backing: `SMB (small business) is the entry-tier buyer. US SMB segment is fragmented + underserved. Our pricing is SMB-friendly.`,
    issue: `No SMB-specific US monitoring page.`,
    impl: `Compare 5 SMB-friendly tools (We360, Hubstaff, ActivTrak, DeskTime, Time Doctor). Price-led. <$10/seat focus. Easy setup emphasis.`,
    brief: emptyBrief("best employee monitoring for small business us", "Best Employee Monitoring for US Small Business [2026]: 5 Tools Under $10/Seat", "commercial", 2000,
      { internal_links: ["/solutions/employee-monitoring", "/pricing"] }
    ),
  },
  {
    key: "B5.2d", kind: "blog_task",
    title: "Build /blog/we360-for-us-distributed-teams",
    scheduled_date: "2026-09-15", priority: "medium", pillar: "SEO",
    target_keyword: "employee monitoring us distributed teams",
    competition: "Low Competition",
    data_backing: `Distributed-team trend in US is structural (post-COVID). We360.ai's strengths (low-bandwidth, privacy-first) fit distributed-team needs.`,
    issue: `No US-distributed-teams positioning page.`,
    impl: `Personal-voice product story. 4 use cases: cross-timezone teams, async ops, contractor management, remote-first scaleups. Customer story.`,
    brief: emptyBrief("employee monitoring us distributed teams", "We360.ai for US Distributed Teams [2026]: Cross-Timezone, Async, Privacy", "commercial", 1800,
      { internal_links: ["/solutions/employee-monitoring", "/blog/best-employee-monitoring-for-small-business-us"] }
    ),
  },

  // Data Study #2 launch
  {
    key: "B5.3", kind: "blog_task",
    title: "Data Study #2 — \"AI tools at work: 50K employees actually use vs HR thinks\"",
    scheduled_date: "2026-09-22", priority: "high", pillar: "SEO",
    target_keyword: "ai tools at work survey 2026",
    competition: "Low Competition",
    data_backing: `Second study compounds backlinks built by Study #1 (B3.4). AI-at-work topic is high-search-volume in 2026 (per Section 5.1: "what ai platforms are best for tracking employee productivity" 2,094 imp at pos 9). PR-friendly story angle.`,
    issue: `Need a second backlink-magnet asset to compound on Study #1.`,
    impl: `1. Aggregate We360.ai application-tracking data — top AI tools used by employees vs top AI tools HR believes are used.
2. Survey supplement: 200-respondent HR leader survey on AI tool perception.
3. Output: data report + 1 long-form blog + interactive chart + 5 PR pitches (HBR India, ET, YourStory, Forbes India, Mint).

Acceptance: PR coverage 3+ pubs; 40 referring domains within 60 days.`,
    brief: emptyBrief("ai tools at work survey 2026", "AI Tools at Work — What 50,000 Employees Actually Use vs What HR Thinks", "informational", 3500,
      { internal_links: ["/features/agentic-ai", "/blog/ai-employee-monitoring-software"] }
    ),
  },

  // ===========================================================================
  // MONTH 6 (October) — Mid-funnel content batch + striking 51-57
  // ===========================================================================

  // Mid-funnel: top 3 zero-click queries (Section 5.1)
  {
    key: "B6.3a", kind: "blog_task",
    title: "Pillar: \"What Causes Low Productivity\" (25,378 imp/16mo at pos 10.89)",
    scheduled_date: "2026-10-05", priority: "critical", pillar: "SEO",
    target_keyword: "what causes low productivity",
    competition: "Medium Competition",
    data_backing: `GSC 16-mo: 25,378 impressions, 0 clicks (zero-click bucket), avg position 10.89. Top zero-click query in our entire pool. We're already adjacent (pos 10.89 means we appear sometimes) but no dedicated page captures it.`,
    issue: `25K impressions per 16 months and zero clicks. Single biggest "we're seen but invisible" gap in the entire data set.`,
    impl: `Long-form pillar (3,500+ words):
- 60-word answer-capsule with verdict
- "The 7 root causes of low productivity" framework
- Each cause: definition, signs, how to measure (link to /employee-productivity-roi-calculator), how to fix
- Interactive diagnostic quiz (15 questions)
- Comparison: low productivity vs burnout vs disengagement
- 6-Q FAQ + schema
- Internal links: /blog/how-to-measure-productivity-formula-metrics-and-best-methods, /solutions/employee-monitoring, /features/business-intelligence

Acceptance: pos 5 within 60 days; CTR 5%+; +1,000 clicks/mo.`,
    brief: emptyBrief("what causes low productivity", "What Causes Low Productivity [2026]: 7 Root Causes + How to Fix Each", "informational", 3500,
      { internal_links: ["/blog/how-to-measure-productivity-formula-metrics-and-best-methods", "/solutions/employee-monitoring"] }
    ),
  },
  {
    key: "B6.3b", kind: "blog_task",
    title: "Pillar: \"People Analytics\" (6,345 imp/16mo at pos 73)",
    scheduled_date: "2026-10-06", priority: "high", pillar: "SEO",
    target_keyword: "people analytics",
    competition: "High Competition",
    data_backing: `GSC 16-mo: 6,345 imp, 0 clicks, position 73.16. Adjacent query "hr analytics vs people analytics" 488 imp at pos 23.3 — also opportunity.`,
    issue: `6K impressions and we rank position 73 — basically invisible. Need a strong pillar that captures this from-scratch.`,
    impl: `Pillar (3,000 words):
- Definition + 60-word answer-capsule
- "People analytics vs HR analytics" comparison
- 5 use cases (turnover prediction, productivity benchmarking, hybrid optimization, comp benchmarking, DEI metrics)
- Tools landscape: 8 leading people-analytics platforms (we feature)
- Implementation playbook
- 5-Q FAQ + schema

Acceptance: pos 20 within 90 days; CTR 1.5%+; +90 clicks/mo.`,
    brief: emptyBrief("people analytics", "People Analytics [2026]: Definition, Tools, Use Cases", "informational", 3000,
      { internal_links: ["/features/business-intelligence", "/in/workforce-analytics-india"] }
    ),
  },
  {
    key: "B6.3c", kind: "blog_task",
    title: "Pillar: \"Operational Efficiency\" (5,338 imp/16mo at pos 75)",
    scheduled_date: "2026-10-07", priority: "high", pillar: "SEO",
    target_keyword: "operational efficiency",
    competition: "Medium Competition",
    data_backing: `GSC 16-mo: 5,338 imp, 1 click, position 74.71. Adjacent: "importance of operational efficiency" 438 imp at pos 19.4 (already in striking distance).`,
    issue: `5K impressions, position 75. Need a pillar that anchors operational-efficiency cluster.`,
    impl: `Pillar (3,000 words):
- Definition + 60-word answer-capsule
- The OE framework (5 dimensions: speed, cost, quality, customer satisfaction, employee engagement)
- 6 case studies (mini)
- How to measure OE (link to /employee-productivity-roi-calculator)
- Tools (we feature)
- 5-Q FAQ + schema

Acceptance: pos 25 within 90 days; CTR 1%+; +50 clicks/mo.`,
    brief: emptyBrief("operational efficiency", "Operational Efficiency [2026]: Framework, Metrics, Case Studies", "informational", 3000,
      { internal_links: ["/blog/how-to-measure-productivity-formula-metrics-and-best-methods", "/employee-productivity-roi-calculator"] }
    ),
  },

  // Striking-distance batch 4 (queries 31-40)
  {
    key: "B6.4a", kind: "blog_task",
    title: "Striking-distance: \"recognition vs recognization\" (519 imp, pos 11.6)",
    scheduled_date: "2026-10-12", priority: "low", pillar: "SEO",
    target_keyword: "recognition vs recognization",
    competition: "Low Competition",
    data_backing: `GSC: 519 imp at pos 11.6. Quirky misspell-disambiguation query but volume is real. Easy win.`,
    issue: `Single "is it recognition or recognization" query. We can rank #1 with a 600-word answer.`,
    impl: `Short post (~600 words). Spelling explanation + employee recognition primer + link to /templates/employee-recognition-survey-form.`,
    brief: emptyBrief("recognition vs recognization", "Recognition vs Recognization — Which Is Correct?", "informational", 800,
      { internal_links: ["/templates/employee-recognition-survey-form"] }
    ),
  },
  {
    key: "B6.4b", kind: "blog_task",
    title: "Striking-distance: \"employee 360\" (467 imp, pos 18.6)",
    scheduled_date: "2026-10-13", priority: "medium", pillar: "SEO",
    target_keyword: "employee 360",
    competition: "Medium Competition",
    data_backing: `GSC: 467 imp at pos 18.6. Adjacent to brand "we360" but generic intent. Captures category-defining buyers.`,
    issue: `Queryers search "employee 360" and find generic results — opportunity to land them on a we360 narrative page.`,
    impl: `New post: "Employee 360 [2026]: Why 'whole-person' workforce visibility is replacing point tools." Frame as category narrative leading into We360.ai.`,
    brief: emptyBrief("employee 360", "Employee 360 [2026]: Why Whole-Person Workforce Visibility Is the New Standard", "informational", 1800,
      { internal_links: ["/", "/solutions/employee-monitoring"] }
    ),
  },

  // ===========================================================================
  // MONTH 7 (November) — Refresh wave 4 + mid-funnel + Study #3 + Pillar #1
  // ===========================================================================

  {
    key: "B7.4", kind: "blog_task",
    title: "Pillar #1: \"Workforce Productivity Software — The Buyer's Guide 2026\"",
    scheduled_date: "2026-11-03", priority: "critical", pillar: "SEO",
    target_keyword: "workforce productivity software",
    competition: "High Competition",
    data_backing: `GSC: "workforce productivity software" 3,101 imp at pos 24.6 (zero-click bucket). Plus "workforce analytics platform" 2,382 imp at pos 28.7. Combined 5,483 imp/16mo — anchor for the broader category.`,
    issue: `No pillar exists. Buyers researching the category land on competitor buyer's guides.`,
    impl: `Massive pillar (5,000+ words):
- 60-word answer-capsule with verdict
- "What is workforce productivity software" definition
- 7 categories of tools (time tracking, screen monitoring, output measurement, sentiment, analytics, integrated suites, AI-augmented)
- Per-category: 3 representative tools + when to use
- Buying framework: 8 questions to ask vendors
- Pricing benchmarks (per-seat ranges per category)
- Comparison matrix (15 tools × 12 features)
- 8-Q FAQ + schema
- Heavy internal linking — every BoF page from our 50-page set links from here

Acceptance: pos 10 within 90 days; CTR 3%+; +300 clicks/mo + acts as topical-authority hub for all 50 BoF pages.`,
    brief: emptyBrief("workforce productivity software", "Workforce Productivity Software [2026]: The Buyer's Guide (15 Tools Compared)", "commercial", 5000,
      {
        secondary_keywords: ["workforce productivity tools", "workforce analytics platform", "productivity software for teams"],
        internal_links: ["/solutions/employee-monitoring", "/vs/we360-vs-hubstaff", "/alternative/hubstaff-alternative", "/in/employee-monitoring-software-india"],
      }
    ),
  },
  {
    key: "B7.3", kind: "blog_task",
    title: "Data Study #3 — kickoff (topic TBD with marketing)",
    scheduled_date: "2026-11-10", priority: "medium", pillar: "SEO",
    target_keyword: "data study 3 (placeholder)",
    competition: "Low Competition",
    data_backing: `Third study compounds on Study #1 + #2 backlinks. Topic to be selected based on what M6 review (K6.4) reveals about which content angles drove the most demos.`,
    issue: `Need third backlink-magnet asset for end-of-year PR push.`,
    impl: `1. Topic kickoff with marketing — pick from candidates: "remote work productivity meta-analysis", "burnout indicators in monitoring data", "the 4-day work week productivity study".
2. Production runs through Month 8 launch.

Acceptance: topic chosen + outline approved by Nov 15.`,
    brief: emptyBrief("data study 3 placeholder", "Data Study #3 [TBD]", "informational", 3000,
      { writer_notes: ["Topic finalization happens after K6.4 review."] }
    ),
  },

  // ===========================================================================
  // MONTH 8 (December) — 3 pillar pages launch
  // ===========================================================================

  {
    key: "B8.1a", kind: "blog_task",
    title: "Pillar #2: \"Employee Monitoring Software — The 2026 Buyer's Guide\"",
    scheduled_date: "2026-12-01", priority: "critical", pillar: "SEO",
    target_keyword: "employee monitoring software guide",
    competition: "High Competition",
    data_backing: `Anchor pillar for the entire vs/* + alternative/* + solutions/* cluster (50 BoF pages built M2-M5). Compounds topical authority.`,
    issue: `Need umbrella pillar that internally links to every BoF + solution page.`,
    impl: `Pillar (5,000+ words). Same structure as B7.4 but EM-specific. Heavy internal linking to ALL 50 BoF pages.`,
    brief: emptyBrief("employee monitoring software guide", "Employee Monitoring Software [2026]: The Definitive Buyer's Guide", "commercial", 5000,
      { internal_links: ["/solutions/employee-monitoring", "/vs/we360-vs-hubstaff", "/alternative/hubstaff-alternative"] }
    ),
  },
  {
    key: "B8.1b", kind: "blog_task",
    title: "Pillar #3: \"Workforce Analytics — What It Is + Tools Compared\"",
    scheduled_date: "2026-12-08", priority: "high", pillar: "SEO",
    target_keyword: "workforce analytics",
    competition: "High Competition",
    data_backing: `GSC: "workforce analytics" 3,737 imp at pos 73.1 + "workforce analytics platform" 2,382 imp at pos 28.7 + "workforce analytics ai" 441 imp at pos 16.4. Combined 6,560 imp/16mo on a category we currently can't capture.`,
    issue: `Workforce analytics is the analytics-tier framing of our product. No pillar today.`,
    impl: `Pillar (4,500 words). Definition, use cases, tools landscape, our (We360.ai) positioning.`,
    brief: emptyBrief("workforce analytics", "Workforce Analytics [2026]: Definition, Tools, ROI", "commercial", 4500,
      { internal_links: ["/in/workforce-analytics-india", "/features/business-intelligence"] }
    ),
  },
  {
    key: "B8.1c", kind: "blog_task",
    title: "Pillar #4: \"AI in the Workplace — Productivity Without Big Brother\"",
    scheduled_date: "2026-12-15", priority: "high", pillar: "SEO",
    target_keyword: "ai in the workplace",
    competition: "High Competition",
    data_backing: `Captures AI-related strikes from M2-M3 work (B2.4b "ai employee monitoring software" 924 imp + B6.3a/b/c pillars + Study #2). Frames AI-at-work narrative around our brand position.`,
    issue: `AI-related queries are scattered across M2-M6 work — need an anchor pillar that aggregates them.`,
    impl: `Pillar (4,000 words). Cover: ethics, productivity gains, monitoring vs trust, AI tools landscape, We360.ai's AI-augmented features.`,
    brief: emptyBrief("ai in the workplace", "AI in the Workplace [2026]: Productivity Without Big Brother", "commercial", 4000,
      { internal_links: ["/features/agentic-ai", "/blog/ai-employee-monitoring-software"] }
    ),
  },
  {
    key: "B8.3", kind: "blog_task",
    title: "Data Study #3 — PR launch + repurposing",
    scheduled_date: "2026-12-18", priority: "high", pillar: "SEO",
    target_keyword: "data study 3 launch (placeholder)",
    competition: "Low Competition",
    data_backing: `End-of-year PR window — best window for thought-leadership coverage. Studies launched in December index by Q1 of the following year.`,
    issue: `Need PR + repurposing playbook for Study #3.`,
    impl: `1. PR pitch to 5 publications (rotation from prior studies).
2. Repurpose into: 4 LinkedIn posts, 1 Twitter thread, 3 customer-newsletter blurbs.
3. Track referring domains weekly.

Acceptance: 5 PR pubs; 40 referring domains within 60 days.`,
    brief: emptyBrief("data study 3 launch placeholder", "Data Study #3 — Launch + Repurposing", "informational", 0,
      { writer_notes: ["Operational task — output is PR coverage + LinkedIn/Twitter assets, not a blog post."] }
    ),
  },
  {
    key: "B8.4", kind: "blog_task",
    title: "8-month review + H2 (Jan-Aug 2027) plan",
    scheduled_date: "2026-12-22", priority: "high", pillar: "SEO",
    target_keyword: "8-month review",
    competition: "Low Competition",
    data_backing: `End of 8-month plan. Re-pull GSC + GA4 vs Tier 1 (40-50K realistic) and Tier 2 (5-8K commercial + 150-300 demos/mo) targets. Next plan must be evidence-based.`,
    issue: `Plan ends. Without explicit review + re-plan, momentum stalls in Jan 2027.`,
    impl: `1. Re-pull all baseline tables from Section 2 of the original plan with fresh data.
2. Diff: actuals vs targets per tier.
3. Top 5 worked / top 5 didn't.
4. Build Jan-Aug 2027 plan (similar structure: 8-month, 24 page-eq/mo, dev+content tracks).
5. Present to leadership.

Acceptance: 2027 plan delivered Dec 22; team-wide kickoff scheduled Jan 5, 2027.`,
    brief: emptyBrief("8-month review", "8-Month Review + 2027 Plan", "informational", 0,
      { writer_notes: ["Operational task — output is the new plan doc + memo."] }
    ),
  },

  // ===========================================================================
  // PHASE C+D+E ADDITIONS (Apr 29 2026) — 2-month focus (May+June)
  // Triggered by Semrush + Topical Authority + Keyword Gap data review on
  // Apr 29. Adds: 19 Moz striking-distance refreshes, homepage retarget,
  // 30 unique-angle articles, 5 feature pillars, 5 high-volume gap pages,
  // 3 India expansion pages, 8 feature-cluster blogs, 2 expertise blogs,
  // /reviews/ + /how-it-works/ pages.
  // ===========================================================================

  // ---- PHASE C: Tier 1 — 19 Moz striking-distance refreshes (May 4-22) ----
  // Each is an Update Post: refresh existing /blog/* or feature/solution page
  // already ranking pos 4-20. Writer uses GSC URL Inspection to find the
  // exact page, then applies refresh playbook.
  ...buildStrikingDistanceTasks([
    { kw: "workforce productivity platform", vol: 364, ourPos: 16, lift: 101, kd: 38, date: "2026-05-04" },
    { kw: "track remote employees", vol: 57, ourPos: 13, lift: 11, kd: 37, date: "2026-05-04" },
    { kw: "remote working monitoring software", vol: 174, ourPos: 16, lift: 9, kd: 43, date: "2026-05-05" },
    { kw: "workforce analytics software", vol: 47, ourPos: 15, lift: 9, kd: 35, date: "2026-05-05" },
    { kw: "employee efficiency", vol: 56, ourPos: 16, lift: 8, kd: 29, date: "2026-05-06" },
    { kw: "workforce analytics solution", vol: 33, ourPos: 10, lift: 8, kd: 38, date: "2026-05-06" },
    { kw: "user tracking software", vol: 30, ourPos: 16, lift: 8, kd: 42, date: "2026-05-07" },
    { kw: "user activity monitoring tools", vol: 35, ourPos: 20, lift: 7, kd: 37, date: "2026-05-07" },
    { kw: "productivity monitoring", vol: 27, ourPos: 7, lift: 6, kd: 48, date: "2026-05-08" },
    { kw: "employee spy software", vol: 20, ourPos: 18, lift: 5, kd: 46, date: "2026-05-08" },
    { kw: "measure of productivity", vol: 246, ourPos: 17, lift: 2, kd: 54, date: "2026-05-15" },
    { kw: "workforce tracking", vol: 25, ourPos: 20, lift: 2, kd: 41, date: "2026-05-15" },
    { kw: "formula for constant workforce planning", vol: 27, ourPos: 4, lift: 1, kd: 18, date: "2026-05-18" },
    { kw: "pc monitoring tools", vol: 25, ourPos: 10, lift: 1, kd: 39, date: "2026-05-18" },
    { kw: "remote screen monitoring software", vol: 22, ourPos: 10, lift: 1, kd: 39, date: "2026-05-19" },
    { kw: "tracking remote worker engagement", vol: 28, ourPos: 11, lift: 0, kd: 26, date: "2026-05-20" },
    { kw: "softwar for tracking people", vol: 27, ourPos: 18, lift: 0, kd: 41, date: "2026-05-20" },
    { kw: "pc monitoring tools with notifications", vol: 27, ourPos: 19, lift: 0, kd: 45, date: "2026-05-21" },
    { kw: "maximum productivity", vol: 20, ourPos: 14, lift: 0, kd: 36, date: "2026-05-22" },
  ]),

  // ---- PHASE C: Homepage retarget ----
  {
    key: "K-HOME", kind: "blog_task",
    title: "Retarget homepage to rank for \"employee monitoring software\"",
    scheduled_date: "2026-05-18", priority: "critical", pillar: "SEO",
    target_keyword: "employee monitoring software",
    competition: "High Competition",
    est_volume: 10000,
    action: "REFRESH",
    data_backing: `Strategic doc — Keyword Gap Analysis (Apr 2026): "employee monitoring software" = 8,000-12,000 vol/mo, High KD. Top 3: Hubstaff #1, ActivTrak #2, Time Doctor #3. We360.ai is NOT in top 50 today. Single biggest head term we're missing. Recommended action: rewrite homepage hero + meta + add cluster links to target this exact phrase.`,
    issue: `Homepage doesn't target the head term "employee monitoring software" (10K vol/mo). We rank for branded "we360" and adjacent terms but not the category head — leaving the highest-volume commercial query on the table.`,
    laymanIssue: `"Employee monitoring software" is the biggest single keyword in our category — 10,000 searches per month — and we don't rank in the top 50 for it. Hubstaff, ActivTrak, and Time Doctor own positions 1-3.

The fix is to retarget our homepage hero copy + meta tags + structured data so Google understands "we360.ai is an employee monitoring software product." After this ships, we should land in top 30 within 60 days and top 10 within 6 months.

This is the single highest-leverage page edit in the entire 8-month plan.`,
    impl: `1. Rewrite H1 to lead with "Employee Monitoring Software" + brand qualifier (e.g. "Employee Monitoring Software for Privacy-First Teams").
2. Update <title> to: "Employee Monitoring Software [2026] — We360.ai".
3. Update meta description to lead with the head term + value prop.
4. Add 60-word answer-capsule below the hero with verdict.
5. Add 5 internal links from homepage to: /solutions/employee-monitoring, /vs/we360-vs-hubstaff, /alternative/hubstaff-alternative, /in/employee-monitoring-software-india, /features/agentic-ai.
6. Wire SoftwareApplication schema (covered by K1.5).
7. Submit GSC URL Inspection → Request indexing on https://we360.ai/.

Acceptance: ranking signal "employee monitoring software" appears in GSC for the homepage URL within 30 days. Within 90 days: position ≤30. Within 180 days: top 10.`,
    brief: emptyBrief("employee monitoring software", "Employee Monitoring Software [2026] — We360.ai", "commercial", 0,
      { writer_notes: ["Homepage edit, not a blog post — copy ships into Webflow homepage hero + meta tags."] }
    ),
  },

  // ---- PHASE C: 30 unique-angle articles (May-July) per we360-unique-angles.csv ----
  // Theme 1: Agentic AI (5 articles)
  ...buildUniqueAngleTasks([
    { theme: "AI", n: 1, title: "Agentic AI in employee monitoring: the complete guide", kw: "agentic AI employee monitoring", vol: 450, kd: "Very Low", words: 2500, format: "Pillar", date: "2026-05-04",
      data: `Strategic doc — Unique Angles theme #1: We360.ai has Agentic AI recommendations; no competitor (Hubstaff, Time Doctor, ActivTrak) has this. Entire 'AI-native monitoring' content space unclaimed. KD Very Low + zero competitor coverage = fast ranking.` },
    { theme: "AI", n: 2, title: "How AI recommendations improve workforce productivity", kw: "AI workforce recommendations", vol: 450, kd: "Very Low", words: 1500, format: "Cluster", date: "2026-05-05",
      data: `Cluster article supporting the Agentic AI pillar. Targets a different intent: HOW the AI recommendations actually work (concrete examples).` },
    { theme: "AI", n: 3, title: "AI vs traditional employee monitoring: what's the difference?", kw: "AI vs traditional monitoring", vol: 300, kd: "Very Low", words: 1500, format: "Comparison", date: "2026-05-07",
      data: `Establishes our AI-native positioning by contrasting with traditional time-tracker competitors.` },
    { theme: "AI", n: 4, title: "The future of workforce management: AI-driven insights 2026", kw: "future of workforce management AI", vol: 600, kd: "Low", words: 2000, format: "Guide", date: "2026-05-12",
      data: `Forward-looking thought leadership. Strategic doc says Agentic AI cluster ships through Month 1 Week 2.` },
    { theme: "AI", n: 5, title: "How we360.ai's AI engine detects productivity risks", kw: "AI productivity risk detection", vol: 225, kd: "Very Low", words: 1200, format: "Feature", date: "2026-05-19",
      data: `Product-feature spotlight. Demonstrates Agentic AI in action via concrete risk-detection scenarios.` },
    // Theme 2: Cost Intelligence (5 articles)
    { theme: "COST", n: 1, title: "How to calculate the real cost of unproductive employees", kw: "cost of unproductive employees", vol: 750, kd: "Low", words: 2500, format: "Data guide", date: "2026-05-20",
      data: `Strategic doc — Unique Angles theme #2 (Cost Intelligence): no competitor has Cost Intelligence feature. CFO/COO persona is wide open. Hubstaff/Time Doctor focus on time tracking, not cost ROI.` },
    { theme: "COST", n: 2, title: "Employee monitoring ROI: complete guide for CFOs", kw: "employee monitoring ROI", vol: 450, kd: "Low", words: 2000, format: "Guide", date: "2026-05-26",
      data: `CFO persona article. Industry differentiator — competitors target HR + Ops; we target finance leaders too.` },
    { theme: "COST", n: 3, title: "Employee cost calculator (free tool)", kw: "employee cost calculator", vol: 900, kd: "Low", words: 800, format: "Free tool page", date: "2026-06-02",
      data: `Free-tool play. Calculator pages convert well + earn natural backlinks. We have 24 templates already — adding cost calculator extends the pattern.` },
    { theme: "COST", n: 4, title: "Workforce cost optimisation strategies for Indian companies", kw: "workforce cost optimisation India", vol: 300, kd: "Very Low", words: 2000, format: "India guide", date: "2026-06-09",
      data: `India + CFO double-niche. Zero competitor coverage on this combined angle.` },
    { theme: "COST", n: 5, title: "How we360.ai's Cost Intelligence pays for itself", kw: "cost intelligence employee monitoring", vol: 225, kd: "Very Low", words: 1500, format: "Feature guide", date: "2026-06-16",
      data: `Direct mapping to our Cost Intelligence feature — establishes ownership of the feature term.` },
    // Theme 3: Technology Usage / SaaS Optimisation (5 articles)
    { theme: "TECH", n: 1, title: "Shadow IT in Indian companies: what your employees are actually using", kw: "shadow IT India", vol: 450, kd: "Low", words: 2000, format: "Guide", date: "2026-06-03",
      data: `Strategic doc — Unique Angles theme #3 (SaaS Optimisation): we tag Technology Usage by employee. No competitor monetises this as content. India-specific framing = uncontested.` },
    { theme: "TECH", n: 2, title: "How to reduce SaaS costs by tracking tool usage", kw: "reduce SaaS costs employee monitoring", vol: 600, kd: "Low", words: 1800, format: "Guide", date: "2026-06-10",
      data: `CFO persona again. Connects Technology Usage feature to a board-level conversation.` },
    { theme: "TECH", n: 3, title: "Technology adoption analytics: are employees using your tools?", kw: "technology adoption analytics HR", vol: 300, kd: "Low", words: 1500, format: "Guide", date: "2026-06-17",
      data: `HR persona variant of the SaaS optimisation angle. Bridges to our Technology Usage feature.` },
    { theme: "TECH", n: 4, title: "SaaS stack optimisation: the CFO's guide to software ROI", kw: "SaaS stack optimisation", vol: 750, kd: "Low", words: 2500, format: "Guide", date: "2026-06-24",
      data: `Higher-volume head term in the SaaS optimisation cluster. CFO targeted.` },
    { theme: "TECH", n: 5, title: "How to detect unused software with employee monitoring tools", kw: "unused software detection", vol: 300, kd: "Very Low", words: 1500, format: "Guide", date: "2026-07-01",
      data: `Product-feature spotlight closing the SaaS optimisation cluster.` },
    // Theme 4: India Field Force GPS Tracking (5 articles)
    { theme: "FIELD", n: 1, title: "Field employee GPS tracking software India: complete guide", kw: "field employee GPS tracking India", vol: 750, kd: "Low", words: 2500, format: "Pillar", date: "2026-05-06",
      data: `Strategic doc — Unique Angles theme #4: India has massive field workforce sectors (FMCG, pharma, fintech, insurance, manufacturing). Zero competitor has India-specific field force content. BLUE OCEAN.` },
    { theme: "FIELD", n: 2, title: "How FMCG companies in India track field sales teams", kw: "FMCG field force tracking India", vol: 300, kd: "Very Low", words: 2000, format: "Vertical guide", date: "2026-05-13",
      data: `Vertical-specific application of the Field GPS pillar. FMCG is one of the largest field-force sectors in India.` },
    { theme: "FIELD", n: 3, title: "GPS attendance for field staff: legal and practical guide India", kw: "GPS attendance field staff India", vol: 600, kd: "Low", words: 2000, format: "Guide", date: "2026-05-21",
      data: `India compliance + practical setup hybrid. Solves a pain that field-management buyers actually search for.` },
    { theme: "FIELD", n: 4, title: "Field force management software India: top options compared", kw: "field force management software India", vol: 750, kd: "Low", words: 2000, format: "Comparison", date: "2026-05-28",
      data: `Listicle/comparison capturing comparison-stage searchers. Lists We360 alongside generic competitors with India-specific evaluation lens.` },
    { theme: "FIELD", n: 5, title: "How to manage remote field employees across multiple cities", kw: "manage field employees multiple cities India", vol: 300, kd: "Very Low", words: 1800, format: "Guide", date: "2026-06-04",
      data: `Multi-city India enterprise angle (overlaps with Multi-Location Productivity theme).` },
    // Theme 5: Livestream Monitoring (5 articles)
    { theme: "LIVE", n: 1, title: "Live screen monitoring software: complete guide 2026", kw: "live screen monitoring software", vol: 900, kd: "Low", words: 2500, format: "Pillar", date: "2026-05-08",
      data: `Strategic doc — Unique Angles theme #5: Hubstaff explicitly refuses to offer livestream. We360 has it. Powerful differentiation around 'responsible live monitoring' narrative.` },
    { theme: "LIVE", n: 2, title: "When is live employee monitoring appropriate? Ethics guide", kw: "employee live monitoring ethics", vol: 450, kd: "Low", words: 2000, format: "Ethics guide", date: "2026-05-11",
      data: `Builds trust. Differentiates from competitors who avoid the topic. Anchors our 'responsible live monitoring' position.` },
    { theme: "LIVE", n: 3, title: "Livestream vs screenshot monitoring: which is right for your team?", kw: "livestream vs screenshot monitoring", vol: 300, kd: "Very Low", words: 1500, format: "Comparison", date: "2026-05-13",
      data: `Comparison post that maps to a real evaluator question. Zero competitor coverage on this comparison.` },
    { theme: "LIVE", n: 4, title: "Real-time monitoring for BPO and call centre teams India", kw: "real time monitoring BPO India", vol: 250, kd: "Very Low", words: 2000, format: "Vertical", date: "2026-05-19",
      data: `BPO vertical + India + livestream triple-niche. Connects to /industries/bpo (B3.1i1) shipping in M3.` },
    { theme: "LIVE", n: 5, title: "Live monitoring compliance guide: Indian IT law, GDPR, PDPA", kw: "employee monitoring compliance India", vol: 450, kd: "Low", words: 2500, format: "Compliance", date: "2026-06-05",
      data: `Compliance-stage content for legal/IT-security buyers. Fills India compliance gap competitors don't address.` },
    // Theme 6: Multi-Location Productivity (5 articles)
    { theme: "MULTI", n: 1, title: "How to compare employee productivity across multiple office locations", kw: "compare productivity multiple offices", vol: 600, kd: "Low", words: 2000, format: "Pillar", date: "2026-06-08",
      data: `Strategic doc — Unique Angles theme #6 (Multi-Location): We360's Location Performance feature compares productivity across branches. Indian enterprises operate Bangalore, Mumbai, Delhi, Pune offices. Zero content from competitors.` },
    { theme: "MULTI", n: 2, title: "Multi-city workforce analytics for Indian enterprises", kw: "multi city workforce analytics India", vol: 250, kd: "Very Low", words: 2000, format: "India guide", date: "2026-06-11",
      data: `India enterprise angle. Cross-city analytics is a real ask from large India HR teams.` },
    { theme: "MULTI", n: 3, title: "Office vs WFH productivity in India: 2026 data and insights", kw: "office vs WFH productivity India", vol: 1100, kd: "Low", words: 2500, format: "Data post", date: "2026-06-18",
      data: `Data-driven post — earns natural backlinks. Topic: anonymised aggregate from We360 user base showing onsite vs remote gap. Highest-volume keyword in the Multi-Location cluster.` },
    { theme: "MULTI", n: 4, title: "Location performance analytics: what Indian HR leaders need to know", kw: "location performance analytics India", vol: 225, kd: "Very Low", words: 1800, format: "Guide", date: "2026-06-25",
      data: `India HR persona variant. Connects to /features/location-performance.` },
    { theme: "MULTI", n: 5, title: "How to benchmark team performance across Indian office locations", kw: "benchmark team performance India offices", vol: 225, kd: "Very Low", words: 1500, format: "Guide", date: "2026-07-02",
      data: `Closing cluster article. Benchmarking-stage content for ops/HR leaders running multi-city teams.` },
  ]),

  // ---- PHASE C: 5 net-new feature pillars (May 25 - Jun 22) ----
  // 4 are refreshes of existing /features/* pages, 1 is brand-new (livestream).
  {
    key: "F.remote-em", kind: "blog_task",
    title: "Build /features/remote-employee-monitoring (new feature pillar)",
    scheduled_date: "2026-05-25", priority: "critical", pillar: "SEO",
    target_keyword: "remote employee monitoring software",
    competition: "High Competition",
    est_volume: 3000,
    action: "NEW",
    data_backing: `Strategic doc — Keyword Gap (Apr 2026): "remote employee monitoring software" = 2,000-4,000 vol/mo, Medium KD. Top 3: Hubstaff #1, Teramind #2, ActivTrak #3. We360 not in top 50. Recommended action: create dedicated feature page with 3,000+ words.`,
    issue: `No dedicated remote-employee-monitoring feature page. Generic /solutions/employee-monitoring doesn't target the "remote" qualifier in the head term.`,
    impl: `New page at /features/remote-employee-monitoring (3,000+ words):
1. H1: "Remote Employee Monitoring Software [2026]: Productivity Without Surveillance"
2. 200-word answer-capsule with privacy-first verdict.
3. "How it works" — 4 sections (activity capture, productivity scoring, alerts, reports).
4. Comparison table vs Hubstaff/ActivTrak/Time Doctor.
5. Privacy + India compliance section.
6. 6-Q FAQ + FAQPage schema.
7. CTA + free trial.

Acceptance: pos 30 within 60 days for "remote employee monitoring software"; pos 15 within 90 days.`,
    brief: emptyBrief("remote employee monitoring software", "Remote Employee Monitoring Software [2026]: Productivity Without Surveillance", "commercial", 3000),
  },
  {
    key: "F.screen-rec", kind: "blog_task",
    title: "Refresh /features/screen-recording (target screen-monitoring head term)",
    scheduled_date: "2026-06-01", priority: "high", pillar: "SEO",
    url: "https://we360.ai/features/screen-recording",
    target_keyword: "screen monitoring software employees",
    competition: "Medium Competition",
    est_volume: 1750,
    action: "REFRESH",
    data_backing: `Strategic doc — Keyword Gap: "screen monitoring software employees" = 1,000-2,500 vol/mo, Low KD. Top 3: Teramind #1, ActivTrak #2, Monitask #3. Existing /features/screen-recording is thin — refresh to target the head term.`,
    issue: `Existing /features/screen-recording page is a thin feature description. Doesn't target the high-volume head term properly.`,
    impl: `Refresh playbook applied to /features/screen-recording. Add: 60-word answer-capsule, comparison table, privacy + India legal section ("Is screen recording employees legal India?" sub-section since 300-600 vol/mo on that), 5-Q FAQ, internal links to /vs/we360-vs-teramind + /alternative/teramind-alternative.`,
    brief: emptyBrief("screen monitoring software employees", "Screen Monitoring Software for Employees [2026]: Live View, Recording, Privacy", "commercial", 2500),
  },
  {
    key: "F.productivity", kind: "blog_task",
    title: "Refresh /features/productivity-tracking (target productivity-monitoring head term)",
    scheduled_date: "2026-06-08", priority: "high", pillar: "SEO",
    url: "https://we360.ai/features/productivity-tracking",
    target_keyword: "productivity monitoring software",
    competition: "Medium Competition",
    est_volume: 1750,
    action: "REFRESH",
    data_backing: `Strategic doc — Keyword Gap: "productivity monitoring software" = 1,000-2,500 vol/mo, Medium KD. Top 3: ActivTrak #1, Insightful #2, Teramind #3. Existing /features/productivity-tracking page is thin.`,
    issue: `Existing /features/productivity-tracking targets feature term but not the head category term "productivity monitoring software".`,
    impl: `Refresh playbook. Lead with "Productivity Monitoring Software" head term. Add answer-capsule, comparison vs ActivTrak/Insightful, hybrid-team angle (per "productivity tracking for hybrid teams" 800-1,500 vol/mo). FAQ schema.`,
    brief: emptyBrief("productivity monitoring software", "Productivity Monitoring Software [2026]: Track What Matters Without Surveillance", "commercial", 2500),
  },
  {
    key: "F.livestream", kind: "blog_task",
    title: "Build /features/livestream (new feature pillar — Hubstaff differentiator)",
    scheduled_date: "2026-06-15", priority: "high", pillar: "SEO",
    target_keyword: "live screen monitoring software",
    competition: "Low Competition",
    est_volume: 900,
    action: "NEW",
    data_backing: `Strategic doc — Unique Angles theme #5: Hubstaff explicitly refuses livestream. We360 has it. /features/livestream doesn't exist yet. "live screen monitoring software" = 600-1,200 vol/mo, Low KD.`,
    issue: `No /features/livestream page exists. The livestream cluster blogs (B-UA.LIVE.*) need a feature pillar to anchor them.`,
    impl: `New /features/livestream page. H1: "Live Screen Monitoring — See Work As It Happens (Responsibly)". Position as the Hubstaff differentiator. Wire SoftwareApplication schema, FAQPage schema, comparison vs Hubstaff (live=no, ours=yes), India BPO real-time use case section.`,
    brief: emptyBrief("live screen monitoring software", "Live Screen Monitoring — See Work As It Happens (Responsibly)", "commercial", 2500),
  },
  {
    key: "F.agentic-ai", kind: "blog_task",
    title: "Refresh /features/agentic-ai (anchor for AI cluster)",
    scheduled_date: "2026-06-22", priority: "high", pillar: "SEO",
    url: "https://we360.ai/features/agentic-ai",
    target_keyword: "AI-powered employee monitoring software",
    competition: "Medium Competition",
    est_volume: 1150,
    action: "REFRESH",
    data_backing: `Strategic doc — Topical Authority Feature×Topics: "AI-powered employee monitoring software" = 800-1,500 vol/mo, Medium KD. Currently nobody ranks well. We360 has the feature; existing page needs to be the pillar anchoring the 5 Agentic AI cluster blogs (B-UA.AI.*).`,
    issue: `Existing /features/agentic-ai page is thin. Doesn't anchor the Agentic AI cluster we're shipping in May.`,
    impl: `Refresh /features/agentic-ai. Lead with "AI-Powered Employee Monitoring — Agentic AI Recommendations". Link out to all 5 Agentic AI cluster blogs (B-UA.AI.*). Add answer-capsule, "How our AI engine works" section, comparison vs ActivTrak's "AI coaching" (we go further), India case study.`,
    brief: emptyBrief("AI-powered employee monitoring software", "AI-Powered Employee Monitoring Software [2026]: Agentic AI Recommendations", "commercial", 2500),
  },

  // ---- PHASE D: Tier 3 high-volume gap pages (June) ----
  {
    key: "D.best-em-listicle", kind: "blog_task",
    title: "Write \"Best Employee Monitoring Software 2026\" listicle",
    scheduled_date: "2026-06-02", priority: "critical", pillar: "SEO",
    target_keyword: "best employee monitoring software",
    competition: "High Competition",
    est_volume: 5500,
    action: "NEW",
    data_backing: `Strategic doc — Keyword Gap: "best employee monitoring software" = 4,000-7,000 vol/mo, High KD. Top 3: Hubstaff #1, Time Doctor #2, ActivTrak #3. We360 not in top 50. Listicle format owns this query type — visible across all top SERPs.`,
    issue: `No "best employee monitoring software 2026" listicle on we360.ai. Highest-volume keyword we don't compete on.`,
    impl: `Long-form listicle (3,500-4,000 words). 10 tools ranked, with We360 leading. Each tool: 250-word review with pros/cons, pricing, "best for". Comparison table at top. Methodology section. India angle. FAQ + FAQPage schema. Internal links to all our /vs/* + /alternative/* pages.`,
    brief: emptyBrief("best employee monitoring software", "Best Employee Monitoring Software [2026]: 10 Tools Ranked", "commercial", 3500,
      { internal_links: ["/solutions/employee-monitoring", "/vs/we360-vs-hubstaff", "/alternative/hubstaff-alternative"] }),
  },
  {
    key: "D.how-monitor-remote", kind: "blog_task",
    title: "Write \"How to Monitor Remote Employees\" guide",
    scheduled_date: "2026-06-09", priority: "high", pillar: "SEO",
    target_keyword: "how to monitor remote employees",
    competition: "Low Competition",
    est_volume: 2250,
    action: "NEW",
    data_backing: `Strategic doc — Keyword Gap: "how to monitor remote employees" = 1,500-3,000 vol/mo, LOW KD. Top 3: Hubstaff #1, Time Doctor #2, DeskTime #3. Quick win — write 2,000+ word guide. Low KD + clear intent = fast ranking.`,
    issue: `No how-to guide for "how to monitor remote employees". Easy quick-win given low KD.`,
    impl: `2,000-word how-to guide. Sections: (1) what to monitor + what NOT to monitor, (2) tools needed, (3) setting expectations with team, (4) reading the data, (5) ethics + privacy, (6) tools comparison, (7) FAQs. Wire FAQPage schema. Internal links to /solutions/employee-monitoring + /features/agentic-ai.`,
    brief: emptyBrief("how to monitor remote employees", "How to Monitor Remote Employees [2026]: A Practical 7-Step Guide", "informational", 2200),
  },
  {
    key: "D.time-tracking-landing", kind: "blog_task",
    title: "Build /solutions/time-tracking landing (target head term)",
    scheduled_date: "2026-06-12", priority: "high", pillar: "SEO",
    target_keyword: "time tracking software for employees",
    competition: "High Competition",
    est_volume: 6500,
    action: "NEW",
    data_backing: `Strategic doc — Keyword Gap: "time tracking software for employees" = 5,000-8,000 vol/mo, High KD. Top 3: Hubstaff #1, DeskTime #2, Time Doctor #3. Recommended action: create time-tracking landing page. /solutions/time-tracker exists but is thin.`,
    issue: `/solutions/time-tracker is the closest existing page but doesn't target the head term properly. Need a richer landing or a fresh /solutions/time-tracking page.`,
    impl: `Either expand /solutions/time-tracker to 3,000 words OR build /solutions/time-tracking as a new page. Sections: head-term lead, comparison table, India + payroll integration, screenshots, pricing, 6-Q FAQ + schema. Internal links to /integrations/keka + /integrations/zoho (HR/payroll-relevant).`,
    brief: emptyBrief("time tracking software for employees", "Time Tracking Software for Employees [2026]: Productivity, Payroll, India Compliance", "commercial", 3000),
  },
  {
    key: "D.in-wfh-tracking", kind: "blog_task",
    title: "Build /in/wfh-tracking-software-india (India BoF)",
    scheduled_date: "2026-06-15", priority: "high", pillar: "GEO",
    target_keyword: "WFH tracking software India",
    competition: "Low Competition",
    est_volume: 550,
    action: "NEW",
    data_backing: `Strategic doc — Keyword Gap: "WFH tracking software India" = 300-800 vol/mo, Low KD. Top 3: Time Champ #1, EmpMonitor #2, DeskTrack #3 (India-only competitors). No global player ranks. Critical India keyword — uncontested by Hubstaff/ActivTrak/Time Doctor.`,
    issue: `India WFH tracking is a real-volume query with NO global competitor ranking. Uncontested.`,
    impl: `Use /in/* template (K2.4 patterns). Standard sections: H1, answer-capsule, DPDPA compliance, INR pricing, 3 India testimonials, India phone, India-specific FAQ.`,
    brief: emptyBrief("WFH tracking software India", "WFH Tracking Software India [2026]: DPDPA, INR Pricing, Hindi Support", "commercial", 1800,
      { internal_links: ["/in/employee-monitoring-software-india", "/in/attendance-tracking-software-india"] }),
  },
  {
    key: "D.in-leave-mgmt", kind: "blog_task",
    title: "Build /in/leave-management-software-india",
    scheduled_date: "2026-06-19", priority: "medium", pillar: "GEO",
    target_keyword: "leave management software India",
    competition: "Medium Competition",
    est_volume: 1150,
    action: "NEW",
    data_backing: `Strategic doc — Topical Authority Feature×Topics (Attendance row): "leave management software India" = 800-1,500 vol/mo, Medium KD. Time Champ ranks weakly. Indian companies need ESI/PF + multi-state holiday calendar coverage.`,
    issue: `No /in/leave-management page. Adjacent demand to attendance, integrates well with Keka/Zoho/GreyTHR integration pages shipping June.`,
    impl: `Use /in/* template. Lead with "Leave Management Software India". ESI/PF integration callout, multi-state holiday calendar, India payroll integration via Keka/Zoho/GreyTHR. Internal links to all 3 integration pages.`,
    brief: emptyBrief("leave management software India", "Leave Management Software India [2026]: ESI, PF, Payroll Integration", "commercial", 1800,
      { internal_links: ["/integrations/keka", "/integrations/zoho", "/integrations/greythr", "/in/attendance-tracking-software-india"] }),
  },
  {
    key: "D.in-field-force", kind: "blog_task",
    title: "Build /in/field-force-management-india",
    scheduled_date: "2026-06-23", priority: "high", pillar: "GEO",
    target_keyword: "field force management software India",
    competition: "Low Competition",
    est_volume: 750,
    action: "NEW",
    data_backing: `Strategic doc — Unique Angles theme #4 (Field Force India). 500-1,000 vol/mo, Low KD. Anchors the 5 Field Force unique-angle blogs (B-UA.FIELD.*). FMCG/pharma/insurance/manufacturing field workforce in India is massive + uncontested.`,
    issue: `No India field-force landing. The 5 Field Force cluster blogs (B-UA.FIELD.*) need a pillar to link into.`,
    impl: `Use /in/* template + emphasize field-force features. GPS attendance, multi-city tracking, FMCG case study. Internal links to all 5 B-UA.FIELD.* cluster blogs.`,
    brief: emptyBrief("field force management software India", "Field Force Management Software India [2026]: GPS, Attendance, Multi-City", "commercial", 2000,
      { internal_links: ["/in/employee-monitoring-software-india", "/blog/field-employee-gps-tracking-india"] }),
  },

  // ---- PHASE D: 8 feature-cluster blogs from feature-topics-map (June scope) ----
  ...buildFeatureClusterTasks([
    { key: "FC.1", topic: "How to track employee internet usage", kw: "how to track employee internet usage", vol: 2250, kd: "Low", date: "2026-06-03", feature: "Apps & URL Tracking",
      data: `Strategic doc — Feature×Topics (Apps & URL Tracking): 1,500-3,000 vol/mo, Low KD. Hubstaff + Time Doctor compete. We map to Apps & URL Tracking feature.` },
    { key: "FC.2", topic: "Website monitoring for employees", kw: "website monitoring for employees", vol: 1500, kd: "Medium", date: "2026-06-04", feature: "Apps & URL Tracking",
      data: `1,000-2,000 vol/mo, Medium KD. Cluster sibling to FC.1.` },
    { key: "FC.3", topic: "Application usage tracking software", kw: "application usage tracking software", vol: 1150, kd: "Medium", date: "2026-06-05", feature: "Apps & URL Tracking",
      data: `800-1,500 vol/mo. ActivTrak ranks #1. We have the feature; just need the page.` },
    { key: "FC.4", topic: "How to track employee productivity", kw: "how to track employee productivity", vol: 5500, kd: "High", date: "2026-06-10", feature: "Productivity",
      data: `4,000-7,000 vol/mo, High KD. Big head term. Multiple competitors top 3. High effort but big reward.` },
    { key: "FC.5", topic: "Employee productivity benchmarks India", kw: "employee productivity benchmarks India", vol: 450, kd: "Very Low", date: "2026-06-11", feature: "Productivity",
      data: `300-600 vol/mo, Very Low KD. India-specific data post — earns backlinks. Zero competitor coverage.` },
    { key: "FC.6", topic: "How to block distracting websites at work", kw: "how to block distracting websites at work", vol: 1500, kd: "Low", date: "2026-06-17", feature: "Domain Blocking",
      data: `1,000-2,000 vol/mo, Low KD. Domain Blocking feature — currently nobody ranks well.` },
    { key: "FC.7", topic: "Idle time tracking for remote employees", kw: "idle time tracking for remote employees", vol: 600, kd: "Low", date: "2026-06-18", feature: "Activity Monitoring",
      data: `400-800 vol/mo, Low KD. Adjacent to remote-employee-monitoring pillar. Easy win.` },
    { key: "FC.8", topic: "Project management + time tracking software", kw: "project management time tracking software", vol: 3000, kd: "High", date: "2026-06-26", feature: "Projects & Tasks",
      data: `2,000-4,000 vol/mo. Big head. Internal link to /integrations/jira (engineering teams use this combo).` },
  ]),

  // ---- PHASE E: Recurring tier — 2 expertise blogs + /reviews/ + /how-it-works/ ----
  {
    key: "E.expertise-may", kind: "blog_task",
    title: "Publish industry-leader expertise blog (May)",
    scheduled_date: "2026-05-30", priority: "medium", pillar: "AEO",
    target_keyword: "industry expertise we360 may",
    est_volume: 0,
    action: "NEW",
    data_backing: `User directive Apr 29: 1 invited industry-leader expertise blog per month for E-E-A-T signals + LinkedIn distribution. Pipeline already exists internally. Adds Person schema + author byline. Drives referral traffic when guest shares to their network.`,
    issue: `Recurring May placeholder for the monthly invited-expert blog. Topic + author finalized by your team based on outreach pipeline.`,
    impl: `Workflow (handled by your existing pipeline):
1. Outreach to industry leader (HR/Ops/CFO/CXO at India SaaS/BPO/IT services).
2. Brief shared (topic + word count + tone + 3 internal links to weave in).
3. Review draft, edit, publish under guest's byline with full Person schema (LinkedIn, photo, role, employer logo).
4. Publish + co-promote on LinkedIn (founder share + guest tag).

Acceptance: published by May 30 with proper byline + schema. LinkedIn post drives 50+ referral visits within 7 days.`,
    brief: emptyBrief("industry expertise we360 may", "TBD — Industry Leader Expertise Article (May)", "informational", 1500,
      { writer_notes: ["Topic + author chosen from active outreach pipeline. Final brief locked one week before publish date."] }),
  },
  {
    key: "E.expertise-jun", kind: "blog_task",
    title: "Publish industry-leader expertise blog (June)",
    scheduled_date: "2026-06-30", priority: "medium", pillar: "AEO",
    target_keyword: "industry expertise we360 jun",
    est_volume: 0,
    action: "NEW",
    data_backing: `User directive Apr 29: 1 invited industry-leader expertise blog per month. Same workflow as May. Compounding E-E-A-T + LinkedIn referral traffic.`,
    issue: `Recurring June placeholder for the monthly invited-expert blog.`,
    impl: `Same workflow as E.expertise-may. Pipeline runs in parallel.`,
    brief: emptyBrief("industry expertise we360 jun", "TBD — Industry Leader Expertise Article (June)", "informational", 1500,
      { writer_notes: ["Topic + author chosen from active outreach pipeline. Final brief locked one week before publish date."] }),
  },
  {
    key: "K-REVIEWS", kind: "blog_task",
    title: "Build /reviews/ (aggregate G2 + Capterra + Trustpilot reviews)",
    scheduled_date: "2026-06-15", priority: "medium", pillar: "AEO",
    target_keyword: "we360 reviews",
    est_volume: 100,
    action: "NEW",
    data_backing: `User directive Apr 29: build /reviews/ as a single asset (Q2 deliverable). Improves branded-SERP knowledge panel + AI Overview citation eligibility (Review schema is a strong signal). 0 ranking competitor pages in our peer set for this URL pattern — uncontested + unique.`,
    issue: `No on-site /reviews/ page. Branded "we360 reviews" search shows G2/Capterra third-party pages, not our own collection. Missing AI Overview citation surface.`,
    impl: `New page at /reviews/. Sections:
1. H1: "We360.ai Customer Reviews" + AggregateRating schema (4.5-5 from G2/Capterra).
2. Star summary + total review count.
3. 6-9 featured reviews (rotating quarterly) with Review schema each.
4. Tabs/filters: by industry, by company size.
5. CTA: "Leave your review on G2/Capterra".
6. Internal links to /case-studies-n/* + /pricing.
7. AggregateRating + Review schema validates in Rich Results Test.

Acceptance: page live; Rich Results Test confirms AggregateRating + Review; GSC > Enhancements adds new "Review snippet" report within 14 days.`,
    brief: emptyBrief("we360 reviews", "We360.ai Customer Reviews — Real Stories from G2 + Capterra + Trustpilot", "commercial", 1200),
  },
  {
    key: "K-HOWITWORKS", kind: "blog_task",
    title: "Build /how-it-works/ (explainer page — installation → tracking → reports)",
    scheduled_date: "2026-06-20", priority: "medium", pillar: "AEO",
    target_keyword: "how does we360 work",
    est_volume: 200,
    action: "NEW",
    data_backing: `User directive Apr 29: build /how-it-works/ as a single asset (Q2 deliverable). Educational mid-funnel — ranks for "how does <category>/we360 work" + "what does <competitor>/we360 track" queries. 0 ranking competitor pages — uncontested.`,
    issue: `No /how-it-works/ page. Pre-sales education currently happens via demos. Mid-funnel buyers searching "how does we360 work" or "what does employee monitoring software track" go to competitor pages.`,
    impl: `New page at /how-it-works/. Sections:
1. H1: "How We360.ai Works — Installation to Insights"
2. 60-word answer-capsule.
3. 5-step visual flow: Install agent → Capture activity → Score productivity → Surface insights → Drive action.
4. Per-step expansion: 2-3 paragraphs each + screenshot/diagram.
5. "What we track vs what we DON'T track" section (privacy positioning).
6. Setup time, system requirements, OS support (Windows/Mac/Linux).
7. CTA: book demo.
8. FAQ + FAQPage schema (5-Q).
9. Internal links to /features/* + /security-and-compliance.

Acceptance: page live with HowTo schema (installation steps); FAQ rich result within 21 days; ranks for "how does we360 work" branded query within 30 days.`,
    brief: emptyBrief("how does we360 work", "How We360.ai Works — Installation to Insights in 5 Steps", "informational", 1500),
  },
];

// =============================================================================
// Helpers — generate vs / alternative / integration page tasks at scale
// =============================================================================

function buildVsPages(specs: Array<{ slug: string; competitor: string; date: string; priority: Priority; data: string; customH1?: string }>): BlogTask[] {
  return specs.map((s, i) => {
    const we360BasedH1 = s.customH1 ?? `We360 vs ${s.competitor}: Honest Comparison [2026]`;
    const is360 = !s.customH1; // We360-as-actor vs head-to-head
    const targetKw = s.customH1 ? s.slug.replace(/-/g, " ") : `we360 vs ${s.competitor.toLowerCase()}`;
    return {
      key: `B-VS.${s.slug}`, kind: "blog_task" as const,
      title: `Build /vs/${s.slug} (${s.competitor} vs-page)`,
      scheduled_date: s.date, priority: s.priority, pillar: "SEO" as const,
      target_keyword: targetKw,
      competition: "Medium Competition" as const,
      data_backing: s.data,
      issue: `BoF vs-page targeting evaluator-stage searchers. Currently no dedicated /vs/ page for ${s.competitor}.`,
      impl: `Use /vs/* template (K2.2). Per-page structure:
- H1: "${we360BasedH1}"
- 200-word answer-capsule + verdict in first 60 words
- Comparison table (10-15 rows): pricing, privacy, India support, integrations, AI features, support hours, etc.
- Use-case-by-use-case sections (privacy, India-specific, BPO, pricing)
- Pros/Cons split per side
- Final verdict
- Demo CTA + free-trial CTA
- 5-Q FAQ + FAQPage JSON-LD
- BreadcrumbList (template-inherited)
- 5 internal links to other vs/alternative/solution pages

Acceptance: page ranks pos 20 within 60 days for primary query; combined with sister vs-pages drives 250 sessions/mo by M4; 3 demos/mo attributable.`,
      brief: emptyBrief(targetKw, we360BasedH1, "commercial", 2200, {
        secondary_keywords: is360
          ? [`${s.competitor.toLowerCase()} alternative`, `${s.competitor.toLowerCase()} vs we360`, `we360 ${s.competitor.toLowerCase()} comparison`]
          : [`${s.competitor.toLowerCase()} comparison`],
        recommended_h2s: [
          `What is ${s.competitor}?`,
          `${we360BasedH1.split(":")[0]} — at a glance (10-row table)`,
          "Privacy + compliance: what each does differently",
          "India support + INR pricing",
          "Pros and cons (each side)",
          "Verdict + recommendation",
          "FAQ",
        ],
        internal_links: ["/solutions/employee-monitoring", `/alternative/${s.competitor.toLowerCase().replace(/\s+/g, "-")}-alternative`],
      }),
    };
  });
}

function buildAlternativePages(specs: Array<{ slug: string; competitor: string; date: string; priority: Priority; data: string }>): BlogTask[] {
  return specs.map((s) => {
    const targetKw = `${s.competitor.toLowerCase()} alternative`;
    return {
      key: `B-ALT.${s.slug}`, kind: "blog_task" as const,
      title: `Build /alternative/${s.slug} (${s.competitor} alternative BoF)`,
      scheduled_date: s.date, priority: s.priority, pillar: "SEO" as const,
      target_keyword: targetKw,
      competition: "Medium Competition" as const,
      data_backing: s.data,
      issue: `BoF alternative-page. ${s.competitor} alternative searchers are evaluator-stage with high intent.`,
      impl: `Use /alternative/* template (K2.3). Per-page structure:
- H1: "Best ${s.competitor} Alternative [2026]: Why Teams Switch to We360.ai"
- 200-word answer-capsule + verdict
- "What we hear from ${s.competitor} users" callout (3 quotes)
- 5-bullet "Why teams switch" list
- Side-by-side feature parity table (10 rows)
- Migration steps (numbered)
- Pricing comparison
- Customer quote
- Demo CTA + free-trial CTA
- 5-Q FAQ + FAQPage JSON-LD
- 5 internal links to /vs/we360-vs-${s.slug.replace("-alternative", "")} + /solutions/employee-monitoring

Acceptance: pos 15 within 60 days; 30% of impressions captured at top-10 within 90 days; +150-300 sessions/mo per page.`,
      brief: emptyBrief(targetKw, `Best ${s.competitor} Alternative [2026]: Why Teams Switch to We360.ai`, "commercial", 2200, {
        secondary_keywords: [`${s.competitor.toLowerCase()} alternatives`, `alternatives to ${s.competitor.toLowerCase()}`, `${s.competitor.toLowerCase()} competitors`, `switch from ${s.competitor.toLowerCase()}`],
        internal_links: ["/solutions/employee-monitoring", `/vs/we360-vs-${s.slug.replace("-alternative", "")}`],
      }),
    };
  });
}

function buildIntegrationPages(specs: Array<{ tool: string; title: string; date: string; priority: Priority; data: string }>): BlogTask[] {
  return specs.map((s) => {
    const targetKw = `${s.title.toLowerCase()} employee monitoring integration`;
    return {
      key: `B-INT.${s.tool}`, kind: "blog_task" as const,
      title: `Build /integrations/${s.tool} (${s.title} integration page)`,
      scheduled_date: s.date, priority: s.priority, pillar: "SEO" as const,
      target_keyword: targetKw,
      competition: "Low Competition" as const,
      data_backing: s.data,
      issue: `No /integrations/${s.tool} page. Integration pages are highest-converting BoF pages (3-5% demo rate).`,
      impl: `Use /integrations/* template (K2.3). Per-page structure:
- H1: "We360.ai + ${s.title}: Auto-Sync Productivity Insights"
- 80-word answer-capsule + use-case
- Setup instructions (5 steps with screenshots)
- "What this integration does" — 4 mini-cards
- Use-cases by team (Sales, Engineering, Ops, HR)
- Pricing — note that integration is free with all plans
- Demo CTA
- 4-Q FAQ + FAQPage JSON-LD

Acceptance: page ranks for "${s.title.toLowerCase()} ${s.tool === "slack" || s.tool === "asana" ? "integration we360" : "integration"}" within 90 days; 100 sessions/mo at top-10; 4 demos/mo at 4% conversion.`,
      brief: emptyBrief(targetKw, `We360.ai + ${s.title} Integration [2026]: Auto-Sync Productivity Insights`, "commercial", 1500, {
        secondary_keywords: [`${s.title.toLowerCase()} integration`, `${s.title.toLowerCase()} we360`, `${s.title.toLowerCase()} productivity`],
        internal_links: ["/solutions/employee-monitoring", "/features/business-intelligence"],
      }),
    };
  });
}

// =============================================================================
// Phase C/D builders — added Apr 29 2026
// =============================================================================

interface StrikingDistanceSpec {
  kw: string;
  vol: number;        // monthly volume from Moz
  ourPos: number;     // our current position
  lift: number;       // estimated traffic lift if pushed to top 10
  kd: number;         // keyword difficulty
  date: string;       // YYYY-MM-DD scheduled
}

function slugifyKw(kw: string): string {
  return kw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function buildStrikingDistanceTasks(items: StrikingDistanceSpec[]): BlogTask[] {
  return items.map((it) => {
    const slug = slugifyKw(it.kw);
    const priority: Priority = it.lift >= 50 ? "high" : it.lift >= 5 ? "medium" : "low";
    return {
      key: `B-SDR.${slug}`,
      kind: "blog_task" as const,
      title: `Refresh existing page targeting "${it.kw}"`,
      scheduled_date: it.date,
      priority,
      pillar: "SEO" as const,
      target_keyword: it.kw,
      action: "REFRESH",
      est_volume: it.vol,
      data_backing: `Moz Keyword Gap export (Apr 29 2026 — file: moz-keyword-gap-improve.csv): we already rank position ${it.ourPos} for "${it.kw}" (${it.vol} vol/mo, KD ${it.kd}). Estimated traffic lift if pushed to top 10: +${it.lift} clicks/mo. Quickest type of win — page is already topically relevant per Google.`,
      issue: `We rank position ${it.ourPos} on "${it.kw}" but the page needs improvement to break into top 10. Striking distance refresh.`,
      laymanIssue: `We're already on page 2 of Google for "${it.kw}" — position ${it.ourPos} out of ~50 ranked results. Monthly searches: ${it.vol}. KD: ${it.kd} (${it.kd <= 30 ? "easy" : it.kd <= 50 ? "medium" : "hard"}).

The fastest type of SEO win: Google already considers the page topically relevant, we just need to bump it. Use GSC URL Inspection to find which page ranks for this keyword, then apply the standard refresh playbook (rewrite intro, update title, add FAQ, add internal links, republish + request indexing).

Estimated traffic lift if successful: +${it.lift} clicks/mo.`,
      impl: `1. GSC URL Inspection → search "${it.kw}" → find which existing URL ranks at position ${it.ourPos}.
2. Apply 8-step refresh playbook:
   - Check current top-3 SERP for content gaps
   - Rewrite intro with 200-word answer-capsule + verdict
   - Update title to "[2026]" with the keyword leading
   - Add comparison table or structured comparison if relevant
   - Add 4-6 FAQ + FAQPage schema
   - Add 3-5 internal links FROM other related blogs + TO related solution/feature pages
   - Update publish date
   - Republish + GSC URL Inspection > Request indexing
3. Track position weekly in 132-query rank tracker.

Acceptance: position moves from ${it.ourPos} → ≤10 within 30 days; CTR rises ≥2x; +${it.lift} clicks/mo lift visible in GSC within 60 days.`,
      brief: emptyBrief(it.kw, "", "informational", 1500),
    };
  });
}

interface UniqueAngleSpec {
  theme: "AI" | "COST" | "TECH" | "FIELD" | "LIVE" | "MULTI";
  n: number;
  title: string;
  kw: string;
  vol: number;
  kd: string;       // "Very Low" / "Low" / "Medium"
  words: number;
  format: string;   // "Pillar" / "Cluster" / "Comparison" / etc
  date: string;
  data: string;
}

function buildUniqueAngleTasks(items: UniqueAngleSpec[]): BlogTask[] {
  // Inline-scoped to avoid TDZ — BLOG_TASKS is evaluated at module load
  // and calls this builder before any module-level const can resolve.
  const THEME_LABEL: Record<UniqueAngleSpec["theme"], string> = {
    AI: "Agentic AI",
    COST: "Cost Intelligence",
    TECH: "Technology Usage / SaaS Optimisation",
    FIELD: "India Field Force GPS Tracking",
    LIVE: "Livestream Monitoring",
    MULTI: "Multi-Location Productivity",
  };
  return items.map((it) => {
    const themeLabel = THEME_LABEL[it.theme];
    const isPillar = /pillar/i.test(it.format);
    return {
      key: `B-UA.${it.theme}.${it.n}`,
      kind: "blog_task" as const,
      title: it.title,
      scheduled_date: it.date,
      priority: isPillar ? "high" : "medium",
      pillar: it.theme === "FIELD" || it.theme === "MULTI" ? "GEO" : "SEO" as const,
      target_keyword: it.kw,
      competition: "Low Competition" as const,
      action: "NEW",
      est_volume: it.vol,
      data_backing: `Strategic doc — Unique Angles theme: ${themeLabel}. Target kw "${it.kw}" = ${it.vol} vol/mo, KD ${it.kd}. Format: ${it.format}, ${it.words}w. ${it.data}`,
      issue: `Blue-ocean content opportunity in the ${themeLabel} theme. Zero / weak competitor coverage on this keyword.`,
      impl: `New blog post (${it.words}w, ${it.format} format).
1. H1 + 60-word answer-capsule with clear verdict.
2. ${isPillar ? "Pillar structure: 6-8 H2 sections covering the topic comprehensively. Internal-link to all sibling cluster blogs in the same theme." : "Cluster structure: 4-5 H2 sections focused on this specific angle. Internal-link UP to the theme pillar."}
3. India angle wherever applicable (we are India-first by design).
4. Wire FAQPage schema (4-Q minimum).
5. Internal links to /features/${it.theme === "AI" ? "agentic-ai" : it.theme === "COST" ? "cost-intelligence" : it.theme === "TECH" ? "technology-usage" : it.theme === "FIELD" ? "location-tracking" : it.theme === "LIVE" ? "livestream" : "location-performance"} (the feature pillar that anchors this theme).
6. CTA: book demo / start trial.

Acceptance: published by ${it.date}. ${isPillar ? "Ranks pos ≤20 within 60 days; pos ≤10 within 90 days (Very Low / Low KD)." : "Ranks pos ≤30 within 60 days as part of cluster; pos ≤15 within 90 days."}`,
      brief: emptyBrief(it.kw, it.title, "informational", it.words),
    };
  });
}

interface FeatureClusterSpec {
  key: string;
  topic: string;
  kw: string;
  vol: number;
  kd: string;
  date: string;
  feature: string;
  data: string;
}

function buildFeatureClusterTasks(items: FeatureClusterSpec[]): BlogTask[] {
  return items.map((it) => ({
    key: it.key,
    kind: "blog_task" as const,
    title: `Write blog: "${it.topic}"`,
    scheduled_date: it.date,
    priority: it.vol >= 2000 ? "high" : "medium",
    pillar: "SEO" as const,
    target_keyword: it.kw,
    competition: it.kd === "High" ? "High Competition" : it.kd === "Medium" ? "Medium Competition" : "Low Competition" as const,
    action: "NEW",
    est_volume: it.vol,
    data_backing: `Strategic doc — Feature×Topics map (Feature: ${it.feature}). Target kw "${it.kw}" = ${it.vol} vol/mo, KD ${it.kd}. ${it.data}`,
    issue: `No blog post targeting "${it.kw}". Cluster blog feeding the ${it.feature} feature pillar.`,
    impl: `Standard blog post (${it.vol >= 2000 ? "2,500" : "1,500-2,000"}w). Format: how-to / guide / listicle depending on intent. Wire FAQPage schema. Internal link to /features/${it.feature.toLowerCase().replace(/[^a-z0-9]+/g, "-")} pillar page.

Acceptance: published by ${it.date}. Ranks pos ≤30 within 60 days as part of feature-cluster pyramid.`,
    brief: emptyBrief(it.kw, it.topic, "informational", it.vol >= 2000 ? 2500 : 1800),
  }));
}

// =============================================================================
// PSI re-date map — existing 17 PSI tasks get pulled into Apr 28 → May 14
// (Month 1 Week 1-2 of new plan). Apr 22-23 done tasks stay at their dates.
// =============================================================================

// =============================================================================
// PSI tasks — pre-existing rows from scripts/import-psi-task-plan.ts
// On first run after this rewrite, finds by old "PSI · ..." title and renames
// to "<layman title> [PSI-X]". On subsequent runs, finds by [PSI-X] suffix
// (same dedupe pattern as web/blog tasks).
// =============================================================================

interface PsiTask {
  key: string;            // PSI-1 .. PSI-18 — stable identifier
  oldTitle: string;       // Original title for first-run rename
  newTitle: string;       // Layman title (no [KEY] — script appends it)
  newDate: string;
  status?: TaskStatus;
  laymanIssue: string;    // Plain-English what's-wrong text
}

export const PSI_TASKS: PsiTask[] = [
  {
    key: "PSI-1",
    oldTitle: "PSI · Kill font bloat + font-display swap",
    newTitle: "Speed up the site by removing 6 unused fonts",
    newDate: "2026-04-22", status: "done",
    laymanIssue: `Our site loads 7 different fonts (Exo, Montserrat, Inconsolata, Lato, Great Vibes, Open Sans, plus Poppins + DM Serif Display). 6 of them aren't used anywhere — they just slow down page load.

Removing the unused 6 + adding a one-line CSS rule that lets text render with a fallback font while custom fonts download speeds up first-paint by 200-400ms across all pages.`,
  },
  {
    key: "PSI-2",
    oldTitle: "PSI · Lazy-load HubSpot Chat widget",
    newTitle: "Speed up pages by loading the chat widget only when visitors scroll",
    newDate: "2026-04-23", status: "done",
    laymanIssue: `Our chat widget loads on every page visit, but most visitors never click it. The widget's code blocks ~250ms of page rendering for nothing.

Better approach: load the widget only when the visitor scrolls, OR after 6 seconds, whichever happens first. Visitors still see and use the chat as normal; pages load 250ms faster.`,
  },
  {
    key: "PSI-3",
    oldTitle: "PSI · Defer HubSpot Forms script (IntersectionObserver wrapper)",
    newTitle: "Make /demo, /contact, and homepage forms load 200ms faster (without breaking them)",
    newDate: "2026-04-28",
    laymanIssue: `HubSpot's form code blocks our /demo, /contact, and homepage from rendering for ~200ms on every visit.

We can't just slap a "defer" attribute on it — that would break the form. The dev needs to write a smarter loader that fetches HubSpot's code only when the form is about to scroll into view. Same forms work the same way; pages load faster.`,
  },
  {
    key: "PSI-4",
    oldTitle: "PSI · Add preconnect hints for 5 third-party hosts",
    newTitle: "Speed up first-time visits by warming up connections to GTM / Clarity / HubSpot / Facebook",
    newDate: "2026-04-29",
    laymanIssue: `Five third-party services (Google Tag Manager, Clarity, HubSpot CDN, HubSpot Scripts, Facebook) each take 100-300ms to set up their network connection on a first-time page visit.

We can pre-warm those connections by adding 5 short lines of code in the site head — the browser starts opening the connections in parallel with everything else, so they're ready when the third-party scripts actually request data. Saves 100-300ms on first-time visitors with zero downside.`,
  },
  {
    key: "PSI-5",
    oldTitle: "PSI · Forced reflow fix + sprint regression run",
    newTitle: "Fix homepage hitch + run final speed-test for the 2-week sprint",
    newDate: "2026-04-30",
    laymanIssue: `Chrome dev tools shows a "forced reflow" warning on the homepage — some JavaScript is making the browser recalculate the page layout twice in a row, causing a visible hitch of 50-100ms.

The dev finds the script causing it (DevTools Performance tab will show pink "Forced reflow" markers) and refactors it to read AND write to layout in separate steps. Then re-runs the PageSpeed test on key pages to wrap up the 2-week sprint.`,
  },
  {
    key: "PSI-6",
    oldTitle: "PSI · Eliminate www → non-www redirect chain (saves ~65,520ms across 84 pages)",
    newTitle: "Stop sending visitors through a redirect on every page (saves 65 seconds site-wide)",
    newDate: "2026-05-04",
    laymanIssue: `Every visitor today hits we360.ai, gets redirected to www.we360.ai (or vice versa), and THEN sees the page. That extra hop adds 780ms PER PAGE on first-time visits.

Fixing this saves 65 SECONDS combined across our 85 main pages — the single biggest PageSpeed win available in the entire sprint.

The dev picks one canonical version (www or non-www), sets up a server-level direct redirect (one hop, no chain), and updates internal links to use the canonical form.`,
  },
  {
    key: "PSI-7",
    oldTitle: "PSI · Kill webfont.js loader (saves ~64s render-blocking site-wide)",
    newTitle: "Replace the 2010-era font loader (saves 64 seconds of blocked render time site-wide)",
    newDate: "2026-05-05",
    laymanIssue: `Our site uses a font loader from 2010 (webfont.js) that blocks every page from rendering until it finishes downloading. Combined across all pages, it costs 64 SECONDS of blocked render time.

Modern browsers don't need it — they can load fonts directly from CSS. The dev removes the old loader and switches to direct @font-face declarations. No visual change for visitors; big speed win.`,
  },
  {
    key: "PSI-8",
    oldTitle: "PSI · Critical CSS inlining for Webflow shared stylesheet",
    newTitle: "Inline the critical CSS so pages render before the full stylesheet downloads",
    newDate: "2026-05-06",
    laymanIssue: `Webflow's main stylesheet (9KB) blocks every page from rendering until it's fully downloaded. Combined across our 85 pages, that's 63 SECONDS of blocked render time.

The dev extracts just the bytes needed to render above-the-fold content, pastes them inline in the page head, and loads the rest asynchronously after the page is visible. Result: faster first paint with no visual regression.`,
  },
  {
    key: "PSI-9",
    oldTitle: "PSI · Fix /demo-experience NO_FCP (iframe-only page is 0 indexable content)",
    newTitle: "Add real content to /demo-experience so Google can index it (currently invisible)",
    newDate: "2026-05-07",
    laymanIssue: `Our /demo-experience page is just a full-page iframe with no other content. Google's crawler sees nothing — Lighthouse gives the page 0/0 because there's literally no content to score, and the page isn't indexable in search.

The fix: add a hero section above the iframe with H1 + intro paragraph (50-80 words) + 4 feature bullets + CTA button. Page becomes indexable, gets a real PageSpeed score, demo iframe still works the same way for visitors.`,
  },
  {
    key: "PSI-10",
    oldTitle: "PSI · Image lazy-loading + reserved dimensions (kill CLS site-wide)",
    newTitle: "Stop layout from jumping around as images load (kills CLS warnings sitewide)",
    newDate: "2026-05-08",
    laymanIssue: `Pages "jump" as images finish loading because we don't reserve space for them upfront. PageSpeed flags this as Cumulative Layout Shift (CLS), and it costs us search ranking — Google has used CLS as a ranking factor since 2021.

Fix: dev adds explicit width/height to every image tag, marks below-the-fold images as "lazy load", and marks hero images as "high priority". Visitors get a stable, faster page; CLS drops below 0.1 site-wide.`,
  },
  {
    key: "PSI-11",
    oldTitle: "PSI · Defer Hubspot tracker (hs-scripts.com/48302716.js)",
    newTitle: "Speed up pages by loading HubSpot's visitor tracker 2 seconds after page load",
    newDate: "2026-05-11",
    laymanIssue: `HubSpot's visitor-tracking script runs on every page on first paint — even though it doesn't need to fire immediately.

Defer it by 2 seconds and visitor sessions still record correctly (people read for at least 2s before clicking anything anyway). Saves 150-250ms of script-blocking time per page.`,
  },
  {
    key: "PSI-12",
    oldTitle: "PSI · Audit + remove unused 3rd-party scripts (Facebook Pixel, jQuery)",
    newTitle: "Check if Facebook Pixel + jQuery are still needed; remove if not",
    newDate: "2026-05-12",
    laymanIssue: `Two old scripts are still loading on every page: Facebook Pixel (9 pages, 2.8s of JS time) and jQuery (80 pages, 2s).

Both might no longer be needed:
• Facebook Pixel — confirm with marketing whether Facebook Ads is still active
• jQuery — search the codebase for any custom code still using $ or jQuery()

Remove whichever isn't needed. Saves 100-200ms + 50-100KB per page.`,
  },
  {
    key: "PSI-13",
    oldTitle: "PSI · Browser caching + Cache-Control headers tune-up",
    newTitle: "Make repeat visits feel instant by caching fonts/images for 1 year",
    newDate: "2026-05-13",
    laymanIssue: `Default Webflow caching is conservative — repeat visitors download our fonts, images, and CSS again every time they visit.

With proper Cache-Control headers, repeat visitors get those assets instantly from their browser cache. First-time visit speed is unchanged; second-visit PageSpeed mobile score jumps from ~60 to ~75. The dev configures the headers in Vercel/Cloudflare/hosting layer.`,
  },
  {
    key: "PSI-14",
    oldTitle: "PSI · Final regression sweep + score validation across 85 pages",
    newTitle: "Re-run PageSpeed on all 85 pages and document the wins from the 2-week sprint",
    newDate: "2026-05-14",
    laymanIssue: `After 12 days of PageSpeed fixes, run the speed test on every one of our 85 priority pages and document what improved.

Compare to the original baseline. Identify pages still scoring under 50 (next sprint's targets). Slack the team the top 4-6 wins to keep momentum. Update the dashboard's PSI section with the new scores.`,
  },
  {
    key: "PSI-15",
    oldTitle: "PSI · Eliminate page redirects (PSI opportunity) (84 pages, 66s savings)",
    newTitle: "Site-wide rollup — Eliminate redirect chains across all 84 affected pages (66 sec saved)",
    newDate: "2026-05-04",
    laymanIssue: `This is the consolidated tracking task for the redirect-chain fix (the actual fix is in the "stop redirect chain" task above).

PageSpeed flags "redirects" on 84 pages with a combined 66 seconds of wasted load time. Once the canonical-domain fix ships, this rollup goes to zero across all 84 pages. This task tracks the consolidated metric, not separate work.`,
  },
  {
    key: "PSI-16",
    oldTitle: "PSI · Reduce unused JavaScript (PSI opportunity) (71 pages, 47s savings)",
    newTitle: "Site-wide rollup — Reduce unused JavaScript across 71 pages (47 sec saved)",
    newDate: "2026-05-15",
    laymanIssue: `71 pages on our site ship JavaScript code that never actually runs. Combined waste: 47 seconds of blocked time.

Often it's tracking scripts (HubSpot, Clarity, Facebook) loaded on pages where they don't need to fire, or Webflow features included by default that we don't use. The dev audits each unused JS file at the template level and conditionally loads scripts only on pages that need them.`,
  },
  {
    key: "PSI-17",
    oldTitle: "PSI · Reduce unused CSS (PSI opportunity) (44 pages, 15s savings)",
    newTitle: "Site-wide rollup — Reduce unused CSS across 44 pages (15 sec saved)",
    newDate: "2026-05-18",
    laymanIssue: `44 pages ship CSS rules that never apply to anything on the page. Combined waste: 15 seconds of blocked rendering.

Webflow's design system pulls in big chunks of CSS for components a page doesn't use. The dev audits and tree-shakes at the template level. Less CSS = faster paint.`,
  },
  {
    key: "PSI-18",
    oldTitle: "PSI · Minify the lone unminified JS file (cleanup)",
    newTitle: "Minify the one remaining unminified JavaScript file (final cleanup)",
    newDate: "2026-05-19",
    laymanIssue: `PageSpeed flagged one JavaScript file as unminified on one page. Tiny win individually — easy to close out so the cleanup queue is empty.`,
  },
];

const PSI_DATA_BACKING = `PSI baseline (Section 2.8 of the 100K plan): 85 priority pages audited Apr 2026. Three architectural defects affect 80+ pages each — www→root redirect chain (85/85, +400ms LCP typical), render-blocking 3rd-party JS (78/85, +800ms FCP typical), no image optimization (85/85, +1.2s LCP on image-heavy pages). CWV is a confirmed Google ranking factor; pages failing both LCP and CLS lose 7-12% organic clicks vs matched-control passing peers (Semrush + Sistrix studies, 2024).`;

// =============================================================================
// Action tagging — make the type-of-work obvious in title + first line of issue
// =============================================================================

function inferAction(key: string, override?: Action): Action {
  if (override) return override;
  // SEO ops (kind=blog_task, no brief): K1.2 disavow / K1.6 GBP / K1.7 GA4 /
  // K1.8 monthly report / K3.1 internal-linking sweep / K6.4 6mo review
  if (key === "K1.2" || key === "K1.6" || key === "K1.7") return "CONFIGURE";
  if (key === "K1.8" || key === "K6.4") return "OPS";
  if (key === "K3.1") return "AUDIT";
  // Web (true dev/code/template work)
  if (key === "K3.2") return "AUDIT";
  if (key.startsWith("K")) return "DEPLOY";
  // Blog: explicit MERGE/PRUNE
  if (key === "B2.1") return "MERGE/PRUNE";
  // Blog: REFRESH = existing URL gets rewritten
  if (key.startsWith("B1.4")) return "REFRESH";          // 6 P0 blog rewrites
  if (key === "B1.5a" || key === "B1.5b" || key === "B1.5c") return "REFRESH";
  if (key === "B2.2a" || key === "B2.2b" || key === "B2.2c") return "REFRESH";
  if (key === "B2.4a" || key === "B2.4c") return "REFRESH";
  // Blog: OPS = studies, reviews, kickoffs, launches (output isn't a page)
  if (["B3.4", "B5.3", "B7.3", "B8.3", "B8.4"].includes(key)) return "OPS";
  // Default for everything else (BoF pages, India, industries, integrations,
  // pillars, US pilot, mid-funnel content): NEW page
  return "NEW";
}

function buildActionPreamble(t: Task, action: Action): string {
  // Plain English — no jargon labels. Tells the user what kind of work this
  // actually is (refresh existing vs build new vs ship code vs ops work).
  if (action === "REFRESH") {
    // SeoOpsTask shares kind=blog_task but has no `url`; only BlogTask carries it.
    const url = t.kind === "blog_task" ? (t as Partial<BlogTask>).url : undefined;
    return `REFRESH — We're updating an existing page that's already live at ${url ?? "(URL in task title)"}. Keep the same URL; rewrite the content, update the title, refresh the publish date, then republish. Once live, submit the URL via GSC URL Inspection → Request indexing so Google re-crawls it within 24-48 hours.`;
  }
  if (action === "NEW") {
    const m = t.title.match(/(\/[a-z0-9_/-]+)/);
    const targetUrl = m?.[1] ?? "(slug in task title)";
    return `NEW PAGE — Building from scratch at ${targetUrl}. No prior content exists at this URL. Once published, submit it to GSC for indexing.`;
  }
  if (action === "MERGE/PRUNE") {
    return `CLEANUP — This is content-ops cleanup, NOT a new article. For each URL in the implementation notes, decide: (a) MERGE — 301-redirect this URL to a higher-traffic post on the same topic; or (b) PRUNE — return 410 (delete permanently). Output is a decision spreadsheet + the actual redirects/deletions executed in Webflow/hosting. Cleaning up thin posts improves the quality signal of the entire blog subfolder to Google.`;
  }
  if (action === "DEPLOY") {
    return `FOR YOUR DEV — This needs a code or config change to the website (template code, schema markup, redirects, sitemap, or routing). No content writing involved. After they ship, follow the acceptance test below to confirm it worked. Then watch Google Search Console for the next 14 days for downstream impact.`;
  }
  if (action === "CONFIGURE") {
    return `EXTERNAL ADMIN — Work happens inside a third-party dashboard (Google Search Console / Analytics / Business Profile / DNS / hosting). No website code change. No content writing. Settings persist on the external system; verify with the acceptance test below.`;
  }
  if (action === "AUDIT") {
    return `AUDIT SWEEP — Review every page in the listed scope, build a fix-list (spreadsheet), then execute the fixes. Output = audit log + applied corrections. This is not a single-page edit; it's a systematic review.`;
  }
  if (action === "OPS") {
    return `OPERATIONAL — The output is a document, dataset, or external launch — NOT a published webpage. Could be a research/data study (PDF + supporting blog post), a monthly performance report, a mid-plan review memo, a PR distribution push, or planning/kickoff for a downstream project.`;
  }
  return "";
}

// Format an estimated search volume for the title prefix. "1.5K/mo" / "600/mo".
function formatVolume(v: number | null | undefined): string | null {
  if (v == null || v <= 0) return null;
  if (v >= 1000) {
    const k = v / 1000;
    return `${k.toFixed(k >= 10 ? 0 : 1).replace(/\.0$/, "")}K/mo`;
  }
  return `${v}/mo`;
}

// Determine Page vs Post for type taxonomy. Posts live under /blog/; pages
// are landing-page-like (vs / alternative / integration / industry / India / feature / solution).
function inferPagePost(t: Task): "Post" | "Page" {
  // Key-prefix shortcut for our seed structure
  if (
    /^(B-VS|B-ALT|B-INT|F\.)/.test(t.key) ||
    /^B3\.2[a-z]?/.test(t.key) ||      // /in/* India pages
    /^B3\.1i\d+/.test(t.key) ||         // industry pages M3
    /^B4\.2/.test(t.key) ||             // industry pages M4
    /^K-(HOME|REVIEWS|HOWITWORKS)$/.test(t.key)
  ) return "Page";

  if (t.kind === "blog_task") {
    const blogish = t as Partial<BlogTask>;
    if (blogish.url && /\/blog\//i.test(blogish.url)) return "Post";
    if (blogish.url && /\/(solutions?|vs|alternative|integrations?|industries|in|features?)\//i.test(blogish.url)) return "Page";
    if (/Build (\/(vs|alternative|integrations?|industries|in|features?))/i.test(t.title)) return "Page";
    if (/(blog|article|listicle|post|cluster|pillar)/i.test(t.title) && !/landing|page$/i.test(t.title)) return "Post";
  }
  return "Post";
}

function inferTaskType(t: Task): TaskType | null {
  if (t.task_type) return t.task_type;
  if (t.kind === "web_task") return null;
  if (t.kind === "blog_task" && !(t as Partial<BlogTask>).target_keyword) return null;

  const action = inferAction(t.key, t.action);
  const asset = inferPagePost(t);
  if (action === "REFRESH") return `Update ${asset}` as TaskType;
  if (action === "NEW") return `New ${asset}` as TaskType;
  if (action === "MERGE/PRUNE") return `Modify ${asset}` as TaskType;
  return null;
}

// Layman title: lead with [<Type> · <Vol>] prefix when available, then the
// plain-English body, then [KEY] suffix for dedupe. Examples:
//   "[New Post · 600/mo] Agentic AI in Employee Monitoring [B-UA.AI.1]"
//   "[Update Post · 1.5K/mo] Remote screen monitoring software [B1.4a]"
//   "Fix sitemap.xml so Google can find all 420 pages [K1.1]"  (no prefix on dev tasks)
function buildTitle(t: Task, action: Action): string {
  const taskType = inferTaskType(t);
  const volStr = formatVolume(t.est_volume);
  const body = humanize(t, action);
  let prefix = "";
  if (taskType && volStr) prefix = `[${taskType} · ${volStr}] `;
  else if (taskType) prefix = `[${taskType}] `;
  else if (volStr) prefix = `[${volStr}] `;
  return `${prefix}${body} [${t.key}]`;
}

function humanize(t: Task, action: Action): string {
  const raw = t.title;

  // BLOG: refreshes — "Rewrite: /blog/X" or "Striking-distance refresh: /X"
  // or "Solution-page refresh: /X"
  if (action === "REFRESH") {
    const url = t.kind === "blog_task" ? (t as Partial<BlogTask>).url : undefined;
    if (t.kind === "blog_task" && url) {
      // Strip URL prefix to get a clean slug → human title
      const m = raw.match(/(?:Rewrite|refresh|Solution-page refresh):\s*(.+?)(?:\s*\(|$)/i);
      const target = (t as Partial<BlogTask>).target_keyword;
      if (raw.toLowerCase().startsWith("solution-page refresh")) {
        return `Update existing landing page: ${m?.[1]?.trim() ?? url}`;
      }
      if (raw.toLowerCase().startsWith("striking-distance")) {
        return `Update existing page: ${m?.[1]?.trim() ?? url}${target ? ` — target "${target}"` : ""}`;
      }
      return `Update existing blog: "${target ?? m?.[1]?.trim() ?? url}"`;
    }
    return raw; // fallback
  }

  // BLOG: new BoF pages — "Build /vs/X (Y vs-page)" / "Build /alternative/X" / etc.
  if (action === "NEW") {
    const slugMatch = raw.match(/Build\s+(\/(vs|alternative|integrations|industries|in)\/[a-z0-9-/]+)/);
    if (slugMatch) {
      const scope = slugMatch[2];
      const slug = slugMatch[1].split("/").pop() ?? "";
      const name = slug.replace(/-/g, " ").replace(/^we360 vs /, "We360 vs ");
      const cap = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
      if (scope === "vs") return `Build new comparison page: ${cap(name)}`;
      if (scope === "alternative") return `Build new alternative page: ${cap(name.replace(/ alternative$/i, ""))} alternative`;
      if (scope === "integrations") return `Build new integration page: ${cap(name)}`;
      if (scope === "industries") return `Build new industry page: ${cap(name)}`;
      if (scope === "in") return `Build new India page: ${cap(name.replace(/ india$/i, ""))} (India)`;
    }
    // New blog posts (not BoF pages) — keys like B2.4b, B3.3a, B5.2*, B6.3*, B7.4, B8.1*
    if (raw.toLowerCase().startsWith("new blog:") || raw.toLowerCase().startsWith("pillar:")) {
      const target = (t as { target_keyword?: string }).target_keyword;
      const fromTitle = raw.replace(/^(New blog|Pillar):\s*/i, "").replace(/\s*\(.*?\)\s*$/, "").trim();
      return `Write new article: "${target ?? fromTitle}"`;
    }
    if (raw.startsWith("Build /blog/")) {
      const m = raw.match(/Build (\/blog\/[a-z0-9-]+)/);
      return `Write new blog post: ${m?.[1] ?? raw}`;
    }
    // Fallback: prepend "Build new:"
    return `Build new: ${raw.replace(/^Build\s+/, "")}`;
  }

  if (action === "MERGE/PRUNE") {
    // "Prune 41 thin/duplicate blog posts — execute keep/merge/410 decisions"
    const m = raw.match(/(\d+)\s+thin/i);
    const n = m?.[1] ?? "many";
    return `Clean up ${n} thin blog posts (decide: merge, delete, or refresh)`;
  }

  if (action === "OPS") {
    // Studies / reviews / launches — keep raw title, it's already plain English
    if (raw.toLowerCase().startsWith("data study")) return raw;
    if (raw.toLowerCase().includes("review")) return raw;
    return raw;
  }

  // WEB tasks (DEPLOY / CONFIGURE / AUDIT) and PSI: keep their titles as-is.
  // The titles are already plain English — no jargon prefix to strip.
  return raw;
}

// Brief merge: seed wins for scalars, UNION for arrays (deduped). Preserves
// Apify-enriched H2/H3/PAA/competitor_refs/writer_notes across re-runs of the
// import script. The seed brief gets stamped on first INSERT; every UPDATE
// after that adds new seed bits without clobbering the actor's work.
function mergeBriefs(seed: BlogBriefSeed, db: BlogBriefSeed): BlogBriefSeed {
  const dedupeArr = (...lists: unknown[][]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const list of lists) {
      for (const raw of list ?? []) {
        const s = typeof raw === "string" ? raw : (raw == null ? "" : String(raw));
        const k = s.trim().toLowerCase();
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(s.trim());
      }
    }
    return out;
  };
  return {
    // Scalars — seed wins
    target_keyword: seed.target_keyword || db.target_keyword,
    intent: seed.intent || db.intent || "informational",
    word_count_target: seed.word_count_target || db.word_count_target || 1500,
    recommended_h1: seed.recommended_h1 || db.recommended_h1 || "",
    generated_by: db.generated_by === "apify-enrich" ? "apify-enrich" : (seed.generated_by ?? "manual"),
    // Arrays — preserve Apify enrichment, append new seed entries
    secondary_keywords: dedupeArr(db.secondary_keywords ?? [], seed.secondary_keywords ?? []),
    recommended_h2s: dedupeArr(db.recommended_h2s ?? [], seed.recommended_h2s ?? []),
    recommended_h3s: dedupeArr(db.recommended_h3s ?? [], seed.recommended_h3s ?? []),
    sections_breakdown: dedupeArr(db.sections_breakdown ?? [], seed.sections_breakdown ?? []),
    paa_questions: dedupeArr(db.paa_questions ?? [], seed.paa_questions ?? []),
    internal_links: dedupeArr(db.internal_links ?? [], seed.internal_links ?? []),
    competitor_refs: dedupeArr(db.competitor_refs ?? [], seed.competitor_refs ?? []),
    writer_notes: dedupeArr(db.writer_notes ?? [], seed.writer_notes ?? []),
  };
}

// =============================================================================
// Driver — upsert all tasks (dedupe by [KEY] prefix), re-date PSI tasks
// =============================================================================

async function upsertTask(t: Task, superAdminId: string): Promise<"inserted" | "updated"> {
  const action = inferAction(t.key, t.action);
  const fullTitle = buildTitle(t, action);
  // Prefer the layman-friendly issue text when present (web tasks especially —
  // the original `issue` is too technical for a non-engineer to delegate from).
  const issueText = t.laymanIssue ?? t.issue;
  const issueWithPreamble = `${buildActionPreamble(t, action)}\n\n${issueText}`;

  // Dedupe by [KEY] — used to be a title PREFIX `[KEY] ...`, now a SUFFIX
  // `... [KEY]` after the layman-title rewrite. Match BOTH so old prefix-style
  // titles still get found and updated in place (rather than duplicated).
  const keyTag = `[${t.key}]`;
  const { data: existing } = await admin
    .from("tasks")
    .select("id")
    .eq("project_id", PROJECT_ID)
    .or(`title.like.${keyTag}%,title.like.%${keyTag}`)
    .limit(1)
    .maybeSingle();

  // If an Apify-enrich appendix exists on the live row's data_backing, preserve
  // it — the seed only carries the GSC/GA4 baseline; live SERP / AI Overview
  // status lives in the appendix and shouldn't be erased on re-import.
  let preservedEnrichmentTail = "";
  if (existing) {
    const { data: liveDb } = await admin
      .from("tasks")
      .select("data_backing")
      .eq("id", existing.id)
      .single();
    const live = (liveDb?.data_backing ?? "") as string;
    const idx = live.indexOf("\n\n---\n**Apify enrichment");
    if (idx >= 0) preservedEnrichmentTail = live.slice(idx);
  }

  const baseRow: Record<string, unknown> = {
    project_id: PROJECT_ID,
    title: fullTitle,
    kind: t.kind,
    priority: t.priority,
    pillar: t.pillar,
    source: "manual" as const,
    scheduled_date: t.scheduled_date,
    status: t.status ?? "todo",
    issue: issueWithPreamble,
    impl: t.impl,
    data_backing: t.data_backing + preservedEnrichmentTail,
    task_type: inferTaskType(t),
    est_volume: t.est_volume ?? null,
  };

  if (t.kind === "blog_task") {
    // SeoOpsTask is also kind=blog_task but doesn't carry target_keyword /
    // brief / competition / url. Distinguish via runtime check on `target_keyword`.
    const blogish = t as Partial<BlogTask>;
    if (blogish.target_keyword) {
      // CRITICAL: on UPDATE, MERGE the seed brief with the existing brief in
      // DB so we don't wipe Apify-enriched H2/H3/PAA/competitor_refs. Without
      // this, every re-run of the import script reverts the brief to the
      // skeleton seed and destroys hours of actor-cost enrichment.
      let mergedBrief: BlogBriefSeed | null = blogish.brief ?? null;
      if (existing && blogish.brief) {
        const { data: dbRow } = await admin
          .from("tasks")
          .select("brief")
          .eq("id", existing.id)
          .single();
        const dbBrief = (dbRow?.brief ?? null) as BlogBriefSeed | null;
        if (dbBrief) mergedBrief = mergeBriefs(blogish.brief, dbBrief);
      }
      Object.assign(baseRow, {
        target_keyword: blogish.target_keyword,
        url: blogish.url ?? null,
        competition: blogish.competition ?? null,
        brief: mergedBrief,
        word_count_target: mergedBrief?.word_count_target ?? null,
        intent: mergedBrief?.intent ?? null,
      });
    } else {
      // SEO ops task — no content fields, explicitly NULL them so a previous
      // run that left them populated gets cleaned up.
      Object.assign(baseRow, {
        target_keyword: null,
        url: null,
        competition: null,
        brief: null,
        word_count_target: null,
        intent: null,
      });
    }
  }

  if (existing) {
    const { error } = await admin
      .from("tasks")
      .update(baseRow)
      .eq("id", existing.id);
    if (error) throw error;
    return "updated";
  }

  const { error } = await admin
    .from("tasks")
    .insert({ ...baseRow, created_by: superAdminId });
  if (error) throw error;
  return "inserted";
}

async function redatePsiTasks(): Promise<{ updated: number; renamed: number; missing: number }> {
  let updated = 0;
  let renamed = 0;
  let missing = 0;
  // The DEPLOY preamble for PSI tasks. Build once with a synthetic Task so we
  // can call buildActionPreamble (which expects a Task parameter).
  const psiPreamble = buildActionPreamble({ kind: "web_task" } as Task, "DEPLOY");

  for (const t of PSI_TASKS) {
    const tag = `[${t.key}]`;
    const fullTitle = `${t.newTitle} ${tag}`;

    // Try [KEY] dedupe first (subsequent runs)
    let existing: { id: string } | null = null;
    {
      const r = await admin
        .from("tasks")
        .select("id")
        .eq("project_id", PROJECT_ID)
        .or(`title.like.${tag}%,title.like.%${tag}`)
        .limit(1)
        .maybeSingle();
      existing = r.data;
    }
    // Fall back to old title (first run after rename)
    if (!existing) {
      const r = await admin
        .from("tasks")
        .select("id")
        .eq("project_id", PROJECT_ID)
        .eq("title", t.oldTitle)
        .limit(1)
        .maybeSingle();
      existing = r.data;
      if (existing) renamed++;
    }
    if (!existing) { missing++; continue; }

    const patch: Record<string, unknown> = {
      title: fullTitle,
      scheduled_date: t.newDate,
      data_backing: PSI_DATA_BACKING,
      issue: `${psiPreamble}\n\n${t.laymanIssue}`,
    };
    if (t.status) {
      patch.status = t.status;
      patch.done = t.status === "done";
    }
    const { error } = await admin.from("tasks").update(patch).eq("id", existing.id);
    if (error) throw error;
    updated++;
  }
  return { updated, renamed, missing };
}

// Keys we used to insert but no longer want — running this cleans them up.
// On re-run after a refactor, anything in DB matching `[KEY]%` gets deleted.
const DELETED_KEYS = [
  // Phase 100K-plan-v1 — deleted page-template tasks (writers create the structure when shipping the first page in each category)
  "K2.2", "K2.3", "K2.4",
  // Phase B (Apr 29 2026) — deleted integration tasks for tools we don't actually integrate with.
  // Real integrations are only Keka, Zoho, GreyTHR, Jira, MS Teams (see buildIntegrationPages call).
  "B-INT.slack", "B-INT.salesforce", "B-INT.asana", "B-INT.zoom",
  "B-INT.hubspot", "B-INT.google-workspace",
];

// Keys that USED to be kind=web_task and are now kind=blog_task. The upsert
// won't auto-fix this because it dedupes by [KEY] prefix only — if an existing
// row has the wrong kind, we update it explicitly here.
const RECLASSIFIED_TO_BLOG = ["K1.2", "K1.6", "K1.7", "K1.8", "K3.1", "K6.4"];

async function deleteByKeys(keys: string[]): Promise<number> {
  let deleted = 0;
  for (const k of keys) {
    const tag = `[${k}]`;
    const { data: rows } = await admin
      .from("tasks")
      .select("id")
      .eq("project_id", PROJECT_ID)
      .or(`title.like.${tag}%,title.like.%${tag}`);
    const ids = (rows ?? []).map((r: { id: string }) => r.id);
    if (ids.length === 0) continue;
    const { error } = await admin.from("tasks").delete().in("id", ids);
    if (error) throw error;
    deleted += ids.length;
  }
  return deleted;
}

async function fixKindByKeys(keys: string[], targetKind: "web_task" | "blog_task"): Promise<number> {
  let updated = 0;
  for (const k of keys) {
    const tag = `[${k}]`;
    const { data: rows } = await admin
      .from("tasks")
      .select("id, kind")
      .eq("project_id", PROJECT_ID)
      .or(`title.like.${tag}%,title.like.%${tag}`);
    for (const r of (rows ?? []) as Array<{ id: string; kind: string }>) {
      if (r.kind === targetKind) continue;
      const { error } = await admin.from("tasks").update({ kind: targetKind }).eq("id", r.id);
      if (error) throw error;
      updated++;
    }
  }
  return updated;
}

async function main() {
  // Resolve a creator (first super_admin / platform_admin)
  const { data: prof } = await admin
    .from("profiles")
    .select("id")
    .or("platform_admin.eq.true,role.eq.super_admin,role.eq.admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const superAdminId = (prof as { id?: string } | null)?.id ?? null;
  if (!superAdminId) { console.error("No admin profile found"); process.exit(1); }

  // 0) Cleanup: drop tasks no longer in the spec (K2.2 / K2.3 / K2.4 templates)
  const dropped = await deleteByKeys(DELETED_KEYS);
  console.log(`Cleanup: deleted ${dropped} rows for keys ${DELETED_KEYS.join(", ")}`);

  // 0b) Cleanup: fix `kind` for tasks that moved web_task → blog_task
  const reclassified = await fixKindByKeys(RECLASSIFIED_TO_BLOG, "blog_task");
  console.log(`Reclassified ${reclassified} rows from web_task → blog_task (${RECLASSIFIED_TO_BLOG.join(", ")})`);

  // 1) Re-date PSI tasks + add data_backing
  const psi = await redatePsiTasks();
  console.log(`PSI re-date: ${psi.updated} updated (${psi.renamed} freshly renamed), ${psi.missing} not found`);

  // 2) Upsert WEB tasks (true dev/code/template work only)
  let webIns = 0, webUpd = 0;
  for (const t of WEB_TASKS) {
    const r = await upsertTask(t, superAdminId);
    if (r === "inserted") webIns++; else webUpd++;
  }
  console.log(`WEB tasks: ${webIns} inserted, ${webUpd} updated (total ${WEB_TASKS.length})`);

  // 3) Upsert SEO OPS tasks (kind=blog_task; admin/setup/audit work)
  let opsIns = 0, opsUpd = 0;
  for (const t of SEO_OPS_TASKS) {
    const r = await upsertTask(t, superAdminId);
    if (r === "inserted") opsIns++; else opsUpd++;
  }
  console.log(`SEO OPS tasks: ${opsIns} inserted, ${opsUpd} updated (total ${SEO_OPS_TASKS.length})`);

  // 4) Upsert BLOG tasks (real content work — refreshes, new pages, studies)
  let blogIns = 0, blogUpd = 0;
  for (const t of BLOG_TASKS) {
    const r = await upsertTask(t, superAdminId);
    if (r === "inserted") blogIns++; else blogUpd++;
  }
  console.log(`BLOG tasks: ${blogIns} inserted, ${blogUpd} updated (total ${BLOG_TASKS.length})`);

  // 5) Final counts
  const { count: webCount } = await admin.from("tasks").select("*", { count: "exact", head: true }).eq("project_id", PROJECT_ID).eq("kind", "web_task");
  const { count: blogCount } = await admin.from("tasks").select("*", { count: "exact", head: true }).eq("project_id", PROJECT_ID).eq("kind", "blog_task");
  console.log(`\n✅ Total in dashboard: ${webCount} web tasks, ${blogCount} SEO tasks`);
}

// Gate auto-run so this file can be imported as a module by other scripts
// (e.g. export-may-jun-plan.ts) without triggering the import side-effects.
if (require.main === module || process.argv[1]?.includes("import-100k-plan")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
