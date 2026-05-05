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

export function briefToMarkdownPrompt(
  brief: BlogBrief,
  projectName: string,
  projectDomain: string,
  // Optional GSC/GA4 backing text — when provided, it's pasted at the top
  // of the prompt so the LLM understands WHY this article matters and what
  // its current SERP / engagement reality looks like. The backing text is
  // already human-formatted ("GSC 28d: 5,420 imp · 67 clk · pos 14.3 …")
  // so we just embed it as-is. Leave undefined for new tasks (no history).
  dataBacking?: string | null,
): string {
  const wt = brief.word_count_target;
  const lengthBand =
    wt >= 2500 ? "2500+ words" : wt >= 1800 ? "1800–2200 words" : "1200–1500 words";

  const list = (arr: string[]) => arr.map((x, i) => `${i + 1}. ${x}`).join("\n");
  const bullets = (arr: string[]) => arr.map((x) => `- ${x}`).join("\n");

  const backingBlock = dataBacking && dataBacking.trim().length > 0
    ? `\n## Why this article matters (live SEO + analytics)\n${dataBacking.trim()}\n\nUse the GSC/GA4 numbers above to prioritize: target the queries that already drive impressions, fix the engagement gaps the data exposes.\n`
    : "";

  return `# Blog Article Brief

Write a complete, publish-ready article for **${projectName}** (${projectDomain}).
${backingBlock}
## Core
- **Target keyword**: ${brief.target_keyword}
- **Search intent**: ${brief.intent}
- **Target length**: ${wt} words (${lengthBand})
- **Secondary keywords to weave in**: ${brief.secondary_keywords.join(", ")}

## Required H1
${brief.recommended_h1}

## H2 sections (${brief.recommended_h2s.length})
${list(brief.recommended_h2s)}

## H3 subsections to cover across the H2s
${bullets(brief.recommended_h3s)}

## Sections breakdown (ordered — follow this flow)
${list(brief.sections_breakdown)}

## People Also Ask — include as FAQ at the bottom (FAQPage schema)
${list(brief.paa_questions)}

## Internal linking suggestions
${bullets(brief.internal_links)}

## Competitor references / authoritative sources to cite
${bullets(brief.competitor_refs)}

## Writer notes & SEO checklist
${bullets(brief.writer_notes)}

## The 5-pillar template — every article must satisfy all five

### SEO
- Single H1 with primary keyword near start
- 4+ H2 sections with keyword variations
- Keyword density 0.8–1.5%
- 3–5 internal link suggestions formatted as [text](/path)
- End with a META line

### AEO (Answer Engine)
- Start with a TL;DR blockquote: "> **TL;DR:** …" (2-4 sentences)
- Answer-first paragraphs (topic sentence in sentence 1)
- FAQ section at bottom with 5-7 Q&A pairs (30-60 words each)
- Wrap FAQs as FAQPage JSON-LD

### GEO (Generative Engine / E-E-A-T)
- Author byline at top: "*By [Name], [credential]. Updated [date].*"
- Cite 2-3 authoritative external sources inline
- Include named entities: places, brands, certifications
- 2-line author bio block

### SXO (Search Experience)
- Short paragraphs (max 4 sentences)
- Bullet lists and numbered steps
- 2-3 image prompts: "> [Image: description — alt='alt text']"
- One clear CTA paragraph near the end

### AIO (AI/LLM Optimization)
- Each claim standalone (no reliance on earlier context)
- "Key takeaways" bullet list near the top (3-5 bullets)
- Fact-first sentences
- Schema: block at end listing JSON-LD types to add

## Output order (strict)
1. H1 title (use the Required H1 above)
2. Author byline
3. TL;DR blockquote
4. Key takeaways bullets
5. Intro paragraph
6. Body H2/H3 sections (follow the breakdown order)
7. CTA paragraph
8. FAQ section (5-7 Q&As, use PAA questions above)
9. Author bio
10. META: <150-160 char description>
11. Schema: <JSON-LD types to add>

Return only the article Markdown — no commentary.`;
}
