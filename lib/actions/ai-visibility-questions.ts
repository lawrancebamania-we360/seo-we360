"use server";

// Server actions for the per-question Source Tracker (the "By question" view of
// the AI-Visibility Answers tab).
//
// All three are pure DB work - no engine calls, no LLM, no credits. The share
// numbers are derived from runs that already happened (see
// lib/ai-citation/question-tracker.ts), so nothing here can spend money.
//
// Kept SEPARATE from lib/actions/ai-visibility.ts (the run pipeline) and
// ai-visibility-evidence.ts (the trust surfaces), matching how those two were
// already split by workstream.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProjectSectionPermissions } from "@/lib/auth/section-permissions";
import { rateLimit } from "@/lib/security/rate-limit";
import { getQuestionHistory, normDomain, type QuestionHistory } from "@/lib/ai-citation/question-tracker";

// Reads need VIEW (a viewer may inspect the history); the two writes change
// tracked state, so they need EDIT - the same split as ai-visibility-evidence.ts.
async function authViewer(project_id: string): Promise<{ userId: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };
  const perms = await getProjectSectionPermissions(project_id);
  if (!perms.ai_visibility?.view) return { error: "You do not have access to AI visibility for this project." };
  return { userId: user.id };
}

async function authManager(project_id: string): Promise<{ userId: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };
  const perms = await getProjectSectionPermissions(project_id);
  if (!perms.ai_visibility?.edit) return { error: "You do not have permission to manage AI visibility for this project." };
  return { userId: user.id };
}

/** The prompt must belong to the project the caller was authorized against -
 *  otherwise a valid session on project A could edit project B's questions. */
async function assertPromptInProject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  project_id: string,
  prompt_id: string,
): Promise<boolean> {
  const { data } = await supabase.from("ai_citation_prompts")
    .select("id").eq("id", prompt_id).eq("project_id", project_id).maybeSingle();
  return !!data;
}

const HistoryInput = z.object({
  project_id: z.string().uuid(),
  prompt_id: z.string().uuid(),
});

export interface QuestionHistoryResult { ok: boolean; error?: string; history?: QuestionHistory }

/** Full check-in history for ONE question: per-check-in source shares, whether
 *  the watched brand was cited, and what drove it. Lazy (on expand) and bounded
 *  to a single prompt, so it stays cheap however long the history gets. */
export async function fetchQuestionHistory(input: { project_id: string; prompt_id: string }): Promise<QuestionHistoryResult> {
  const parsed = HistoryInput.parse(input);
  const a = await authViewer(parsed.project_id);
  if ("error" in a) return { ok: false, error: a.error };
  if (!(await rateLimit(`aiv-qhistory:${a.userId}`, 60, 60))) {
    return { ok: false, error: "Too many requests. Give it a moment and try again." };
  }
  try {
    const supabase = await createClient(); // RLS-scoped
    const history = await getQuestionHistory(supabase, parsed.project_id, parsed.prompt_id);
    if (!history) return { ok: false, error: "That question is no longer available." };
    return { ok: true, history };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load the question history." };
  }
}

const BrandInput = z.object({
  project_id: z.string().uuid(),
  prompt_id: z.string().uuid(),
  // null = watch the project's own brand (the default).
  competitor_id: z.string().uuid().nullable(),
});

export interface SetBrandResult { ok: boolean; error?: string }

/**
 * Point a question at the brand whose citation presence it watches: the
 * project's own brand (null) or one of its tracked competitors.
 *
 * Restricted to TRACKED competitors on purpose - those are the only brands
 * already detected in the stored answers, so any other value would leave the
 * "Cited?" column permanently unknowable. Because detection already happened,
 * switching re-reads the entire existing history rather than needing a re-run.
 */
export async function setQuestionBrandOfInterest(input: {
  project_id: string; prompt_id: string; competitor_id: string | null;
}): Promise<SetBrandResult> {
  const parsed = BrandInput.parse(input);
  const a = await authManager(parsed.project_id);
  if ("error" in a) return { ok: false, error: a.error };
  if (!(await rateLimit(`aiv-qbrand:${a.userId}`, 30, 60))) {
    return { ok: false, error: "Too many requests. Give it a moment and try again." };
  }

  const supabase = await createClient();
  if (!(await assertPromptInProject(supabase, parsed.project_id, parsed.prompt_id))) {
    return { ok: false, error: "That question is not part of this project." };
  }
  // A competitor from ANOTHER project would pass the FK but be meaningless here
  // (and would leak its name into this project's UI), so verify ownership.
  if (parsed.competitor_id) {
    const { data: comp } = await supabase.from("competitors")
      .select("id").eq("id", parsed.competitor_id).eq("project_id", parsed.project_id).maybeSingle();
    if (!comp) return { ok: false, error: "That competitor is not tracked on this project." };
  }

  const { error } = await supabase.from("ai_citation_prompts")
    .update({ brand_of_interest_competitor_id: parsed.competitor_id })
    .eq("id", parsed.prompt_id).eq("project_id", parsed.project_id);
  if (error) {
    // The column does not exist until migration 20260722000001 is applied.
    return { ok: false, error: /column|schema cache/i.test(error.message)
      ? "Brand-of-interest needs migration 20260722000001 applied in Supabase first."
      : error.message };
  }

  revalidatePath("/dashboard/ai-visibility");
  return { ok: true };
}

const FlagInput = z.object({
  project_id: z.string().uuid(),
  prompt_id: z.string().uuid(),
  source_domain: z.string().min(1).max(255),
  // null clears the flag.
  flag: z.enum(["double_down", "declining"]).nullable(),
  note: z.string().max(500).nullable().optional(),
});

export interface SetFlagResult { ok: boolean; error?: string }

/** Record (or clear) the manual "double down" / "declining" judgement on one
 *  source for one question. The trend is computed; the call on it is not. */
export async function setQuestionSourceFlag(input: {
  project_id: string; prompt_id: string; source_domain: string;
  flag: "double_down" | "declining" | null; note?: string | null;
}): Promise<SetFlagResult> {
  const parsed = FlagInput.parse(input);
  const a = await authManager(parsed.project_id);
  if ("error" in a) return { ok: false, error: a.error };
  if (!(await rateLimit(`aiv-qflag:${a.userId}`, 60, 60))) {
    return { ok: false, error: "Too many requests. Give it a moment and try again." };
  }

  // Store the domain in the SAME canonical form the read layer keys on, or the
  // flag would never match its row in the table.
  const domain = normDomain(parsed.source_domain);
  if (!domain) return { ok: false, error: "That is not a valid source domain." };

  const supabase = await createClient();
  if (!(await assertPromptInProject(supabase, parsed.project_id, parsed.prompt_id))) {
    return { ok: false, error: "That question is not part of this project." };
  }

  const missingTable = (msg: string) =>
    /does not exist|schema cache|relation/i.test(msg)
      ? "Source flags need migration 20260722000001 applied in Supabase first."
      : msg;

  if (parsed.flag === null) {
    const { error } = await supabase.from("ai_citation_question_flags")
      .delete().eq("prompt_id", parsed.prompt_id).eq("source_domain", domain);
    if (error) return { ok: false, error: missingTable(error.message) };
  } else {
    const { error } = await supabase.from("ai_citation_question_flags")
      .upsert({
        project_id: parsed.project_id,
        prompt_id: parsed.prompt_id,
        source_domain: domain,
        flag: parsed.flag,
        note: parsed.note ?? null,
        created_by: a.userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "prompt_id,source_domain" });
    if (error) return { ok: false, error: missingTable(error.message) };
  }

  revalidatePath("/dashboard/ai-visibility");
  return { ok: true };
}
