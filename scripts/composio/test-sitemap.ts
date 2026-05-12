// Quick standalone test of sitemap discovery — no Composio or DB calls.
// Just fetches https://we360.ai/sitemap.xml, recursively expands any
// sitemap-index entries, and prints what would be synced.

const SITEMAP_URL = "https://we360.ai/sitemap.xml";
const ALLOWED_HOST = "we360.ai";

function rewriteDriveDownload(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname !== "drive.google.com") return url;
    const id = u.searchParams.get("id");
    if (!id) return url;
    return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
  } catch { return url; }
}

async function fetchSitemapUrls(url: string, depth = 0): Promise<string[]> {
  if (depth > 2) return [];
  const fetchUrl = rewriteDriveDownload(url);
  console.log(`  ${"  ".repeat(depth)}fetching ${fetchUrl !== url ? `${url} (rewritten)` : url}`);
  const resp = await fetch(fetchUrl, { headers: { "User-Agent": "We360-SEO-Sync/1.0" } });
  if (!resp.ok) throw new Error(`${url} returned ${resp.status}`);
  const xml = await resp.text();
  if (/<sitemapindex\b/i.test(xml)) {
    const subs = extractLocs(xml);
    console.log(`  ${"  ".repeat(depth)}sitemap index, ${subs.length} sub-sitemaps`);
    const all: string[] = [];
    for (const sub of subs) {
      try {
        const inner = await fetchSitemapUrls(sub, depth + 1);
        all.push(...inner);
      } catch (e) {
        console.error(`  ${"  ".repeat(depth)}  sub failed: ${e instanceof Error ? e.message : e}`);
      }
    }
    return all;
  }
  return extractLocs(xml);
}

function extractLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const u = decodeXmlEntities(m[1].trim());
    if (u.startsWith("http")) out.push(u);
  }
  return out;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function isOwnDomain(url: string): boolean {
  try { return new URL(url).hostname.endsWith(ALLOWED_HOST); } catch { return false; }
}

(async () => {
  const all = await fetchSitemapUrls(SITEMAP_URL);
  const ownDomain = all.filter(isOwnDomain);
  const others = all.filter((u) => !isOwnDomain(u));

  console.log(`\nTotal <loc> values: ${all.length}`);
  console.log(`Same-domain (${ALLOWED_HOST}): ${ownDomain.length}`);
  console.log(`Off-domain (filtered out): ${others.length}`);

  // Group by path prefix to see what we'd pull
  const buckets = new Map<string, number>();
  for (const u of ownDomain) {
    try {
      const path = new URL(u).pathname;
      const top = path.split("/")[1] || "(homepage)";
      buckets.set(top, (buckets.get(top) ?? 0) + 1);
    } catch { /* ignore */ }
  }
  console.log("\nBy path prefix:");
  [...buckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([prefix, count]) => console.log(`  /${prefix}: ${count}`));

  console.log("\nFirst 10 URLs:");
  ownDomain.slice(0, 10).forEach((u) => console.log(`  ${u}`));
})().catch((e) => { console.error("Crash:", e); process.exit(1); });
