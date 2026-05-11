// Heuristic blog-brief generator.
// Runs on the server (cron) without an LLM — so the cron can always produce
// a decent starting brief. When the user clicks "Generate with AI" (BYOK),
// the LLM uses this brief + the 5-pillar prompt to write the full article.

export interface BlogBrief {
  title: string;
  target_keyword: string;
  secondary_keywords: string[];
  intent: string;
  recommended_h1: string;
  recommended_h2s: string[];
  recommended_h3s: string[];
  sections_breakdown: string[];
  word_count_target: number;
  paa_questions: string[];
  internal_links: string[];
  competitor_refs: string[];
  writer_notes: string[];
  generated_by: "heuristic" | "llm" | "manual";
}

type Intent = "informational" | "commercial" | "transactional" | "navigational";

export interface BriefInput {
  keyword: string;
  intent: Intent | string | null;
  competition: "Low Competition" | "Medium Competition" | "High Competition" | string | null;
  projectName: string;
  projectDomain: string;
  industry: string | null;
  paaQuestions?: string[];
  // Actual competitors from the project — when provided, competitor_refs
  // in the brief will use their real names + URLs instead of placeholders.
  competitors?: Array<{ name: string; url: string }>;
}

const YEAR = new Date().getFullYear();

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function wordCountFor(competition: string | null): number {
  if (competition === "Low Competition") return 1400;
  if (competition === "Medium Competition") return 2000;
  if (competition === "High Competition") return 2800;
  return 1500;
}

function detectPattern(keyword: string): "question" | "how_to" | "best" | "vs" | "definition" | "guide" | "generic" {
  const k = keyword.toLowerCase().trim();
  if (/^(is|are|can|does|do|will|should|how does|what is|why|when)\b/.test(k)) return "question";
  if (/^how to\b/.test(k)) return "how_to";
  if (/^(best|top\s+\d*)\b/.test(k)) return "best";
  if (/\s+vs\s+|\bversus\b/.test(k)) return "vs";
  if (/\b(guide|tips|tutorial|handbook)\b/.test(k)) return "guide";
  if (/^what is\b/.test(k)) return "definition";
  return "generic";
}

function h1For(keyword: string, pattern: ReturnType<typeof detectPattern>): string {
  const kw = titleCase(keyword.trim().replace(/\?$/, ""));
  switch (pattern) {
    case "question":
      return `${kw}? Everything You Need to Know in ${YEAR}`;
    case "how_to":
      return `${kw}: Step-by-Step Guide (${YEAR})`;
    case "best":
      return `${kw}: Top Picks Compared for ${YEAR}`;
    case "vs":
      return `${kw}: Which One Is Right for You in ${YEAR}?`;
    case "definition":
      return `${kw}? A Complete Guide for ${YEAR}`;
    case "guide":
      return `${kw} for ${YEAR}: The Definitive Resource`;
    default:
      return `${kw}: The Complete ${YEAR} Guide`;
  }
}

function h2sFor(keyword: string, pattern: ReturnType<typeof detectPattern>, projectName: string): string[] {
  const kw = keyword.toLowerCase().trim().replace(/\?$/, "");
  const kwCapped = kw.replace(/^./, (c) => c.toUpperCase());
  switch (pattern) {
    case "question":
      return [
        `What ${kw} actually means`,
        `The legal and safety framework`,
        `What's allowed vs what's not`,
        `How to do it the right way`,
        `How ${projectName} helps you get started`,
      ];
    case "how_to":
      return [
        `Before you begin: what you need to know`,
        `${kwCapped}: step-by-step`,
        `Common mistakes to avoid`,
        `Pro tips to get better results faster`,
        `How ${projectName} can help`,
      ];
    case "best":
      return [
        `How we evaluated`,
        `Our top picks for ${YEAR}`,
        `Detailed comparison table`,
        `How to choose the right one for you`,
        `${projectName}, our recommendation for Indian adventurers`,
      ];
    case "vs":
      return [
        `At a glance: quick comparison`,
        `Key differences explained`,
        `Pros and cons of each`,
        `Which one wins for what use case`,
        `Our verdict`,
      ];
    case "definition":
      return [
        `Definition and quick facts`,
        `How it works`,
        `Types and variations`,
        `Benefits and downsides`,
        `Getting started with ${projectName}`,
      ];
    default:
      return [
        `What is ${kw}?`,
        `How ${kw} works`,
        `Benefits and what to expect`,
        `Best options and pricing`,
        `How ${projectName} helps you experience it`,
      ];
  }
}

function h3sFor(pattern: ReturnType<typeof detectPattern>): string[] {
  const common = [
    "Safety standards and equipment",
    "Age, weight and fitness requirements",
    "First-timer versus experienced",
    "Best season and weather conditions",
    "Booking and preparation",
    "What to expect during the experience",
    "After-experience: certificates, photos, memories",
    "Common myths debunked",
  ];
  if (pattern === "how_to") {
    return [
      "Preparation checklist",
      "Step 1: research and shortlist",
      "Step 2: book and prepare",
      "Step 3: the experience itself",
      "Step 4: follow-up and sharing",
      "Troubleshooting common issues",
      "Advanced tips for enthusiasts",
    ];
  }
  if (pattern === "best" || pattern === "vs") {
    return [
      "Evaluation criteria",
      "Price and value for money",
      "Safety record and certifications",
      "Location and accessibility",
      "Customer reviews and reputation",
      "Booking flexibility and support",
      "Additional amenities",
    ];
  }
  return common;
}

function sectionsBreakdownFor(pattern: ReturnType<typeof detectPattern>, projectName: string): string[] {
  const base = [
    "Introduction: why this matters for the reader right now",
    "Section 1: quick-answer / TL;DR in 2-4 sentences",
    "Section 2: detailed explanation with examples",
    "Section 3: practical guidance or breakdown",
    "Section 4: options / pricing / details relevant to India",
    `Section 5: how ${projectName} delivers this experience`,
    "FAQ: 5 PAA questions with schema-ready answers",
    "Conclusion: clear CTA and next-step link",
  ];
  if (pattern === "best" || pattern === "vs") {
    return [
      "Introduction: who this guide is for",
      "Evaluation methodology",
      "Comparison table",
      "Detailed review of each option",
      `Why ${projectName} tops our list`,
      "FAQ: 5 common buyer questions",
      "Conclusion with clear CTA",
    ];
  }
  return base;
}

function secondaryKeywordsFor(keyword: string): string[] {
  const kw = keyword.toLowerCase().replace(/\?$/, "").trim();
  const out = new Set<string>();
  // Variations: add location / price / beginner / cost
  if (!/india/i.test(kw)) out.add(`${kw} india`);
  if (!/cost|price/i.test(kw)) out.add(`${kw} cost`);
  if (!/near me/i.test(kw)) out.add(`${kw} near me`);
  if (!/beginner|first/i.test(kw)) out.add(`${kw} for beginners`);
  if (!/safe/i.test(kw)) out.add(`is ${kw} safe`);
  return Array.from(out).slice(0, 5);
}

function internalLinksFor(projectName: string): string[] {
  // Generic but sensible defaults — agency team overrides per-project in the UI.
  return ["/", "/faq", "/pricing", "/blog", "/contact"];
}

function competitorRefsFor(
  _industry: string | null,
  competitors?: Array<{ name: string; url: string }>
): string[] {
  // If the project has real competitors tracked, use their names + URLs.
  if (competitors && competitors.length > 0) {
    return competitors.slice(0, 5).map((c) => `${c.name}: ${c.url}`);
  }
  // Fallback heuristic prompts for the writer.
  return [
    "Top-3 ranking competitor for the target keyword",
    "Authoritative source (Wikipedia / regulator)",
    "Industry association resource",
  ];
}

function writerNotesFor(keyword: string, competition: string | null): string[] {
  return [
    "Lead with a TL;DR blockquote that answers the keyword in ≤4 sentences",
    "Add a 'Key takeaways' bullet list near the top (3-5 bullets)",
    "Short paragraphs: 2-4 sentences, scannable",
    "FAQ section wrapped as FAQPage schema (use JSON-LD block at end)",
    "Image prompts: 2-3 embedded, each with descriptive alt text",
    "Author byline with credentials + published date",
    "Cite 2-3 authoritative external sources (Wikipedia, govt, industry body)",
    `Target word count: ${wordCountFor(competition)} words`,
    "End with clear CTA paragraph",
  ];
}

export function generateBlogBrief(input: BriefInput): BlogBrief {
  const { keyword, intent, competition, projectName, industry, paaQuestions } = input;
  const pattern = detectPattern(keyword);
  return {
    title: h1For(keyword, pattern),
    target_keyword: keyword,
    secondary_keywords: secondaryKeywordsFor(keyword),
    intent: (intent as string) ?? "informational",
    recommended_h1: h1For(keyword, pattern),
    recommended_h2s: h2sFor(keyword, pattern, projectName),
    recommended_h3s: h3sFor(pattern),
    sections_breakdown: sectionsBreakdownFor(pattern, projectName),
    word_count_target: wordCountFor(competition),
    paa_questions:
      paaQuestions && paaQuestions.length > 0
        ? paaQuestions.slice(0, 5)
        : [
            `How much does ${keyword} cost?`,
            `Is ${keyword} safe for beginners?`,
            `What are the best locations for ${keyword} in India?`,
            `How long does ${keyword} take?`,
            `Do I need any experience for ${keyword}?`,
          ],
    internal_links: internalLinksFor(projectName),
    competitor_refs: competitorRefsFor(industry, input.competitors),
    writer_notes: writerNotesFor(keyword, competition),
    generated_by: "heuristic",
  };
}

export interface BriefKind {
  action: "New" | "Update" | "Ops";
  surface: "Blog" | "Page" | "Ops";
}

// We360.ai brand-fixed strings used in every prompt so writers + AI don't
// invent CTAs/pricing/trust signals on the fly. Real numbers from the brand.
const WE360_BRAND = {
  primaryCta:     "Start Free Trial – No Credit Card",
  secondaryCta:   "Book a Demo",
  pricingLine:    "Starts at ₹299 per user/month",
  trustLine:      "120K+ users · 10K+ companies · 21+ countries trust We360.ai",
  authorTitle:    "SEO Expert at We360.ai",  // override per-author if you have actual titles
  competitorRef:  "https://www.timechamp.io/solutions/workforce-management",
  voice:          "Professional, outcome driven, NOT sales heavy. Speak to operations leaders and HR managers in India and APAC. ROI aware. Use Indian rupee (₹) for pricing.",
};

const TODAY_ISO = () => new Date().toISOString().slice(0, 10);
const TODAY_PRETTY = () => new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

export function briefToMarkdownPrompt(
  brief: BlogBrief,
  projectName: string,
  projectDomain: string,
  // Live GSC/GA4 backing text (human-formatted); embedded near the top so
  // the LLM knows WHY this page exists and which queries already have
  // momentum. Leave undefined for net-new tasks.
  dataBacking?: string | null,
  // Page vs blog, new vs update, ops. Drives the entire template.
  kind?: BriefKind,
  // Pre-filled context — assigneeName fills the byline; today fills the
  // "Updated" date. Both are auto-populated by the dialog so writers don't
  // have to hand-edit the prompt before pasting into Claude/ChatGPT.
  assigneeName?: string | null,
): string {
  const k: BriefKind = kind ?? { action: "New", surface: "Blog" };
  const wt = brief.word_count_target;
  const lengthBand =
    wt >= 2500 ? "2500+ words" : wt >= 1800 ? "1800–2200 words" : "1200–1500 words";

  const list = (arr: string[]) => arr.map((x, i) => `${i + 1}. ${x}`).join("\n");
  const bullets = (arr: string[]) => arr.map((x) => `• ${x}`).join("\n");

  const isPage = k.surface === "Page";
  const isUpdate = k.action === "Update";
  const isOps = k.surface === "Ops";

  const author = assigneeName?.trim() || "We360.ai team";
  const today = TODAY_PRETTY();

  // -------------------------------------------------------------- VERIFICATION
  // Ask the AI to read the brief and confirm before generating. Hard-gated —
  // language is intentionally aggressive so models like ChatGPT/Claude don't
  // skip the verification block (they will, otherwise — they want to "help"
  // by getting to the answer faster).
  const verification = `## ⛔ Hard gate. Step 0: verify the brief before writing

**Skip this and the output is invalid.** Your response must start with the verification block below. Anything else gets rejected.

Read the brief end to end, then output exactly this block first, before the H1 and everything else.

\`\`\`
✅ Brief understood
• Topic: <one line summary of what this ${isPage ? "page" : "post"} covers>
• Target keyword: <keyword> · Intent: <intent>
• Audience: <who reads this. Be specific. Example: "HR managers at Indian SMBs, 50 to 500 employees">
• Format: ${k.action} ${k.surface}
• Tone: ${WE360_BRAND.voice.split(".")[0]}.
• Word count target: ${wt} words. Hit this exactly. Don't compress.

⚠️  Flags or questions before writing
• <anything unclear, missing, or inconsistent with the URL or intent>
• <leave empty as "(none)" if everything checks out>
\`\`\`

Then write \`---\` on its own line.

**If Flags has any item, stop. Don't write the ${isPage ? "page" : "article"}. Ask the user to clarify first.**

If Flags is (none), proceed to the full ${isPage ? "page" : "article"} below.`;

  // -------------------------------------------------------------- HEADER + OPENER
  let header: string;
  let opener: string;
  let backingHeading: string;
  if (isOps) {
    header = "# SEO ops task";
    opener = `Plan and execute an SEO operations task for **${projectName}** (${projectDomain}). This isn't content writing. It's site wide hygiene and governance work.\n\n**Assignee:** ${author} · **Today:** ${today}`;
    backingHeading = "## Context";
  } else if (isUpdate && isPage) {
    header = "# Landing page refresh brief";
    opener = `Refresh an existing landing page on **${projectName}** (${projectDomain}).\n\n**Assignee:** ${author} · **Today:** ${today}\n\nKeep the URL and the core conversion path. Fix what's broken. Close the gaps the GSC + GA4 data below exposes.`;
    backingHeading = "## Why we're refreshing this page (live SEO + analytics)";
  } else if (isUpdate) {
    header = "# Blog refresh brief";
    opener = `Refresh an existing blog post on **${projectName}** (${projectDomain}).\n\n**Assignee:** ${author} · **Today:** ${today}\n\n**Don't change the URL.** Update the publish date and add a "Last updated: ${today}" line under the H1. Use the live GSC + GA4 data below to see which queries already pull impressions, then double down on those.`;
    backingHeading = "## Why we're refreshing this post (live SEO + analytics)";
  } else if (isPage) {
    header = "# Landing page brief, We360.ai";
    opener = `Build a complete, publish ready **landing page** for **${projectName}** (${projectDomain}).\n\n**Assignee:** ${author} · **Today:** ${today}\n\nPages exist to convert. Every section should push the visitor toward the CTA, not just inform. Follow the structure below exactly.`;
    backingHeading = "## Why this page matters (live SEO + analytics)";
  } else {
    header = "# Blog article brief, We360.ai";
    opener = `Write a complete, publish ready blog article for **${projectName}** (${projectDomain}).\n\n**Assignee and author:** ${author} · **Publish date:** ${today}`;
    backingHeading = "## Why this article matters (live SEO + analytics)";
  }

  const backingBlock = dataBacking && dataBacking.trim().length > 0
    ? `\n${backingHeading}\n${dataBacking.trim()}\n\nUse the numbers above to prioritize. Target the queries that already drive impressions. Fix the engagement gaps the data exposes.\n`
    : "";

  // -------------------------------------------------------------- BRAND BLOCK
  const brandBlock = `## Brand voice and fixed assets

Use these verbatim. Don't invent your own.

• **Voice:** ${WE360_BRAND.voice}
• **Primary CTA (filled button):** \`${WE360_BRAND.primaryCta}\`
• **Secondary CTA (outlined button):** \`${WE360_BRAND.secondaryCta}\`
• **Pricing line:** \`${WE360_BRAND.pricingLine}\`
• **Trust line:** \`${WE360_BRAND.trustLine}\`
• **Author and updated:** \`${author}\` · \`${today}\`
${isPage ? `• **Reference page (visual style guide):** ${WE360_BRAND.competitorRef}\n` : ""}`;

  // -------------------------------------------------------------- OPS — short flow
  if (isOps) {
    return `${header}\n\n${opener}\n${backingBlock}\n${verification}\n\n${brandBlock}\n## Task\n• **Title:** ${brief.recommended_h1 || brief.target_keyword}\n• **Target keyword (if applicable):** ${brief.target_keyword}\n• **Word count for any deliverable doc:** ${wt} words\n\n## Context and writer notes\n${bullets(brief.writer_notes)}\n\n## Deliverable\n\nOutput a short execution plan in Markdown.\n\n1. **Goal.** One sentence on what this task achieves.\n2. **Context.** What's currently broken or missing.\n3. **Steps.** A numbered list of 5–10 concrete, verifiable actions.\n4. **Owner and ETA.** Who does what, by when.\n5. **Verification.** How we'll confirm the task is actually done.\n\nReturn only the Markdown plan. No commentary.`;
  }

  // -------------------------------------------------------------- PAGE template
  // Mirrors the internal team's SPA structure (Hero → Problem → Solution
  // intro → Feature grid → Detailed feature sections w/ alternating image
  // L/R → Comparison table → Use cases → Mid CTA → FAQ → Final CTA) with
  // 2026 trends layered in (FAQPage JSON-LD, AEO answer-first intros, AIO
  // standalone-claim sentences, scannable bullets).
  if (isPage) {
    const updateExtras = isUpdate
      ? `\n## Refresh workflow (do these in order)\n1. Open the live URL and read the current content end to end.\n2. Identify what's outdated (year stamps, screenshots, stats, prices, deprecated competitors).\n3. Compare against the H2/H3 list below and fill the gaps.\n4. Tighten the hero subhead so the value prop hits in one sentence.\n5. Add a "Last updated: ${today}" line under the H1.\n6. **Don't change the URL.** Same page, refreshed.\n`
      : "";

    return `${header}\n\n${opener}\n${backingBlock}${updateExtras}\n${verification}\n\n${brandBlock}\n## Core
• **Target keyword:** ${brief.target_keyword}
• **Search intent:** ${brief.intent}
• **Target length:** ${wt} words (${lengthBand})
• **Secondary keywords to use:** ${brief.secondary_keywords.join(", ")}

## Required H1
${brief.recommended_h1}

## Source data

Use these as the structure of the page.

**H2 sections (${brief.recommended_h2s.length}). Turn each into a detailed feature section, with image placement alternating left and right.**
${list(brief.recommended_h2s)}

**H3 subsections that drill into the H2s.**
${bullets(brief.recommended_h3s)}

**People Also Ask. Use as the FAQ section, wrapped in FAQPage JSON-LD.**
${list(brief.paa_questions)}

**Competitor references. Use to inform the comparison and cite where appropriate.**
${bullets(brief.competitor_refs)}

**Writer notes and SEO checklist.**
${bullets(brief.writer_notes)}

## Page output structure

Follow this exact order. It mirrors the internal team's SPA pattern.

### 0. Page metadata block

Output this first, before the H1. Use a fenced code block, not an HTML comment.

\`\`\`
META TITLE: <55–60 chars. Include the target keyword and brand. Example: "Employee Monitoring Software 2026 | We360.ai">
META DESC:  <150–160 chars. Benefit led with a CTA verb. Example: "Track productivity, manage attendance, and prove ROI with ethical employee monitoring software. Start free with We360.ai.">
SLUG:       /<kebab-case-from-h1>
CANONICAL:  https://we360.ai/<slug>
H1:         <the Required H1>
\`\`\`

### 1. Hero section
• **H1:** the Required H1 above. Focus on the outcome, not the feature.
• **Subheadline:** one line that promises the outcome in plain language.
• **Primary CTA and Secondary CTA** (use the brand fixed CTAs above).
• **Trust line:** \`${WE360_BRAND.trustLine}\` on one line below the CTAs.
• **Image:** \`> [Image: Hero, We360.ai dashboard showing ${brief.target_keyword} overview · placement: RIGHT · alt='We360.ai dashboard showing ${brief.target_keyword}']\`

### 2. Problem section
• **H2:** pain point framing. Example: "Why managing a workforce manually doesn't scale".
• 4–5 short bullet points. Each one a specific pain a manager feels today.
• No paragraphs. Bullets only.

### 3. Solution intro
• **H2:** how We360.ai solves this.
• 2–3 short paragraphs. Lead with the answer, then explain the how.
• **Weave in 1–2 inline internal links** (e.g. "...with [workforce analytics](/solutions/workforce-analytics) built in"). Don't just list them at the bottom.

### 4. Key features grid
• **H2:** "What [target keyword] does".
• 4–6 feature cards. Each card has an icon name, the feature name, and a one line description.

### 5. Detailed feature sections

One per H2 from the source data. For each one:
• **H2** that targets a keyword variant from secondary_keywords.
• 4–6 short bullet points. No paragraphs.
• One \`> [Image: <feature name>, placement: <Left/Right alternating> · alt='We360.ai dashboard showing <feature>']\` placeholder.
• **Weave at least one inline internal link per 2–3 sections** to /solutions/*, /integrations/*, /vs/*, or /alternative/*.

### 6. Comparison table

Use a proper Markdown table. Don't fall back to a wall of text.

• **H2:** "Why use We360.ai for ${brief.target_keyword}?"
• Use this exact Markdown table syntax:

\`\`\`
| Without We360.ai                          | With We360.ai                                 |
|-------------------------------------------|------------------------------------------------|
| Manual attendance tracking                | Automated real time attendance dashboard       |
| Productivity based on manager guesses     | Data backed productivity scoring per employee  |
| ... (5–7 rows total)                      | ... (matching 5–7 rows)                        |
\`\`\`

### 7. Use cases
• **H2:** "Who uses ${brief.target_keyword}?"
• 6–8 industry or role chips. Pick the most relevant 6–8 from: BPO, IT services, Banking, EdTech, Healthcare, Consulting, Real Estate, Retail, Manufacturing.
• Each chip is the role or industry name plus a one line use case.

### 8. Mid page CTA
• **H2:** action oriented. Example: "See We360.ai in action".
• One short paragraph.
• Both CTAs (primary and secondary).

### 9. FAQ section
• **H2:** "Frequently Asked Questions".
• 5–7 Q&A pairs. Use the People Also Ask above as the questions. Answer in 30–60 words each, and answer first.
• The FAQPage JSON-LD goes in section 11 below. Don't duplicate inline.

### 10. Final CTA
• **H2:** outcome statement. Example: "Ready to manage your workforce smarter?"
• 2–3 sentences.
• Both CTAs.
• Pricing line: \`${WE360_BRAND.pricingLine}\`.
• \`> [Image: HR manager reviewing dashboard · placement: BOTTOM · alt='HR manager reviewing ${brief.target_keyword} dashboard on We360.ai']\`

### 11. Schema

All three JSON-LD blocks are required. Skipping any one is a fail. Output each as a fenced \`\`\`json code block.

**(a) SoftwareApplication.** The page sells software, so this is mandatory.
\`\`\`json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "We360.ai",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web, Windows, macOS",
  "offers": { "@type": "Offer", "price": "299", "priceCurrency": "INR", "priceSpecification": { "@type": "UnitPriceSpecification", "referenceQuantity": { "@type": "QuantitativeValue", "value": 1, "unitText": "user/month" }}},
  "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.6", "ratingCount": "1200" }
}
\`\`\`

**(b) FAQPage.** Wraps the FAQ section above.
\`\`\`json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [ /* one entry per Q&A from section 9 */ ]
}
\`\`\`

**(c) BreadcrumbList.**
\`\`\`json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://we360.ai/" },
    { "@type": "ListItem", "position": 2, "name": "Solutions", "item": "https://we360.ai/solutions/" },
    { "@type": "ListItem", "position": 3, "name": "<H1 short>", "item": "https://we360.ai/<slug>" }
  ]
}
\`\`\`

## The 5-pillar template

The page must satisfy all five.

### SEO
• Single H1 with the target keyword near the start. H2s use keyword variations.
• 0.8–1.5% keyword density. Don't stuff.
• Schema: SoftwareApplication, FAQPage, BreadcrumbList.

### AEO
• The hero subhead and Problem section bullets answer the query in the first viewport.
• FAQ uses answer first paragraphs (30–60 words).
• FAQPage JSON-LD wraps the FAQ section.

### GEO and E-E-A-T
• Trust line plus customer logos or badges visible above the fold.
• Cite 2–3 authoritative sources inline (link to gov, Wikipedia, or an industry body).
• Use named entities (specific industries, regulations, and integrations).

### SXO
• Bullets over paragraphs everywhere.
• Visual hierarchy: hero → problem → features → comparison → social proof → CTA.
• Repeat the primary CTA every 1–2 viewports.

### AIO
• Each claim standalone. No "as mentioned earlier".
• Fact first sentences.
• The comparison table is structured data, so LLMs can extract it cleanly.

Return only the page Markdown. No commentary.`;
  }

  // -------------------------------------------------------------- BLOG template
  // Modern blog format — TL;DR + key takeaways at top (AEO/AIO win),
  // inline mid-post CTA after value delivered (2026 conversion trend),
  // FAQPage JSON-LD at the end.
  const updateExtras = isUpdate
    ? `\n## Refresh workflow (do these in order)\n1. Open the live URL and read the current content end to end.\n2. Identify what's outdated (year stamps, screenshots, stats, prices, deprecated tools, broken links).\n3. Compare against the H2/H3 list below and fill the gaps.\n4. Tighten the intro so the answer hits in the first two sentences (AEO).\n5. Add a "Last updated: ${today}" line under the H1.\n6. **Don't change the URL.** Same post, refreshed.\n`
    : "";

  return `${header}\n\n${opener}\n${backingBlock}${updateExtras}\n${verification}\n\n${brandBlock}\n## Core
• **Target keyword:** ${brief.target_keyword}
• **Search intent:** ${brief.intent}
• **Target length:** ${wt} words (${lengthBand})
• **Secondary keywords to use:** ${brief.secondary_keywords.join(", ")}

## Required H1
${brief.recommended_h1}

## H2 sections (${brief.recommended_h2s.length})
${list(brief.recommended_h2s)}

## H3 subsections to cover across the H2s
${bullets(brief.recommended_h3s)}

## People Also Ask
${list(brief.paa_questions)}

Answer these in the FAQ at the bottom (FAQPage schema).

## Internal linking suggestions
${bullets(brief.internal_links)}

## Competitor and authoritative sources to cite
${bullets(brief.competitor_refs)}

## Writer notes and SEO checklist
${bullets(brief.writer_notes)}

## Blog output structure

Follow these strictly. Modern blog conventions, 2026 patterns.

### 0. Page metadata block

Output this first, before the H1. Use a fenced code block.

\`\`\`
META TITLE: <55–60 chars. Include the target keyword and brand.>
META DESC:  <150–160 chars. Benefit led with a CTA verb.>
SLUG:       /blog/<kebab-case-from-h1>
CANONICAL:  https://we360.ai/blog/<slug>
H1:         <the Required H1>
\`\`\`

### 1. H1 title (use the Required H1 above)

### 2. Author byline
\`*By ${author}, ${WE360_BRAND.authorTitle}. ${isUpdate ? "Last updated" : "Published"}: ${today}.*\`

### 3. TL;DR blockquote
\`> **TL;DR:** <2–4 sentences, answer first, AEO win>\`

### 4. Key takeaways

3–5 scannable bullets that are friendly to AI overview parsers.

### 5. Intro paragraph

2–3 sentences max. Set the stake. Don't pad.

### 6. Body H2/H3 sections

Follow the H2 and H3 lists above.

• **Weave 3–5 inline internal links** into the body at natural mention points. Example: when you mention "attendance tracking", link to [/solutions/attendance-tracking-software](). Don't dump links at the end. Integrate them inline.
• Drop 2–3 \`> [Image: description, placement: inline · alt='alt text']\` placeholders mid body where a visual would help.

### 7. Inline mid post CTA

A soft CTA after value is delivered, around 60% of the way through.

\`> Want to see how this works for your team? **${WE360_BRAND.secondaryCta}** → /demo\`

### 8. More body sections continue

### 9. Final CTA paragraph

2–3 outcome focused sentences. Use both CTAs (primary and secondary).

### 10. FAQ section
• \`## Frequently Asked Questions\` plus 5–7 Q&A from the PAA list above.
• Answer first, 30–60 words each.
• The FAQPage JSON-LD goes in section 12 below. Don't duplicate inline.

### 11. Author bio (2 lines)
\`*${author} is the ${WE360_BRAND.authorTitle.toLowerCase()}. Writes about workforce productivity, employee monitoring, and modern SEO. Connect on LinkedIn.*\`

### 12. Schema

All three JSON-LD blocks are required. Output each as a fenced \`\`\`json code block.

**(a) Article.**
\`\`\`json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "<H1>",
  "datePublished": "${today}",
  "dateModified": "${today}",
  "author": { "@type": "Person", "name": "${author}", "jobTitle": "${WE360_BRAND.authorTitle}" },
  "publisher": { "@type": "Organization", "name": "We360.ai", "url": "https://we360.ai" },
  "mainEntityOfPage": "https://we360.ai/blog/<slug>"
}
\`\`\`

**(b) FAQPage.** Wraps the FAQ section above.
\`\`\`json
{ "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [ /* one entry per Q&A */ ] }
\`\`\`

**(c) BreadcrumbList.**
\`\`\`json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://we360.ai/" },
    { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://we360.ai/blog/" },
    { "@type": "ListItem", "position": 3, "name": "<H1 short>", "item": "https://we360.ai/blog/<slug>" }
  ]
}
\`\`\`

## The 5-pillar template

The article must satisfy all five.

### SEO
• Single H1 with the primary keyword near the start.
• 4+ H2 sections with keyword variations. 0.8–1.5% keyword density.
• 3–5 internal links formatted as \`[anchor](/path)\`.
• META line at the end.

### AEO (answer engine)
• TL;DR and Key takeaways near the top.
• Answer first paragraphs (topic sentence in sentence 1).
• FAQPage JSON-LD wraps the FAQ section.

### GEO and E-E-A-T
• Author byline at top with credential and date.
• Cite 2–3 authoritative external sources inline.
• Named entities (places, brands, regulations).

### SXO
• Short paragraphs (max 4 sentences).
• Bullets and numbered lists generously.
• Inline mid post CTA and final CTA paragraph.
• 2–3 image prompts.

### AIO
• Each claim standalone. No "as mentioned earlier".
• Fact first sentences.
• Schema block listing JSON-LD types at end.

Return only the article Markdown. No commentary.`;
}
