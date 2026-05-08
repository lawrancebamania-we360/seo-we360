// Types for the AI verification pipeline.
// Shared between the Vercel side (queue + UI reads), local skill, and
// scoring libraries.

export type AiVerificationStatus =
  | "queued"        // waiting for the worker
  | "running"       // worker picked it up
  | "verified"      // passed (green badge)
  | "failed"        // one or more hard fails (red badge)
  | "doc_missing";  // task moved to Done with no Google Doc URL

export type SourceType = "google_doc" | "live_url";

// One issue surfaced by any of the scoring steps. Renders in the side panel.
export interface VerificationIssue {
  severity: "hard" | "soft" | "info";
  category:
    | "doc_access"
    | "keyword"
    | "word_count"
    | "headings"
    | "internal_links"
    | "external_citations"
    | "schema"
    | "faq"
    | "meta"
    | "byline"
    | "plagiarism"
    | "humanization"
    | "readability"
    | "ctas"
    | "compliance";
  code: string;            // stable code (e.g. "kw_missing_in_h1") for UI grouping
  message: string;         // user-facing
  suggestion?: string;     // optional fix hint
  evidence?: string;       // optional snippet of offending text
}

// ============ Per-step result blobs (stored as JSONB columns) ============

export interface DocFetchResult {
  ok: boolean;
  url: string;
  textLength: number;
  wordCount: number;
  fetchedAt: string;
  error?: string;          // "private_doc" | "404" | "timeout" | ...
}

export interface PlagiarismResult {
  ok: boolean;
  phrasesChecked: number;
  matchesFound: number;
  matchPercent: number;     // 0-100 (matches / phrases)
  matches: Array<{
    phrase: string;
    matchedUrls: string[];  // first 3 hits
  }>;
  searchEngine: "google_pse" | "duckduckgo";
  error?: string;
}

export interface HumanizationResult {
  ok: boolean;
  score: number;             // 0-100, higher = MORE AI-sounding (i.e. more flags)
  signals: {
    em_dash_per_100w: number;
    rule_of_three_count: number;
    ai_vocab_density: number;       // hits per 1000 words
    sentence_length_variance: number; // 0-1, lower = more AI
    title_case_headings: number;
    chatbot_artifacts: number;
  };
  flaggedPhrases: string[];
  error?: string;
}

export interface QualityResult {
  ok: boolean;
  wordCount: number;
  wordCountTarget: number;
  wordCountPercent: number;          // actual / target * 100
  h2Coverage: number;                // 0-1
  h2Found: string[];
  h2Missing: string[];
  internalLinks: number;             // count of /solutions, /vs, /alt, /integrations
  externalCitations: number;         // count of authoritative external links
  jsonLdBlocks: string[];            // ["Article", "FAQPage", "BreadcrumbList"]
  hasMetaTitle: boolean;
  metaTitleLength: number;
  hasMetaDescription: boolean;
  metaDescriptionLength: number;
  hasFaqSection: boolean;
  hasAuthorByline: boolean;
  hasTldr: boolean;
  fleschReadingEase: number;         // 0-100, higher is easier
  averageParagraphSentences: number;
  hasMidPostCta: boolean;
  error?: string;
}

export interface LlmComplianceResult {
  ok: boolean;
  model: string;                     // e.g. "claude-opus-4-7"
  ranAt: string;
  briefAlignment: number;            // 0-100, how well the doc matches the brief
  issues: VerificationIssue[];       // LLM-found issues that the regex couldn't catch
  notes?: string;                    // free-form summary from the LLM
  error?: string;
}

// ============ The verification row as seen by the UI ============

export interface TaskVerification {
  id: string;
  task_id: string;
  status: AiVerificationStatus;
  trigger_status: "review" | "done";
  retry_count: number;
  source_type: SourceType | null;
  source_url: string | null;
  doc_text_length: number | null;
  word_count: number | null;
  doc_fetch_result: DocFetchResult | null;
  plagiarism_result: PlagiarismResult | null;
  humanization_result: HumanizationResult | null;
  quality_result: QualityResult | null;
  llm_compliance_result: LlmComplianceResult | null;
  overall_score: number | null;
  prev_score: number | null;
  hard_fails: string[];
  soft_fails: string[];
  passed: boolean | null;
  issues: VerificationIssue[] | null;
  summary: string | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

// ============ Pass/fail criteria ============
//
// Hard fail = any one fails = card goes red.
// Soft fail = each one is logged; >2 soft fails also flips card red.

export const HARD_FAIL_CODES = [
  "kw_missing_in_h1",
  "kw_missing_in_first_paragraph",
  "word_count_too_low",
  "word_count_too_high",
  "schema_missing",
  "plagiarism_high",
  "humanization_high",
  "no_faq_section",
  "doc_not_accessible",
] as const;

export const SOFT_FAIL_CODES = [
  "h2_coverage_low",
  "internal_links_low",
  "external_citations_low",
  "no_tldr",
  "meta_title_length",
  "meta_description_length",
  "byline_missing",
  "paragraph_too_long",
  "slug_mismatch",
  "no_mid_post_cta",
] as const;

export type HardFailCode = typeof HARD_FAIL_CODES[number];
export type SoftFailCode = typeof SOFT_FAIL_CODES[number];

// Passing rule: zero hard fails AND ≤2 soft fails.
export function computeVerdict(
  hard_fails: string[],
  soft_fails: string[],
): { passed: boolean; reason: string } {
  if (hard_fails.length > 0) {
    return { passed: false, reason: `${hard_fails.length} hard fail${hard_fails.length === 1 ? "" : "s"}` };
  }
  if (soft_fails.length > 2) {
    return { passed: false, reason: `${soft_fails.length} soft fails (>2)` };
  }
  return { passed: true, reason: soft_fails.length === 0 ? "all checks passed" : `${soft_fails.length} soft warning${soft_fails.length === 1 ? "" : "s"}` };
}

// Score is 100 minus weighted penalties. Hard fails cost 25 each (capped 100),
// soft fails cost 5 each. So 1 hard fail floors at 75; 4 hard fails = 0.
// 5 soft fails = 75. Mixed: 1 hard + 3 soft = 60.
export function computeOverallScore(hard_fails: string[], soft_fails: string[]): number {
  const penalty = hard_fails.length * 25 + soft_fails.length * 5;
  return Math.max(0, Math.min(100, 100 - penalty));
}
