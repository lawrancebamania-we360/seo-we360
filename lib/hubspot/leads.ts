// HubSpot "deals captured" verification. A booking counts as valid only when it
// became a DEAL (a real opportunity) — contacts/meetings are too noisy. For each
// deal created in the window we classify its associated contact real/internal/
// test and collect the deal's createdate, so a GA4 booking is tagged "Deal" when
// a real deal was created within ~15 min of it, or dropped when an internal/test
// deal was. (Timing verified against live data: deals land ~2 min after booking;
// ~half of bookings become a deal, the rest stay untagged = booked, no deal yet.)
//
// Lean on API calls (429-retry in the client, per-batch/per-section try/catch) so
// HubSpot rate limits don't blank the panel. Returns COUNTS + TIMESTAMPS only.

import { hubspotFetch, hasHubspot } from "@/lib/hubspot/client";

const INTERNAL_DOMAINS = new Set(["we360.ai", "goodlives.in"]);
const TEST_EMAILS = new Set(["lawrance@goodlives.in"]);
const PAGE_CAP = 15; // up to 1500 deals

type Klass = "real" | "internal" | "test";
function classify(email: string | null | undefined): Klass {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return "real";
  if (TEST_EMAILS.has(e)) return "test";
  if (INTERNAL_DOMAINS.has(e.split("@")[1] ?? "")) return "internal";
  return "real";
}

export interface HubspotVerification {
  ok: boolean;
  reason?: string;
  realDeals: number;
  excludedDeals: number;       // internal/test deals (their bookings get dropped)
  capped: boolean;
  verifyTimestamps: number[];  // real deal createdates (UTC ms) -> tag "Deal"
  excludeTimestamps: number[]; // internal/test deal createdates -> drop the booking row
}

const EMPTY: HubspotVerification = { ok: false, realDeals: 0, excludedDeals: 0, capped: false, verifyTimestamps: [], excludeTimestamps: [] };

type Row = { id: string; properties: Record<string, string | null> };
type SearchResult = { results?: Row[]; paging?: { next?: { after?: string } } };

async function searchAll(object: string, dateProp: string, since: number, until: number, properties: string[]): Promise<{ rows: Row[]; capped: boolean }> {
  const rows: Row[] = [];
  let after: string | undefined;
  let pages = 0;
  do {
    const res = await hubspotFetch(`/crm/v3/objects/${object}/search`, {
      filterGroups: [{ filters: [
        { propertyName: dateProp, operator: "GTE", value: String(since) },
        { propertyName: dateProp, operator: "LTE", value: String(until) },
      ] }],
      properties,
      sorts: [{ propertyName: dateProp, direction: "DESCENDING" }],
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

// Map each deal id -> its first associated contact email (batched, fault-tolerant).
async function dealContactEmails(ids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    try {
      const assocRes = await hubspotFetch(`/crm/v4/associations/deals/contacts/batch/read`, { inputs: batch.map((id) => ({ id })) });
      if (!assocRes.ok) continue;
      const assoc = (await assocRes.json()) as { results?: { from: { id: string }; to: { toObjectId: string }[] }[] };
      const contactIdByDeal = new Map<string, string>();
      const contactIds = new Set<string>();
      for (const r of assoc.results ?? []) {
        const cid = r.to?.[0]?.toObjectId;
        if (cid) { contactIdByDeal.set(r.from.id, cid); contactIds.add(cid); }
      }
      const emailById = new Map<string, string | null>();
      const cids = [...contactIds];
      for (let j = 0; j < cids.length; j += 100) {
        const cres = await hubspotFetch(`/crm/v3/objects/contacts/batch/read`, { properties: ["email"], inputs: cids.slice(j, j + 100).map((id) => ({ id })) });
        if (!cres.ok) continue;
        const cj = (await cres.json()) as { results?: { id: string; properties?: { email?: string | null } }[] };
        for (const c of cj.results ?? []) emailById.set(c.id, c.properties?.email ?? null);
      }
      for (const id of batch) {
        const cid = contactIdByDeal.get(id);
        out.set(id, cid ? (emailById.get(cid) ?? null) : null);
      }
    } catch { /* a slow/failed batch leaves those deals unclassified -> treated as real */ }
  }
  return out;
}

export async function getHubspotVerification(range: { start: string; end: string }): Promise<HubspotVerification> {
  if (!hasHubspot()) return { ...EMPTY, reason: "HubSpot not connected (no token on the server)." };
  const since = Date.parse(`${range.start}T00:00:00Z`);
  const until = Date.parse(`${range.end}T23:59:59Z`);
  if (!Number.isFinite(since) || !Number.isFinite(until)) return { ...EMPTY, reason: "Bad date range." };

  try {
    const deals = await searchAll("deals", "createdate", since, until, ["createdate"]);
    let emails = new Map<string, string | null>();
    try { emails = await dealContactEmails(deals.rows.map((d) => d.id)); } catch { /* keep timestamps */ }

    const verifyTimestamps: number[] = [];
    const excludeTimestamps: number[] = [];
    let realDeals = 0, excludedDeals = 0;
    for (const d of deals.rows) {
      const ts = Date.parse(d.properties.createdate ?? "");
      if (!Number.isFinite(ts)) continue;
      if (classify(emails.get(d.id)) === "real") { verifyTimestamps.push(ts); realDeals++; }
      else { excludeTimestamps.push(ts); excludedDeals++; }
    }

    return {
      ok: true,
      realDeals, excludedDeals,
      capped: deals.capped,
      verifyTimestamps: verifyTimestamps.sort((a, b) => a - b),
      excludeTimestamps: excludeTimestamps.sort((a, b) => a - b),
    };
  } catch (e) {
    return { ...EMPTY, reason: e instanceof Error ? e.message : "HubSpot deals request failed" };
  }
}
