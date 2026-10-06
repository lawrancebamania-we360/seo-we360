"use server";

// Server actions behind the Sample answers tab's HISTORY view: every answer from
// every check, not just the latest (read-only, RLS-scoped). Kept separate from
// lib/actions/ai-visibility-evidence.ts, which owns the latest-check drill-downs
// and the sentiment pass.
//
//   fetchPersonaHistory  one card per persona that was ever asked, counts across
//                        all checks, plus each persona's list of checks.
//   fetchCheckAnswers    one (persona, check): its answers, 25 per page, each with
//                        a snippet and its cited links.

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProjectSectionPermissions } from "@/lib/auth/section-permissions";
import { rateLimit } from "@/lib/security/rate-limit";
import {
  getCheckAnswers, getPersonaHistory,
  type CheckAnswersPage, type PersonaHistory,
} from "@/lib/ai-citation/answer-history";

// Reads only need VIEW on the section (viewers can inspect evidence).
async function authViewer(project_id: string): Promise<{ userId: string } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };
  const perms = await getProjectSectionPermissions(project_id);
  if (!perms.ai_visibility?.view) return { error: "You do not have access to AI visibility for this project." };
  return { userId: user.id };
}

const CATEGORY = z.string().regex(/^[a-z0-9_]{1,60}$/);

const PersonaHistoryInput = z.object({
  project_id: z.string().uuid(),
  category: CATEGORY,
});

export interface PersonaHistoryResult { ok: boolean; error?: string; data?: PersonaHistory }

/** Every persona that was ever asked (any check, active or paused), with counts across all checks. */
export async function fetchPersonaHistory(input: { project_id: string; category: string }): Promise<PersonaHistoryResult> {
  const parsed = PersonaHistoryInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const a = await authViewer(parsed.data.project_id);
  if ("error" in a) return { ok: false, error: a.error };
  if (!(await rateLimit(`aiv-persona-history:${a.userId}`, 30, 60))) {
    return { ok: false, error: "Too many requests. Give it a moment and try again." };
  }
  try {
    const supabase = await createClient(); // RLS-scoped: reads only what the user's org can see
    const data = await getPersonaHistory(supabase, parsed.data.project_id, parsed.data.category);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load the answer history." };
  }
}

const CheckAnswersInput = z.object({
  project_id: z.string().uuid(),
  category: CATEGORY,
  // Exact persona name as listed (not trimmed: it must match the prompt's persona string).
  persona: z.string().min(1).max(160),
  // A run_batch_id, or "d:YYYY-MM-DD" for runs that have none.
  check_key: z.string().regex(/^[A-Za-z0-9:_.-]{1,100}$/),
  offset: z.number().int().min(0).max(100_000).default(0),
});

export interface CheckAnswersResult { ok: boolean; error?: string; data?: CheckAnswersPage }

/** One persona's answers in one check: 25 per page, mentioned first, each with its cited links. */
export async function fetchCheckAnswers(input: {
  project_id: string; category: string; persona: string; check_key: string; offset?: number;
}): Promise<CheckAnswersResult> {
  const parsed = CheckAnswersInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const a = await authViewer(parsed.data.project_id);
  if ("error" in a) return { ok: false, error: a.error };
  // Opening several checks and paging through them is normal use; still bounded.
  if (!(await rateLimit(`aiv-check-answers:${a.userId}`, 120, 60))) {
    return { ok: false, error: "Too many requests. Give it a moment and try again." };
  }
  try {
    const supabase = await createClient();
    const { project_id, category, persona, check_key, offset } = parsed.data;
    const data = await getCheckAnswers(supabase, project_id, category, persona, check_key, offset);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load the answers." };
  }
}
