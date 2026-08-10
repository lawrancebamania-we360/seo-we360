// Analytics · What changed this week — the "something moved" surface. GSC click
// gainers/losers + rank movers on the left, GA4 page-view movers on the right.
//
// Server component (two Google round-trips, in parallel). Deltas below a base of
// 10 render as an absolute change (or "New" when the prior week was zero) so the
// prev=0 → "+100%" artifact never shows. Each source degrades independently: a
// disconnected GSC still lets the GA4 movers render, and vice-versa — the empty
// copy carries that source's own `reason`.

import { getGscWeeklyDelta, type GscWeeklySummary } from "@/lib/google/gsc";
import { getGa4WeeklyDelta, type Ga4WeeklySummary } from "@/lib/google/ga4";
import { pathFromUrl } from "@/lib/url";
import { MoverList, type MoverItem } from "@/components/ui/mover-list";

export async function WeeklyMoversStreamed({
  siteUrl,
  propertyId,
}: {
  siteUrl: string | null;
  propertyId: string | null;
  projectId: string;
}) {
  const [gsc, ga4] = await Promise.all([getGscWeeklyDelta(siteUrl), getGa4WeeklyDelta(propertyId)]);
  return <WeeklyMovers gsc={gsc} ga4={ga4} />;
}

// Absolute-below-base-10 rule: a percentage on a tiny base is noise.
function countMover(from: number, to: number): { deltaLabel: string; direction: "up" | "down" } {
  const delta = to - from;
  const direction: "up" | "down" = delta >= 0 ? "up" : "down";
  let deltaLabel: string;
  if (from >= 10) deltaLabel = `${delta >= 0 ? "+" : ""}${Math.round((delta / from) * 100)}%`;
  else if (from === 0) deltaLabel = "New";
  else deltaLabel = `${delta >= 0 ? "+" : ""}${delta}`;
  return { deltaLabel, direction };
}

// Rank: a LOWER position number is better, so #14 → #8 is "up" (+6).
function rankMover(fromPos: number, toPos: number): { deltaLabel: string; direction: "up" | "down" } {
  const improved = toPos < fromPos;
  const diff = Math.round(Math.abs(fromPos - toPos));
  return { deltaLabel: `${improved ? "+" : "−"}${diff}`, direction: improved ? "up" : "down" };
}

function WeeklyMovers({ gsc, ga4 }: { gsc: GscWeeklySummary; ga4: Ga4WeeklySummary }) {
  const clickItems: MoverItem[] = [
    ...gsc.topGainers.map((d) => ({
      primary: d.query,
      secondary: pathFromUrl(d.page),
      from: d.lastWeekClicks,
      to: d.thisWeekClicks,
      ...countMover(d.lastWeekClicks, d.thisWeekClicks),
    })),
    ...gsc.topLosers.map((d) => ({
      primary: d.query,
      secondary: pathFromUrl(d.page),
      from: d.lastWeekClicks,
      to: d.thisWeekClicks,
      ...countMover(d.lastWeekClicks, d.thisWeekClicks),
    })),
  ];

  const rankItems: MoverItem[] = [
    ...gsc.positionImprovers.map((d) => ({
      primary: d.query,
      secondary: pathFromUrl(d.page),
      from: d.lastWeekPosition,
      to: d.thisWeekPosition,
      format: "position" as const,
      ...rankMover(d.lastWeekPosition, d.thisWeekPosition),
    })),
    ...gsc.positionDropers.map((d) => ({
      primary: d.query,
      secondary: pathFromUrl(d.page),
      from: d.lastWeekPosition,
      to: d.thisWeekPosition,
      format: "position" as const,
      ...rankMover(d.lastWeekPosition, d.thisWeekPosition),
    })),
  ];

  const ga4Items: MoverItem[] = [
    ...ga4.topGainers.map((d) => ({
      primary: d.page || "/",
      from: d.lastWeek,
      to: d.thisWeek,
      ...countMover(d.lastWeek, d.thisWeek),
    })),
    ...ga4.topLosers.map((d) => ({
      primary: d.page || "/",
      from: d.lastWeek,
      to: d.thisWeek,
      ...countMover(d.lastWeek, d.thisWeek),
    })),
  ];

  const gscEmpty = gsc.connected
    ? "No week-over-week search movement yet — deltas appear after two full weeks of data."
    : (gsc.reason ?? "Connect Search Console to see search movers.");
  const ga4Empty = ga4.connected
    ? "No week-over-week page-view movement yet."
    : (ga4.reason ?? "Connect GA4 to see page-view movers.");

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-heading text-[19px] font-semibold tracking-[-0.01em] text-foreground">What changed this week</h2>
        <p className="mt-1 text-[13px] text-slate-500">Gains and drops vs the previous 7 days</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <MoverList title="Search clicks · GSC" items={clickItems} emptyCopy={gscEmpty} />
          <MoverList title="Ranking movers · GSC" items={rankItems} emptyCopy={gsc.connected ? "No notable rank changes this week." : gscEmpty} />
        </div>
        <MoverList title="Page views · GA4" items={ga4Items} emptyCopy={ga4Empty} />
      </div>
    </section>
  );
}
