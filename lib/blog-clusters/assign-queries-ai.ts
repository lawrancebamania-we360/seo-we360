// Blog Clusters - GSC queries (GC-3, GC-8, GC-10): Claude decides, per search
// term, where it goes (post / hub / new post / ignore) when it isn't decided
// yet, HOW to use it (one or more options), anchor variants, and drafts the
// actual wording (title + meta within mobile limits, H2, FAQ Q&A, paragraph,
// what a template/tool should contain). For terms already routed (by a rule
// or a person) it keeps the route and only adds options + drafts.
//
// Uses the dedicated `claude_key` env var and Claude Sonnet 5.5 with
// structured outputs + server-side refusal fallback. Server only.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import {
  META_MAX, NEW_POST_MIN_IMPRESSIONS, TITLE_MAX,
  type QueryAction, type QueryDrafts, type QueryUseOption,
} from "@/lib/types/cluster-gsc";

const MODEL = "claude-sonnet-5-5";
const BATCH = 30;        // search terms per request (drafts make each answer long)
const RETRY_BATCH = 10;  // smaller batches for terms Claude didn't return the first time
const PARALLEL = 3;      // requests in flight

export function claudeKey(): string | null {
  // Env var names are case-sensitive; accept the casings the key may have been saved under.
  return process.env.claude_key || process.env.CLAUDE_KEY || process.env.Claude_Key || null;
}

export interface AiPost { id: string; title: string; primary: string | null; supporting: string[]; live: boolean; needsNaturals: boolean }
export interface AiQuery {
  query: string;
  impressions: number;
  clicks: number;
  position: number;
  diagnosis: string;
  rankingPage: string | null;
  rankingPageTitle: string | null;
  /** Already decided (rule / person / earlier run): keep this route, only add options + drafts. */
  fixed?: { action: QueryAction; targetTitle: string | null; usages?: QueryUseOption[] } | null;
}
export interface AiAssignment {
  action: "assign" | "hub" | "new_post" | "ignore";
  itemId: string | null;
  usages: QueryUseOption[];
  anchors: string[];
  reason: string;
  drafts: QueryDrafts;
}

export type AiResult =
  | { ok: true; assignments: Map<string, AiAssignment>; naturals: Map<string, { toHub: string; fromHub: string }> }
  | { ok: false; error: string };

const UseOption = z.enum(["title_meta", "template", "h2", "faq", "paragraph", "link_text"]);

const OutputSchema = z.object({
  queries: z.array(z.object({
    id: z.string(),
    action: z.enum(["assign", "hub", "new_post", "ignore"]),
    post: z.string().nullable(),
    usages: z.array(UseOption),
    anchors: z.array(z.string()),
    reason: z.string(),
    draft_title: z.string().nullable(),
    draft_meta: z.string().nullable(),
    draft_h2: z.string().nullable(),
    draft_faq_question: z.string().nullable(),
    draft_faq_answer: z.string().nullable(),
    draft_paragraph: z.string().nullable(),
    draft_template: z.string().nullable(),
  })),
  posts: z.array(z.object({
    id: z.string(),
    natural_to_hub: z.string(),
    natural_from_hub: z.string(),
  })),
});

const ShortenSchema = z.object({
  items: z.array(z.object({ id: z.string(), title: z.string().nullable(), meta: z.string().nullable() })),
});

const SYSTEM = `You are a senior SEO strategist and copywriter for a B2B SaaS website (employee monitoring / workforce analytics).
You receive a content cluster: its hub page, its posts (P1, P2, ...), and Google Search Console search terms (Q1, Q2, ...) the site already gets impressions for, each with impressions, clicks, average Google rank, a diagnosis, and the page it currently shows up on.

STEP 1 - where it goes (only for terms WITHOUT a "fixed" decision; for fixed terms repeat the fixed action):
- "assign": the post whose topic and intent fit best (exactly one owner post).
- "hub": the broad head term of the cluster that belongs on the hub page.
- "new_post": a distinct intent no post covers - only when impressions >= ${NEW_POST_MIN_IMPRESSIONS}.
- "ignore": off-topic, a competitor's brand, or wrong intent.

STEP 2 - how to use it ("usages", one or more; empty for new_post/ignore):
- "title_meta": diagnosis "snippet" (page 1 but rarely clicked) - rewrite the page title and meta description to match this search.
- "template": the searcher wants something to download/use (template, example, checklist, calculator, generator...).
- "h2": a distinct sub-topic worth its own section heading.
- "faq": a question people ask.
- "paragraph": a close variant - mention it naturally in existing text.
- "link_text": for assign/hub - other pages should link to this page with these words.
Pick what will actually move clicks. For "snippet" terms, title_meta is almost always first. Don't add h2 for a page that already ranks top 5 for the term unless the content clearly lacks it.

STEP 3 - drafts (fill ONLY the fields for the chosen usages; null otherwise), written for real readers, no keyword stuffing:
- draft_title: the page <title>, MAX ${TITLE_MAX} characters (mobile Google cuts it off beyond that). Include the search term naturally, front-loaded.
- draft_meta: the meta description, MAX ${META_MAX} characters (mobile limit). Say what the reader gets; end with a reason to click.
- draft_h2: the section heading text.
- draft_faq_question / draft_faq_answer: the question, and a direct 40-60 word answer.
- draft_paragraph: one or two sentences that mention the term naturally.
- draft_template: what the template/tool should contain (sections/fields/columns), in one short paragraph.
- anchors: 2-3 natural link texts (2-6 words) for "link_text"; empty otherwise.
Give a one-sentence plain-English "reason" for every term.

For each post in "posts_needing_naturals", also write natural_to_hub (4-8 words a post can use to link to the hub, NOT the hub's exact keyword) and natural_from_hub (4-8 words the hub can use to link to that post, NOT the post's exact keyword).

Count characters carefully: titles over ${TITLE_MAX} or metas over ${META_MAX} characters are rejected. Return every query id exactly once.`;

// Where JSON syntax has leaked into a text field (the model "closed" the string
// with curly quotes and carried on with more fields): `","` (no spaces), `},{`, `"draft_x":`, `": null`.
const LEAKED_JSON = /["“”][,:]["“”{]|\}\s*,\s*\{|["“”]\w+_\w+["“”]\s*:|["“”]\s*:\s*null\b/;

function trimOrNull(s: string | null | undefined): string | null {
  let t = (s ?? "").trim();
  const leak = t.search(LEAKED_JSON);
  if (leak >= 0) t = t.slice(0, leak).replace(/[\s“”",]+$/, "").trim();
  return t.length >= 3 ? t : null;
}

export async function assignQueriesWithClaude(input: {
  clusterName: string;
  /** false = route + options only; drafts are written later by the planning step. Default true. */
  withDrafts?: boolean;
  hub: { title: string; slug: string | null; keyword: string | null };
  posts: AiPost[];
  queries: AiQuery[];
}): Promise<AiResult> {
  const key = claudeKey();
  if (!key) return { ok: false, error: "claude_key is not set." };
  const naturalsWanted = input.posts.filter((p) => p.needsNaturals);
  if (!input.queries.length && !naturalsWanted.length) return { ok: true, assignments: new Map(), naturals: new Map() };

  const client = new Anthropic({ apiKey: key });
  const postRef = new Map<string, string>(); // "P1" -> item id
  const postIdToRef = new Map<string, string>();
  const posts = input.posts.map((p, i) => {
    const ref = `P${i + 1}`;
    postRef.set(ref, p.id);
    postIdToRef.set(p.id, ref);
    return { id: ref, title: p.title, primary_keyword: p.primary, supporting_keywords: p.supporting.slice(0, 15), status: p.live ? "live" : "planned" };
  });

  const assignments = new Map<string, AiAssignment>();
  const naturals = new Map<string, { toHub: string; fromHub: string }>();

  const batches: AiQuery[][] = [];
  for (let i = 0; i < input.queries.length; i += BATCH) batches.push(input.queries.slice(i, i + BATCH));
  if (!batches.length) batches.push([]); // naturals only

  const runBatch = async (batch: AiQuery[], withNaturals: boolean): Promise<string | null> => {
    const queryRef = new Map<string, AiQuery>();
    const queries = batch.map((q, i) => {
      const ref = `Q${i + 1}`;
      queryRef.set(ref, q);
      return {
        id: ref, search_term: q.query, impressions_90d: q.impressions, clicks_90d: q.clicks,
        avg_google_rank: q.position, diagnosis: q.diagnosis,
        currently_shows_up_on: q.rankingPage ? { url: q.rankingPage, title: q.rankingPageTitle } : null,
        fixed: q.fixed ? { action: q.fixed.action, target: q.fixed.targetTitle, keep_usages: q.fixed.usages ?? null } : null,
      };
    });
    const payload = {
      cluster: input.clusterName,
      hub_page: input.hub,
      posts,
      queries,
      posts_needing_naturals: withNaturals ? naturalsWanted.map((p) => postIdToRef.get(p.id)) : [],
    };

    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(OutputSchema) },
      system: input.withDrafts === false
        ? `${SYSTEM}

Drafts are written later by another step that reads the page and Google's top results: skip STEP 3 and set every draft_* field to null (still give anchors and a reason).`
        : SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
    });
    if (response.stop_reason === "refusal") return "Claude declined the request.";
    if (response.stop_reason === "max_tokens") return "Claude's answer was cut off.";
    const parsed = response.parsed_output;
    if (!parsed) return "Claude's answer couldn't be read as JSON.";

    for (const a of parsed.queries) {
      const q = queryRef.get(a.id);
      if (!q) continue;
      let action = a.action;
      let itemId = action === "assign" && a.post ? postRef.get(a.post) ?? null : null;
      if (q.fixed) {
        // Route already decided - keep it; take only options, drafts, anchors.
        action = (["assign", "hub", "new_post", "ignore"].includes(q.fixed.action) ? q.fixed.action : "assign") as AiAssignment["action"];
        itemId = null; // caller keeps the existing item
      } else {
        if (action === "new_post" && q.impressions < NEW_POST_MIN_IMPRESSIONS) action = "ignore";
        if (action === "assign" && !itemId) action = "ignore";
      }
      const used = !q.fixed ? action === "assign" || action === "hub" : !["new_post", "ignore", "unassigned"].includes(q.fixed.action);
      const usages = q.fixed?.usages?.length ? q.fixed.usages : used ? [...new Set(a.usages)] : [];
      assignments.set(q.query, {
        action, itemId, usages,
        anchors: used ? a.anchors.map((s) => s.trim()).filter(Boolean).slice(0, 3) : [],
        reason: a.reason,
        drafts: used ? {
          title: trimOrNull(a.draft_title), meta: trimOrNull(a.draft_meta), h2: trimOrNull(a.draft_h2),
          faqQuestion: trimOrNull(a.draft_faq_question), faqAnswer: trimOrNull(a.draft_faq_answer),
          paragraph: trimOrNull(a.draft_paragraph), template: trimOrNull(a.draft_template),
        } : {},
      });
    }
    if (withNaturals) {
      for (const p of parsed.posts) {
        const id = postRef.get(p.id);
        if (id && p.natural_to_hub && p.natural_from_hub) naturals.set(id, { toHub: p.natural_to_hub.trim(), fromHub: p.natural_from_hub.trim() });
      }
    }
    return null;
  };

  const runAll = async (list: AiQuery[][], naturalsInFirst: boolean): Promise<string | null> => {
    for (let i = 0; i < list.length; i += PARALLEL) {
      const errors = await Promise.all(list.slice(i, i + PARALLEL).map((b, j) => runBatch(b, naturalsInFirst && i + j === 0)));
      const err = errors.find((e) => e);
      if (err) return err;
    }
    return null;
  };

  try {
    const err = await runAll(batches, true);
    if (err) return { ok: false, error: err };

    // A malformed answer can silently drop terms - ask once more for those, in smaller batches.
    const missing = input.queries.filter((q) => !assignments.has(q.query));
    if (missing.length) {
      const retry: AiQuery[][] = [];
      for (let i = 0; i < missing.length; i += RETRY_BATCH) retry.push(missing.slice(i, i + RETRY_BATCH));
      await runAll(retry, false); // best effort: anything still missing is retried on the next refresh
    }

    // Mobile limits: re-ask once for any title/meta that's too long.
    const tooLong = [...assignments.entries()].filter(([, a]) =>
      (a.drafts.title && a.drafts.title.length > TITLE_MAX) || (a.drafts.meta && a.drafts.meta.length > META_MAX));
    if (tooLong.length) {
      const items = tooLong.map(([query, a], i) => ({ id: `S${i + 1}`, search_term: query, title: a.drafts.title, meta: a.drafts.meta }));
      const res = await client.beta.messages.parse({
        model: MODEL,
        max_tokens: 8000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(ShortenSchema) },
        system: `Shorten each title to at most ${TITLE_MAX} characters and each meta description to at most ${META_MAX} characters, keeping the search term and the meaning. Return null for a field that was null. Count characters carefully.`,
        messages: [{ role: "user", content: JSON.stringify(items) }],
      });
      if (res.stop_reason !== "refusal" && res.parsed_output) {
        for (const it of res.parsed_output.items) {
          const idx = Number(it.id.replace(/^S/, "")) - 1;
          const entry = tooLong[idx];
          if (!entry) continue;
          const d = entry[1].drafts;
          if (it.title && it.title.length <= TITLE_MAX) d.title = it.title.trim();
          if (it.meta && it.meta.length <= META_MAX) d.meta = it.meta.trim();
        }
      }
    }
    return { ok: true, assignments, naturals };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "claude_key was rejected (401)." };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "Claude rate limit hit - try again shortly." };
    if (e instanceof Anthropic.APIError) return { ok: false, error: `Claude API error ${e.status ?? ""}: ${e.message}`.slice(0, 300) };
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 300) : "Claude request failed." };
  }
}
