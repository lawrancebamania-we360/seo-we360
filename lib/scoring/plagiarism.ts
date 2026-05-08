// Plagiarism detection.
//
// Approach: take ~10 distinctive sentences from the article, search each as
// a quoted phrase. If the quoted phrase shows up on a non-We360 domain, that
// phrase is a hit. matchPercent = hits / phrasesChecked.
//
// Search backends:
//   1. Google Programmable Search Engine (free, 100 queries/day across the
//      whole project). Configured via GOOGLE_PSE_API_KEY + GOOGLE_PSE_CX.
//   2. DuckDuckGo HTML scrape (no auth, no quota, but flaky).
//
// We try Google first; on quota error or no key, fall back to DuckDuckGo.

import type { PlagiarismResult } from "@/lib/types/verification";

const PSE_ENDPOINT = "https://www.googleapis.com/customsearch/v1";
const DDG_ENDPOINT = "https://html.duckduckgo.com/html/";

interface PlagiarismInput {
  text: string;
  ignoreDomains?: string[];   // additional domains to treat as own content
  phraseCount?: number;       // default 10
}

export async function checkPlagiarism({
  text,
  ignoreDomains = [],
  phraseCount = 10,
}: PlagiarismInput): Promise<PlagiarismResult> {
  const phrases = pickRepresentativePhrases(text, phraseCount);
  if (phrases.length === 0) {
    return {
      ok: true,
      phrasesChecked: 0,
      matchesFound: 0,
      matchPercent: 0,
      matches: [],
      searchEngine: "google_pse",
    };
  }

  const ownDomainPattern = new RegExp(["we360", ...ignoreDomains].join("|"), "i");

  // Try Google PSE first if configured.
  const apiKey = process.env.GOOGLE_PSE_API_KEY;
  const cx = process.env.GOOGLE_PSE_CX;
  let engine: PlagiarismResult["searchEngine"] = "google_pse";
  let usePse = !!(apiKey && cx);

  const matches: PlagiarismResult["matches"] = [];

  for (const phrase of phrases) {
    let hits: string[] = [];
    if (usePse) {
      try {
        hits = await searchPse(phrase, apiKey!, cx!);
      } catch (e) {
        if (e instanceof Error && /quota|rate/i.test(e.message)) {
          // Quota exceeded → fall back to DDG for the rest.
          usePse = false;
          engine = "duckduckgo";
        }
      }
    }
    if (!usePse) {
      try {
        hits = await searchDuckDuckGo(phrase);
        engine = "duckduckgo";
      } catch {
        hits = [];
      }
    }

    const externalHits = hits.filter((url) => !ownDomainPattern.test(url));
    if (externalHits.length > 0) {
      matches.push({ phrase, matchedUrls: externalHits.slice(0, 3) });
    }

    // Be polite — small delay so neither engine throttles us.
    await sleep(400);
  }

  return {
    ok: true,
    phrasesChecked: phrases.length,
    matchesFound: matches.length,
    matchPercent: Math.round((matches.length / phrases.length) * 100),
    matches,
    searchEngine: engine,
  };
}

// ============ Phrase selection ============
//
// Pick sentences that are 8-20 words long, prefer ones with concrete nouns
// or numbers, avoid generic sentences like "Let's explore this further."

export function pickRepresentativePhrases(text: string, count: number): string[] {
  const sentences = text
    .split(/[.!?]+(?:\s|$)/)
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter((s) => {
      const words = s.split(/\s+/).filter(Boolean);
      return words.length >= 8 && words.length <= 20;
    });

  // Score each: longer is better up to ~16 words, presence of digits or
  // capitalized middle-words boosts (concrete claims).
  const scored = sentences.map((s) => {
    const words = s.split(/\s+/);
    let score = Math.min(words.length, 16);
    if (/\d/.test(s)) score += 5;
    // Capitalized middle words (proper nouns) suggest a concrete claim.
    const middleCaps = words.slice(1, -1).filter((w) => /^[A-Z][a-z]/.test(w)).length;
    score += middleCaps * 2;
    // Penalize generic AI-isms.
    if (/\b(let'?s|consider this|in conclusion|as we'?ve seen|first and foremost)\b/i.test(s)) score -= 10;
    return { s, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // De-duplicate by first 30 chars to avoid picking near-identical sentences.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { s } of scored) {
    const key = s.slice(0, 30).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= count) break;
  }
  return out;
}

// ============ Google Programmable Search ============

async function searchPse(query: string, apiKey: string, cx: string): Promise<string[]> {
  const url = new URL(PSE_ENDPOINT);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", `"${query}"`);
  url.searchParams.set("num", "5");

  const resp = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
  if (!resp.ok) {
    const body = await resp.text();
    if (resp.status === 429 || /quota|exceeded|rateLimitExceeded/i.test(body)) {
      throw new Error(`PSE quota: ${resp.status}`);
    }
    throw new Error(`PSE ${resp.status}: ${body.slice(0, 200)}`);
  }
  const json = await resp.json() as { items?: Array<{ link: string }> };
  return (json.items ?? []).map((it) => it.link);
}

// ============ DuckDuckGo HTML fallback ============

async function searchDuckDuckGo(query: string): Promise<string[]> {
  const body = new URLSearchParams({ q: `"${query}"`, kl: "us-en" });
  const resp = await fetch(DDG_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (compatible; We360-SEO-Verifier/1.0)",
    },
    body: body.toString(),
  });
  if (!resp.ok) throw new Error(`DDG ${resp.status}`);
  const html = await resp.text();

  // DDG result links use a redirect wrapper: //duckduckgo.com/l/?uddg=<encoded>
  const out: string[] = [];
  const linkRe = /href="(?:\/\/duckduckgo\.com\/l\/\?uddg=([^&"]+)|(https?:\/\/[^"]+))"/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    if (m[1]) out.push(decodeURIComponent(m[1]));
    else if (m[2]) out.push(m[2]);
    if (out.length >= 5) break;
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
