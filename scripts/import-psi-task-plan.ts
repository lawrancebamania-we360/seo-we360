#!/usr/bin/env tsx
// Build the PSI task backlog in /dashboard/tasks (Web Tasks):
//
//   1. Delete the generic P0 tasks I seeded earlier (user is replacing them
//      with the day-by-day PSI plan from the team Slack).
//   2. Insert Apr 22–28 (existing in-flight work from Slack) with statuses
//      reflecting reality (Apr 22/23 done, Apr 24 blocked, Apr 25/28 todo).
//   3. Insert Apr 29 → May 9 — fresh PSI roadmap, 8 working days @ 4–5h/day.
//   4. Group audit_findings (skill='speed', status='fail' → savings >1000ms)
//      by check_name and create one site-wide task per opportunity. Avoids
//      drowning the kanban with per-page rows since each fix is template-level.

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env"); process.exit(1);
}
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.trim());
const PROJECT_ID = "11111111-1111-4111-8111-000000000001";

interface SeedTask {
  date: string;                                     // YYYY-MM-DD
  title: string;
  priority: "critical" | "high" | "medium" | "low";
  status?: "todo" | "in_progress" | "done";
  issue: string;
  impl: string;
}

// ---------------------------------------------------------------
// Step 1 — wipe the 5 P0 tasks I seeded in 20260424000004
// ---------------------------------------------------------------
async function purgeOldP0() {
  // Wipe both the old "P0-" prefixed seed tasks AND any prior PSI tasks from
  // this script (so re-running is idempotent).
  const { data: rows } = await admin
    .from("tasks").select("id, title")
    .eq("project_id", PROJECT_ID)
    .eq("kind", "web_task")
    .or("title.like.P0-%,title.like.PSI \u00b7 %");
  const ids = (rows ?? []).map((r: { id: string }) => r.id);
  if (ids.length === 0) return 0;
  await admin.from("tasks").delete().in("id", ids);
  return ids.length;
}

// ---------------------------------------------------------------
// Step 2+3 — Day-by-day PSI plan
// ---------------------------------------------------------------
const PLAN: SeedTask[] = [
  // ===== Apr 22–28 (already in flight — match Slack thread) =====
  {
    date: "2026-04-22", priority: "high", status: "done",
    title: "PSI · Kill font bloat + font-display swap",
    issue: "Webflow project loads Exo, Montserrat, Inconsolata, Lato, Great Vibes, Open Sans alongside Poppins + DM Serif Display. PSI flags multiple Google Font requests as render-blocking. No font-display:swap on custom Untitledsans.",
    impl: `1. Webflow → Project Settings → Fonts → Google Fonts: remove Exo, Montserrat, Inconsolata, Lato, Great Vibes, Open Sans. Keep only what's actually used.
2. Audit remaining font weights — if only 400/600/700 used, drop the rest.
3. Add @font-face { font-display: swap; } site-wide custom head for Untitledsans.
4. Identify the 3rd-party JS still injecting Google Fonts (PSI still flags Google Fonts after Webflow cleanup).
5. Publish + PSI re-run.
TEST 1: Browse 3 pages, fonts render (no Times New Roman fallback).
TEST 2: GA4 Real-Time normal traffic + Clarity sessions still recording.
EXPECTED: FCP -200–400ms, render-blocking 370ms → ~200ms, desktop PSI 70 → ~76.`,
  },
  {
    date: "2026-04-23", priority: "high", status: "done",
    title: "PSI · Lazy-load HubSpot Chat widget",
    issue: "usemessages.com/conversations-embed.js loads on every page hit, blocking ~250ms of TBT. Most visitors never engage with chat.",
    impl: `1. Replace direct HubSpot Chat embed with a JS loader that delays injection until first scroll OR 6-second timeout (whichever first).
2. Confirm widget still opens via scroll + chat-icon click.
3. Verify hs-scripts.com/48302716.js (visitor identification tracker) still fires on page load — do NOT defer this one.
4. Deploy + PSI re-run.
TEST 1: scroll triggers widget, click opens convo, send test message.
TEST 2: GA4 Real-Time + Clarity check — HubSpot active sessions still appearing in admin.
EXPECTED: TBT -200–350ms, desktop PSI 76 → ~83.`,
  },
  {
    date: "2026-04-24", priority: "high", status: "in_progress",
    title: "PSI · Defer HubSpot Forms script (IntersectionObserver wrapper)",
    issue: "js-na2.hsforms.net/forms/embed/v2.js is render-blocking on /demo, /contact, homepage. Adding raw `defer` BREAKS the form because the inline hbspt.forms.create() runs before the script loads.",
    impl: `Use a wrapped lazy-loader instead of plain defer:

<script>
  // Load HubSpot Forms only when the form scrolls into viewport (or on window load fallback)
  function loadHubspotForms() {
    if (window.__hsFormsLoaded) return;
    window.__hsFormsLoaded = true;
    const s = document.createElement('script');
    s.src = 'https://js-na2.hsforms.net/forms/embed/v2.js';
    s.onload = () => {
      hbspt.forms.create({
        region: "na2",
        portalId: "YOUR_ID",
        formId: "YOUR_FORM_ID",
        target: "#hubspotForm"
      });
    };
    document.head.appendChild(s);
  }
  // Trigger on first viewport visibility OR window 'load' fallback
  const target = document.querySelector('#hubspotForm');
  if (target && 'IntersectionObserver' in window) {
    new IntersectionObserver((entries, obs) => {
      if (entries[0].isIntersecting) { loadHubspotForms(); obs.disconnect(); }
    }, { rootMargin: '200px' }).observe(target);
  } else {
    window.addEventListener('load', loadHubspotForms);
  }
</script>

TEST every form: /demo, /contact, homepage contact, any inline. Submit end-to-end → confirm lead appears in HubSpot Contacts.
TEST 2: GA4 + Clarity normal.
EXPECTED: 1 of 3 blocking scripts gone. Render-blocking 200ms → ~80ms. PSI 83 → ~87.`,
  },
  {
    date: "2026-04-25", priority: "high", status: "todo",
    title: "PSI · Add preconnect hints for 5 third-party hosts",
    issue: "GTM, Clarity, HubSpot CDN, Facebook all do DNS+TLS handshakes on first request. Costs 100–300ms per host.",
    impl: `Webflow site-wide custom head, ABOVE existing preconnects:

<link rel="preconnect" href="https://www.googletagmanager.com" crossorigin>
<link rel="preconnect" href="https://www.clarity.ms" crossorigin>
<link rel="preconnect" href="https://js-na2.hubspot.com" crossorigin>
<link rel="preconnect" href="https://js-na2.hs-scripts.com" crossorigin>
<link rel="preconnect" href="https://connect.facebook.net" crossorigin>

Publish + PSI re-run.
TEST 1: DevTools → Network → confirm preconnect rows for new hosts; DNS+TLS for them shows as "(disk cache)" or 0ms when their script requests fire.
TEST 2: GA4 + Clarity normal.
EXPECTED: 100–300ms saved on first-visit. PSI 87 → ~89.`,
  },
  {
    date: "2026-04-28", priority: "high", status: "todo",
    title: "PSI · Forced reflow fix + sprint regression run",
    issue: "Chrome DevTools Performance shows pink 'Forced reflow' triangles in flame chart — JS reading layout properties (offsetHeight, getBoundingClientRect) inside write phases triggers expensive recalcs.",
    impl: `1. DevTools → Performance → record homepage load. Find pink "Forced reflow" markers.
2. Trace offending function. Common culprits: custom JS reading offsetHeight inside a setTimeout that also writes styles.
3. Fix: cache the read into a variable, batch the write inside requestAnimationFrame, or move to a separate task. If reflow is in Webflow-owned code, skip (we can't edit it).
4. Final PSI re-run + side-by-side compare with Apr 21 baseline.
TEST 1: browse homepage — Webflow animations still play, scroll interactions still work.
TEST 2: GA4 + Clarity normal.
EXPECTED: 1 PSI diagnostic cleared. TBT -50–100ms.`,
  },

  // ===== Apr 29 → May 9: NEW PSI ROADMAP (8 working days) =====
  {
    date: "2026-04-29", priority: "critical", status: "todo",
    title: "PSI · Eliminate www → non-www redirect chain (saves ~65,520ms across 84 pages)",
    issue: "Every page has a we360.ai → www.we360.ai (or vice versa) 301 hop costing 780ms per first-visit. PSI flags this on 84/85 core pages — total potential savings 65.5 SECONDS site-wide. This is the single biggest PSI win available.",
    impl: `1. Decide canonical: choose ONE of www.we360.ai or we360.ai as primary (current top page is https://we360.ai/ which suggests non-www should be canonical).
2. In Webflow Project Settings → Hosting → set the canonical domain.
3. At DNS / hosting level (Vercel/Cloudflare/whatever): set up server-level 301 from non-canonical → canonical (one hop, no chain).
4. Audit every internal link in Webflow: search/replace any hardcoded https://www.we360.ai/ to https://we360.ai/ (or whatever you chose).
5. Update sitemap.xml to use canonical only.
6. Update GSC/GA4 property URL to match canonical.
7. PSI re-run.
TEST 1: Network tab → confirm no 301 chain on top pages. Each URL resolves in 1 hop.
TEST 2: GA4 + Clarity normal. Brand search still works in Google.
EXPECTED: PSI mobile +5–8 points across the board.`,
  },
  {
    date: "2026-04-30", priority: "critical", status: "todo",
    title: "PSI · Kill webfont.js loader (saves ~64s render-blocking site-wide)",
    issue: "ajax.googleapis.com/ajax/libs/webfont/1.6.26/webfont.js loads on 84 pages, 6KB but blocks 64,187ms of total page paint time. WebFont Loader is a 2010-era library — modern browsers don't need it.",
    impl: `1. Identify what webfont.js is actually loading on the site (likely Webflow's legacy fallback for Google Fonts).
2. Self-host the actual font files (.woff2) in Webflow assets OR via /public.
3. Replace the webfont.js loader with direct @font-face declarations in site-wide head:

@font-face {
  font-family: 'Untitled Sans';
  src: url('/fonts/UntitledSans-Regular.woff2') format('woff2');
  font-display: swap;
  font-weight: 400;
}
/* ...one block per weight */

4. Remove the webfont.js script tag entirely.
5. Publish + PSI re-run.
TEST 1: visit 5 different page types (home, blog, alternative-to, /demo, careers) — fonts render correctly with no FOUT/FOIT.
TEST 2: GA4 + Clarity normal.
EXPECTED: render-blocking goes from ~200ms → ~50ms. PSI desktop +3–5 points.`,
  },
  {
    date: "2026-05-01", priority: "high", status: "todo",
    title: "PSI · Critical CSS inlining for Webflow shared stylesheet",
    issue: "we360-ai.webflow.shared.fe0040a98.min.css (9KB) blocks 63,087ms cumulative across 84 pages. Plus per-template CSS files add another 20–60s each. Inlining the above-the-fold critical bytes unblocks first paint.",
    impl: `1. Use the 'critical' npm package or critters-webpack-plugin equivalent to extract above-the-fold CSS for the homepage, /demo, /alternative/* templates.
2. In Webflow site-wide custom head, inline the critical bytes inside a <style>...</style> block (~3-5KB).
3. Mark the original stylesheet as non-render-blocking by loading it async:
   <link rel="preload" href="...webflow.shared....min.css" as="style" onload="this.rel='stylesheet'">
   <noscript><link rel="stylesheet" href="...webflow.shared....min.css"></noscript>
4. Publish + PSI re-run.
TEST 1: visit 5 page types, confirm no FOUC (flash of unstyled content). Browse for 30s, animations work.
TEST 2: GA4 + Clarity normal.
EXPECTED: FCP -300–500ms. PSI mobile +4–7 points.`,
  },
  {
    date: "2026-05-04", priority: "high", status: "todo",
    title: "PSI · Fix /demo-experience NO_FCP (iframe-only page is 0 indexable content)",
    issue: "/demo-experience is a full-viewport iframe to app.storylane.io. document.body.innerText ≈ 0 chars. Lighthouse returns NO_FCP (no contentful paint EVER). Google can't index the page — major SEO red flag — and it gets a 0/0 PSI score.",
    impl: `1. In Webflow, edit /demo-experience template.
2. Above the iframe, add server-rendered hero content:
   - <h1>Try We360 — interactive product demo</h1>
   - 1 paragraph intro (50–80 words explaining what visitors will see)
   - 4 feature bullets (what to look for in the demo)
   - Primary CTA button ("Book a guided demo" → /demo)
3. Add loading="lazy" to the iframe so it doesn't block paint.
4. Wrap iframe in a container with min-height to prevent CLS.
5. PSI re-run + Google Search Console "Request indexing" for /demo-experience.
TEST 1: page renders content above the fold within 1.5s. iframe loads on scroll.
TEST 2: GA4 + Clarity normal. Storylane analytics still tracking demo plays.
EXPECTED: NO_FCP gone, /demo-experience indexable, PSI for that page 0 → 60+.`,
  },
  {
    date: "2026-05-05", priority: "high", status: "todo",
    title: "PSI · Image lazy-loading + reserved dimensions (kill CLS site-wide)",
    issue: "WebP conversion is done but PSI still flags CLS (avg 0.10–0.72 across pages). Root cause: image elements don't reserve layout space, so layout shifts as they load. Plus below-the-fold images load eagerly.",
    impl: `1. Audit all <img> tags in Webflow templates. Add explicit width + height attributes (or aspect-ratio CSS) to every one.
2. Add loading="lazy" to all images BELOW the fold (keep eager on hero/LCP images).
3. Add fetchpriority="high" to LCP images (usually the hero image on each page).
4. For Webflow's auto-generated <picture>/<img> elements, check the responsive image markup includes width/height.
5. PSI re-run.
TEST 1: scroll-recorded video on /, /alternative/timedoctor, /demo — visual confirm no jumps as images load.
TEST 2: GA4 + Clarity normal.
EXPECTED: CLS drops to <0.1 site-wide. PSI mobile +3–5 points (CLS contributes 25% of score).`,
  },
  {
    date: "2026-05-06", priority: "medium", status: "todo",
    title: "PSI · Defer Hubspot tracker (hs-scripts.com/48302716.js)",
    issue: "Hubspot's visitor-identification tracker is on 19 pages, 9008ms total main-thread time. It IS load-bearing for lead attribution but doesn't need to fire before first paint.",
    impl: `1. Wrap the hs-scripts.com loader in a window.requestIdleCallback fallback to setTimeout 2000ms:

<script>
  function loadHubspotTracker() {
    if (window.__hsTrackerLoaded) return;
    window.__hsTrackerLoaded = true;
    const s = document.createElement('script');
    s.src = '//js.hs-scripts.com/48302716.js';
    s.async = true; s.defer = true;
    document.body.appendChild(s);
  }
  if ('requestIdleCallback' in window) {
    requestIdleCallback(loadHubspotTracker, { timeout: 2500 });
  } else {
    setTimeout(loadHubspotTracker, 2000);
  }
</script>

2. Verify in HubSpot admin that visitor sessions still record (the 2-second delay shouldn't lose any since users typically read for >2s before forms/CTAs).
3. PSI re-run.
TEST 1: open page, wait 3s, click any CTA. Confirm in HubSpot session recordings.
TEST 2: GA4 + Clarity normal. HubSpot dashboard active sessions count similar to baseline.
EXPECTED: TBT -150–250ms. Mobile PSI +1–2 points.`,
  },
  {
    date: "2026-05-07", priority: "medium", status: "todo",
    title: "PSI · Audit + remove unused 3rd-party scripts (Facebook Pixel, jQuery)",
    issue: "PSI flags Facebook Pixel (9 pages, 2851ms total) — confirm if FB Ads is still active before removing. Plus jQuery CDN (80 pages, 2076ms) — modern Webflow doesn't need it; check if any custom JS still depends on $.",
    impl: `1. Confirm with marketing: is Facebook Pixel still in use for any active campaign? If NO, remove the connect.facebook.net loader from site-wide head.
2. Search the codebase for any custom JS using $ or jQuery() — if none, remove the d3e54v103j8qbb.cloudfront.net/js/jquery-3.5.1.min.dc5e7f18c8.js script tag.
3. Audit other listed 3rd parties from PSI brief: usemessages.com, Clarity, openstreetmap.org. Anything not load-bearing → defer or remove.
4. PSI re-run.
TEST 1: full site walk — every interactive element (forms, dropdowns, modals, animations) still works.
TEST 2: GA4 + Clarity normal. Confirm with marketing if FB pixel removal is OK before deploying.
EXPECTED: TBT -100–200ms. Page weight -50–100KB.`,
  },
  {
    date: "2026-05-08", priority: "medium", status: "todo",
    title: "PSI · Browser caching + Cache-Control headers tune-up",
    issue: "Default Webflow caching is conservative. Static assets (fonts, images, CSS) can be cached aggressively for repeat visitors. PSI flags 'Serve static assets with an efficient cache policy'.",
    impl: `1. In Vercel/Cloudflare/hosting layer, configure Cache-Control:
   - Fonts (.woff2): max-age=31536000, immutable
   - Versioned CSS/JS (.min.css, .js with hash in filename): max-age=31536000, immutable
   - Images (.webp, .png, .jpg in /public): max-age=2592000 (30 days)
   - HTML: max-age=0, must-revalidate (so we can ship updates)
2. Verify with curl -I https://we360.ai/css/we360-ai.webflow.shared.fe0040a98.min.css → Cache-Control header set correctly.
3. PSI re-run on a 2nd-visit (after first load completes — open incognito → load → close → reopen incognito → reload).
TEST 1: 2nd visit to homepage feels visibly faster than 1st. Network tab shows assets coming from "(disk cache)" or "(memory cache)".
TEST 2: GA4 + Clarity normal. Updated CSS/JS still hot-loads when content changes.
EXPECTED: 2nd-visit PSI mobile 60 → 75. First visit unchanged.`,
  },
  {
    date: "2026-05-09", priority: "high", status: "todo",
    title: "PSI · Final regression sweep + score validation across 85 pages",
    issue: "After 12 days of PSI fixes (Apr 22 → May 8), need to verify the work compounds. Re-run PSI on all 85 core pages and document the before/after delta.",
    impl: `1. Run scripts/build_dev_brief.js (the offline PSI batch tool) against all 85 core pages — same script that produced the original psi_dev_brief.json.
2. Compare new psi_dev_brief.json to the Apr 24 baseline. Compute:
   - Average mobile score delta
   - Pages now scoring ≥90 on mobile (was 0 → target 5+)
   - Pages still <50 on mobile (was 47 → target <20)
   - LCP avg delta (was ~8s on mobile → target <4s)
   - CLS avg delta (was ~0.10–0.72 → target <0.1)
3. Run scripts/import-psi.ts to write the new snapshot into the dashboard. Existing pillar SXO score will recompute.
4. Document the 4-6 highest-impact wins for the team Slack thread (helps motivate the next sprint).
5. Identify the top 3 pages still <50 — these become the next sprint's targets.
TEST 1: Screenshot the new vs old PSI scores side-by-side.
TEST 2: GA4 organic sessions for last 14 days vs prior 14 days — confirm no traffic regression.
EXPECTED: Mobile site-wide avg 46.6 → 65–70. SXO pillar 47 → 65+.`,
  },
];

// ---------------------------------------------------------------
// Step 4 — group audit_findings (skill='speed', status='fail') by check_name
// ---------------------------------------------------------------
async function fetchOpportunityGroups() {
  // Pull ALL speed findings (not just status=fail) so we can sum savings
  // across pages. The user's bar is "total opp savings > 1000ms" — i.e.,
  // a single page might contribute 300ms but 50 pages = 15s site-wide.
  const { data } = await admin
    .from("audit_findings")
    .select("url, check_name, message, details")
    .eq("project_id", PROJECT_ID)
    .eq("skill", "speed");
  const rows = (data ?? []) as Array<{
    url: string; check_name: string; message: string;
    details: { savings_ms?: number; savings_bytes?: number } | null;
  }>;
  // Group by check_name
  const groups = new Map<string, { pages: string[]; total_savings_ms: number; total_savings_bytes: number }>();
  for (const r of rows) {
    if (r.check_name === "psi_mobile_score") continue; // page-summary, not actionable
    const g = groups.get(r.check_name) ?? { pages: [], total_savings_ms: 0, total_savings_bytes: 0 };
    if (!g.pages.includes(r.url)) g.pages.push(r.url);
    g.total_savings_ms += r.details?.savings_ms ?? 0;
    g.total_savings_bytes += r.details?.savings_bytes ?? 0;
    groups.set(r.check_name, g);
  }
  return groups;
}

const OPP_TITLES: Record<string, string> = {
  "redirects": "Eliminate page redirects (PSI opportunity)",
  "unused-javascript": "Reduce unused JavaScript (PSI opportunity)",
  "unused-css-rules": "Reduce unused CSS (PSI opportunity)",
  "render-blocking-resources": "Eliminate render-blocking resources",
  "uses-text-compression": "Enable Gzip/Brotli text compression",
  "uses-rel-preconnect": "Preconnect to required origins",
  "modern-image-formats": "Serve images in modern formats (WebP/AVIF)",
  "uses-optimized-images": "Efficiently encode images",
  "offscreen-images": "Defer offscreen images",
  "unminified-javascript": "Minify JavaScript",
  "unminified-css": "Minify CSS",
  "uses-long-cache-ttl": "Serve static assets with efficient cache policy",
  "total-byte-weight": "Reduce total page weight",
  "dom-size": "Avoid excessive DOM size",
  "third-party-summary": "Reduce third-party impact",
  "main-thread-tasks": "Minimize main-thread work",
  "bootup-time": "Reduce JavaScript execution time",
};

async function insertSiteWideTasks(superAdminId: string, baseDate: Date) {
  const groups = await fetchOpportunityGroups();
  const sortedOpps = [...groups.entries()].sort((a, b) => b[1].total_savings_ms - a[1].total_savings_ms);

  const tasks: SeedTask[] = [];
  let dayOffset = 9; // start May 10 (after the 9-day plan ends)
  for (const [oppId, info] of sortedOpps) {
    if (info.total_savings_ms < 1000) continue; // user said >1000ms only
    const title = OPP_TITLES[oppId] ?? `PSI opportunity: ${oppId}`;
    const dateStr = new Date(baseDate.getTime() + dayOffset * 86400000).toISOString().slice(0, 10);
    tasks.push({
      date: dateStr,
      priority: info.total_savings_ms > 30000 ? "high" : "medium",
      status: "todo",
      title: `PSI · ${title} (${info.pages.length} pages, ${Math.round(info.total_savings_ms / 1000)}s savings)`,
      issue: `PSI flags '${oppId}' on ${info.pages.length} pages with ${Math.round(info.total_savings_ms / 1000)}s of total potential savings (${Math.round(info.total_savings_bytes / 1024)}KB if applicable). Template-level fix lifts every affected page.`,
      impl: `Affected pages (top 10):\n${info.pages.slice(0, 10).map((u) => `  - ${u}`).join("\n")}${info.pages.length > 10 ? `\n  ...and ${info.pages.length - 10} more` : ""}\n\nApply fix at the Webflow template level. Re-run PSI after each batch of pages to verify the savings actually compound. Cross-reference with Apr 22 → May 9 day-by-day plan — many of these are addressed by specific tasks in that sprint.`,
    });
    dayOffset += 2; // space them out 2 days each
  }
  return tasks;
}

// ---------------------------------------------------------------
// Insert helper
// ---------------------------------------------------------------
async function insertTask(t: SeedTask, superAdminId: string) {
  await admin.from("tasks").insert({
    project_id: PROJECT_ID,
    title: t.title,
    kind: "web_task",
    priority: t.priority,
    pillar: "SXO",
    source: "manual",
    scheduled_date: t.date,
    status: t.status ?? "todo",
    issue: t.issue,
    impl: t.impl,
    created_by: superAdminId,
  });
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

  const purged = await purgeOldP0();
  console.log(`Purged ${purged} legacy P0 web tasks.`);

  // Insert plan tasks (Apr 22 → May 9)
  for (const t of PLAN) {
    await insertTask(t, superAdminId);
  }
  console.log(`Inserted ${PLAN.length} day-by-day PSI tasks (Apr 22 → May 9).`);

  // Insert site-wide opportunity tasks (May 10+)
  const oppTasks = await insertSiteWideTasks(superAdminId, new Date("2026-05-01"));
  for (const t of oppTasks) {
    await insertTask(t, superAdminId);
  }
  console.log(`Inserted ${oppTasks.length} site-wide PSI opportunity tasks (May 10+).`);

  const { count } = await admin
    .from("tasks")
    .select("*", { count: "exact", head: true })
    .eq("project_id", PROJECT_ID)
    .eq("kind", "web_task");
  console.log(`\n✅ Total web tasks in dashboard: ${count}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
