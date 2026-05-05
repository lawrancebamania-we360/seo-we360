import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// BYOK E-E-A-T analyzer.
// - Fetches a handful of critical pages (homepage, /about, /authors, /privacy, top article)
// - Sends HTML excerpts to user's Claude or OpenAI key with an E-E-A-T rubric
// - Parses + persists a scored report for the Overview card
// Never logs or stores the API key.

export const runtime = "nodejs";
export const maxDuration = 45;

const Body = z.object({
  provider: z.enum(["claude", "openai"]),
  apiKey: z.string().min(10),
  projectId: z.string().uuid(),
});

const CANDIDATE_PATHS = ["/", "/about", "/about-us", "/authors", "/team", "/privacy", "/contact"];

function makeAbsolute(urlPath: string, domain: string): string {
  const clean = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (urlPath.startsWith("http")) return urlPath;
  return `https://${clean}${urlPath.startsWith("/") ? urlPath : "/" + urlPath}`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPageExcerpt(url: string): Promise<{ url: string; excerpt: string; found: boolean }> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 We360SeoBot/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { url, excerpt: "", found: false };
    const html = await res.text();
    const text = stripHtml(html).slice(0, 2500);
    return { url, excerpt: text, found: text.length > 100 };
  } catch {
    return { url, excerpt: "", found: false };
  }
}

function buildPrompt(projectName: string, industry: string | null, pages: Array<{ url: string; excerpt: string }>): string {
  const pageBlocks = pages.map((p, i) => `---\nPAGE ${i + 1}: ${p.url}\n${p.excerpt}\n`).join("\n");
  return `You are a Google Search Quality Rater evaluating E-E-A-T signals for ${projectName}${industry ? ` (industry: ${industry})` : ""}.

Assess the following pages for E-E-A-T signals. Return ONLY a JSON object — no markdown fencing, no commentary.

${pageBlocks}

Return this exact JSON shape:
{
  "overall_score": 0-100,
  "experience_score": 0-100,
  "expertise_score": 0-100,
  "authoritativeness_score": 0-100,
  "trust_score": 0-100,
  "strengths": [{"signal": "short title", "evidence": "1-sentence quote or observation"}],
  "weaknesses": [{"signal": "short title", "impact": "why this hurts ranking", "fix": "concrete action"}],
  "recommendations": [{"priority": "high|medium|low", "action": "specific thing to do", "reason": "why"}]
}

Scoring rubric:
- experience: first-hand use / original photos / personal stories / real case studies
- expertise: author credentials / qualifications / demonstrated domain depth
- authoritativeness: citations from other sites / mentions / industry recognition / published elsewhere
- trust: HTTPS, privacy policy, contact info, reviews/testimonials, transparent business info, author bios with photos

Be honest. If information is missing (no about page, no author bios, no contact), reflect that in lower trust/authority scores. Keep strengths/weaknesses arrays 2-5 items each. Keep recommendations to 5 max, ordered by priority.`;
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
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(35000),
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
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(35000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

interface ParsedReport {
  overall_score: number;
  experience_score: number;
  expertise_score: number;
  authoritativeness_score: number;
  trust_score: number;
  strengths: Array<{ signal: string; evidence: string }>;
  weaknesses: Array<{ signal: string; impact: string; fix: string }>;
  recommendations: Array<{ priority: "high" | "medium" | "low"; action: string; reason: string }>;
}

function parseReport(raw: string): ParsedReport | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]);
    const clampScore = (x: unknown) => Math.max(0, Math.min(100, Number(x) || 0));
    return {
      overall_score: clampScore(obj.overall_score),
      experience_score: clampScore(obj.experience_score),
      expertise_score: clampScore(obj.expertise_score),
      authoritativeness_score: clampScore(obj.authoritativeness_score),
      trust_score: clampScore(obj.trust_score),
      strengths: Array.isArray(obj.strengths) ? obj.strengths.slice(0, 10) : [],
      weaknesses: Array.isArray(obj.weaknesses) ? obj.weaknesses.slice(0, 10) : [],
      recommendations: Array.isArray(obj.recommendations) ? obj.recommendations.slice(0, 10) : [],
    };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const role = (profile as { role?: string } | null)?.role;
  if (role !== "super_admin" && role !== "admin" && role !== "member") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await request.json()); }
  catch { return NextResponse.json({ error: "invalid body" }, { status: 400 }); }

  const admin = createAdminClient();
  const { data: project } = await admin.from("projects").select("*").eq("id", body.projectId).single();
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  // Fetch candidate pages in parallel; only keep the ones that actually returned content
  const pages = await Promise.all(
    CANDIDATE_PATHS.map((p) => fetchPageExcerpt(makeAbsolute(p, project.domain)))
  );
  const foundPages = pages.filter((p) => p.found);
  if (foundPages.length === 0) {
    return NextResponse.json({ error: "Could not fetch any pages from the domain. Check the domain is reachable." }, { status: 502 });
  }

  const prompt = buildPrompt(project.name, project.industry, foundPages);
  let raw: string;
  try {
    raw = body.provider === "claude"
      ? await callClaude(body.apiKey, prompt)
      : await callOpenAI(body.apiKey, prompt);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI call failed" }, { status: 502 });
  }

  const report = parseReport(raw);
  if (!report) {
    return NextResponse.json({ error: "AI returned an unparseable response. Try again." }, { status: 502 });
  }

  const { data: inserted, error: insErr } = await admin.from("eeat_reports").insert({
    project_id: body.projectId,
    overall_score: report.overall_score,
    experience_score: report.experience_score,
    expertise_score: report.expertise_score,
    authoritativeness_score: report.authoritativeness_score,
    trust_score: report.trust_score,
    strengths: report.strengths,
    weaknesses: report.weaknesses,
    recommendations: report.recommendations,
    analyzed_pages: foundPages.map((p) => ({ url: p.url, length: p.excerpt.length })),
    provider: body.provider,
    generated_by: user.id,
  }).select().single();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, report: inserted });
}
