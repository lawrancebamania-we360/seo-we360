// Pure text segmentation for the transcript viewer: split an AI answer into
// plain / brand / competitor segments so the drawer can highlight who got named.
// Uses the SAME word-boundary matching idea as detect.ts (a brand never
// highlights inside another word, a dotted alias like "we360.ai" matches
// literally), reimplemented here so we never touch detect.ts (owned by the run
// pipeline) and stay importable from client components.

export interface HighlightSegment {
  text: string;
  kind: "plain" | "brand" | "competitor";
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface MatchRange { start: number; end: number; kind: "brand" | "competitor" }

function collectRanges(text: string, names: string[], kind: MatchRange["kind"], out: MatchRange[]): void {
  for (const raw of names) {
    const n = raw.trim();
    if (n.length < 2) continue;
    // Whole-word-ish: a non-alphanumeric (or edge) on both sides, same as
    // detect.ts isMentioned, so "Apple" never lights up inside "Snapple".
    const re = new RegExp(`(^|[^a-z0-9])(${escapeRe(n)})(?=[^a-z0-9]|$)`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index + m[1].length;
      out.push({ start, end: start + m[2].length, kind });
      // Continue right after the matched name so adjacent mentions all match.
      re.lastIndex = start + m[2].length;
    }
  }
}

/** Split `text` into ordered segments; overlaps resolve brand-first. */
export function segmentMentions(text: string, brandNames: string[], competitorNames: string[]): HighlightSegment[] {
  if (!text) return [];
  const ranges: MatchRange[] = [];
  collectRanges(text, brandNames, "brand", ranges);
  collectRanges(text, competitorNames, "competitor", ranges);
  if (!ranges.length) return [{ text, kind: "plain" }];

  // Earliest first; on a tie the brand wins (e.g. the alias "we360" inside a
  // competitor name that also contains it).
  ranges.sort((a, b) => a.start - b.start || (a.kind === "brand" ? -1 : 1) - (b.kind === "brand" ? -1 : 1));
  const kept: MatchRange[] = [];
  let lastEnd = -1;
  for (const r of ranges) {
    if (r.start >= lastEnd) { kept.push(r); lastEnd = r.end; }
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const r of kept) {
    if (r.start > cursor) segments.push({ text: text.slice(cursor, r.start), kind: "plain" });
    segments.push({ text: text.slice(r.start, r.end), kind: r.kind });
    cursor = r.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), kind: "plain" });
  return segments;
}
