import type { CheerioAPI } from "cheerio";
import type { Skill, Finding } from "./types";

// AEO = Answer Engine Optimization.
// Scores each page on how well it can win Featured Snippets, People Also Ask,
// and voice-search answers. The existing schema skill catches schema types;
// this skill specifically checks the *shape* of the content.
//
// Signals:
//   1. Direct answer in first 50 words
//   2. Question-based H2s (map to PAA question patterns)
//   3. List / table / HowTo structures (high snippet-win rate)
//   4. FAQPage / HowTo schema in JSON-LD
//   5. Conversational tone vs corporate wall-of-text

const QUESTION_STARTERS = [
  "what", "why", "how", "when", "where", "who", "which",
  "is", "are", "can", "does", "do", "should", "will", "did",
];

function looksLikeQuestion(heading: string): boolean {
  const first = heading.trim().toLowerCase().split(/\s+/)[0] ?? "";
  return heading.trim().endsWith("?") || QUESTION_STARTERS.includes(first);
}

function avgSentenceLength(text: string): number {
  const sents = text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 0);
  if (sents.length === 0) return 0;
  const total = sents.reduce((n, s) => n + s.split(/\s+/).length, 0);
  return total / sents.length;
}

function firstParagraphOfBody($: CheerioAPI): string {
  // Find the main content container and grab the first <p>
  const containers = ["main", "article", "[role='main']", ".post-content", ".entry-content", "#content"];
  for (const sel of containers) {
    const container = $(sel).first();
    if (container.length) {
      const p = container.find("p").first().text().replace(/\s+/g, " ").trim();
      if (p.length > 0) return p;
    }
  }
  return $("p").first().text().replace(/\s+/g, " ").trim();
}

export const aeoSkill: Skill = {
  name: "aeo",
  description: "Answer-engine readiness: direct answers, question headings, lists, FAQ/HowTo schema, conversational tone.",
  pillars: ["AEO"],
  run(ctx) {
    const findings: Finding[] = [];
    const { $, url } = ctx;
    const path = new URL(url).pathname;
    const isArticle = /\/blog|\/news|\/article|\/post|\/guide/.test(path);
    const isHomepage = path === "/";

    // AEO checks only really apply to article-style pages. Homepage is exempt —
    // it's evaluated by the brand / schema skills instead.
    if (isHomepage) return findings;

    // --------------------------------------------------------------
    // 1. Direct answer in first 50 words of the main content
    // --------------------------------------------------------------
    const firstPara = firstParagraphOfBody($);
    const firstParaWords = firstPara.split(/\s+/).filter(Boolean).length;

    if (isArticle) {
      if (firstParaWords === 0) {
        findings.push({
          skill: "aeo", check: "opening_answer", status: "fail",
          pillar: "AEO", priority: "high",
          message: "No visible opening paragraph detected",
          impl: "Open with a 30–50 word self-contained answer right after the H1. Featured snippets pull from here.",
        });
      } else if (firstParaWords < 20) {
        findings.push({
          skill: "aeo", check: "opening_answer", status: "warn",
          pillar: "AEO", priority: "medium",
          message: `Opening paragraph is only ${firstParaWords} words`,
          impl: "Expand the first paragraph to 30–50 words with a direct answer to the page's primary question. This is prime snippet real estate.",
          details: { first_paragraph_words: firstParaWords },
        });
      }
    }

    // --------------------------------------------------------------
    // 2. Question-based H2s — align with PAA patterns
    // --------------------------------------------------------------
    const h2Texts: string[] = [];
    $("h2").each((_, el) => {
      const t = $(el).text().trim();
      if (t) h2Texts.push(t);
    });
    const questionH2s = h2Texts.filter(looksLikeQuestion);
    if (isArticle && h2Texts.length >= 3 && questionH2s.length === 0) {
      findings.push({
        skill: "aeo", check: "question_headings", status: "warn",
        pillar: "AEO", priority: "medium",
        message: "No H2 is phrased as a question",
        impl: "Rewrite 2–3 H2s as questions (e.g. 'How much does tandem skydiving cost?'). Matches People Also Ask patterns that Google surfaces.",
        details: { total_h2s: h2Texts.length, question_h2s: 0 },
      });
    }

    // --------------------------------------------------------------
    // 3. List / table / HowTo structures — big snippet-win rate
    // --------------------------------------------------------------
    const listCount = $("ol, ul").length;
    const tableCount = $("table").length;
    if (isArticle && listCount === 0 && tableCount === 0) {
      findings.push({
        skill: "aeo", check: "scannable_structure", status: "warn",
        pillar: "AEO", priority: "medium",
        message: "No lists or tables — harder for Google to extract a snippet",
        impl: "Add at least one ordered list (steps), unordered list (comparison), or table (price/spec grid). Snippets overwhelmingly come from these.",
      });
    }

    // --------------------------------------------------------------
    // 4. FAQPage / HowTo schema in JSON-LD
    // --------------------------------------------------------------
    const ldJson = $("script[type='application/ld+json']").map((_, el) => $(el).text()).get().join(" ");
    const hasFaq = /"@type"\s*:\s*"FAQPage"/i.test(ldJson);
    const hasHowTo = /"@type"\s*:\s*"HowTo"/i.test(ldJson);

    // Suggest FAQ schema only when the page actually has FAQ-shaped content
    // (question H2s present) — avoids noisy warnings on pure articles.
    if (isArticle && !hasFaq && !hasHowTo && questionH2s.length >= 2) {
      findings.push({
        skill: "aeo", check: "faqpage_schema", status: "missing",
        pillar: "AEO", priority: "medium",
        message: "Page has question-shaped H2s but no FAQPage / HowTo schema",
        impl: "Wrap the Q&A sections in FAQPage JSON-LD. Doubles the chance of appearing in Google's PAA + voice answers.",
      });
    }

    // --------------------------------------------------------------
    // 5. Conversational tone — avg sentence length check
    // --------------------------------------------------------------
    if (isArticle && firstParaWords > 0) {
      const bodyText = $("main p, article p, .post-content p, .entry-content p").text();
      const avg = avgSentenceLength(bodyText || firstPara);
      if (avg > 28) {
        findings.push({
          skill: "aeo", check: "sentence_length", status: "warn",
          pillar: "AEO", priority: "low",
          message: `Average sentence length is ${avg.toFixed(0)} words — too dense for voice answers`,
          impl: "Target 15–20 words per sentence. AI voice assistants read aloud short declarative sentences; long ones get skipped.",
          details: { avg_sentence_words: Math.round(avg) },
        });
      }
    }

    return findings;
  },
};
