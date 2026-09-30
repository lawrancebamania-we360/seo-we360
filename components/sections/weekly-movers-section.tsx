// Analytics · "What changed this week" - split into two independent pieces
// for Ticket 6's category boxes: GSC rank movers ("Top 10 Movers") and GA4
// page-view movers ("Top 10 Page Views"). Splitting them (they used to share
// one Suspense boundary) also means a slow GSC call no longer blocks the GA4
// panel from showing, and vice versa.
//
// Ticket 3's "too many things shown" complaint drops the old third column
// (GSC click gainers/losers) from the default view entirely - it wasn't one
// of the 5 categories asked for. getGscWeeklyDelta still computes it (no
// extra API cost, same response), it's just not rendered here.
//
// Deltas below a base of 10 render as an absolute change (or "New" when the
// prior week was zero) so the prev=0 → "+100%" artifact never shows.

import { getGscWeeklyDelta, type GscWeeklySummary } from "@/lib/google/gsc";
import { getGa4WeeklyDelta, type Ga4WeeklySummary } from "@/lib/google/ga4";
import { pathFromUrl } from "@/lib/url";
import { MoverList, type MoverItem } from "@/components/ui/mover-list";

// Rank: a LOWER position number is better, so #14 → #8 is "up" (+6).
function rankMover(fromPos: number, toPos: number): { deltaLabel: string; direction: "up" | "down" } {
  const improved = toPos < fromPos;
  const diff = Math.round(Math.abs(fromPos - toPos));
  return { deltaLabel: `${improved ? "+" : "−"}${diff}`, direction: improved ? "up" : "down" };
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

export async function RankingMoversStreamed({ siteUrl }: { siteUrl: string | null }) {
  const gsc = await getGscWeeklyDelta(siteUrl);
  return <RankingMovers gsc={gsc} />;
}

function RankingMovers({ gsc }: { gsc: GscWeeklySummary }) {
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
  const emptyCopy = gsc.connected
    ? "No notable rank changes this week."
    : (gsc.reason ?? "Connect Search Console to see ranking movers.");

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-heading text-[19px] font-semibold tracking-[-0.01em] text-foreground">Top 10 movers</h2>
        <p className="mt-1 text-[13px] text-slate-500">Biggest ranking gains and drops this week · GSC</p>
      </div>
      <MoverList title="Ranking movers · GSC" items={rankItems} emptyCopy={emptyCopy} />
    </section>
  );
}

export async function PageViewMoversStreamed({ propertyId }: { propertyId: string | null }) {
  const ga4 = await getGa4WeeklyDelta(propertyId);
  return <PageViewMovers ga4={ga4} />;
}

function PageViewMovers({ ga4 }: { ga4: Ga4WeeklySummary }) {
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
  const emptyCopy = ga4.connected
    ? "No week-over-week page-view movement yet."
    : (ga4.reason ?? "Connect GA4 to see page-view movers.");

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-heading text-[19px] font-semibold tracking-[-0.01em] text-foreground">Top 10 page views</h2>
        <p className="mt-1 text-[13px] text-slate-500">Biggest page-view gains and drops this week · GA4</p>
      </div>
      <MoverList title="Page views · GA4" items={ga4Items} emptyCopy={emptyCopy} />
    </section>
  );
}
