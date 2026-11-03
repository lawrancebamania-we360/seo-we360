// HubSpot demo-booking verification. The reliable signal is the MEETING record
// (hs_createdate = the booking moment) — a booker who is already a contact won't
// create a new contact/deal, so matching those misses them. For each meeting in
// the window we classify its associated contact as real / internal / test and
// collect the meeting timestamp, so a GA4 booking can be tagged "verified" (real)
// or dropped (internal/test). Real contacts created is kept as a summary count.
//
// Kept deliberately lean on API calls (sequential, meetings first, each section
// fault-tolerant, 429-retry in the client) so HubSpot rate limits don't blank the
// whole verification. Returns COUNTS + TIMESTAMPS only — never names/emails.

import { hubspotFetch, hasHubspot } from "@/lib/hubspot/client";

const INTERNAL_DOMAINS = new Set(["we360.ai", "goodlives.in"]);
const TEST_EMAILS = new Set(["lawrance@goodlives.in"]);
const PAGE_CAP = 15; // up to 1500 records per object

type Klass = "real" | "internal" | "test";
function classify(email: string | null | undefined): Klass {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return "real"; // no email tied to it — treat as a real booking, don't drop
  if (TEST_EMAILS.has(e)) return "test";
  if (INTERNAL_DOMAINS.has(e.split("@")[1] ?? "")) return "internal";
  return "real";
}

export interface HubspotVerification {
  ok: boolean;              // true once the MEETINGS signal loaded (the match data)
  reason?: string;
  realContacts: number;
  realMeetings: number;
  internalCount: number;      // contacts excluded as company members
  testCount: number;          // contacts excluded as the test account
  excludedMeetings: number;   // internal/test meetings (their bookings get dropped)
  capped: boolean;
  verifyTimestamps: number[];  // real meeting createdates (UTC ms) -> tag "Verified"
  excludeTimestamps: number[]; // internal/test meeting createdates -> drop the booking row
}

const EMPTY: HubspotVerification = {
  ok: false, realContacts: 0, realMeetings: 0, internalCount: 0, testCount: 0,
  excludedMeetings: 0, capped: false, verifyTimestamps: [], excludeTimestamps: [],
};

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

// Map each meeting id -> its first associated contact email (batched).
async function meetingContactEmails(ids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    try {
    const assocRes = await hubspotFetch(`/crm/v4/associations/meetings/contacts/batch/read`, { inputs: batch.map((id) => ({ id })) });
    if (!assocRes.ok) continue;
    const assoc = (await assocRes.json()) as { results?: { from: { id: string }; to: { toObjectId: string }[] }[] };
    const contactIdByMeeting = new Map<string, string>();
    const contactIds = new Set<string>();
    for (const r of assoc.results ?? []) {
      const cid = r.to?.[0]?.toObjectId;
      if (cid) { contactIdByMeeting.set(r.from.id, cid); contactIds.add(cid); }
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
      const cid = contactIdByMeeting.get(id);
      out.set(id, cid ? (emailById.get(cid) ?? null) : null);
    }
    } catch { /* a slow/failed batch leaves those meetings unclassified -> treated as real (verified) */ }
  }
  return out;
}

export async function getHubspotVerification(range: { start: string; end: string }): Promise<HubspotVerification> {
  if (!hasHubspot()) return { ...EMPTY, reason: "HubSpot not connected (no token on the server)." };
  const since = Date.parse(`${range.start}T00:00:00Z`);
  const until = Date.parse(`${range.end}T23:59:59Z`);
  if (!Number.isFinite(since) || !Number.isFinite(until)) return { ...EMPTY, reason: "Bad date range." };

  const result: HubspotVerification = { ...EMPTY, verifyTimestamps: [], excludeTimestamps: [] };

  // 1) Meetings — the booking signal. This is what gates ok. Done first.
  try {
    const meetings = await searchAll("meetings", "hs_createdate", since, until, ["hs_createdate"]);
    // Classification is secondary to the timestamps — if it fails, treat all as real.
    let emails = new Map<string, string | null>();
    try { emails = await meetingContactEmails(meetings.rows.map((m) => m.id)); } catch { /* keep timestamps */ }
    for (const m of meetings.rows) {
      const ts = Date.parse(m.properties.hs_createdate ?? "");
      if (!Number.isFinite(ts)) continue;
      if (classify(emails.get(m.id)) === "real") { result.verifyTimestamps.push(ts); result.realMeetings++; }
      else { result.excludeTimestamps.push(ts); result.excludedMeetings++; }
    }
    result.verifyTimestamps.sort((a, b) => a - b);
    result.excludeTimestamps.sort((a, b) => a - b);
    result.capped = result.capped || meetings.capped;
    result.ok = true;
  } catch (e) {
    return { ...result, ok: false, reason: e instanceof Error ? e.message : "HubSpot meetings request failed" };
  }

  // 2) Contacts created (summary counts only — best-effort, never fails the whole).
  try {
    const contacts = await searchAll("contacts", "createdate", since, until, ["email", "createdate"]);
    for (const c of contacts.rows) {
      const k = classify(c.properties.email);
      if (k === "internal") result.internalCount++;
      else if (k === "test") result.testCount++;
      else result.realContacts++;
    }
    result.capped = result.capped || contacts.capped;
  } catch { /* summary only — keep meetings result */ }

  return result;
}
