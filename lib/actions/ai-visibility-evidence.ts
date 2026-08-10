"use server";

// Server actions for the AI-Visibility trust features: paged answer evidence +
// full transcripts behind every clickable number (read-only, RLS-scoped), and
// the bounded post-hoc brand-sentiment pass (owner/admin, metered, locked).
// Kept SEPARATE from lib/actions/ai-visibility.ts on purpose - the run pipeline
// and its actions are owned by another workstream.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProjectSectionPermissions } from "@/lib/auth/section-permissions";
import { withCronLock } from "@/lib/auth/cron";
import { gateOrgForProject } from "@/lib/billing/gate";
import { rateLimit } from "@/lib/security/rate-limit";
import { estimateAiCostCents } from "@/lib/billing/ai-pricing";
import {
  getAnswerEvidence, getAnswerTranscript,
  type AnswerTranscript, type EvidencePage,
} from "@/lib/ai-citation/evidence";
import {
  classifyBatchSentiment,
  SENTIMENT_BATCH_SIZE, SENTIMENT_MAX_PER_INVOCATION,
  SENTIMENT_EST_INPUT_TOKENS, SENTIMENT_EST_OUTPUT_TOKENS,
} from "@/lib/ai-citation/sentiment";

// Reads only need VIEW on the section (viewers can inspect evidence); the
// sentiment pass spends credits and writes rows, so it needs EDIT.
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

const FilterSchema = z.object({
  engine: z.string().max(40).optional(),
  persona: z.string().max(160).optional(),
  topic: z.string().max(160).optional(),
  stage: z.enum(["awareness", "consideration", "decision", "trust"]).optional(),
  competitor: z.string().max(200).optional(),
  mentioned: z.boolean().optional(),
  cited: z.boolean().optional(),
  sentiment: z.enum(["recommended", "with_caveats", "dismissed"]).optional(),
});

const EvidenceInput = z.object({
  project_id: z.string().uuid(),
  page: z.number().int().min(0).max(500).default(0),
  filter: FilterSchema.default({}),
});

export interface EvidenceResult { ok: boolean; error?: string; page?: EvidencePage }

/** Paged answer list for a clicked report slice (latest run batch). */
export async function fetchAiVisibilityEvidence(input: {
  project_id: string; page?: number; filter?: z.infer<typeof FilterSchema>;
}): Promise<EvidenceResult> {
  const parsed = EvidenceInput.parse(input);
  const a = await authViewer(parsed.project_id);
  if ("error" in a) return { ok: false, error: a.error };
  // Light throttle: paging is cheap but unbounded clicking shouldn't hammer the DB.
  if (!(await rateLimit(`aiv-evidence:${a.userId}`, 60, 60))) {
    return { ok: false, error: "Too many requests. Give it a moment and try again." };
  }
  try {
    const supabase = await createClient(); // RLS-scoped: reads only what the user's org can see
    const page = await getAnswerEvidence(supabase, parsed.project_id, parsed.filter, parsed.page);
    return { ok: true, page };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load the answers." };
  }
}

const TranscriptInput = z.object({ project_id: z.string().uuid(), run_id: z.string().uuid() });

export interface TranscriptResult { ok: boolean; error?: string; transcript?: AnswerTranscript }

/** One answer's full stored transcript + sources + names to highlight. */
export async function fetchAiVisibilityTranscript(input: { project_id: string; run_id: string }): Promise<TranscriptResult> {
  const parsed = TranscriptInput.parse(input);
  const a = await authViewer(parsed.project_id);
  if ("error" in a) return { ok: false, error: a.error };
  if (!(await rateLimit(`aiv-transcript:${a.userId}`, 60, 60))) {
    return { ok: false, error: "Too many requests. Give it a moment and try again." };
  }
  try {
    const supabase = await createClient();
    const transcript = await getAnswerTranscript(supabase, parsed.project_id, parsed.run_id);
    if (!transcript) return { ok: false, error: "That answer is no longer available." };
    return { ok: true, transcript };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load the transcript." };
  }
}

const ProjectInput = z.object({ project_id: z.string().uuid() });

export interface ClassifySentimentResult {
  ok: boolean;
  error?: string;
  classified?: number;
  /** Eligible rows still unclassified (another trigger will pick them up). */
  remaining?: number;
}

/**
 * Bounded post-hoc sentiment pass over the latest batch's brand-mention answers.
 * Fired lazily when the report loads (fire-and-forget) or via a button. Metered
 * through the org budget gate; per-project lock so concurrent tabs cannot
 * double-classify; the SQL "sentiment IS NULL" guards make retries idempotent.
 */
export async function classifyAnswerSentiment(input: { project_id: string }): Promise<ClassifySentimentResult> {
  const { project_id } = ProjectInput.parse(input);
  const a = await authManager(project_id);
  if ("error" in a) return { ok: false, error: a.error };

  if (!(await rateLimit(`aiv-sentiment:${a.userId}:${project_id}`, 4, 60))) {
    return { ok: false, error: "Too many requests. Give it a moment and try again." };
  }

  const admin = createAdminClient();
  const gate = await gateOrgForProject(admin, project_id);
  // Worst case per invocation: ceil(cap / batch) gpt-4o-mini calls (~fractions of
  // a cent each). Reserve that; record the actual calls made.
  const maxCalls = Math.ceil(SENTIMENT_MAX_PER_INVOCATION / SENTIMENT_BATCH_SIZE);
  const perCallCents = estimateAiCostCents("gpt-4o-mini", SENTIMENT_EST_INPUT_TOKENS, SENTIMENT_EST_OUTPUT_TOKENS);
  if (gate) {
    const check = await gate.can({ kind: "ai_call", estimated_cost_cents: Math.max(1, perCallCents * maxCalls), model: "gpt-4o-mini" });
    if (!check.allowed) return { ok: false, error: check.reason ?? "Out of AI credits." };
  }

  try {
    const locked = await withCronLock(`aiv-sentiment:${project_id}`, 90, () => classifyBatchSentiment(admin, project_id));
    if ((locked as { skipped?: string } | null)?.skipped === "locked") {
      // Another tab/request is already classifying; nothing spent here.
      if (gate) { try { await gate.release(); } catch { /* best-effort refund */ } }
      return { ok: true, classified: 0, remaining: 0 };
    }
    const result = locked as Awaited<ReturnType<typeof classifyBatchSentiment>>;
    if (gate) {
      if (result.llmCalls > 0) {
        await gate.record({
          kind: "ai_call", feature: "ai_citation_sentiment",
          cost_cents: Math.max(1, perCallCents * result.llmCalls), user_id: a.userId,
        });
      } else {
        try { await gate.release(); } catch { /* nothing ran - refund the reservation */ }
      }
    }
    if (result.classified > 0) revalidatePath("/dashboard/ai-visibility");
    return { ok: true, classified: result.classified, remaining: result.remaining };
  } catch (e) {
    if (gate) { try { await gate.release(); } catch { /* best-effort refund */ } }
    return { ok: false, error: e instanceof Error ? e.message : "Sentiment classification failed." };
  }
}
