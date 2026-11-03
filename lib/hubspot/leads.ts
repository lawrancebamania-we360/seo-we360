// HubSpot demo-booking verification. For a date window, counts the REAL contacts
// and deals created (excluding internal company domains + the test account) and
// collects their createdate timestamps — used to tag a GA4 booking "HubSpot
// verified" when a real record was created around the same time. Returns COUNTS
// and TIMESTAMPS only — never names or emails (no PII leaves the server).

import { hubspotFetch, hasHubspot } from "@/lib/hubspot/client";

const INTERNAL_DOMAINS = new Set(["we360.ai", "goodlives.in"]);
const TEST_EMAILS = new Set(["lawrance@goodlives.in"]);
const PAGE_CAP = 25; // up to 2500 records per object — guards huge ranges

type Klass = "real" | "internal" | "test";
function classify(email: string | null | undefined): Klass {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return "real"; // no email but a real record created (e.g. meeting) — count it
  if (TEST_EMAILS.has(e)) return "test";
  const domain = e.split("@")[1] ?? "";
  if (INTERNAL_DOMAINS.has(domain)) return "internal";
  return "real";
}

export interface HubspotVerification {
  ok: boolean;
  reason?: string;
  realContacts: number;
  realDeals: number;
  internalCount: number;   // contacts excluded as company members
  testCount: number;       // contacts excluded as the test account
  capped: boolean;
  /** createdate (UTC epoch ms) of each real contact + real deal, for time-match tagging. */
  timestamps: number[];
}

const EMPTY: HubspotVerification = { ok: false, realContacts: 0, realDeals: 0, internalCount: 0, testCount: 0, capped: false, timestamps: [] };

type SearchResult = { results?: { id: string; properties?: Record<string, string | null> }[]; paging?: { next?: { after?: string } } };

async function searchAll(
  object: "contacts" | "deals",
  since: number,
  until: number,
  properties: string[],
): Promise<{ rows: { id: string; properties: Record<string, string | null> }[]; capped: boolean }> {
  const rows: { id: string; properties: Record<string, string | null> }[] = [];
  let after: string | undefined;
  let pages = 0;
  do {
    const res = await hubspotFetch(`/crm/v3/objects/${object}/search`, {
      filterGroups: [{ filters: [
        { propertyName: "createdate", operator: "GTE", value: String(since) },
        { propertyName: "createdate", operator: "LTE", value: String(until) },
      ] }],
      properties,
      sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      limit: 100,
      ...(after ? { after } : {}),
    });
    if (!res.ok) throw new Error(`HubSpot ${object} search ${res.status}`);
    const json = (await res.json()) as SearchResult;
    for (const r of json.results ?? []) rows.push({ id: r.id, properties: r.properties ?? {} });
    after = json.paging?.next?.after;
    pages++;
  } while (after && pages < PAGE_CAP);
  return { rows, capped: !!after };
}

// Map each deal id -> an associated contact email (first association), in batches.
async function dealContactEmails(dealIds: string[]): Promise<Map<string, string | null>> {
  const emailByDeal = new Map<string, string | null>();
  for (let i = 0; i < dealIds.length; i += 100) {
    const batch = dealIds.slice(i, i + 100);
    const assocRes = await hubspotFetch(`/crm/v4/associations/deals/contacts/batch/read`, { inputs: batch.map((id) => ({ id })) });
    if (!assocRes.ok) continue;
    const assoc = (await assocRes.json()) as { results?: { from: { id: string }; to: { toObjectId: string }[] }[] };
    const contactIdByDeal = new Map<string, string>();
    const contactIds = new Set<string>();
    for (const r of assoc.results ?? []) {
      const cid = r.to?.[0]?.toObjectId;
      if (cid) { contactIdByDeal.set(r.from.id, cid); contactIds.add(cid); }
    }
    const ids = [...contactIds];
    const emailById = new Map<string, string | null>();
    for (let j = 0; j < ids.length; j += 100) {
      const cres = await hubspotFetch(`/crm/v3/objects/contacts/batch/read`, { properties: ["email"], inputs: ids.slice(j, j + 100).map((id) => ({ id })) });
      if (!cres.ok) continue;
      const cj = (await cres.json()) as { results?: { id: string; properties?: { email?: string | null } }[] };
      for (const c of cj.results ?? []) emailById.set(c.id, c.properties?.email ?? null);
    }
    for (const id of batch) {
      const cid = contactIdByDeal.get(id);
      emailByDeal.set(id, cid ? (emailById.get(cid) ?? null) : null);
    }
  }
  return emailByDeal;
}

export async function getHubspotVerification(range: { start: string; end: string }): Promise<HubspotVerification> {
  if (!hasHubspot()) return { ...EMPTY, reason: "HubSpot not connected." };
  const since = Date.parse(`${range.start}T00:00:00Z`);
  const until = Date.parse(`${range.end}T23:59:59Z`);
  if (!Number.isFinite(since) || !Number.isFinite(until)) return { ...EMPTY, reason: "Bad date range." };

  try {
    const [contacts, deals] = await Promise.all([
      searchAll("contacts", since, until, ["email", "createdate"]),
      searchAll("deals", since, until, ["createdate"]),
    ]);

    let realContacts = 0, internalCount = 0, testCount = 0;
    const timestamps: number[] = [];
    for (const c of contacts.rows) {
      const k = classify(c.properties.email);
      if (k === "internal") { internalCount++; continue; }
      if (k === "test") { testCount++; continue; }
      realContacts++;
      const ts = Date.parse(c.properties.createdate ?? "");
      if (Number.isFinite(ts)) timestamps.push(ts);
    }

    // Deals: real when their associated contact isn't internal/test.
    const emailByDeal = await dealContactEmails(deals.rows.map((d) => d.id));
    let realDeals = 0;
    for (const d of deals.rows) {
      const k = classify(emailByDeal.get(d.id));
      if (k !== "real") continue;
      realDeals++;
      const ts = Date.parse(d.properties.createdate ?? "");
      if (Number.isFinite(ts)) timestamps.push(ts);
    }

    return {
      ok: true,
      realContacts,
      realDeals,
      internalCount,
      testCount,
      capped: contacts.capped || deals.capped,
      timestamps: timestamps.sort((a, b) => a - b),
    };
  } catch (e) {
    return { ...EMPTY, reason: e instanceof Error ? e.message : "HubSpot request failed" };
  }
}
