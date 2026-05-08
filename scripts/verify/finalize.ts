// Finalize a verification: take Claude's brief-compliance JSON, combine
// with the partial scores from prepare.ts, write the final verdict to
// task_verifications and mirror it onto the task row.
//
// Usage:
//   npx tsx scripts/verify/finalize.ts <verification_id> <claude_result_json_path>
//
// The Claude result JSON should match this shape:
//   {
//     "briefAlignment": 82,
//     "issues": [
//       { "severity": "hard"|"soft"|"info", "category": "...", "code": "...",
//         "message": "...", "suggestion?": "...", "evidence?": "..." }
//     ],
//     "notes": "optional 1-2 sentence summary"
//   }

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { readFileSync } from "fs";
import { combineVerdict } from "@/lib/scoring/verdict";
import type {
  HumanizationResult, LlmComplianceResult, PlagiarismResult, QualityResult,
  VerificationIssue, DocFetchResult,
} from "@/lib/types/verification";
import type { BlogBrief } from "@/lib/seo-skills/blog-brief";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);

(async () => {
  const verificationId = process.argv[2];
  const claudeResultPath = process.argv[3];
  if (!verificationId || !claudeResultPath) {
    console.error("Usage: finalize.ts <verification_id> <claude_result_json_path>");
    process.exit(2);
  }

  const claudeRaw = readFileSync(claudeResultPath, "utf-8");
  let claude: { briefAlignment: number; issues: VerificationIssue[]; notes?: string };
  try {
    claude = JSON.parse(claudeRaw);
  } catch (e) {
    console.error("Invalid Claude result JSON:", e);
    process.exit(1);
  }

  // Pull the verification row + the parent task to get the brief.
  const { data: ver } = await admin
    .from("task_verifications")
    .select("*")
    .eq("id", verificationId)
    .single();
  if (!ver) {
    console.error(`Verification ${verificationId} not found`);
    process.exit(1);
  }
  const v = ver as Record<string, unknown> & {
    task_id: string;
    doc_fetch_result: DocFetchResult | null;
    plagiarism_result: PlagiarismResult | null;
    humanization_result: HumanizationResult | null;
    quality_result: QualityResult | null;
    prev_score: number | null;
  };

  const { data: task } = await admin
    .from("tasks")
    .select("brief, task_type")
    .eq("id", v.task_id)
    .single();
  const t = task as { brief: BlogBrief; task_type: string | null } | null;

  if (!t) {
    console.error(`Task ${v.task_id} not found`);
    process.exit(1);
  }

  const isPage = ((t.task_type ?? "") as string).includes("Page");

  // Build the LLM result blob from Claude's JSON.
  const llmResult: LlmComplianceResult = {
    ok: true,
    model: "claude-via-claude-code-skill",
    ranAt: new Date().toISOString(),
    briefAlignment: claude.briefAlignment,
    issues: claude.issues ?? [],
    notes: claude.notes,
  };

  // Combine all signals into the final verdict.
  const verdict = combineVerdict({
    brief: t.brief ?? ({} as BlogBrief),
    text: "",   // text isn't needed for verdict combination — already scored
    doc: v.doc_fetch_result as DocFetchResult,
    plagiarism: v.plagiarism_result,
    humanization: v.humanization_result,
    quality: v.quality_result,
    llm: llmResult,
    isPage,
  });

  const score = verdict.overall_score;
  const prev = v.prev_score;
  const delta = prev !== null && prev !== undefined ? score - prev : null;

  const { error: verUpdErr } = await admin
    .from("task_verifications")
    .update({
      status: verdict.passed ? "verified" : "failed",
      llm_compliance_result: llmResult as unknown as object,
      passed: verdict.passed,
      overall_score: score,
      hard_fails: verdict.hard_fails,
      soft_fails: verdict.soft_fails,
      issues: verdict.issues as unknown as object,
      summary: verdict.summary,
      completed_at: new Date().toISOString(),
    })
    .eq("id", verificationId);
  if (verUpdErr) {
    console.error("Failed to update verification:", verUpdErr);
    process.exit(1);
  }

  // Mirror onto the task for fast UI reads.
  const { error: taskUpdErr } = await admin
    .from("tasks")
    .update({
      ai_verification_status: verdict.passed ? "verified" : "failed",
      ai_verified_at: new Date().toISOString(),
      ai_score: score,
      ai_score_delta: delta,
      ai_verification_summary: verdict.summary,
      verified_by_ai: verdict.passed,
    })
    .eq("id", v.task_id);
  if (taskUpdErr) {
    console.error("Failed to update task:", taskUpdErr);
    process.exit(1);
  }

  console.log(JSON.stringify({
    ok: true,
    verdict: {
      passed: verdict.passed,
      score,
      prev_score: prev,
      delta,
      hard_fails: verdict.hard_fails.length,
      soft_fails: verdict.soft_fails.length,
      issues: verdict.issues.length,
      summary: verdict.summary,
    },
  }, null, 2));
})().catch((e) => {
  console.error("Crash:", e);
  process.exit(1);
});
