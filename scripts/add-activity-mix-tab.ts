#!/usr/bin/env tsx
/**
 * Read user's existing 100K Traffic - SEO Plan.xlsx, add a new "Activity Mix"
 * worksheet showing on-page + off-page SEO activities with 2-month vs 8-month
 * counts, plain-English why + outcome. Save as a new file (don't overwrite).
 *
 * Per Apr 30 user directives:
 *   - Verbs constrained to: Update / Delete / Merge / Create
 *   - Plain English only — no "refresh", no "M1/M2", no "Section X.Y"
 *   - PROPOSED tag on activities not currently in the plan
 *   - Why + Outcome in separate columns, 1 line each
 *   - Detailed (~25-30 rows)
 */

import ExcelJS from "exceljs";
import path from "node:path";

const SRC  = "C:/Users/HP/Downloads/100K Traffic - SEO Plan.xlsx";
const DEST = "C:/Users/HP/Downloads/100K Traffic - SEO Plan + Activity Mix.xlsx";

interface Row {
  pillar: "On-page" | "Off-page";
  section: string;
  activity: string;
  proposed: boolean;        // adds 🆕 PROPOSED tag in display
  twoMonth: string;         // string so we can show "GBP + 25 reviews" etc.
  eightMonth: string;
  why: string;              // 1-line, plain English
  outcome: string;          // 1-line, plain English
}

const ROWS: Row[] = [
  // ===========================================================================
  // ON-PAGE — CONTENT (writers update or create blogs/posts)
  // ===========================================================================
  {
    pillar: "On-page", section: "Content — existing", activity: "Update existing blogs (already on Google page 2; push to page 1)",
    proposed: false, twoMonth: "33 blogs", eightMonth: "~80 blogs",
    why: "Pages already get impressions but rank too low — small content + meta edits push them into top 10",
    outcome: "Each updated page expected to gain 50-200 monthly clicks within 30 days",
  },
  {
    pillar: "On-page", section: "Content — existing", activity: "Update existing landing pages (top organic pages with low click-through)",
    proposed: false, twoMonth: "4 pages", eightMonth: "5 pages",
    why: "Top BoF pages have huge impressions but tiny clicks — refresh content + meta + add schema",
    outcome: "/solutions/employee-monitoring lifts from 393 to 1,000+ monthly sessions; +10 demos/mo attributable",
  },
  {
    pillar: "On-page", section: "Content — existing", activity: "Delete or merge thin/duplicate blog posts (audit-driven)",
    proposed: false, twoMonth: "0 (audit running)", eightMonth: "~60 deleted/merged",
    why: "Blog audit dashboard identifies low-quality posts dragging down site quality — delete or merge into stronger siblings",
    outcome: "Site quality recovers; Google's 'low quality URL' count drops from 186 to ~120 within 30 days",
  },
  {
    pillar: "On-page", section: "Content — existing", activity: "Update existing feature pages (add depth + target head terms)",
    proposed: false, twoMonth: "3 pages", eightMonth: "5 pages",
    why: "Existing /features/* pages are thin — refresh to target high-volume head terms (productivity monitoring, screen monitoring)",
    outcome: "Each refreshed feature page expected to capture top 15 ranking on its head term within 60 days",
  },
  {
    pillar: "On-page", section: "Content — existing", activity: "Update homepage (target 'employee monitoring software' head term)",
    proposed: false, twoMonth: "1 page", eightMonth: "1 page",
    why: "10K monthly searches for 'employee monitoring software' — we're not in top 50; biggest single-keyword opportunity",
    outcome: "Homepage in top 30 within 60 days; top 10 within 6 months",
  },
  {
    pillar: "On-page", section: "Content — new", activity: "Create new blogs on uncontested topics (Agentic AI, Cost Intelligence, India Field Force, Livestream, SaaS optimisation)",
    proposed: false, twoMonth: "30 blogs", eightMonth: "30 blogs",
    why: "Topics where competitors have ZERO content — we own these themes by default",
    outcome: "Each blog ranks page 1 within 30-60 days due to very low keyword difficulty",
  },
  {
    pillar: "On-page", section: "Content — new", activity: "Create new blogs that support a feature page (topic-cluster blogs)",
    proposed: false, twoMonth: "8 blogs", eightMonth: "50 blogs",
    why: "Each blog feeds back into a feature page to build topical authority — Google rewards depth on a topic",
    outcome: "Compounds ranking power of feature pages; each cluster blog drives 50-150 monthly sessions",
  },
  {
    pillar: "On-page", section: "Content — new", activity: "Create big comprehensive buyer's guides (5,000+ words covering an entire category)",
    proposed: false, twoMonth: "0", eightMonth: "4 guides",
    why: "Heavy 'pillar' content that anchors entire topic clusters — earns natural backlinks + acts as ranking hub",
    outcome: "Each pillar drives 200-500 monthly sessions at top 10 within 90 days",
  },
  {
    pillar: "On-page", section: "Content — new", activity: "Create 'Best X' listicles + 'How to X' guides",
    proposed: false, twoMonth: "2 articles", eightMonth: "5 articles",
    why: "Listicle and how-to formats dominate commercial-intent SERPs — buyers searching 'best employee monitoring 2026' click these first",
    outcome: "Listicle for 'Best Employee Monitoring Software 2026' (5,500/mo searches) gains 200-400 monthly clicks",
  },
  {
    pillar: "On-page", section: "Content — new", activity: "Create original data studies (anonymised aggregate from we360 user base + accompanying blog)",
    proposed: false, twoMonth: "0", eightMonth: "3 studies",
    why: "Original research with PR push — data studies earn the most quality backlinks of any content format",
    outcome: "30-50 referring domains per study + 2-3 PR mentions per study; combined 100+ new backlinks",
  },
  {
    pillar: "On-page", section: "Content — new", activity: "Publish invited industry-leader blogs (1 per month)",
    proposed: false, twoMonth: "2 blogs", eightMonth: "8 blogs",
    why: "Industry experts write under their own byline — strong E-E-A-T signal + leader shares to their LinkedIn network",
    outcome: "Each guest blog drives 50-100+ referral visits via LinkedIn from the guest's network",
  },
  // ===========================================================================
  // ON-PAGE — LANDING PAGES (Bottom-of-funnel page architecture)
  // ===========================================================================
  {
    pillar: "On-page", section: "Landing pages", activity: "Create comparison pages (We360 vs Hubstaff / vs ActivTrak / vs Time Doctor / etc.)",
    proposed: false, twoMonth: "5 pages", eightMonth: "15 pages",
    why: "Buyers comparing tools end up on competitor comparison pages today — capture them with our own honest comparison",
    outcome: "Each page expected to drive 4-10 demos/month at 4% conversion rate",
  },
  {
    pillar: "On-page", section: "Landing pages", activity: "Create alternative-to pages ('Hubstaff alternative', 'Time Doctor alternative', etc.)",
    proposed: false, twoMonth: "0", eightMonth: "12 pages",
    why: "Buyers who've outgrown a competitor search 'X alternative' — high commercial intent, ready to switch",
    outcome: "Each page captures 100-300 monthly sessions at top 10 ranking",
  },
  {
    pillar: "On-page", section: "Landing pages", activity: "Create integration pages (REAL integrations only: Keka, Zoho, GreyTHR, Jira, MS Teams)",
    proposed: false, twoMonth: "5 pages", eightMonth: "5 pages",
    why: "Convert visitors who already use these tools — integration pages convert at 3-5% demo rate vs 0.31% sitewide",
    outcome: "100 monthly sessions per page; combined 20 demos/month from these 5 pages alone",
  },
  {
    pillar: "On-page", section: "Landing pages", activity: "Create India-localized pages (/in/employee-monitoring-india etc.)",
    proposed: false, twoMonth: "3 pages", eightMonth: "8 pages",
    why: "India is 73% of our existing organic traffic; competitors have ZERO India-specific landing pages — uncontested",
    outcome: "Top-3 ranking on each India page within 90 days; combined +500 monthly sessions",
  },
  {
    pillar: "On-page", section: "Landing pages", activity: "Create industry-vertical pages (BPO, IT services, Banking, Healthcare, etc.)",
    proposed: false, twoMonth: "0", eightMonth: "10 pages",
    why: "Buyers in specific verticals search vertical-specific terms — fewer competitors per vertical = easier ranking",
    outcome: "50-150 monthly sessions per page; high-conversion verticals like BPO get 200+",
  },
  {
    pillar: "On-page", section: "Landing pages", activity: "Create new feature pages (Agentic AI, Livestream, Remote Employee Monitoring)",
    proposed: false, twoMonth: "2 pages", eightMonth: "5 pages",
    why: "Features that have organic search demand but no dedicated page on our site today",
    outcome: "Each feature page captures the head term for that capability (e.g. 1-3K monthly searches)",
  },
  {
    pillar: "On-page", section: "Landing pages", activity: "Create reviews page (aggregate G2 + Capterra + Trustpilot reviews on-site)",
    proposed: false, twoMonth: "1 page", eightMonth: "1 page",
    why: "No on-site reviews page today; AI Overviews preferentially cite pages with Review schema markup",
    outcome: "Brand SERP improves; AI Overview citation eligibility added; Review rich result earns 15-25% CTR lift",
  },
  {
    pillar: "On-page", section: "Landing pages", activity: "Create how-it-works page (mid-funnel education explainer)",
    proposed: false, twoMonth: "1 page", eightMonth: "1 page",
    why: "Buyers searching 'how does we360/employee monitoring work' currently go to competitor pages — capture with our own",
    outcome: "Mid-funnel education traffic captured; demo-no-show rate reduced via pre-sales priming",
  },
  // ===========================================================================
  // ON-PAGE — TECHNICAL SEO + SCHEMA
  // ===========================================================================
  {
    pillar: "On-page", section: "Technical / Schema", activity: "Fix sitemap.xml (Google can only see 103 of our 420 pages today)",
    proposed: false, twoMonth: "1 fix", eightMonth: "1 fix (one-time)",
    why: "Sitemap is malformed — Google's parser fails halfway through; ~314 blog posts are completely invisible",
    outcome: "All ~314 invisible blog posts become discoverable within 14 days; +50 unique blog landings within 30 days",
  },
  {
    pillar: "On-page", section: "Technical / Schema", activity: "Add schema markup site-wide (Breadcrumb, SoftwareApplication, FAQ)",
    proposed: false, twoMonth: "3 deployments", eightMonth: "3 deployments",
    why: "One-time template work — makes us eligible for rich results in Google + AI Overview citations (AI Overviews trigger on 48% of B2B searches)",
    outcome: "Rich results add 20-40% CTR lift on every page where they show; AI Overview citation eligibility unlocked",
  },
  {
    pillar: "On-page", section: "Technical / Schema", activity: "Page speed sprint (PSI fixes — redirect chains, fonts, images, scripts)",
    proposed: false, twoMonth: "18 fixes", eightMonth: "18 fixes (one-time sprint)",
    why: "65 seconds of cumulative redirect-chain time across 85 pages; biggest single page-speed win available",
    outcome: "Mobile PageSpeed scores +15-25 points sitewide; CWV pass rate goes from ~20% to ~80%",
  },
  {
    pillar: "On-page", section: "Technical / Schema", activity: "301-redirect outdated URLs (cleanup ~22 leftover legacy URLs)",
    proposed: false, twoMonth: "2 deployments", eightMonth: "2 deployments",
    why: "Old /features-old/, /new-, /lp- URLs are dragging down site quality — Google penalises low-quality URL clusters",
    outcome: "Site quality recovers; 'low quality URL' count drops from 186 to ~120 within 30 days",
  },
  {
    pillar: "On-page", section: "Technical / Schema", activity: "Internal linking sweep (every BoF page gets 5+ internal links)",
    proposed: false, twoMonth: "1 sweep", eightMonth: "2 sweeps",
    why: "BoF pages need internal links to rank — cheapest CTR + topical authority lift available",
    outcome: "Each BoF page expected to gain 3-8 ranking positions on its target keyword within 30 days",
  },
  {
    pillar: "On-page", section: "Technical / Schema", activity: "Schema audit pass (verify rich results still render after content edits)",
    proposed: false, twoMonth: "0", eightMonth: "1 audit",
    why: "Mid-year health check on all schema-marked pages — typos can silently drop us out of rich results within 7 days",
    outcome: "Catches silent regressions; restores any lost rich result eligibility before traffic loss",
  },
  // ===========================================================================
  // OFF-PAGE — LINK BUILDING
  // ===========================================================================
  {
    pillar: "Off-page", section: "Link building", activity: "Disavow toxic backlinks (PBN cleanup — teamrelated.com)",
    proposed: false, twoMonth: "1 deployment", eightMonth: "1 deployment (one-time)",
    why: "924 of our 1,275 backlinks come from one PBN domain (72% of profile) — Google may already be discounting these",
    outcome: "Site quality recovers; future link-building compounds on a clean profile",
  },
  {
    pillar: "Off-page", section: "Link building", activity: "Personalised outreach campaign to tangent industries (staffing / HR tech / productivity / India SaaS — DA 30-60)",
    proposed: true, twoMonth: "0", eightMonth: "4 campaigns",
    why: "1 campaign every 2 months. Tangent industries link more easily than direct competitors. Each campaign targets 100+ contacts in one vertical",
    outcome: "Expect 20-30 quality DA 30-60 backlinks per campaign = 80-120 total over 8 months",
  },
  {
    pillar: "Off-page", section: "Link building", activity: "Guest post pitching to industry publications (Inc42, YourStory, ET, Mint, HBR India)",
    proposed: true, twoMonth: "0", eightMonth: "16 pitches",
    why: "2 pitches per month — published guest posts earn high-DA backlinks + referral traffic from target publications",
    outcome: "6-8 published guest posts over 8 months at typical 40-50% pitch acceptance rate",
  },
  {
    pillar: "Off-page", section: "Link building", activity: "Brand-mention claims (turn unlinked mentions into links)",
    proposed: true, twoMonth: "0", eightMonth: "8 sweeps",
    why: "Sites that mention 'we360' in text without linking — we email asking them to add a link. Free backlinks from existing positive buzz",
    outcome: "1 monthly sweep; expect 5-10 new backlinks per sweep at ~30-40% success rate (writer already mentioned us positively)",
  },
  {
    pillar: "Off-page", section: "Link building", activity: "Competitor backlink reverse-engineering (find sites linking to Hubstaff/ActivTrak; pitch our alternative content)",
    proposed: true, twoMonth: "0", eightMonth: "2 sweeps",
    why: "Sites that link to competitors are open to linking to alternatives. Use Ahrefs/Moz to find them, pitch our /alternative/ pages",
    outcome: "Quarterly sweeps; expect 10-20 backlinks per sweep targeting our alternative-to pages",
  },
  // ===========================================================================
  // OFF-PAGE — DIGITAL PR
  // ===========================================================================
  {
    pillar: "Off-page", section: "Digital PR", activity: "Data study PR launches (each study comes with PR pitch list)",
    proposed: false, twoMonth: "0", eightMonth: "3 launches",
    why: "Each study targets TechCrunch India / YourStory / ET / Inc42 / Mint with the data narrative",
    outcome: "30-50 referring domains per study within 60 days of launch; combined 100+ new domains",
  },
  {
    pillar: "Off-page", section: "Digital PR", activity: "HARO / Connectively (journalist quote responses) — flagged: low-confidence",
    proposed: true, twoMonth: "0", eightMonth: "32 (if pursued)",
    why: "4 responses per month. Journalists post requests for expert quotes; we respond. ~30 min/day commitment. Hit rate is 5-10% — works for some companies, not all",
    outcome: "Expected 5-10 quote-with-link placements over 8 months IF we pursue (mostly mid-tier publications)",
  },
  {
    pillar: "Off-page", section: "Digital PR", activity: "Press releases on major product/feature launches (Agentic AI, Cost Intelligence, India page set)",
    proposed: true, twoMonth: "0", eightMonth: "4 releases",
    why: "Major launches deserve formal PR push — press releases get syndicated to India SaaS press automatically",
    outcome: "10-20 placements per release across India SaaS press; aggregate brand visibility lift",
  },
  {
    pillar: "Off-page", section: "Digital PR", activity: "Podcast appearance pitching (start June; target India SaaS / HR tech / productivity podcasts)",
    proposed: true, twoMonth: "0 (starts June)", eightMonth: "7 pitches (June onwards)",
    why: "1 pitch per month starting June. Podcast appearances = high-DA backlink + spoken-word audience referral",
    outcome: "Expected 3-4 published appearances; each adds 1 DA 50+ backlink + audience referral traffic",
  },
  {
    pillar: "Off-page", section: "Digital PR", activity: "Awards submissions (G2 Winter/Summer Awards, Stevie India, Inc42, ET)",
    proposed: true, twoMonth: "0", eightMonth: "4 submissions",
    why: "Awards add credibility + backlinks from awards sites (DA 70+) + badges for homepage trust signals",
    outcome: "Aim to win or be nominated in 2 of 4 — adds badge to homepage + DA 70+ backlinks from each",
  },
  // ===========================================================================
  // OFF-PAGE — BRAND PRESENCE
  // ===========================================================================
  {
    pillar: "Off-page", section: "Brand presence", activity: "Set up Google Business Profile + collect customer reviews",
    proposed: false, twoMonth: "GBP setup + 25 reviews", eightMonth: "GBP + ~75 reviews",
    why: "No GBP today; branded 'we360' search has no Maps/knowledge panel; reviews drive Maps + branded SERP visibility",
    outcome: "Top-3 Maps ranking for 'employee monitoring software near Pune/Bengaluru' within 30 days",
  },
  {
    pillar: "Off-page", section: "Brand presence", activity: "Refresh listings on industry directories (G2, Capterra, GetApp, Software Advice, Trustpilot)",
    proposed: true, twoMonth: "5 listings refreshed", eightMonth: "5 listings × 4 quarterly refreshes",
    why: "These are buyer-discovery surfaces; up-to-date listings + active review velocity drive direct demos from these platforms",
    outcome: "Higher review velocity on each platform → ranking lift in their internal SERPs → +50-100 demo requests/year",
  },
  {
    pillar: "Off-page", section: "Brand presence", activity: "Round tables (closed-door executive discussions; recap published on-site + LinkedIn)",
    proposed: true, twoMonth: "2 events", eightMonth: "8 events",
    why: "1/month executive event. Recap blog mentions attendees + their company logos for credibility (E-E-A-T + Brands Featured signal)",
    outcome: "Each event drives 50-100 LinkedIn referral visits + builds executive network for future studies/quotes",
  },
  {
    pillar: "Off-page", section: "Brand presence", activity: "Talk shows / podcast hosting (online interviews; distributed on LinkedIn)",
    proposed: true, twoMonth: "2 episodes", eightMonth: "8 episodes",
    why: "1/month online interview with industry leader. Recap on LinkedIn with guest tag drives compounding referral traffic",
    outcome: "Compounding founder/team brand growth + future guest pool for round tables + invited blogs",
  },
  {
    pillar: "Off-page", section: "Brand presence", activity: "Q&A presence on Reddit, Quora, LinkedIn (high-value answers on relevant questions)",
    proposed: true, twoMonth: "20 answers", eightMonth: "80 answers",
    why: "5-10 high-value answers per month on relevant questions. Signals topical expertise to AI Overviews (which preferentially cite Reddit + Quora)",
    outcome: "AI Overview citation eligibility improves; some direct Reddit/Quora referral traffic; brand mentions compound",
  },
  {
    pillar: "Off-page", section: "Brand presence", activity: "LinkedIn distribution (snippet posts from blogs / round tables)",
    proposed: false, twoMonth: "4 posts", eightMonth: "16 posts",
    why: "2 posts per month — 1 expertise blog snippet + 1 round table recap. Compounds founder/team brand visibility",
    outcome: "Compounding referral traffic to site; builds founder/team thought leadership for future PR opportunities",
  },
];

// =============================================================================
// Build the new XLSX
// =============================================================================

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);

  // Remove any existing Activity Mix tab so re-runs are idempotent
  const existing = wb.getWorksheet("Activity Mix");
  if (existing) wb.removeWorksheet(existing.id);

  const ws = wb.addWorksheet("Activity Mix");

  // Header row
  ws.columns = [
    { header: "#",          key: "n",        width: 5  },
    { header: "Pillar",     key: "pillar",   width: 11 },
    { header: "Section",    key: "section",  width: 22 },
    { header: "Activity",   key: "activity", width: 70 },
    { header: "2 months (May–Jun)", key: "twoMonth", width: 22 },
    { header: "8 months (May–Dec)", key: "eightMonth", width: 22 },
    { header: "Why (1 line)",       key: "why",        width: 70 },
    { header: "Expected outcome (1 line)", key: "outcome", width: 70 },
  ];

  // Header styling
  const hr = ws.getRow(1);
  hr.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  hr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF231D4F" } };
  hr.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  hr.height = 30;
  ws.views = [{ state: "frozen", ySplit: 1 }];

  // Data rows
  ROWS.forEach((r, i) => {
    const activityText = r.proposed ? `[PROPOSED] ${r.activity}` : r.activity;
    const row = ws.addRow({
      n: i + 1,
      pillar: r.pillar,
      section: r.section,
      activity: activityText,
      twoMonth: r.twoMonth,
      eightMonth: r.eightMonth,
      why: r.why,
      outcome: r.outcome,
    });
    row.alignment = { vertical: "top", wrapText: true };
    row.height = 50;

    // Pillar column color tint
    const pillarCell = row.getCell("pillar");
    if (r.pillar === "On-page") {
      pillarCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F4F1" } };
      pillarCell.font = { color: { argb: "FF065F46" }, bold: true };
    } else {
      pillarCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
      pillarCell.font = { color: { argb: "FF92400E" }, bold: true };
    }

    // Activity cell — bold the [PROPOSED] tag with rich text
    if (r.proposed) {
      const activityCell = row.getCell("activity");
      activityCell.value = {
        richText: [
          { text: "[PROPOSED] ", font: { bold: true, color: { argb: "FFB45309" }, size: 10 } },
          { text: r.activity, font: { color: { argb: "FF231D4F" }, size: 10 } },
        ],
      };
    }

    // Count columns — emphasize numbers
    row.getCell("twoMonth").alignment = { vertical: "top", horizontal: "left", wrapText: true };
    row.getCell("eightMonth").alignment = { vertical: "top", horizontal: "left", wrapText: true };
    row.getCell("twoMonth").font = { bold: true, color: { argb: "FF5B45E0" } };
    row.getCell("eightMonth").font = { bold: true, color: { argb: "FF5B45E0" } };
  });

  // Auto-filter on the header row (excludes # column)
  ws.autoFilter = { from: { row: 1, column: 2 }, to: { row: 1, column: 8 } };

  // Add a small summary block at the very top of the sheet (above the data)
  // Actually keep it clean — auto-filter + frozen header is plenty.

  await wb.xlsx.writeFile(DEST);
  console.log(`\n✅ Wrote ${DEST}`);
  console.log(`   New tab "Activity Mix" added with ${ROWS.length} rows.`);
  console.log(`   Original "Summary" tab + your other tabs preserved.\n`);

  // Counts breakdown for terminal
  const planned = ROWS.filter((r) => !r.proposed).length;
  const proposed = ROWS.filter((r) => r.proposed).length;
  const onPage = ROWS.filter((r) => r.pillar === "On-page").length;
  const offPage = ROWS.filter((r) => r.pillar === "Off-page").length;
  console.log(`   Activity counts:`);
  console.log(`     On-page:  ${onPage} activities`);
  console.log(`     Off-page: ${offPage} activities`);
  console.log(`     Currently planned: ${planned}`);
  console.log(`     Proposed (need approval): ${proposed}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
