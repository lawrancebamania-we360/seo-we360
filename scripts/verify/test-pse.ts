// Quick check: does Google Programmable Search work, and does it search
// the WHOLE web (not just we360.ai)? Runs two queries:
//   1. A phrase that should exist on many sites — if results come back
//      from non-we360 domains, whole-web search is working.
//   2. A made-up nonsense phrase — should return few/no results.

import { config } from "dotenv";
config({ path: ".env.local" });

const KEY = process.env.GOOGLE_PSE_API_KEY;
const CX = process.env.GOOGLE_PSE_CX;

async function search(q: string): Promise<string[]> {
  const url = `https://www.googleapis.com/customsearch/v1?key=${KEY}&cx=${CX}&q=${encodeURIComponent(`"${q}"`)}`;
  const r = await fetch(url);
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`HTTP ${r.status}: ${body.slice(0, 300)}`);
  }
  const j = await r.json() as { items?: Array<{ link: string }> };
  return (j.items ?? []).map((i) => i.link);
}

(async () => {
  if (!KEY || !CX) { console.error("Missing GOOGLE_PSE_API_KEY / GOOGLE_PSE_CX"); process.exit(1); }
  console.log(`CX: ${CX}`);

  console.log("\nQuery 1 — a common phrase ('employee monitoring software'):");
  const r1 = await search("employee monitoring software");
  const hosts = r1.map((u) => { try { return new URL(u).hostname; } catch { return u; } });
  hosts.forEach((h) => console.log(`  ${h}`));
  const offWe360 = hosts.filter((h) => !h.includes("we360"));
  console.log(`\n  -> ${offWe360.length} of ${hosts.length} results are NON-we360 domains.`);
  console.log(offWe360.length > 0
    ? "  ✓ Whole-web search IS working — plagiarism check is good to go."
    : "  ✗ Only we360 results — 'Search the entire web' still needs enabling.");
  process.exit(0);
})().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
