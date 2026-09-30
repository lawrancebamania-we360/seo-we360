// Analytics · Top 20 engaged/disengaged — which pages hold visitors best and
// worst, both restricted to pages with real traffic (see
// ENGAGEMENT_SESSION_FLOOR in lib/data/url-metrics.ts) so a near-zero-session
// page can't dominate either end with a freak 100%/0% rate.
//
// Reuses MoverList's card chrome as a plain ranked list (not an actual
// before/after delta) - from:0, to:rate% renders as "0 → 62%  ↑62%", which
// reads fine for a ranking and avoids a second bespoke list component.

import { pathFromUrl } from "@/lib/url";
import { MoverList, type MoverItem } from "@/components/ui/mover-list";
import type { EngagementRateExtremes } from "@/lib/data/url-metrics";

export function EngagementExtremesSection({ extremes }: { extremes: EngagementRateExtremes }) {
  const mostItems: MoverItem[] = extremes.mostEngaged.map((m) => ({
    primary: pathFromUrl(m.url, m.url),
    to: Math.round(m.ga_engagement_rate * 100),
    from: 0,
    deltaLabel: `${Math.round(m.ga_engagement_rate * 100)}%`,
    direction: "up",
  }));
  const leastItems: MoverItem[] = extremes.leastEngaged.map((m) => ({
    primary: pathFromUrl(m.url, m.url),
    to: Math.round(m.ga_engagement_rate * 100),
    from: 0,
    deltaLabel: `${Math.round(m.ga_engagement_rate * 100)}%`,
    direction: "down",
  }));

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-heading text-[19px] font-semibold tracking-[-0.01em] text-foreground">Top 20 engaged / disengaged</h2>
        <p className="mt-1 text-[13px] text-slate-500">Which pages hold visitors best and worst, by GA4 engagement rate</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <MoverList title="Most engaged" items={mostItems} emptyCopy="Not enough per-page traffic yet to rank engagement." />
        <MoverList title="Least engaged" items={leastItems} emptyCopy="Not enough per-page traffic yet to rank engagement." />
      </div>
    </section>
  );
}
