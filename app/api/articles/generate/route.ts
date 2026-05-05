import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

// Bring-your-own-key article generation.
// API key received in request body and used for ONE request only.
// Never logged, never stored server-side.

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  provider: z.enum(["claude", "openai"]),
  apiKey: z.string().min(10),
  targetKeyword: z.string().min(1),
  secondaryKeywords: z.array(z.string()).default([]),
  competition: z.string().nullable().optional(),
  mode: z.enum(["outline", "full"]),
});

function wordTarget(competition: string | null | undefined): string {
  if (competition === "Low Competition") return "1200–1500 words";
  if (competition === "Medium Competition") return "1800–2200 words";
  if (competition === "High Competition") return "2500+ words";
  return "1500 words";
}

// --------------------------------------------------------------
// The 5-pillar article template.
// Every article must structurally satisfy SEO + AEO + GEO + SXO + AIO.
// --------------------------------------------------------------
function buildPrompt(b: z.infer<typeof Body>) {
  const target = wordTarget(b.competition);
  const secondary = b.secondaryKeywords.length > 0 ? `Secondary keywords to weave in naturally: ${b.secondaryKeywords.join(", ")}.` : "";

  if (b.mode === "outline") {
    return `You are a senior SEO + GEO strategist for a skydiving company in India.
Generate a JSON outline for an article targeting the primary keyword "${b.targetKeyword}". ${secondary}

The outline must satisfy all 5 pillars (SEO, AEO, GEO, SXO, AIO). Return ONLY this JSON shape — no commentary:

{
  "title": "H1 (≤ 70 chars, includes primary keyword)",
  "slug": "url-friendly-slug",
  "metaDescription": "150–160 char meta with keyword + CTA",
  "tldr": "2–4 sentence TL;DR / Key Takeaways box to display at top (AEO + AIO boost)",
  "intro": "hook paragraph with primary keyword in first 100 words",
  "sections": [
    {"h2": "Section heading", "h3s": ["sub-section", "sub-section"], "notes": "what to cover", "entities": ["relevant named entities — places, people, brands"]}
  ],
  "faq": [
    {"q": "question", "a": "answer (short, direct, schema-ready)"}
  ],
  "authorBio": "1–2 sentence author bio with credentials",
  "internalLinkSuggestions": ["/path1", "/path2"],
  "externalCitations": ["wikipedia or govt or authoritative source URL"],
  "wordCountEstimate": 1500,
  "pillars": {
    "SEO": ["how this outline satisfies SEO"],
    "AEO": ["FAQ count, TL;DR, direct answers"],
    "GEO": ["author bio, citations, entity coverage"],
    "SXO": ["scannable structure, CTAs, short paragraphs"],
    "AIO": ["schema hints, citability, fact-first claims"]
  }
}`;
  }

  return `You are a senior SEO + GEO content writer for a skydiving company in India.
Write a COMPLETE, publish-ready article targeting "${b.targetKeyword}". ${secondary}

Target length: ${target}. Use proper Markdown.

This article must structurally satisfy all 5 pillars:

## SEO requirements
- Single H1 that includes the primary keyword near the start
- 4+ H2 sections with keyword variations
- Primary keyword density 0.8%–1.5%
- Natural weaving of secondary keywords
- 3–5 internal link suggestions formatted as [link text](/path)
- End with a META line (see below)

## AEO requirements (Answer Engine — People Also Ask, featured snippets)
- Start with a 2–4 sentence **TL;DR** box: "> **TL;DR:** ..."
- Answer-first paragraphs (topic sentence in sentence 1)
- FAQ section at the bottom with 5–7 Q&A pairs
  - Each answer must be 30–60 words, direct, citable
  - Format: "**Q:** ..." then "**A:** ..."

## GEO requirements (Generative Engines — E-E-A-T + citability)
- Author byline at top: "*By [Name], [credential]. Updated [date].*"
- Cite 2–3 authoritative external sources inline (Wikipedia, government sites, research papers)
- Include named entities: specific places, brands, certifications, equipment, weather conditions
- End with a 2-line author bio block

## SXO requirements (Search eXperience — UX + engagement)
- Short paragraphs (max 4 sentences each)
- Use bullet lists and numbered steps where possible
- 2–3 image suggestions formatted as: "> [Image: description — alt='alt text']"
- One clear CTA paragraph near the end (book a jump, contact us, etc.)

## AIO requirements (AI/LLM Optimization — citable, fact-first)
- Each claim should be standalone (not rely on earlier context to make sense)
- Include a **Key takeaways** bullet list near the top (3–5 bullets)
- Fact-first sentences (number or specific claim first, then context)
- End with a "Schema:" comment block suggesting which JSON-LD types apply (Article + FAQPage + HowTo if relevant)

## Output order (strict)
1. H1
2. Author byline
3. TL;DR block
4. Key takeaways bullets
5. Intro paragraph
6. Body H2/H3 sections
7. CTA paragraph
8. FAQ section (5–7 Q&As)
9. Author bio
10. META: <150–160 char description>
11. Schema: <JSON-LD types to add>

Return ONLY the article Markdown — no commentary, no "Here is your article:" preamble.`;
}

async function callClaude(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4-7",
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API: ${res.status} ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

async function callOpenAI(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 8000,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API: ${res.status} ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function parseMarkdown(md: string): { content: string; title?: string; metaDescription?: string } {
  const titleMatch = md.match(/^#\s+(.+)$/m);
  const metaMatch = md.match(/META:\s*(.+)$/im);
  const cleaned = md.replace(/META:\s*.+$/im, "").trim();
  return {
    content: cleaned,
    title: titleMatch?.[1]?.trim(),
    metaDescription: metaMatch?.[1]?.trim(),
  };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: z.infer<typeof Body>;
  try {
    const json = await request.json();
    body = Body.parse(json);
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const prompt = buildPrompt(body);

  try {
    const text =
      body.provider === "claude"
        ? await callClaude(body.apiKey, prompt)
        : await callOpenAI(body.apiKey, prompt);

    if (body.mode === "outline") {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return NextResponse.json({ content: text });
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const sections = (parsed.sections ?? []).map((s: { h2: string; h3s?: string[]; notes?: string }) =>
          `## ${s.h2}\n${(s.h3s ?? []).map((h: string) => `### ${h}\n`).join("")}${s.notes ? `\n_${s.notes}_\n` : ""}`
        ).join("\n");
        const faq = (parsed.faq ?? []).map((f: { q: string; a: string }) => `**Q:** ${f.q}\n\n**A:** ${f.a}\n`).join("\n");
        const md = `# ${parsed.title ?? body.targetKeyword}\n\n> **TL;DR:** ${parsed.tldr ?? ""}\n\n${parsed.intro ?? ""}\n\n${sections}\n\n## FAQ\n${faq}`;
        return NextResponse.json({
          content: md,
          title: parsed.title,
          metaDescription: parsed.metaDescription,
        });
      } catch {
        return NextResponse.json({ content: text });
      }
    }

    return NextResponse.json(parseMarkdown(text));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Generation failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
