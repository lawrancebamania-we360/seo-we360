// Strict brand-variant regex for we360.ai, matching the Plan §2.2 approach.
// GSC's built-in "branded/non-branded" classifier mislabels variants like
// "myzen", "w360", "we365", "360ai" as non-brand, which inflates our apparent
// non-brand footprint. This regex catches all observed misspellings + legacy
// product names.

const BRAND_VARIANTS = [
  // canonical
  /we\s*360(?:\.?ai)?/i,
  /w360(?:\.?ai)?/i,
  // common typos / misspellings observed in GSC
  /we\s*365/i,
  /360\s*ai/i,
  // legacy / pre-rebrand
  /my\s*zen/i,
  /myzen\s*ai/i,
  /zen\s*ai/i,
];

export function isBrandQuery(query: string): boolean {
  if (!query) return false;
  const normalized = query.toLowerCase().trim();
  return BRAND_VARIANTS.some((r) => r.test(normalized));
}

export function classifyBrand(query: string): "brand" | "non-brand" {
  return isBrandQuery(query) ? "brand" : "non-brand";
}
