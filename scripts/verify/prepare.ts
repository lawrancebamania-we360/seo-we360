// Prepare a single verification: fetch the doc, run all the non-LLM
// scoring (plagiarism, humanization, quality), mark the row as running,
// and emit a JSON payload that Claude can analyze for brief compliance.
//
// Usage:
//   npx tsx scripts/verify/prepare.ts <verification_id>
//
// Output (stdout): JSON with everything the LLM needs to write the
// brief-compliance verdict. The `partial_scores` block is also persisted
// to the verification row so finalize.ts can combine it later.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { fetchGoogleDocFull, fetchLiveUrlText } from "@/lib/scoring/google-doc";
import { scoreHumanization } from "@/lib/scoring/humanization";
import { scoreQuality } from "@/lib/scoring/quality";
import { checkPlagiarism } from "@/lib/scoring/plagiarism";
import type { BlogBrief } from "@/lib/seo-skills/blog-brief";

config({ path: ".env.local" });
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
);

(async () => {
  const verificationId = process.argv[2];
  if (!verificationId) {
    console.error("Usage: prepare.ts <verification_id>");
    process.exit(2);
  }

  // ---- 1. Pull verification + parent task
  const { data: ver } = await admin
    .from("task_verifications")
    .select("*")
    .eq("id", verificationId)
    .single();
  if (!ver) {
    console.error(`Verification ${verificationId} not found`);
    process.exit(1);
  }
  const v = ver as Record<string, unknown> & { task_id: string; source_url: string | null; source_type: string | null; trigger_status: string };

  const { data: task } = await admin
    .from("tasks")
    .select("*")
    .eq("id", v.task_id)
    .single();
  if (!task) {
    console.error(`Task ${v.task_id} not found`);
    process.exit(1);
  }
  const t = task as Record<string, unknown> & { brief: BlogBrief; target_keyword: string | null; kind: string; task_type: string | null };

  // Mark as running so the UI shows the spinner.
  await admin
    .from("task_verifications")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", verificationId);
  await admin
    .from("tasks")
    .update({ ai_verification_status: "running", ai_verification_summary: "Verifying now…" })
    .eq("id", v.task_id);

  if (!v.source_url) {
    // No doc URL — already flagged as doc_missing at enqueue time, but
    // belt-and-braces here: re-detect if the writer added a doc since.
    const supportingLinks = (t.brief && (t.brief as unknown as { supporting_links?: string[] }).supporting_links) ?? [];
    const docLink = (Array.isArray(supportingLinks) ? supportingLinks : []).find((l: string) => /docs\.google\.com/i.test(l));
    if (!docLink) {
      await markDocMissing(verificationId, v.task_id);
      console.log(JSON.stringify({ ok: false, error: "doc_missing" }));
      return;
    }
  }

  // ---- 2. Fetch the source content
  const isPage = ((t.task_type ?? "") as string).includes("Page") || ((t.task_type ?? "") as string).includes("Page");
  const isLive = v.source_type === "live_url";
  const fetchOut = isLive
    ? await fetchLiveUrlText(v.source_url ?? "")
    : await fetchGoogleDocFull(v.source_url ?? "");
  const text = (fetchOut as { text: string }).text;
  const meta = (fetchOut as { meta: ReturnType<typeof fetchGoogleDocFull> extends Promise<infer R> ? R extends { meta: infer M } ? M : never : never }).meta;

  // Save fetch result into the row immediately (so retry logic has a record).
  await admin
    .from("task_verifications")
    .update({
      doc_fetch_result: meta as unknown as object,
      doc_text_length: (meta as unknown as { textLength: number }).textLength,
      word_count: (meta as unknown as { wordCount: number }).wordCount,
    })
    .eq("id", verificationId);

  if (!(meta as unknown as { ok: boolean }).ok) {
    // Doc not reachable — write a doc-not-accessible failure verdict and
    // stop. finalize.ts is not needed for this case.
    await admin
      .from("task_verifications")
      .update({
        status: "failed",
        passed: false,
        overall_score: 0,
        hard_fails: ["doc_not_accessible"],
        soft_fails: [],
        issues: [
          {
            severity: "hard",
            category: "doc_access",
            code: "doc_not_accessible",
            message: (meta as unknown as { error?: string }).error === "private_doc"
              ? "Doc isn't accessible. Set sharing to 'Anyone with the link can view'."
              : `Couldn't fetch the doc: ${(meta as unknown as { error?: string }).error ?? "unknown error"}.`,
            suggestion: "Open the doc → Share → Anyone with the link → Viewer.",
          },
        ],
        summary: "Doc not accessible.",
        completed_at: new Date().toISOString(),
        error_message: (meta as unknown as { error?: string }).error ?? null,
      })
      .eq("id", verificationId);
    await admin
      .from("tasks")
      .update({
        ai_verification_status: "failed",
        ai_verified_at: new Date().toISOString(),
        ai_score: 0,
        ai_verification_summary: "Doc not accessible — fix sharing and re-verify.",
      })
      .eq("id", v.task_id);
    console.log(JSON.stringify({ ok: false, error: "doc_unreachable" }));
    return;
  }

  // ---- 3. Run non-LLM scoring in parallel
  const brief = (t.brief ?? {}) as BlogBrief;
  const targetKw = (t.target_keyword ?? brief.target_keyword ?? "").toString();

  const [plagiarism, humanization, quality] = await Promise.all([
    checkPlagiarism({ text, ignoreDomains: ["we360"] }),
    Promise.resolve(scoreHumanization(text)),
    Promise.resolve(scoreQuality({ text, brief, targetKeyword: targetKw })),
  ]);

  // Persist the partial scores so finalize.ts can read them again.
  await admin
    .from("task_verifications")
    .update({
      plagiarism_result: plagiarism as unknown as object,
      humanization_result: humanization as unknown as object,
      quality_result: quality as unknown as object,
    })
    .eq("id", verificationId);

  // ---- 4. Pull live url_metrics for this task's URL so the AI can check
  //         the draft against what the page is actually doing in GSC + GA4
  //         right now. Only relevant for Update tasks (those have a real
  //         live URL); skipped for net-new content.
  const taskUrl = (t as unknown as { url: string | null; published_url: string | null }).url
                  ?? (t as unknown as { published_url: string | null }).published_url;
  let urlMetrics: Array<Record<string, unknown>> = [];
  if (taskUrl && taskUrl.startsWith("http")) {
    const { data: metricsData } = await admin
      .from("url_metrics_latest")
      .select("period, gsc_clicks, gsc_impressions, gsc_ctr, gsc_position, gsc_top_queries, ga_sessions, ga_engagement_rate, ga_avg_engagement_time")
      .eq("project_id", (t as unknown as { project_id: string }).project_id)
      .eq("url", taskUrl)
      .order("period");
    urlMetrics = (metricsData ?? []) as Array<Record<string, unknown>>;
  }

  // ---- 5. Emit the prompt payload for Claude to analyze
  const payload = {
    verification_id: verificationId,
    task_id: v.task_id,
    is_page: isPage,
    trigger_status: v.trigger_status,
    target_keyword: targetKw,
    brief,
    partial_scores: { plagiarism, humanization, quality },
    doc_meta: meta,
    doc_text: text,
    // Live metrics — empty array for new-content tasks, populated for
    // Update tasks whose URL we already track in url_metrics.
    url: taskUrl,
    url_metrics: urlMetrics,
  };

  console.log(JSON.stringify(payload));
})().catch((e) => {
  console.error("Crash:", e);
  process.exit(1);
});

async function markDocMissing(verificationId: string, taskId: string): Promise<void> {
  await admin
    .from("task_verifications")
    .update({
      status: "doc_missing",
      passed: false,
      hard_fails: ["doc_not_accessible"],
      issues: [
        {
          severity: "hard",
          category: "doc_access",
          code: "doc_not_accessible",
          message: "No Google Doc URL found in Supporting links.",
          suggestion: "Paste the article's Google Doc URL into Supporting links, then re-trigger.",
        },
      ],
      summary: "Doc link missing — paste a Google Doc URL into Supporting links.",
      completed_at: new Date().toISOString(),
    })
    .eq("id", verificationId);
  await admin
    .from("tasks")
    .update({
      ai_verification_status: "doc_missing",
      ai_verification_summary: "Doc link missing — paste a Google Doc URL into Supporting links.",
    })
    .eq("id", taskId);
}
