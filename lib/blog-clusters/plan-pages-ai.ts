// Blog Clusters - GSC queries (GC-17): plan the changes for ONE page at a
// time. Claude sees what our page already has (GC-15) and Google's US mobile
// top 3 for each search term (GC-16), and returns:
//   - one title + meta description for the page (mobile limits, keeps the
//     page's main keyword) - shared by every term that uses "title & meta";
//   - per term: how to use it, what's already on the page, why the top 3
//     rank, and the wording for headings / FAQs / paragraphs / templates.
// Server only. Uses `claude_key` + Claude Sonnet 5.5, structured outputs.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { claudeKey } from "@/lib/blog-clusters/assign-queries-ai";
import { normalizeKeyword } from "@/lib/blog-clusters/query-match";
import { META_MAX, TITLE_MAX, type PageScan, type QueryUseOption, type SerpTopResult } from "@/lib/types/cluster-gsc";

const MODEL = "claude-sonnet-5-5";

export interface PlanTerm {
  id: string;
  query: string;
  impressions: number;
  clicks: number;
  position: number;
  diagnosis: string;
  /** assign | hub | update_existing */
  action: string;
  /** Options a person chose - keep exactly; null = Claude decides (hint given). */
  fixedUsages: QueryUseOption[] | null;
  hintUsages: QueryUseOption[];
  top: SerpTopResult[];
  ourPosition: number | null;
  paa: string[];
}

export interface PlanPageInput {
  clusterName: string;
  url: string | null;
  /** live = a page that exists; planned = a cluster post not published yet. */
  status: "live" | "planned";
  /** What the page is meant to rank for (post's primary keyword / hub keyword / known page keyword). */
  primaryKeyword: string | null;
  plannedTitle: string | null;
  scan: PageScan | null;
  /** A title already approved for this page - keep it rather than inventing another. */
  approvedTitle: string | null;
  approvedMeta: string | null;
  terms: PlanTerm[];
}

export interface PlannedTerm {
  usages: QueryUseOption[];
  alreadyOnPage: string | null;
  whyTheyRank: string | null;
  h2: string | null;
  faqQuestion: string | null;
  faqAnswer: string | null;
  paragraph: string | null;
  template: string | null;
  anchors: string[];
}

export type PlanPageResult =
  | { ok: true; title: string | null; meta: string | null; titleKeepsPrimary: boolean; terms: Map<string, PlannedTerm> }
  | { ok: false; error: string };

const UseOption = z.enum(["title_meta", "template", "h2", "faq", "paragraph", "link_text"]);
const OutputSchema = z.object({
  page_title: z.string().nullable(),
  page_meta: z.string().nullable(),
  terms: z.array(z.object({
    id: z.string(),
    usages: z.array(UseOption),
    already_on_page: z.string().nullable(),
    why_they_rank: z.string(),
    draft_h2: z.string().nullable(),
    draft_faq_question: z.string().nullable(),
    draft_faq_answer: z.string().nullable(),
    draft_paragraph: z.string().nullable(),
    draft_template: z.string().nullable(),
    anchors: z.array(z.string()),
  })),
});
const ShortenSchema = z.object({ title: z.string().nullable(), meta: z.string().nullable() });

const SYSTEM = `You are a senior SEO strategist and copywriter for a B2B SaaS website (employee monitoring / workforce analytics).
You plan the changes for ONE page of ours. You get: what the page already has (title, meta description, H1, H2/H3 headings, FAQs, word count, whether it offers a template), the keyword the page is meant to rank for, and Google Search Console search terms it should win more clicks for. For each term you also get Google's US mobile top 3 (title, meta description, and a quick scan: word count, headings, template yes/no) and "people also ask" questions.

Work like this:
1. For each term, compare the top 3 with our page. In "why_they_rank" say in 1-2 plain sentences what the top 3 do that we don't (or do better): intent match, a template/tool, depth, a direct answer, freshness, title wording. Be specific to what you were given - never invent facts about pages.
2. In "already_on_page" say what our page already covers for this term (e.g. 'Has an H2 "How to measure..."'), or null if nothing. Never suggest something the page already has.
3. Choose "usages" (one or more) that close the gap: title_meta (rewrite the page title + meta), template (add a usable template/tool), h2 (a new section), faq (a question + direct answer), paragraph (mention it naturally), link_text (assign/hub terms: anchors other pages link here with). If a term lists "keep_usages", use exactly those.
4. ONE page title and ONE meta description for the whole page (only if any term uses title_meta, else null), written for the most valuable title_meta term(s):
   - page_title: MAX ${TITLE_MAX} characters, front-loaded, and it MUST keep the page's main keyword (or a very close form) - the page must not lose what it already ranks for. If an approved title is given, return it unchanged.
   - page_meta: MAX ${META_MAX} characters (mobile), say what the reader gets and end with a reason to click.
   - Learn from the top 3 titles/metas but don't copy them.
5. Drafts, only for the chosen usages (null otherwise): draft_h2 (heading text), draft_faq_question + draft_faq_answer (direct 40-60 word answer; prefer a matching "people also ask" question), draft_paragraph (1-2 sentences mentioning the term naturally), draft_template (what the template/tool should contain: sections/fields/columns, one short paragraph). anchors: 2-3 natural link texts (2-6 words) for link_text, else empty.
Plain text only in every field - no JSON, no quotes around values, no markdown. Return every term id exactly once. Count characters carefully.`;

/** True when the title keeps the main keyword's important words. */
export function keepsPrimary(title: string | null, primary: string | null): boolean {
  if (!title || !primary) return true;
  const stem = (w: string) => w.replace(/(ies)$/, "y").replace(/(es|s)$/, "");
  const stop = new Set(["the", "and", "for", "with", "how", "what", "your", "you", "are", "best", "top", "guide", "from", "into", "that", "this"]);
  const t = new Set(normalizeKeyword(title).split(" ").map(stem));
  const words = normalizeKeyword(primary).split(" ").filter((w) => w.length > 2 && !stop.has(w)).map(stem);
  if (!words.length) return true;
  const hit = words.filter((w) => t.has(w)).length;
  return hit / words.length >= 0.75;
}

function plain(s: string | null | undefined, max = 2000): string | null {
  // Strip anything that looks like leaked JSON syntax and cap the length.
  let t = (s ?? "").trim();
  const leak = t.search(/["“”][,:]["“”{]|\}\s*,\s*\{|["“”]\w+_\w+["“”]\s*:|["“”]\s*:\s*null\b/);
  if (leak >= 0) t = t.slice(0, leak).replace(/[\s“”",]+$/, "").trim();
  return t.length >= 3 ? t.slice(0, max) : null;
}

export function fitMeta(meta: string, max = META_MAX): string {
  if (meta.length <= max) return meta;
  const head = meta.slice(0, max);
  const sentence = Math.max(head.lastIndexOf(". "), head.endsWith(".") ? head.length - 1 : -1);
  if (sentence >= max * 0.6) return head.slice(0, sentence + 1).trim();
  const word = head.slice(0, max - 1).lastIndexOf(" ");
  return `${head.slice(0, word > 0 ? word : max - 1).replace(/[\s,;:.-]+$/, "")}…`;
}

const compactScan = (s: PageScan | null, headings = 25) => s ? {
  title: s.title, meta: s.meta, h1: s.h1, word_count: s.wordCount, has_template: s.hasTemplate,
  headings: s.headings.slice(0, headings).map((h) => `${h.level === 2 ? "H2" : "H3"}: ${h.text}`),
  faqs: s.faqs.slice(0, 12),
} : null;

export async function planPageWithClaude(input: PlanPageInput): Promise<PlanPageResult> {
  const key = claudeKey();
  if (!key) return { ok: false, error: "claude_key is not set." };
  if (!input.terms.length) return { ok: true, title: null, meta: null, titleKeepsPrimary: true, terms: new Map() };
  const client = new Anthropic({ apiKey: key });

  const ref = new Map<string, PlanTerm>();
  const payload = {
    cluster: input.clusterName,
    page: {
      url: input.url, status: input.status, main_keyword: input.primaryKeyword, planned_title: input.plannedTitle,
      approved_title: input.approvedTitle, approved_meta: input.approvedMeta,
      current: compactScan(input.scan, 40),
    },
    terms: input.terms.slice(0, 25).map((t, i) => {
      const id = `T${i + 1}`;
      ref.set(id, t);
      return {
        id, search_term: t.query, impressions_90d: t.impressions, clicks_90d: t.clicks, avg_google_rank: t.position,
        diagnosis: t.diagnosis, route: t.action,
        keep_usages: t.fixedUsages, suggested_usages: t.fixedUsages ? undefined : t.hintUsages,
        our_position_in_us_mobile: t.ourPosition,
        google_top3: t.top.map((r) => ({ position: r.position, url: r.url, title: r.title, meta: r.description, scan: compactScan(r.scan, 12) })),
        people_also_ask: t.paa,
      };
    }),
  };

  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(OutputSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    });
    if (response.stop_reason === "refusal") return { ok: false, error: "Claude declined the request." };
    if (response.stop_reason === "max_tokens") return { ok: false, error: "Claude's answer was cut off." };
    const parsed = response.parsed_output;
    if (!parsed) return { ok: false, error: "Claude's answer couldn't be read as JSON." };

    let title = input.approvedTitle ?? plain(parsed.page_title, 200);
    let meta = input.approvedMeta ?? plain(parsed.page_meta, 400);
    // Mobile limits: one shorten retry.
    if (!input.approvedTitle && ((title && title.length > TITLE_MAX) || (meta && meta.length > META_MAX))) {
      const res = await client.beta.messages.parse({
        model: MODEL,
        max_tokens: 2000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(ShortenSchema) },
        system: `Shorten the title to at most ${TITLE_MAX} characters and the meta description to at most ${META_MAX} characters. Keep the main keyword "${input.primaryKeyword ?? ""}" in the title and keep the meaning. Return null for a field that was null. Count characters carefully.`,
        messages: [{ role: "user", content: JSON.stringify({ title, meta }) }],
      });
      if (res.stop_reason !== "refusal" && res.parsed_output) {
        const t = plain(res.parsed_output.title, 200), m = plain(res.parsed_output.meta, 400);
        if (t && t.length <= TITLE_MAX) title = t;
        if (m && m.length <= META_MAX) meta = m;
      }
    }

    // Last resort for the meta: cut at the last full sentence (or word) that fits.
    // Titles are left as they are - a cut title reads badly; the UI flags it.
    if (meta && meta.length > META_MAX) meta = fitMeta(meta);

    const terms = new Map<string, PlannedTerm>();
    for (const a of parsed.terms) {
      const t = ref.get(a.id);
      if (!t) continue;
      const usages = t.fixedUsages?.length ? t.fixedUsages : [...new Set(a.usages)];
      terms.set(t.id, {
        usages,
        alreadyOnPage: plain(a.already_on_page, 400),
        whyTheyRank: plain(a.why_they_rank, 600),
        h2: usages.includes("h2") ? plain(a.draft_h2, 200) : null,
        faqQuestion: usages.includes("faq") ? plain(a.draft_faq_question, 300) : null,
        faqAnswer: usages.includes("faq") ? plain(a.draft_faq_answer, 1500) : null,
        paragraph: usages.includes("paragraph") ? plain(a.draft_paragraph, 1500) : null,
        template: usages.includes("template") ? plain(a.draft_template, 1500) : null,
        anchors: usages.includes("link_text") ? a.anchors.map((s) => s.trim()).filter(Boolean).slice(0, 3) : [],
      });
    }
    return { ok: true, title, meta, titleKeepsPrimary: keepsPrimary(title, input.primaryKeyword), terms };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "claude_key was rejected (401)." };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "Claude rate limit hit - try again shortly." };
    if (e instanceof Anthropic.APIError) return { ok: false, error: `Claude API error ${e.status ?? ""}: ${e.message}`.slice(0, 300) };
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 300) : "Claude request failed." };
  }
}
