// Verdict combiner — takes all the scoring step outputs and the brief, and
// produces the hard_fails, soft_fails, issues list, and overall score.
//
// This runs after all the scoring functions complete (plagiarism +
// humanization + quality + LLM compliance). Single source of truth for the
// pass/fail thresholds.

import type {
  DocFetchResult,
  HumanizationResult,
  LlmComplianceResult,
  PlagiarismResult,
  QualityResult,
  VerificationIssue,
} from "@/lib/types/verification";
import { computeOverallScore, computeVerdict } from "@/lib/types/verification";
import type { BlogBrief } from "@/lib/seo-skills/blog-brief";

interface VerdictInput {
  brief: BlogBrief;
  text: string;
  doc: DocFetchResult;
  plagiarism: PlagiarismResult | null;
  humanization: HumanizationResult | null;
  quality: QualityResult | null;
  llm: LlmComplianceResult | null;
  isPage: boolean;     // determines which JSON-LD schemas are required
}

export interface Verdict {
  passed: boolean;
  overall_score: number;
  hard_fails: string[];
  soft_fails: string[];
  issues: VerificationIssue[];
  summary: string;
}

export function combineVerdict(input: VerdictInput): Verdict {
  const { brief, text, doc, plagiarism, humanization, quality, llm, isPage } = input;
  const issues: VerificationIssue[] = [];
  const hard: string[] = [];
  const soft: string[] = [];

  // ============ Doc accessibility ============
  if (!doc.ok) {
    hard.push("doc_not_accessible");
    issues.push({
      severity: "hard",
      category: "doc_access",
      code: "doc_not_accessible",
      message: doc.error === "private_doc"
        ? "Doc isn't accessible. Set sharing to 'Anyone with the link can view'."
        : `Couldn't fetch the doc: ${doc.error ?? "unknown error"}.`,
      suggestion: doc.error === "private_doc"
        ? "Share → General access → 'Anyone with the link', then re-trigger verify."
        : "Check the URL is correct and try again next window.",
    });
    // Stop further checks if the doc didn't load.
    const score = computeOverallScore(hard, soft);
    return {
      passed: false, overall_score: score, hard_fails: hard, soft_fails: soft, issues,
      summary: "Doc not accessible.",
    };
  }

  const lowerText = text.toLowerCase();
  const targetKw = (brief.target_keyword || "").toLowerCase().trim();

  // ============ Target keyword ============
  if (targetKw) {
    const firstParagraph = text.slice(0, 800).toLowerCase();
    if (!firstParagraph.includes(targetKw)) {
      hard.push("kw_missing_in_first_paragraph");
      issues.push({
        severity: "hard",
        category: "keyword",
        code: "kw_missing_in_first_paragraph",
        message: `Target keyword "${brief.target_keyword}" missing from the first paragraph.`,
        suggestion: "Mention the target keyword once in the opening 100 words.",
      });
    }

    // Check H1: first heading-like line in the doc.
    const h1Match = text.match(/^#\s+(.+)$/m) ?? text.match(/^([A-Z][^\n]{5,120})$/m);
    const h1Text = h1Match ? h1Match[1].toLowerCase() : "";
    if (h1Text && !h1Text.includes(targetKw)) {
      // Allow partial match (≥60% token overlap).
      const kwTokens = new Set(targetKw.split(/\s+/).filter((t) => t.length >= 3));
      const h1Tokens = new Set(h1Text.split(/\s+/));
      let overlap = 0;
      for (const t of kwTokens) if (h1Tokens.has(t)) overlap++;
      if (kwTokens.size === 0 || overlap / kwTokens.size < 0.6) {
        hard.push("kw_missing_in_h1");
        issues.push({
          severity: "hard",
          category: "keyword",
          code: "kw_missing_in_h1",
          message: `H1 doesn't contain the target keyword "${brief.target_keyword}".`,
          suggestion: "Rewrite the H1 to lead with the target keyword.",
          evidence: h1Match ? h1Match[1].slice(0, 100) : undefined,
        });
      }
    }
  }

  // ============ Word count ============
  if (quality) {
    if (quality.wordCountPercent < 70) {
      hard.push("word_count_too_low");
      issues.push({
        severity: "hard",
        category: "word_count",
        code: "word_count_too_low",
        message: `Word count is ${quality.wordCount} (${quality.wordCountPercent}% of ${quality.wordCountTarget} target).`,
        suggestion: "Expand by at least " + (quality.wordCountTarget - quality.wordCount) + " words.",
      });
    } else if (quality.wordCountPercent > 150) {
      hard.push("word_count_too_high");
      issues.push({
        severity: "hard",
        category: "word_count",
        code: "word_count_too_high",
        message: `Word count is ${quality.wordCount} (${quality.wordCountPercent}% of target). Likely padded.`,
        suggestion: "Tighten — remove sections that don't earn their place.",
      });
    }

    // ============ Schema blocks ============
    const required = isPage
      ? ["SoftwareApplication", "FAQPage", "BreadcrumbList"]
      : ["Article", "FAQPage", "BreadcrumbList"];
    const missing = required.filter((t) => !quality.jsonLdBlocks.includes(t) && (t !== "Article" || !quality.jsonLdBlocks.some((b) => b === "BlogPosting")));
    if (missing.length > 0) {
      hard.push("schema_missing");
      issues.push({
        severity: "hard",
        category: "schema",
        code: "schema_missing",
        message: `Missing JSON-LD schema: ${missing.join(", ")}.`,
        suggestion: "Add the missing JSON-LD blocks at the end of the doc.",
      });
    }

    // ============ FAQ ============
    if (!quality.hasFaqSection) {
      hard.push("no_faq_section");
      issues.push({
        severity: "hard",
        category: "faq",
        code: "no_faq_section",
        message: "No FAQ section found.",
        suggestion: "Add a '## Frequently Asked Questions' section with 5-7 Q&A pairs from the brief's PAA list.",
      });
    }

    // ============ Soft fails ============
    if (quality.h2Coverage < 0.7) {
      soft.push("h2_coverage_low");
      issues.push({
        severity: "soft",
        category: "headings",
        code: "h2_coverage_low",
        message: `Only ${Math.round(quality.h2Coverage * 100)}% of brief H2s present (${quality.h2Found.length}/${quality.h2Found.length + quality.h2Missing.length}).`,
        suggestion: quality.h2Missing.length > 0 ? `Missing: ${quality.h2Missing.slice(0, 3).join(" · ")}` : undefined,
      });
    }

    if (quality.internalLinks < 3) {
      soft.push("internal_links_low");
      issues.push({
        severity: "soft",
        category: "internal_links",
        code: "internal_links_low",
        message: `Only ${quality.internalLinks} internal links to /solutions, /vs, /alternative, /integrations.`,
        suggestion: "Add at least 3 inline internal links at natural mention points.",
      });
    }

    if (quality.externalCitations < 2) {
      soft.push("external_citations_low");
      issues.push({
        severity: "soft",
        category: "external_citations",
        code: "external_citations_low",
        message: `Only ${quality.externalCitations} external citations.`,
        suggestion: "Cite 2-3 authoritative sources (Wikipedia, gov, industry body) inline.",
      });
    }

    if (!quality.hasTldr) {
      soft.push("no_tldr");
      issues.push({
        severity: "soft",
        category: "compliance",
        code: "no_tldr",
        message: "No TL;DR or answer-capsule in the opening.",
        suggestion: "Add a 2-4 sentence TL;DR blockquote near the top.",
      });
    }

    if (quality.metaTitleLength > 0 && (quality.metaTitleLength < 50 || quality.metaTitleLength > 65)) {
      soft.push("meta_title_length");
      issues.push({
        severity: "soft",
        category: "meta",
        code: "meta_title_length",
        message: `META title is ${quality.metaTitleLength} chars (target 55-60).`,
      });
    }

    if (quality.metaDescriptionLength > 0 && (quality.metaDescriptionLength < 140 || quality.metaDescriptionLength > 170)) {
      soft.push("meta_description_length");
      issues.push({
        severity: "soft",
        category: "meta",
        code: "meta_description_length",
        message: `META description is ${quality.metaDescriptionLength} chars (target 150-160).`,
      });
    }

    if (!quality.hasAuthorByline) {
      soft.push("byline_missing");
      issues.push({
        severity: "soft",
        category: "byline",
        code: "byline_missing",
        message: "No author byline near the top.",
        suggestion: "Add 'By <Name>, <Title>. Last updated: <date>.' under the H1.",
      });
    }

    if (quality.averageParagraphSentences > 5) {
      soft.push("paragraph_too_long");
      issues.push({
        severity: "soft",
        category: "readability",
        code: "paragraph_too_long",
        message: `Average paragraph length is ${quality.averageParagraphSentences} sentences.`,
        suggestion: "Keep paragraphs to 2-4 sentences. Break up walls of text.",
      });
    }

    if (!quality.hasMidPostCta) {
      soft.push("no_mid_post_cta");
      issues.push({
        severity: "soft",
        category: "ctas",
        code: "no_mid_post_cta",
        message: "No mid-post CTA detected.",
        suggestion: "Drop a soft CTA ('Book a demo', 'See We360 in action') around the 60% mark.",
      });
    }
  }

  // ============ Plagiarism ============
  if (plagiarism && plagiarism.matchPercent > 25) {
    hard.push("plagiarism_high");
    const sample = plagiarism.matches.slice(0, 2).map((m) => `"${m.phrase.slice(0, 80)}…"`).join(", ");
    issues.push({
      severity: "hard",
      category: "plagiarism",
      code: "plagiarism_high",
      message: `Plagiarism flagged ${plagiarism.matchesFound} of ${plagiarism.phrasesChecked} sample phrases (${plagiarism.matchPercent}%).`,
      suggestion: "Rewrite flagged phrases in original wording.",
      evidence: sample,
    });
  }

  // ============ Humanization ============
  if (humanization && humanization.score > 60) {
    hard.push("humanization_high");
    issues.push({
      severity: "hard",
      category: "humanization",
      code: "humanization_high",
      message: `Humanization score is ${humanization.score}/100 (high = AI-sounding). Threshold is 60.`,
      suggestion: signalSuggestion(humanization),
      evidence: humanization.flaggedPhrases.slice(0, 3).join(" · ") || undefined,
    });
  } else if (humanization && humanization.score > 45) {
    // Borderline — note as info, not a fail.
    issues.push({
      severity: "info",
      category: "humanization",
      code: "humanization_borderline",
      message: `Humanization score is ${humanization.score}/100. Below the fail threshold of 60 but worth a polish.`,
    });
  }

  // ============ LLM compliance issues (rolled in as-is) ============
  if (llm && llm.ok) {
    for (const issue of llm.issues) {
      issues.push(issue);
      if (issue.severity === "hard" && !hard.includes(issue.code)) hard.push(issue.code);
      if (issue.severity === "soft" && !soft.includes(issue.code)) soft.push(issue.code);
    }
  }

  // ============ Verdict ============
  const overall_score = computeOverallScore(hard, soft);
  const v = computeVerdict(hard, soft);
  const summary = v.passed
    ? `AI verified · score ${overall_score}/100 · ${v.reason}`
    : `Failed · score ${overall_score}/100 · ${hard.length} hard fail${hard.length === 1 ? "" : "s"}, ${soft.length} soft`;

  return {
    passed: v.passed,
    overall_score,
    hard_fails: hard,
    soft_fails: soft,
    issues,
    summary,
  };
}

function signalSuggestion(h: HumanizationResult): string {
  const tips: string[] = [];
  if (h.signals.em_dash_per_100w > 0.5) tips.push("Replace em dashes with periods/commas");
  if (h.signals.rule_of_three_count >= 3) tips.push("Break the 'X, Y, and Z' pattern");
  if (h.signals.ai_vocab_density >= 5) tips.push("Cut overused AI words (testament, pivotal, vibrant)");
  if (h.signals.title_case_headings > 0) tips.push("Switch headings to sentence case");
  if (h.signals.chatbot_artifacts > 0) tips.push("Remove chatbot-style phrasing");
  if (h.signals.sentence_length_variance < 0.4) tips.push("Vary sentence length more");
  return tips.slice(0, 3).join(" · ");
}
