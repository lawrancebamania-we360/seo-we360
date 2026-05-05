import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// Bring-your-own-key keyword suggestions during project creation.
// Takes domain + industry, asks the user's LLM (Claude or OpenAI) for a
// balanced list of high-intent SEO keywords. The API key is used for this
// single request only — never logged or stored.

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({
  provider: z.enum(["claude", "openai"]),
  apiKey: z.string().min(10),
  domain: z.string().min(3),
  industry: z.string().min(2),
  projectName: z.string().optional(),
  supportsMultiLang: z.boolean().optional(),
  count: z.number().int().min(5).max(30).default(12),
});

function buildPrompt(b: z.infer<typeof Body>): string {
  return `You are a senior SEO strategist. Suggest ${b.count} high-intent SEO keywords for a new project.

Project: ${b.projectName ?? b.domain}
Domain: ${b.domain}
Industry: ${b.industry}
${b.supportsMultiLang ? "Multi-language site (en + local languages)" : "Single-language site"}

Return ONLY a JSON array of keyword strings — no commentary, no markdown fencing, no preamble:
["keyword 1", "keyword 2", "keyword 3", ...]

Requirements:
- Total: ${b.count} keywords
- Mix intents roughly equally:
  - ~1/3 informational ("how to X", "what is X", "guide to X", "X tips")
  - ~1/3 commercial ("best X", "top X for Y", "X vs Y", "X review")
  - ~1/3 transactional ("buy X", "X near me", "book X", "X cost", "cheap X")
- Concise: 2-5 words each
- Lowercase
- No branded terms (no competitor names, no "${b.projectName ?? ""}" itself)
- Prefer ones with clear commercial intent and high search volume
- Include at least 2 long-tail variations (4+ words)
- Include at least 1 local-intent keyword ("near me" or location-specific) if the industry is location-based`;
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
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API: ${res.status} ${text.slice(0, 200)}`);
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
      max_tokens: 2000,
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI API: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function parseKeywords(raw: string): string[] {
  // Extract the first JSON array in the response (strip any accidental markdown fencing)
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length >= 2 && s.length <= 80)
      .slice(0, 30);
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  // Require authenticated admin — don't let randos use this endpoint with their own key against our domain.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (profile as { role?: string } | null)?.role;
  if (role !== "super_admin" && role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const prompt = buildPrompt(body);
  try {
    const raw = body.provider === "claude"
      ? await callClaude(body.apiKey, prompt)
      : await callOpenAI(body.apiKey, prompt);
    const keywords = parseKeywords(raw);
    if (keywords.length === 0) {
      return NextResponse.json(
        { error: "Model returned no usable keywords. Try again or add them manually." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, keywords });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "generation failed" },
      { status: 502 }
    );
  }
}
