// Organic-deal matcher (pure, unit-testable). Turns GA4 non-paid demo bookings +
// the createdates of real HubSpot deals into "unique organic deals by channel".
//
// 1. De-dupe GA4's adjacent-minute rows into unique bookings (a booking whose page
//    activity straddles a minute boundary shows as 2 rows — collapse them).
// 2. Greedily match each unique booking to a real deal created within ±15 min (a
//    deal is consumed once, so one deal = one booking).
// 3. Group matched bookings by channel. Flag "ambiguous" when a different-channel
//    booking sits within the window (attribution is then a best guess).
//
// GA4 booking times are wall-clock in the property timezone; HubSpot deal times
// are UTC — both are converted to property-tz wall-clock to compare.

import type { Ga4NonPaidBookingRow } from "@/lib/google/ga4";

const WINDOW_MS = 15 * 60 * 1000; // booking <-> deal match window
const DEDUPE_MS = 3 * 60 * 1000;  // adjacent rows within this = same booking

export function gaWallMs(timeStr: string): number {
  const [date, time] = timeStr.split(" ");
  if (!date || !time) return NaN;
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return Date.UTC(y, mo - 1, d, h, mi);
}
export function tzWallMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(utcMs));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const h = g("hour") === "24" ? "0" : g("hour");
  return Date.UTC(+g("year"), +g("month") - 1, +g("day"), +h, +g("minute"));
}

export interface OrganicDealRow { time: string; landingPage: string; device: string; location: string; }
export interface OrganicChannel { channel: string; count: number; deals: OrganicDealRow[]; }
export interface OrganicDeals { total: number; ambiguous: number; byChannel: OrganicChannel[] }

type Booking = { channel: string; time: string; landingPage: string; device: string; location: string; wall: number };

export function buildOrganicDeals(
  rows: Ga4NonPaidBookingRow[],
  dealTimestampsUtcMs: number[],
  propertyTz: string,
): OrganicDeals {
  // 1. Collapse adjacent-minute rows (same channel/landing/device/location) into unique bookings.
  const keyed = new Map<string, { wall: number; row: Ga4NonPaidBookingRow }[]>();
  for (const r of rows) {
    const wall = gaWallMs(r.time);
    if (!Number.isFinite(wall)) continue;
    const k = `${r.channel}|${r.landingPage}|${r.device}|${r.location}`;
    (keyed.get(k) ?? keyed.set(k, []).get(k)!).push({ wall, row: r });
  }
  const bookings: Booking[] = [];
  for (const arr of keyed.values()) {
    arr.sort((a, b) => a.wall - b.wall);
    let cluster: typeof arr = [];
    const flush = () => {
      if (!cluster.length) return;
      const f = cluster[0].row;
      bookings.push({ channel: f.channel, time: f.time, landingPage: f.landingPage, device: f.device, location: f.location, wall: cluster[0].wall });
      cluster = [];
    };
    for (const item of arr) {
      if (cluster.length && item.wall - cluster[cluster.length - 1].wall > DEDUPE_MS) flush();
      cluster.push(item);
    }
    flush();
  }
  bookings.sort((a, b) => a.wall - b.wall);

  // 2. Deal wall-times, consumable once.
  const deals = dealTimestampsUtcMs.map((ms) => tzWallMs(ms, propertyTz)).sort((a, b) => a - b);
  const used = new Array<boolean>(deals.length).fill(false);
  const takeNearestDeal = (wall: number): boolean => {
    let bestIdx = -1, bestDelta = Infinity;
    for (let i = 0; i < deals.length; i++) {
      if (used[i]) continue;
      const delta = Math.abs(deals[i] - wall);
      if (delta <= WINDOW_MS && delta < bestDelta) { bestDelta = delta; bestIdx = i; }
    }
    if (bestIdx >= 0) { used[bestIdx] = true; return true; }
    return false;
  };

  // 3. Match + group by channel; flag ambiguous attributions.
  const byChannel = new Map<string, OrganicChannel>();
  let total = 0, ambiguous = 0;
  for (let i = 0; i < bookings.length; i++) {
    const b = bookings[i];
    if (!takeNearestDeal(b.wall)) continue; // no deal within window -> not an organic deal
    total++;
    if (bookings.some((o, j) => j !== i && o.channel !== b.channel && Math.abs(o.wall - b.wall) <= WINDOW_MS)) ambiguous++;
    const ch = byChannel.get(b.channel) ?? { channel: b.channel, count: 0, deals: [] };
    ch.count++;
    ch.deals.push({ time: b.time, landingPage: b.landingPage, device: b.device, location: b.location });
    byChannel.set(b.channel, ch);
  }

  return { total, ambiguous, byChannel: [...byChannel.values()].sort((a, b) => b.count - a.count) };
}
