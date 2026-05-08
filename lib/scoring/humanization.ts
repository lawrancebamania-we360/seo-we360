// Humanization scoring — DIY detector based on the patterns from the
// humanizer skill but in scoring mode (no editing). Returns a 0–100 score
// where higher = MORE AI-sounding.
//
// Signals (each contributes a weighted penalty):
//   • Em dash density (— per 100 words)
//   • Rule-of-three patterns ("X, Y, and Z")
//   • AI vocabulary words (testament, pivotal, landscape, ...)
//   • Sentence length variance (low variance = AI rhythm)
//   • Title-case headings ("Hero Section" instead of "Hero section")
//   • Chatbot artifacts ("I hope this helps", "Let me know")
//
// Each signal maps to a sub-score 0-100. The overall is a weighted sum.

import type { HumanizationResult } from "@/lib/types/verification";

// Curated from Wikipedia's "Signs of AI writing". These are the words that
// jumped sharply in frequency post-2023 in observed AI output.
const AI_VOCAB = new Set([
  "testament", "pivotal", "landscape", "vibrant", "intricate", "tapestry",
  "underscore", "underscores", "underscoring", "showcase", "showcases", "showcasing",
  "delve", "delves", "delving", "foster", "fosters", "fostering", "garner",
  "garners", "garnering", "interplay", "intricacies", "highlight", "highlights",
  "highlighting", "emphasizing", "emphasises", "enhance", "enhances", "enhancing",
  "facilitate", "facilitates", "facilitating", "leverage", "leverages",
  "leveraging", "groundbreaking", "transformative", "innovative", "innovating",
  "ensure", "ensuring", "ensures", "enduring", "evolving",
  "robust", "seamless", "seamlessly", "comprehensive", "holistic",
  "endeavor", "endeavors", "navigate", "navigates", "navigating",
  "elevate", "elevates", "elevating", "embark",
  "myriad", "plethora", "harness", "harnesses", "harnessing",
  "spearhead", "spearheading", "cornerstone", "linchpin",
  "paradigm", "synergize", "synergy", "synergies",
  "indelible", "deeply rooted", "key turning point", "broader trends",
  "key role", "vital role", "crucial role", "pivotal role",
  "ever-evolving", "ever evolving", "rapidly evolving",
]);

// Phrase-level chatbot tells.
const CHATBOT_PATTERNS: RegExp[] = [
  /\bI hope this helps\b/gi,
  /\bLet me know if\b/gi,
  /\bof course[!,]/gi,
  /\bcertainly[!,]/gi,
  /\byou'?re absolutely right\b/gi,
  /\bgreat question\b/gi,
  /\bwithout further ado\b/gi,
  /\blet'?s dive (in|into)\b/gi,
  /\blet'?s explore\b/gi,
  /\bhere'?s what you need to know\b/gi,
  /\bin (today'?s|the modern) (digital|business|fast-paced)\s/gi,
];

// Rule of three: three coordinated nouns/adjs joined by commas + "and".
// "innovation, inspiration, and industry insights"; "quick, efficient, and reliable".
const RULE_OF_THREE = /\b\w{3,15}, \w{3,15},? and \w{3,15}\b/g;

// Title Case heading: line that begins with markdown #s and has every word
// (with >2 letters) capitalized. "## Hero Section" is title case, "## Hero
// section" is sentence case.
function isTitleCaseHeading(line: string): boolean {
  const m = line.match(/^#{1,6}\s+(.+)$/);
  if (!m) return false;
  const heading = m[1].trim();
  const words = heading.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && w.length > 2);
  if (words.length < 2) return false;
  // Skip headings that are mostly proper nouns / acronyms.
  const titleCased = words.filter((w) => /^[A-Z][a-z]/.test(w) || /^[A-Z]+$/.test(w));
  return titleCased.length >= words.length - 1;
}

export function scoreHumanization(text: string): HumanizationResult {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 50) {
    return {
      ok: true,
      score: 0,
      signals: {
        em_dash_per_100w: 0, rule_of_three_count: 0, ai_vocab_density: 0,
        sentence_length_variance: 1, title_case_headings: 0, chatbot_artifacts: 0,
      },
      flaggedPhrases: [],
    };
  }

  // ------ Em dashes
  const emDashCount = (text.match(/—/g) ?? []).length;
  const emDashPer100 = (emDashCount / wordCount) * 100;

  // ------ Rule of three
  const ruleOfThreeMatches = text.match(RULE_OF_THREE) ?? [];
  const ruleOfThreeCount = ruleOfThreeMatches.length;

  // ------ AI vocabulary
  const lower = text.toLowerCase();
  const tokens = lower.split(/[^a-z']+/).filter(Boolean);
  let aiVocabHits = 0;
  for (const t of tokens) if (AI_VOCAB.has(t)) aiVocabHits++;
  // Also catch multi-word phrases.
  for (const phrase of AI_VOCAB) {
    if (phrase.includes(" ")) {
      const re = new RegExp(`\\b${phrase}\\b`, "gi");
      aiVocabHits += (text.match(re) ?? []).length;
    }
  }
  const aiVocabDensity = (aiVocabHits / wordCount) * 1000;  // hits per 1000 words

  // ------ Sentence length variance
  const sentences = text
    .split(/[.!?]+(?:\s|$)/)
    .map((s) => s.trim().split(/\s+/).filter(Boolean).length)
    .filter((n) => n >= 3);
  let lengthVariance = 1;
  if (sentences.length >= 5) {
    const mean = sentences.reduce((a, b) => a + b, 0) / sentences.length;
    const variance = sentences.reduce((a, b) => a + (b - mean) ** 2, 0) / sentences.length;
    const stddev = Math.sqrt(variance);
    // Coefficient of variation, clamped to [0, 1]. Human writing typically
    // has CV >= 0.4. AI-generated often has CV ~0.2-0.3 (uniform rhythm).
    lengthVariance = Math.min(1, stddev / Math.max(mean, 1));
  }

  // ------ Title-case headings
  const lines = text.split(/\n/);
  const titleCaseHeadings = lines.filter(isTitleCaseHeading).length;

  // ------ Chatbot artifacts
  const flaggedPhrases: string[] = [];
  let chatbotArtifacts = 0;
  for (const re of CHATBOT_PATTERNS) {
    const matches = text.match(re) ?? [];
    chatbotArtifacts += matches.length;
    flaggedPhrases.push(...matches.slice(0, 3));
  }

  // ============ Compose final score ============
  // Each sub-score is 0-100, where 100 = very AI-sounding.
  const emDashSub = Math.min(100, emDashPer100 * 80);                  // 1.25 per 100w → 100
  const rule3Sub = Math.min(100, (ruleOfThreeCount / Math.max(1, wordCount / 500)) * 25);  // ~4 per 500w → 100
  const aiVocabSub = Math.min(100, aiVocabDensity * 10);               // 10 per 1000w → 100
  const varianceSub = Math.max(0, (1 - lengthVariance) * 100);         // CV=0 → 100
  const titleCaseSub = Math.min(100, titleCaseHeadings * 25);          // 4 headings → 100
  const chatbotSub = Math.min(100, chatbotArtifacts * 50);             // 2 artifacts → 100

  // Weighted average (chatbot artifacts and em dashes are the loudest tells).
  const score = Math.round(
    emDashSub    * 0.20 +
    rule3Sub     * 0.10 +
    aiVocabSub   * 0.20 +
    varianceSub  * 0.20 +
    titleCaseSub * 0.10 +
    chatbotSub   * 0.20,
  );

  return {
    ok: true,
    score,
    signals: {
      em_dash_per_100w: round2(emDashPer100),
      rule_of_three_count: ruleOfThreeCount,
      ai_vocab_density: round2(aiVocabDensity),
      sentence_length_variance: round2(lengthVariance),
      title_case_headings: titleCaseHeadings,
      chatbot_artifacts: chatbotArtifacts,
    },
    flaggedPhrases: flaggedPhrases.slice(0, 10),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
