// Industry is free-text (the "Other" path), so it is untrusted input that flows
// into the DB and into LLM prompts. Cap + sanitize at every write boundary.
export const INDUSTRY_MAX_LEN = 120;

// Normalize a free-text industry to a safe, bounded value: strip control chars,
// collapse internal whitespace/newlines/tabs, trim, and cap the length. Returns
// "" for empty/null so callers can do `sanitizeIndustry(x) || null`.
export function sanitizeIndustry(raw: string | null | undefined): string {
  if (!raw) return "";
  let out = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f ? " " : ch;
  }
  return out.replace(/\s+/g, " ").trim().slice(0, INDUSTRY_MAX_LEN);
}
