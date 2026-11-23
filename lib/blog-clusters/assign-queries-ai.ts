// Blog Clusters - GSC queries (GC-3): Claude suggests, for each NEW unassigned
// query, which post it belongs to (or hub / new post / ignore), how to use it
// (H2 / FAQ / body) and 2-3 anchor variants; and, for posts that don't have them
// yet, natural anchor phrasings for the post<->hub links.
//
// Uses the dedicated `claude_key` env var (this feature only) and Claude Sonnet
// 5.5 with structured outputs. Server-side refusal fallback is enabled. Server
// only - never import this from a client component.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { NEW_POST_MIN_IMPRESSIONS, type QueryUsage } from "@/lib/types/cluster-gsc";

const MODEL = "claude-sonnet-5-5";
const BATCH = 120; // queries per request

export function claudeKey(): string | null {
  // Env var names are case-sensitive; accept the casings the key may have been saved under.
  return process.env.claude_key || process.env.CLAUDE_KEY || process.env.Claude_Key || null;
}

export interface AiPost { id: string; title: string; primary: string | null; supporting: string[]; live: boolean; needsNaturals: boolean }
export interface AiQuery { query: string; impressions: number; position: number; rankingPage: string | null }
export interface AiAssignment { action: "assign" | "hub" | "new_post" | "ignore"; itemId: string | null; usage: QueryUsage | null; anchors: string[]; reason: string }

export type AiResult =
  | { ok: true; assignments: Map<string, AiAssignment>; naturals: Map<string, { toHub: string; fromHub: string }> }
  | { ok: false; error: string };

const OutputSchema = z.object({
  queries: z.array(z.object({
    id: z.string(),
    action: z.enum(["assign", "hub", "new_post", "ignore"]),
    post: z.string().nullable(),
    usage: z.enum(["h2", "faq", "body"]).nullable(),
    anchors: z.array(z.string()),
    reason: z.string(),
  })),
  posts: z.array(z.object({
    id: z.string(),
    natural_to_hub: z.string(),
    natural_from_hub: z.string(),
  })),
});

const SYSTEM = `You are a senior SEO strategist planning a hub-and-spoke content cluster for a B2B SaaS website.
You receive the cluster's hub page, its posts (P1, P2, ...), and Google Search Console queries (Q1, Q2, ...) the site already gets impressions for.

For EVERY query, decide where it belongs:
- "assign": the post whose topic and search intent fit the query best. Each query has exactly one owner post; prefer the post whose primary keyword it is closest to.
- "hub": the broad head term of the whole cluster topic that belongs on the hub page rather than a single post.
- "new_post": a distinct search intent that no post covers. Only allowed when impressions >= ${NEW_POST_MIN_IMPRESSIONS}.
- "ignore": off-topic, a competitor's brand, or an intent that doesn't fit this cluster (for example a "buy software" query that belongs on a product page).

For "assign" and "hub" also give:
- usage: "faq" for question-form queries; "h2" for a distinct sub-topic worth its own section (generally 100+ impressions); "body" for close variants and synonyms worked into existing text. Keep a post to about 5 H2/FAQ queries at most - use "body" beyond that.
- anchors: 2-3 short anchor-text variants (2-6 words) built from the query, reading naturally in a sentence. Partial-match is good; never stuff keywords.
For "new_post" and "ignore", usage is null and anchors is an empty list.
Give a one-sentence reason for every query.

For each post listed in "posts_needing_naturals", write:
- natural_to_hub: a natural, descriptive 4-8 word phrase that post can use to link to the hub page (NOT the hub's exact keyword).
- natural_from_hub: a natural, descriptive 4-8 word phrase the hub can use to link to that post (NOT the post's exact primary keyword).

Return every query id exactly once, using the ids you were given (Q1, P1, ...).`;

export async function assignQueriesWithClaude(input: {
  clusterName: string;
  hub: { title: string; slug: string | null; keyword: string | null };
  posts: AiPost[];
  queries: AiQuery[];
}): Promise<AiResult> {
  const key = claudeKey();
  if (!key) return { ok: false, error: "claude_key is not set." };
  if (!input.queries.length && !input.posts.some((p) => p.needsNaturals)) {
    return { ok: true, assignments: new Map(), naturals: new Map() };
  }

  const client = new Anthropic({ apiKey: key });
  const postRef = new Map<string, string>(); // "P1" -> item id
  const posts = input.posts.map((p, i) => {
    const ref = `P${i + 1}`;
    postRef.set(ref, p.id);
    return { id: ref, title: p.title, primary_keyword: p.primary, supporting_keywords: p.supporting.slice(0, 15), status: p.live ? "live" : "planned" };
  });
  const naturalsWanted = input.posts.filter((p) => p.needsNaturals).map((p) => posts[input.posts.indexOf(p)].id);

  const assignments = new Map<string, AiAssignment>();
  const naturals = new Map<string, { toHub: string; fromHub: string }>();

  const batches: AiQuery[][] = [];
  for (let i = 0; i < input.queries.length; i += BATCH) batches.push(input.queries.slice(i, i + BATCH));
  if (!batches.length) batches.push([]); // naturals only

  try {
    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      const queryRef = new Map<string, AiQuery>();
      const queries = batch.map((q, i) => {
        const ref = `Q${i + 1}`;
        queryRef.set(ref, q);
        return { id: ref, query: q.query, impressions_90d: q.impressions, avg_position: q.position, currently_ranking_page: q.rankingPage };
      });
      const payload = {
        cluster: input.clusterName,
        hub_page: { title: input.hub.title, slug: input.hub.slug, keyword: input.hub.keyword },
        posts,
        queries,
        posts_needing_naturals: b === 0 ? naturalsWanted : [],
      };

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
      if (response.stop_reason === "max_tokens") return { ok: false, error: "Claude's answer was cut off (too many queries in one batch)." };
      const parsed = response.parsed_output;
      if (!parsed) return { ok: false, error: "Claude's answer couldn't be read as JSON." };

      for (const a of parsed.queries) {
        const q = queryRef.get(a.id);
        if (!q) continue;
        let action = a.action;
        // Enforce the agreed threshold even if the model ignores it.
        if (action === "new_post" && q.impressions < NEW_POST_MIN_IMPRESSIONS) action = "ignore";
        const itemId = action === "assign" && a.post ? postRef.get(a.post) ?? null : null;
        if (action === "assign" && !itemId) action = "ignore";
        assignments.set(q.query, {
          action,
          itemId,
          usage: action === "assign" || action === "hub" ? a.usage ?? "body" : null,
          anchors: action === "assign" || action === "hub" ? a.anchors.map((s) => s.trim()).filter(Boolean).slice(0, 3) : [],
          reason: a.reason,
        });
      }
      for (const p of parsed.posts) {
        const id = postRef.get(p.id);
        if (id && p.natural_to_hub && p.natural_from_hub) naturals.set(id, { toHub: p.natural_to_hub.trim(), fromHub: p.natural_from_hub.trim() });
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
