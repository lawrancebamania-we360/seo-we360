"use client";

// IC-1: every UTM link Google Analytics has seen from LinkedIn (or with
// utm_medium=influencer) - how many people came through each one, demos, when,
// where they landed, and which collab it's counted for. Built from the same GA4
// rows as the per-post numbers, so the two always agree.

import { useMemo, useState } from "react";
import { Link2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SearchBox, matchesQuery } from "@/components/ui/search-box";
import type { InfluencerAttribution } from "@/lib/data/influencer-attribution";
import type { InfluencerCollabRow } from "@/lib/data/influencer-collabs";

const num = (n: number) => n.toLocaleString("en-IN");
const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

export function UtmLinksPanel({ attribution, collabs }: { attribution: InfluencerAttribution | null; collabs: InfluencerCollabRow[] }) {
  const [q, setQ] = useState("");
  const nameById = useMemo(() => new Map(collabs.map((c) => [c.id, c.influencerName])), [collabs]);
  const rows = attribution?.utmLinks ?? [];
  const shown = rows.filter((r) => matchesQuery(q, r.content, r.campaign, r.medium, r.source, r.topLanding, r.collabId ? nameById.get(r.collabId) : null));
  const totalVisits = rows.reduce((a, r) => a + r.visits, 0);
  const totalDemos = rows.reduce((a, r) => a + r.demos, 0);
  const unmatched = rows.filter((r) => !r.collabId && /influencer/i.test(r.medium)).length;

  return (
    <section className="space-y-2.5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
            <Link2 className="size-4 text-[#5B45E0]" /> LinkedIn UTM links
          </h2>
          <p className="text-[12.5px] text-muted-foreground">
            Everyone who reached we360.ai through a tagged LinkedIn link (Google Analytics), from the first post on.
          </p>
        </div>
        {rows.length > 0 && <SearchBox value={q} onChange={setQ} placeholder="Search UTM links..." className="w-full sm:w-60" />}
      </div>

      {!attribution ? (
        <Card className="p-6 text-center text-[13px] text-muted-foreground">Loading Google Analytics…</Card>
      ) : !attribution.ready ? (
        <Card className="p-6 text-center text-[13px] text-muted-foreground">{attribution.reason ?? "Google Analytics isn't connected."}</Card>
      ) : rows.length === 0 ? (
        <Card className="border-dashed p-6 text-center text-[13px] text-muted-foreground">
          No visits through a LinkedIn UTM link yet. Links look like we360.ai/…?utm_source=linkedin&amp;utm_medium=influencer&amp;utm_content=name-post-1
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground">
            <span><span className="font-mono font-semibold tabular-nums text-foreground">{num(totalVisits)}</span> visits</span>
            <span><span className="font-mono font-semibold tabular-nums text-foreground">{num(totalDemos)}</span> demos</span>
            <span><span className="font-mono font-semibold tabular-nums text-foreground">{rows.length}</span> links</span>
            {unmatched > 0 && <span className="text-warning-700 dark:text-warning-400">{unmatched} influencer link{unmatched === 1 ? "" : "s"} not tied to a collab</span>}
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">UTM link (utm_content)</th>
                  <th className="px-4 py-2.5 font-semibold">Collab</th>
                  <th className="px-4 py-2.5 font-semibold">Campaign · medium</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Visits</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Demos</th>
                  <th className="px-4 py-2.5 font-semibold">Visits seen</th>
                  <th className="px-4 py-2.5 font-semibold">Top landing page</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.key} className="border-b border-border/60 align-top last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-[12.5px] text-foreground">{r.content ?? <span className="text-muted-foreground">(no utm_content)</span>}</td>
                    <td className="px-4 py-3 text-[13px]">
                      {r.collabId ? (
                        <span className="text-foreground">{nameById.get(r.collabId) ?? "—"}</span>
                      ) : /influencer/i.test(r.medium) ? (
                        <span className="text-warning-700 dark:text-warning-400" title="No collab's name or recorded link matches this utm_content - check the spelling, or add the link in post tracking.">Not matched</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12.5px] text-muted-foreground">
                      <div className="text-foreground">{r.campaign ?? "—"}</div>
                      <div>{r.medium || "—"} · {r.source}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-foreground">{num(r.visits)}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-foreground">{num(r.demos)}</td>
                    <td className="px-4 py-3 text-[12.5px] text-muted-foreground">{r.firstDate === r.lastDate ? day(r.firstDate) : `${day(r.firstDate)} – ${day(r.lastDate)}`}</td>
                    <td className="max-w-[260px] px-4 py-3 font-mono text-[12px] text-muted-foreground"><span className="break-all">{r.topLanding ?? "—"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
