// Countries for geography pickers and for localizing AI-citation runs.
//
// ISO 3166-1 alpha-2 codes are the source of truth (APIs want codes); display
// names come from Intl.DisplayNames so there is no hand-typed name list to rot.
// Pure and safe on the server and in the browser (explicit "en" locale, so the
// two always agree).
//
// Excludes uninhabited territories (AQ, BV, HM, GS, UM, TF): no one searches from
// there, and they would only add noise to a searchable list.

export const COUNTRY_CODES: readonly string[] = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BW", "BY", "BZ",
  "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ",
  "DE", "DJ", "DK", "DM", "DO", "DZ",
  "EC", "EE", "EG", "EH", "ER", "ES", "ET",
  "FI", "FJ", "FK", "FM", "FO", "FR",
  "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GT", "GU", "GW", "GY",
  "HK", "HN", "HR", "HT", "HU",
  "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT",
  "JE", "JM", "JO", "JP",
  "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ",
  "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY",
  "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ",
  "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ",
  "OM",
  "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY",
  "QA",
  "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ",
  "TC", "TD", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ",
  "UA", "UG", "US", "UY", "UZ",
  "VA", "VC", "VE", "VG", "VI", "VN", "VU",
  "WF", "WS",
  "YE", "YT",
  "ZA", "ZM", "ZW",
];

const CODE_SET = new Set(COUNTRY_CODES);

let displayNames: Intl.DisplayNames | null = null;
function names(): Intl.DisplayNames {
  return (displayNames ??= new Intl.DisplayNames(["en"], { type: "region", fallback: "none" }));
}

/** English country name for an ISO-2 code ("IN" -> "India"). Falls back to the code. */
export function countryName(code: string): string {
  const c = code.trim().toUpperCase();
  try {
    return names().of(c) || c;
  } catch {
    return c;
  }
}

// Names that read naturally only with "the" ("someone located in the United States").
const THE_PREFIXED = new Set(["US", "GB", "AE", "NL", "PH", "BS", "GM", "DO", "CF", "CG", "CD", "MH", "SB", "SC", "KM", "MV"]);

/**
 * How to name a country INSIDE a sentence sent to an AI engine. Never the bare
 * code: "located in IN" reads as Indiana to a model, "located in India" does not.
 * Input that is not a known code passes through trimmed (older free-text values).
 */
export function countryHintName(codeOrName: string): string {
  const raw = codeOrName.trim();
  const code = normalizeCountry(raw);
  if (!code) return raw;
  const n = countryName(code);
  return THE_PREFIXED.has(code) ? `the ${n}` : n;
}

export interface CountryItem {
  value: string;
  label: string;
}

/** Every country, A to Z by name, as picker items ({ value: ISO-2, label: name }). */
export function countryItems(): CountryItem[] {
  return COUNTRY_CODES
    .map((value) => ({ value, label: countryName(value) }))
    .sort((a, b) => a.label.localeCompare(b.label, "en"));
}

const ALIASES: Record<string, string> = {
  usa: "US", "u.s.": "US", "u.s.a.": "US", america: "US", "united states of america": "US",
  uk: "GB", "u.k.": "GB", "great britain": "GB", britain: "GB", england: "GB", scotland: "GB", wales: "GB",
  uae: "AE", emirates: "AE",
  "south korea": "KR", "korea, south": "KR", "north korea": "KP",
  russia: "RU", "czech republic": "CZ", turkey: "TR", "ivory coast": "CI", vietnam: "VN", laos: "LA", syria: "SY",
  "hong kong sar china": "HK",
};

let byName: Map<string, string> | null = null;
function nameIndex(): Map<string, string> {
  if (!byName) {
    byName = new Map();
    for (const c of COUNTRY_CODES) byName.set(countryName(c).toLowerCase(), c);
  }
  return byName;
}

/**
 * Anything a person or an old row might hold for a country -> a valid ISO-2 code,
 * or null. Accepts a code in any case ("in", " IN "), an English name ("India"),
 * or a common alias ("USA", "UK", "UAE"). Anything else ("Indiana") is null.
 */
export function normalizeCountry(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  const up = s.toUpperCase();
  if (CODE_SET.has(up)) return up;
  // Not a code. Two letters can still be an alias (UK is not ISO; GB is), so fall through.
  const key = s.toLowerCase();
  return ALIASES[key] ?? nameIndex().get(key) ?? null;
}

/** A list of raw values -> valid, de-duplicated ISO-2 codes in the given order, at most `max`. */
export function normalizeCountries(list: ReadonlyArray<string | null | undefined> | null | undefined, max = Infinity): string[] {
  const out: string[] = [];
  for (const raw of list ?? []) {
    const c = normalizeCountry(raw);
    if (c && !out.includes(c)) out.push(c);
    if (out.length >= max) break;
  }
  return out;
}
