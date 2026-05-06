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
        `${projectName} — our recommendation for Indian adventurers`,
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
    return competitors.slice(0, 5).map((c) => `${c.name} — ${c.url}`);
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
    "Lead with a TL;DR blockquote — answers the keyword in ≤4 sentences",
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
  voice:          "Professional, outcome-driven, NOT sales-heavy. Speak to operations leaders / HR managers in India and APAC. ROI-aware. Use Indian rupee (₹) for pricing.",
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
  const bullets = (arr: string[]) => arr.map((x) => `- ${x}`).join("\n");

  const isPage = k.surface === "Page";
  const isUpdate = k.action === "Update";
  const isOps = k.surface === "Ops";

  const author = assigneeName?.trim() || "We360.ai team";
  const today = TODAY_PRETTY();

  // -------------------------------------------------------------- VERIFICATION
  // Ask the AI to read the brief and confirm before generating. Catches
  // wrong-keyword / wrong-URL / wrong-intent mistakes before we burn tokens
  // on a draft we'll throw away.
  const verification = `## Step 0 — Verify the brief BEFORE writing (output this first)

Before generating any ${isPage ? "page" : "article"} content, read the entire brief below and output a short verification block:

\`\`\`
✅ Brief understood
- Topic: <one-line summary of what this ${isPage ? "page" : "post"} covers>
- Target keyword: <keyword> · Intent: <intent>
- Audience: <who reads this>
- Format: ${k.action} ${k.surface}
- Tone: ${WE360_BRAND.voice.split(".")[0]}.

⚠️  Flags / questions before writing
- <only list things that are unclear, contradictory, or missing — leave empty if none>
\`\`\`

Then on a new line write \`---\` and continue with the full ${isPage ? "page" : "article"} below. If the flags list is non-empty, STOP and ask the user before writing the rest.`;

  // -------------------------------------------------------------- HEADER + OPENER
  let header: string;
  let opener: string;
  let backingHeading: string;
  if (isOps) {
    header = "# SEO Ops Task";
    opener = `Plan and execute an SEO operations task for **${projectName}** (${projectDomain}). This is not a content-writing task — it's site-wide hygiene / governance work.\n\n**Assignee:** ${author} · **Today:** ${today}`;
    backingHeading = "## Context";
  } else if (isUpdate && isPage) {
    header = "# Landing Page Refresh Brief";
    opener = `Refresh an existing landing page on **${projectName}** (${projectDomain}).\n\n**Assignee:** ${author} · **Today:** ${today}\n\nKeep the URL and core conversion path; fix what's broken; close the gaps the GSC + GA4 data below exposes.`;
    backingHeading = "## Why we're refreshing this page (live SEO + analytics)";
  } else if (isUpdate) {
    header = "# Blog Refresh Brief";
    opener = `Refresh an existing blog post on **${projectName}** (${projectDomain}).\n\n**Assignee:** ${author} · **Today:** ${today}\n\n**Do not change the URL.** Update the publish date and add a "Last updated: ${today}" line under the H1. Use the live GSC + GA4 data below to understand which queries already pull impressions and what to double down on.`;
    backingHeading = "## Why we're refreshing this post (live SEO + analytics)";
  } else if (isPage) {
    header = "# Landing Page Brief — We360.ai";
    opener = `Build a complete, publish-ready **landing page** for **${projectName}** (${projectDomain}).\n\n**Assignee:** ${author} · **Today:** ${today}\n\nPages convert — every section needs to push the visitor toward the CTA, not just inform. Follow the structure below exactly.`;
    backingHeading = "## Why this page matters (live SEO + analytics)";
  } else {
    header = "# Blog Article Brief — We360.ai";
    opener = `Write a complete, publish-ready blog article for **${projectName}** (${projectDomain}).\n\n**Assignee / Author:** ${author} · **Publish date:** ${today}`;
    backingHeading = "## Why this article matters (live SEO + analytics)";
  }

  const backingBlock = dataBacking && dataBacking.trim().length > 0
    ? `\n${backingHeading}\n${dataBacking.trim()}\n\nUse the numbers above to prioritize: target the queries that already drive impressions, fix the engagement gaps the data exposes.\n`
    : "";

  // -------------------------------------------------------------- BRAND BLOCK
  const brandBlock = `## Brand voice + fixed assets (use these — don't invent)
- **Voice:** ${WE360_BRAND.voice}
- **Primary CTA (filled button):** \`${WE360_BRAND.primaryCta}\`
- **Secondary CTA (outlined button):** \`${WE360_BRAND.secondaryCta}\`
- **Pricing line:** \`${WE360_BRAND.pricingLine}\`
- **Trust line:** \`${WE360_BRAND.trustLine}\`
- **Author / Updated:** \`${author}\` · \`${today}\`
${isPage ? `- **Reference page (visual style guide):** ${WE360_BRAND.competitorRef}\n` : ""}`;

  // -------------------------------------------------------------- OPS — short flow
  if (isOps) {
    return `${header}\n\n${opener}\n${backingBlock}\n${verification}\n\n${brandBlock}\n## Task\n- **Title:** ${brief.recommended_h1 || brief.target_keyword}\n- **Target keyword (if applicable):** ${brief.target_keyword}\n- **Word count for any deliverable doc:** ${wt} words\n\n## Context / writer notes\n${bullets(brief.writer_notes)}\n\n## Deliverable\nOutput a short execution plan (Markdown):\n1. **Goal** — one sentence on what this task achieves.\n2. **Context** — what's currently broken or missing.\n3. **Steps** — numbered list of actions (5–10 steps), each concrete and verifiable.\n4. **Owner & ETA** — who does what, by when.\n5. **Verification** — how we'll confirm the task is actually done.\n\nReturn only the Markdown plan — no commentary.`;
  }

  // -------------------------------------------------------------- PAGE template
  // Mirrors the internal team's SPA structure (Hero → Problem → Solution
  // intro → Feature grid → Detailed feature sections w/ alternating image
  // L/R → Comparison table → Use cases → Mid CTA → FAQ → Final CTA) with
  // 2026 trends layered in (FAQPage JSON-LD, AEO answer-first intros, AIO
  // standalone-claim sentences, scannable bullets).
  if (isPage) {
    const updateExtras = isUpdate
      ? `\n## Refresh workflow (do these in order)\n1. Open the live URL and read the current content end-to-end.\n2. Identify what's outdated (year stamps, screenshots, stats, prices, deprecated competitors).\n3. Compare against the H2/H3 list below — fill the gaps.\n4. Tighten the hero subhead so the value-prop hits in 1 sentence.\n5. Add a "Last updated: ${today}" line under the H1.\n6. **Don't change the URL** — same page, refreshed.\n`
      : "";

    return `${header}\n\n${opener}\n${backingBlock}${updateExtras}\n${verification}\n\n${brandBlock}\n## Core
- **Target keyword:** ${brief.target_keyword}
- **Search intent:** ${brief.intent}
- **Target length:** ${wt} words (${lengthBand})
- **Secondary keywords to weave in:** ${brief.secondary_keywords.join(", ")}

## Required H1
${brief.recommended_h1}

## Source data — use these as the spine of the page

**H2 sections (${brief.recommended_h2s.length}) — turn these into detailed feature sections (alternating image L/R/L/R):**
${list(brief.recommended_h2s)}

**H3 subsections (drill into the H2s):**
${bullets(brief.recommended_h3s)}

**People Also Ask (use as the FAQ section, FAQPage JSON-LD):**
${list(brief.paa_questions)}

**Competitor references (use to inform comparison + cite where appropriate):**
${bullets(brief.competitor_refs)}

**Writer notes & SEO checklist:**
${bullets(brief.writer_notes)}

## Page structure (follow this exact order — internal team SPA pattern)

### 1. Hero Section
- **H1:** the Required H1 above (outcome-focused, NOT feature-focused)
- **Sub-headline:** ONE line — promise the outcome in plain language
- **Primary CTA + Secondary CTA** (use the brand-fixed CTAs above)
- **Trust line:** \`${WE360_BRAND.trustLine}\` (one line below the CTAs)
- **Image placement:** RIGHT side · alt: "We360.ai dashboard showing <relevant feature>"

### 2. Problem Section
- **H2:** pain-point framing (e.g. "Why managing a workforce manually doesn't scale")
- 4–5 SHORT bullet points — each one specific pain a manager feels today
- NO paragraphs. Bullets only.

### 3. Solution Intro
- **H2:** how We360.ai solves this
- 2–3 short paragraphs. Lead with the answer, then the how.

### 4. Key Features Grid
- **H2:** "What [target keyword] does"
- 4–6 feature cards (icon + name + 1-line description)

### 5. Detailed Feature Sections — one per H2 above
For each H2 from the source data, write a section:
- **H2** (target a keyword variant from secondary_keywords)
- 4–6 SHORT bullet points (NO paragraphs)
- **Image placement:** alternate Left → Right → Left → Right per section
- **Alt text:** "We360.ai dashboard showing <feature>"

### 6. Comparison Table
- **H2:** "Why use We360.ai for ${brief.target_keyword}?"
- Two columns side-by-side as a Markdown/HTML table:
  - **Without We360.ai** (5–7 rows: manual, scattered tools, no visibility, late attendance reports, productivity guesses, no proof of work, ROI unclear)
  - **With We360.ai** (matching 5–7 rows: automated, single dashboard, real-time visibility, instant attendance, productivity scores, screenshot proof, measurable ROI)

### 7. Use Cases
- **H2:** "Who uses ${brief.target_keyword}?"
- 6–8 industry/role chips: BPO, IT services, Banking, EdTech, Healthcare, Consulting, Real Estate, Retail, Manufacturing — pick the most relevant 6–8.
- Each chip = role/industry name + 1-line use case.

### 8. Mid-page CTA
- **H2:** action-oriented (e.g. "See We360.ai in action")
- 1 short paragraph
- Both CTAs (primary + secondary)

### 9. FAQ Section
- **H2:** "Frequently Asked Questions"
- 5–7 Q&A pairs — use the People Also Ask above as the questions; answer in 30–60 words each, answer-first
- Wrap as **FAQPage JSON-LD** at the end of the section

### 10. Final CTA
- **H2:** outcome statement (e.g. "Ready to manage your workforce smarter?")
- 2–3 sentences
- Both CTAs
- Pricing line: \`${WE360_BRAND.pricingLine}\`
- Image alt: "HR manager reviewing ${brief.target_keyword} dashboard on We360.ai"

### 11. SEO Footer Block (output as Markdown comments at the end)
\`\`\`
META TITLE: <55–60 chars · include target keyword + 2026 + brand>
META DESC: <150–160 chars · benefit + CTA verb>
SLUG (suggested): /<kebab-case-from-h1>
SCHEMA: SoftwareApplication + FAQPage + BreadcrumbList (JSON-LD blocks)
INTERNAL LINKS: 3–5 [anchor](/path) suggestions to /solutions, /vs, /alternative, /integrations, /pricing
\`\`\`

## The 5-pillar template — every page must satisfy all five

### SEO
- Single H1 with target keyword near start; H2s use keyword variations
- 0.8–1.5% keyword density (don't stuff)
- Schema: SoftwareApplication + FAQPage + BreadcrumbList

### AEO
- Hero subhead + Problem section bullets answer the query in the first viewport
- FAQ uses answer-first paragraphs (30–60 words)
- FAQPage JSON-LD wraps the FAQ section

### GEO / E-E-A-T
- Trust line + customer logos/badges visible above the fold
- Cite 2–3 authoritative sources inline (link to gov, Wikipedia, industry body)
- Use named entities (specific industries, regulations, integrations)

### SXO
- Bullets > paragraphs everywhere
- Visual hierarchy: hero → problem → features → comparison → social proof → CTA
- Repeat the primary CTA every 1–2 viewports

### AIO
- Each claim standalone (no "as mentioned earlier")
- Fact-first sentences
- Comparison table is structured data — easy for LLMs to extract

Return only the page Markdown — no commentary.`;
  }

  // -------------------------------------------------------------- BLOG template
  // Modern blog format — TL;DR + key takeaways at top (AEO/AIO win),
  // inline mid-post CTA after value delivered (2026 conversion trend),
  // FAQPage JSON-LD at the end.
  const updateExtras = isUpdate
    ? `\n## Refresh workflow (do these in order)\n1. Open the live URL and read the current content end-to-end.\n2. Identify what's outdated (year stamps, screenshots, stats, prices, deprecated tools, broken links).\n3. Compare against the H2/H3 list below — fill the gaps.\n4. Tighten the intro so the answer hits in the first 2 sentences (AEO).\n5. Add a "Last updated: ${today}" line under the H1.\n6. **Don't change the URL** — same post, refreshed.\n`
    : "";

  return `${header}\n\n${opener}\n${backingBlock}${updateExtras}\n${verification}\n\n${brandBlock}\n## Core
- **Target keyword:** ${brief.target_keyword}
- **Search intent:** ${brief.intent}
- **Target length:** ${wt} words (${lengthBand})
- **Secondary keywords to weave in:** ${brief.secondary_keywords.join(", ")}

## Required H1
${brief.recommended_h1}

## H2 sections (${brief.recommended_h2s.length})
${list(brief.recommended_h2s)}

## H3 subsections to cover across the H2s
${bullets(brief.recommended_h3s)}

## People Also Ask — answer in the FAQ at the bottom (FAQPage schema)
${list(brief.paa_questions)}

## Internal linking suggestions
${bullets(brief.internal_links)}

## Competitor / authoritative sources to cite
${bullets(brief.competitor_refs)}

## Writer notes & SEO checklist
${bullets(brief.writer_notes)}

## Output structure (strict — modern blog conventions, 2026 patterns)

1. **H1 title** (use the Required H1 above)
2. **Author byline:** \`*By ${author}, ${WE360_BRAND.authorTitle}. ${isUpdate ? "Last updated" : "Published"}: ${today}.*\`
3. **TL;DR blockquote** — \`> **TL;DR:** …\` (2–4 sentences, answer-first, AEO win)
4. **Key takeaways** bullet list (3–5 bullets — scannable, AIO-friendly)
5. **Intro paragraph** (2–3 sentences max — set the stake, don't pad)
6. **Body H2/H3 sections** — follow the H2 + H3 lists above
7. **Inline mid-post CTA** (2026 trend — soft CTA after value delivered, ~60% through):
   \`> Want to see how this works for your team? **${WE360_BRAND.secondaryCta}** → /demo\`
8. **More body sections** continue
9. **Final CTA paragraph** — outcome-focused, 2–3 sentences, both CTAs
10. **FAQ section** — \`## FAQ\` + 5–7 Q&A from the PAA list above (answer-first, 30–60 words each). Wrap as **FAQPage JSON-LD**.
11. **Author bio** (2 lines): \`*${author} is the ${WE360_BRAND.authorTitle.toLowerCase()}. Writes about workforce productivity, employee monitoring, and modern SEO. Connect on LinkedIn.*\`
12. **SEO footer block** (Markdown comment at the end):
\`\`\`
META TITLE: <55–60 chars · include target keyword>
META DESC: <150–160 chars · benefit + CTA verb>
SCHEMA: Article + FAQPage + BreadcrumbList (JSON-LD blocks)
INTERNAL LINKS: 3–5 [anchor](/path) — choose from internal linking list above
IMAGE PROMPTS: 2–3 \`> [Image: description — alt='alt text']\` blocks placed mid-post
\`\`\`

## The 5-pillar template — every article must satisfy all five

### SEO
- Single H1 with primary keyword near start
- 4+ H2 sections with keyword variations · 0.8–1.5% keyword density
- 3–5 internal links formatted as \`[anchor](/path)\`
- META line at the end

### AEO (Answer Engine)
- TL;DR + Key takeaways near the top
- Answer-first paragraphs (topic sentence in sentence 1)
- FAQPage JSON-LD wraps the FAQ section

### GEO / E-E-A-T
- Author byline at top with credential + dated
- Cite 2–3 authoritative external sources inline
- Named entities (places, brands, regulations)

### SXO
- Short paragraphs (max 4 sentences)
- Bullets and numbered lists generously
- Inline mid-post CTA + final CTA paragraph
- 2–3 image prompts

### AIO
- Each claim standalone (no "as mentioned earlier")
- Fact-first sentences
- Schema block listing JSON-LD types at end

Return only the article Markdown — no commentary.`;
}
