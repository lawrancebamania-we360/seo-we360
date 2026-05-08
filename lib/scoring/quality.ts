// Quality scoring — structural and SEO-focused checks.
//
// Inputs: doc text + the brief that was supposed to drive it. Output:
// per-section booleans/numbers that the verdict logic uses to decide
// hard/soft fails.

import type { QualityResult } from "@/lib/types/verification";
import type { BlogBrief } from "@/lib/seo-skills/blog-brief";
import { countWords } from "@/lib/scoring/google-doc";

const INTERNAL_LINK_PATHS = [
  "/solutions",
  "/integrations",
  "/vs",
  "/alternative",
  "/industries",
  "/in/",
];

interface ScoreInput {
  text: string;
  brief: BlogBrief;
  targetKeyword: string;
}

export function scoreQuality({ text, brief, targetKeyword }: ScoreInput): QualityResult {
  try {
    const wordCount = countWords(text);
    const wordCountTarget = brief.word_count_target || 1500;
    const wordCountPercent = Math.round((wordCount / wordCountTarget) * 100);

    // ------ H2 coverage (semantic-ish: lowercased token overlap >= 60%)
    const h2sFound = extractH2s(text);
    const h2Match = matchHeadings(brief.recommended_h2s, h2sFound);
    const h2Coverage = brief.recommended_h2s.length > 0
      ? h2Match.matched.length / brief.recommended_h2s.length
      : 1;

    // ------ Internal links (markdown OR plain `/path` mentions)
    const internalLinks = countInternalLinks(text);

    // ------ External citations (links to non-we360 domains, excluding social)
    const externalCitations = countExternalCitations(text);

    // ------ JSON-LD schema blocks
    const jsonLdBlocks = extractJsonLdTypes(text);

    // ------ META block at top
    const metaBlock = extractMetaBlock(text);

    // ------ FAQ section
    const hasFaqSection = /^#{2,3}\s+(frequently asked questions|faq|faqs)\b/im.test(text);

    // ------ Author byline at top
    const top1000 = text.slice(0, 1000).toLowerCase();
    const hasAuthorByline = /\b(by\s+\w+|author:|published:|last updated:)/.test(top1000);

    // ------ TL;DR / answer-first opener (first 250 chars)
    const opener = text.slice(0, 250).toLowerCase();
    const hasTldr = /tl[;:]?dr|^>\s+\*\*tl|\bin short\b|\bquick answer\b/i.test(opener);

    // ------ Mid-post CTA
    const hasMidPostCta = /book a demo|start free trial|see we360 in action|→\s*\/demo/i.test(text);

    // ------ Flesch reading ease
    const fleschReadingEase = computeFleschReadingEase(text);

    // ------ Average paragraph length
    const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 30 && !p.startsWith("#"));
    const avgParaSentences = paragraphs.length > 0
      ? paragraphs.reduce((acc, p) => acc + (p.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().length > 0).length), 0) / paragraphs.length
      : 0;

    return {
      ok: true,
      wordCount,
      wordCountTarget,
      wordCountPercent,
      h2Coverage: round2(h2Coverage),
      h2Found: h2Match.matched,
      h2Missing: h2Match.missing,
      internalLinks,
      externalCitations,
      jsonLdBlocks,
      hasMetaTitle: metaBlock.hasTitle,
      metaTitleLength: metaBlock.titleLength,
      hasMetaDescription: metaBlock.hasDescription,
      metaDescriptionLength: metaBlock.descriptionLength,
      hasFaqSection,
      hasAuthorByline,
      hasTldr,
      fleschReadingEase: Math.round(fleschReadingEase),
      averageParagraphSentences: round2(avgParaSentences),
      hasMidPostCta,
    };
  } catch (e) {
    return {
      ok: false,
      wordCount: 0,
      wordCountTarget: 0,
      wordCountPercent: 0,
      h2Coverage: 0,
      h2Found: [],
      h2Missing: [],
      internalLinks: 0,
      externalCitations: 0,
      jsonLdBlocks: [],
      hasMetaTitle: false,
      metaTitleLength: 0,
      hasMetaDescription: false,
      metaDescriptionLength: 0,
      hasFaqSection: false,
      hasAuthorByline: false,
      hasTldr: false,
      fleschReadingEase: 0,
      averageParagraphSentences: 0,
      hasMidPostCta: false,
      error: e instanceof Error ? e.message : "scoring_failed",
    };
  }
}

// ============ Helpers ============

function extractH2s(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^##\s+(.+)$/);
    if (m) out.push(m[1].trim());
  }
  // Also catch capitalized lines that look like headings (Google Docs export
  // doesn't always preserve markdown).
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 5 && trimmed.length < 100 &&
        /^[A-Z]/.test(trimmed) &&
        !trimmed.endsWith(".") && !trimmed.endsWith("?") && !trimmed.endsWith(":") &&
        trimmed.split(/\s+/).length >= 2 && trimmed.split(/\s+/).length <= 12) {
      // Heuristic: a heading-looking line. We don't double-count things
      // already in `out`.
      if (!out.includes(trimmed)) out.push(trimmed);
    }
  }
  return out;
}

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3);
}

function matchHeadings(brief: string[], found: string[]): { matched: string[]; missing: string[] } {
  const matched: string[] = [];
  const missing: string[] = [];
  for (const briefH2 of brief) {
    const briefTokens = new Set(tokenize(briefH2));
    if (briefTokens.size === 0) { missing.push(briefH2); continue; }
    let bestOverlap = 0;
    for (const foundH2 of found) {
      const foundTokens = new Set(tokenize(foundH2));
      let overlap = 0;
      for (const t of briefTokens) if (foundTokens.has(t)) overlap++;
      bestOverlap = Math.max(bestOverlap, overlap / briefTokens.size);
    }
    if (bestOverlap >= 0.6) matched.push(briefH2);
    else missing.push(briefH2);
  }
  return { matched, missing };
}

function countInternalLinks(text: string): number {
  let count = 0;
  // Markdown links: [anchor](/path...)
  const mdRe = /\[[^\]]+\]\((\/[^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdRe.exec(text)) !== null) {
    if (INTERNAL_LINK_PATHS.some((p) => m![1].startsWith(p))) count++;
  }
  // Bare paths in text (less reliable — only count if surrounded by spaces or paren)
  for (const path of INTERNAL_LINK_PATHS) {
    const re = new RegExp(`(?:^|[\\s(])${path.replace(/\//g, "\\/")}\\b`, "g");
    const matches = text.match(re) ?? [];
    count += matches.length;
  }
  return count;
}

function countExternalCitations(text: string): number {
  // Markdown links to non-we360 domains, excluding social and shorteners.
  const mdRe = /\[[^\]]+\]\((https?:\/\/[^)]+)\)/g;
  const skip = /(we360|twitter|x\.com|facebook|instagram|linkedin|t\.co|bit\.ly|tinyurl|youtube|youtu\.be|tiktok)/i;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = mdRe.exec(text)) !== null) {
    if (!skip.test(m[1])) count++;
  }
  return count;
}

function extractJsonLdTypes(text: string): string[] {
  const blocks = text.match(/```json[\s\S]*?```/g) ?? [];
  const types: string[] = [];
  for (const b of blocks) {
    const typeMatch = b.match(/"@type"\s*:\s*"([^"]+)"/);
    if (typeMatch) types.push(typeMatch[1]);
  }
  // Also catch raw JSON-LD without code fences.
  const rawTypeMatch = text.matchAll(/"@context"\s*:\s*"https:\/\/schema\.org"[^}]*?"@type"\s*:\s*"([^"]+)"/g);
  for (const m of rawTypeMatch) {
    if (!types.includes(m[1])) types.push(m[1]);
  }
  return types;
}

function extractMetaBlock(text: string): { hasTitle: boolean; titleLength: number; hasDescription: boolean; descriptionLength: number } {
  // The brief asks the AI to put a meta block at the top, formatted like:
  //   META TITLE: <text>
  //   META DESC:  <text>
  const titleMatch = text.match(/META\s+TITLE:\s*(.+)/i);
  const descMatch = text.match(/META\s+(DESC(?:RIPTION)?|DESCRIPTION):\s*(.+)/i);
  return {
    hasTitle: !!titleMatch,
    titleLength: titleMatch ? titleMatch[1].trim().replace(/^[<"']|[>"']$/g, "").length : 0,
    hasDescription: !!descMatch,
    descriptionLength: descMatch ? descMatch[2].trim().replace(/^[<"']|[>"']$/g, "").length : 0,
  };
}

function computeFleschReadingEase(text: string): number {
  // Strip code blocks and headings to focus on prose.
  const prose = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#+\s.*$/gm, "")
    .replace(/^\s*[-*]\s+/gm, "");

  const sentences = prose.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().split(/\s+/).filter(Boolean).length >= 3);
  const words = prose.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  if (sentences.length === 0 || words.length === 0) return 0;

  let syllables = 0;
  for (const w of words) syllables += syllableCount(w);

  const asl = words.length / sentences.length;       // average sentence length
  const asw = syllables / words.length;              // average syllables/word
  return 206.835 - 1.015 * asl - 84.6 * asw;
}

function syllableCount(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  const cleaned = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const vowelGroups = cleaned.match(/[aeiouy]+/g);
  return vowelGroups ? Math.max(1, vowelGroups.length) : 1;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
