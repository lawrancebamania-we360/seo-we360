// Topic cluster builder — BYOK microservice.
// Given a seed keyword + industry + (optional) list of existing articles, ask
// the user's Claude or OpenAI key to produce a pillar-and-spoke content plan:
//   - 1 pillar page (the authoritative hub)
//   - 8–12 spoke articles (specific subtopics that link up to the pillar)
//   - internal-linking plan between spokes
//   - coverage scorecard vs. existing articles (what's new, what's already covered)
//   - production roadmap (priority-ordered rollout)
//
// Pure function. No DB writes. No secret storage. Callers persist results.

export type TopicClusterProvider = "claude" | "openai";

export interface TopicClusterSpoke {
  title: string;
  target_keyword: string;
  intent: "informational" | "commercial" | "transactional" | "navigational";
  kd_estimate: "low" | "medium" | "high";
  word_count_target: number;
  outline: string[];                           // H2 list
  reason: string;                              // why this spoke matters for the cluster
  already_covered_by?: { title: string; url: string };
}

export interface TopicClusterLinkRule {
  from: string;                                // spoke title OR "pillar"
  to: string;                                  // spoke title OR "pillar"
  anchor_text: string;
  reason: string;
}

export interface TopicClusterPlan {
  seed_keyword: string;
  pillar: {
    title: string;
    slug_suggestion: string;
    primary_keyword: string;
    h2_outline: string[];
    word_count_target: number;
    summary: string;
  };
  spokes: TopicClusterSpoke[];
  interlinking: TopicClusterLinkRule[];
  coverage: {
    total_spokes: number;
    new_content: number;
    already_covered: number;
    coverage_pct: number;
  };
  roadmap: Array<{
    order: number;
    spoke_title: string;
    rationale: string;
  }>;
  cost_estimate_usd: number;
}

export interface BuildTopicClusterInput {
  seedKeyword: string;
  industry: string | null;
  projectName: string;
  projectDomain: string;
  existingArticles?: Array<{ title: string; url: string; target_keyword?: string | null }>;
  provider: TopicClusterProvider;
  apiKey: string;
}

function prompt(input: BuildTopicClusterInput): string {
  const existing = (input.existingArticles ?? []).slice(0, 40)
    .map((a) => `- ${a.title}${a.target_keyword ? ` (target: ${a.target_keyword})` : ""} — ${a.url}`)
    .join("\n");

  return `You are a senior SEO strategist planning a topic cluster for ${input.projectName} (${input.projectDomain})${input.industry ? ` in ${input.industry}` : ""}.

Seed keyword: ${input.seedKeyword}

${existing ? `Existing articles on the site (DO NOT duplicate these — mark them as already_covered_by):\n${existing}\n` : "The site has no existing articles on this topic yet.\n"}

Produce a pillar-and-spoke content plan. Return ONLY a JSON object — no markdown fencing, no commentary.

Schema:
{
  "pillar": {
    "title": "<authoritative hub title, 8-14 words>",
    "slug_suggestion": "<url-friendly slug>",
    "primary_keyword": "<head term>",
    "h2_outline": ["<H2 section>", ...],
    "word_count_target": 2800,
    "summary": "<2-sentence description of what this pillar covers>"
  },
  "spokes": [
    {
      "title": "<specific subtopic title, 6-12 words>",
      "target_keyword": "<mid/long-tail keyword>",
      "intent": "informational|commercial|transactional|navigational",
      "kd_estimate": "low|medium|high",
      "word_count_target": 1400,
      "outline": ["<H2 section>", ...],
      "reason": "<why this spoke belongs in the cluster>",
      "already_covered_by": {"title": "<existing article title>", "url": "<url>"}   // only if it's already covered
    }
  ],
  "interlinking": [
    {
      "from": "<spoke title OR 'pillar'>",
      "to": "<spoke title OR 'pillar'>",
      "anchor_text": "<exact link text to use>",
      "reason": "<why this link makes sense topically>"
    }
  ],
  "roadmap": [
    {"order": 1, "spoke_title": "<spoke title>", "rationale": "<why ship this first>"}
  ]
}

Requirements:
- Generate exactly 1 pillar
- Generate 8–12 spokes covering the full breadth of "${input.seedKeyword}"
- Mix intents: roughly 50% informational, 30% commercial, 20% transactional
- For each spoke, produce 4–6 H2 outline items
- Interlinking rules: MINIMUM 2 rules per spoke (one up to pillar, one across to a sibling spoke) + the pillar should link to every spoke. Use descriptive anchor text (never "click here").
- Roadmap: order all spokes from first to last based on ranking opportunity (low KD + commercial intent first)
- If an existing article already covers a spoke topic, keep the spoke in the list but set its "already_covered_by" field pointing to the existing article. This flags it as "already handled" instead of dropping it.
- No branded terms in keywords (no "${input.projectName}" or competitor names)
- Keep titles skimmable — they become blog post titles`;
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
      max_tokens: 6000,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
      max_tokens: 6000,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function extractFirstJson(raw: string): unknown {
  // Strip markdown fencing just in case
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Model response did not contain a JSON object");
  return JSON.parse(match[0]);
}

function isSpokeIntent(v: unknown): v is TopicClusterSpoke["intent"] {
  return v === "informational" || v === "commercial" || v === "transactional" || v === "navigational";
}
function isKdBucket(v: unknown): v is TopicClusterSpoke["kd_estimate"] {
  return v === "low" || v === "medium" || v === "high";
}

function normalizeSpoke(raw: Record<string, unknown>): TopicClusterSpoke {
  const covered = raw.already_covered_by as { title?: unknown; url?: unknown } | undefined;
  return {
    title: String(raw.title ?? "").trim(),
    target_keyword: String(raw.target_keyword ?? "").trim().toLowerCase(),
    intent: isSpokeIntent(raw.intent) ? raw.intent : "informational",
    kd_estimate: isKdBucket(raw.kd_estimate) ? raw.kd_estimate : "medium",
    word_count_target: Math.max(600, Math.min(4000, Number(raw.word_count_target) || 1400)),
    outline: Array.isArray(raw.outline) ? raw.outline.map(String).slice(0, 10) : [],
    reason: String(raw.reason ?? "").trim(),
    already_covered_by:
      covered && typeof covered.title === "string" && typeof covered.url === "string"
        ? { title: covered.title, url: covered.url }
        : undefined,
  };
}

function normalizePlan(seed: string, parsed: unknown): TopicClusterPlan {
  const p = parsed as Record<string, unknown>;
  const pillar = (p.pillar ?? {}) as Record<string, unknown>;
  const spokesRaw = Array.isArray(p.spokes) ? p.spokes : [];
  const interlinksRaw = Array.isArray(p.interlinking) ? p.interlinking : [];
  const roadmapRaw = Array.isArray(p.roadmap) ? p.roadmap : [];

  const spokes = spokesRaw
    .map((s) => normalizeSpoke(s as Record<string, unknown>))
    .filter((s) => s.title.length > 0)
    .slice(0, 14);

  const alreadyCovered = spokes.filter((s) => s.already_covered_by).length;

  return {
    seed_keyword: seed,
    pillar: {
      title: String(pillar.title ?? "").trim(),
      slug_suggestion: String(pillar.slug_suggestion ?? "").trim(),
      primary_keyword: String(pillar.primary_keyword ?? seed).trim().toLowerCase(),
      h2_outline: Array.isArray(pillar.h2_outline) ? pillar.h2_outline.map(String).slice(0, 14) : [],
      word_count_target: Math.max(1200, Math.min(6000, Number(pillar.word_count_target) || 2800)),
      summary: String(pillar.summary ?? "").trim(),
    },
    spokes,
    interlinking: interlinksRaw
      .map((r) => {
        const link = r as Record<string, unknown>;
        return {
          from: String(link.from ?? "").trim(),
          to: String(link.to ?? "").trim(),
          anchor_text: String(link.anchor_text ?? "").trim(),
          reason: String(link.reason ?? "").trim(),
        };
      })
      .filter((r) => r.from.length > 0 && r.to.length > 0 && r.anchor_text.length > 0)
      .slice(0, 60),
    coverage: {
      total_spokes: spokes.length,
      new_content: spokes.length - alreadyCovered,
      already_covered: alreadyCovered,
      coverage_pct: spokes.length === 0 ? 0 : Math.round((alreadyCovered / spokes.length) * 100),
    },
    roadmap: roadmapRaw
      .map((r, i) => {
        const row = r as Record<string, unknown>;
        return {
          order: Number(row.order) || i + 1,
          spoke_title: String(row.spoke_title ?? "").trim(),
          rationale: String(row.rationale ?? "").trim(),
        };
      })
      .filter((r) => r.spoke_title.length > 0)
      .sort((a, b) => a.order - b.order)
      .slice(0, 20),
    // Cost estimate: Claude Opus ~$0.015/1k input + $0.075/1k output; GPT-4o ~$0.005+$0.015.
    // One call, ~3-6k tokens out. Both providers land in $0.03-$0.08 range.
    cost_estimate_usd: 0.05,
  };
}

export async function buildTopicCluster(input: BuildTopicClusterInput): Promise<TopicClusterPlan> {
  if (!input.seedKeyword.trim()) throw new Error("seedKeyword required");
  if (input.apiKey.trim().length < 10) throw new Error("apiKey required");

  const p = prompt(input);
  const raw = input.provider === "claude"
    ? await callClaude(input.apiKey, p)
    : await callOpenAI(input.apiKey, p);

  const parsed = extractFirstJson(raw);
  const plan = normalizePlan(input.seedKeyword.trim(), parsed);

  if (plan.spokes.length < 5) {
    throw new Error(`Model returned only ${plan.spokes.length} spokes — try again or pick a broader seed keyword.`);
  }
  if (!plan.pillar.title) {
    throw new Error("Model did not return a valid pillar — try again.");
  }
  return plan;
}
