// Team Targets: the KPI row. Completion is the headline (mean of per-target
// capped completion), with a purple fill and a pace tick. Unit figures are split
// content vs volume so the big outreach numbers never swamp the content numbers.

import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmtNum, fmtPct, ProgressBar } from "@/components/sections/team-targets/ui";
import type { DashboardTotals } from "@/lib/team-targets/types";

function Tile({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <Card className={cn("gap-1 p-3.5", className)}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      {children}
    </Card>
  );
}

export function KpiTiles({
  totals, ended, openCount, behindNames,
}: {
  totals: DashboardTotals;
  ended: boolean;
  openCount: number;
  behindNames: string[];
}) {
  const hasVolume = totals.volumeExpected > 0;
  const gap = Math.round((totals.completion - totals.paceCompletion) * 100);
  const behind = totals.behindCount > 0;

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      {/* Completion (hero) */}
      <Tile label="Completion" className="col-span-2 sm:col-span-3 lg:col-span-1">
        <div className="font-mono text-3xl font-semibold tabular-nums text-foreground">{fmtPct(totals.completion)}</div>
        <ProgressBar value={totals.completion} className="my-1.5" />
        <div className="text-[11.5px] text-muted-foreground">
          {ended ? "Final result"
            : `Pace ${fmtPct(totals.paceCompletion)} · ${gap >= 0 ? `${gap} pts ahead` : `${Math.abs(gap)} pts behind`}`}
        </div>
      </Tile>

      {/* Done */}
      <Tile label="Done (verified)">
        <div className="font-mono text-2xl font-semibold tabular-nums text-foreground">{fmtNum(totals.contentDone)}</div>
        {hasVolume && <div className="text-[11px] text-muted-foreground">+ {fmtNum(totals.volumeDone)} volume</div>}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px]">
          {totals.awaiting > 0 && <span className="inline-flex items-center gap-1 text-warning-700 dark:text-warning-400"><Clock className="size-3" /> {fmtNum(totals.awaiting)} awaiting</span>}
          {totals.failed > 0 && <span className="inline-flex items-center gap-1 text-error-700 dark:text-error-400"><AlertTriangle className="size-3" /> {fmtNum(totals.failed)} failed</span>}
          {totals.awaiting === 0 && totals.failed === 0 && <span className="text-muted-foreground">All checked</span>}
        </div>
      </Tile>

      {/* Expected */}
      <Tile label="Expected">
        <div className="font-mono text-2xl font-semibold tabular-nums text-foreground">{fmtNum(totals.contentExpected)}</div>
        {hasVolume && <div className="text-[11px] text-muted-foreground">+ {fmtNum(totals.volumeExpected)} volume</div>}
        <div className="mt-0.5 text-[11.5px] text-muted-foreground">for the period</div>
      </Tile>

      {/* Remaining */}
      <Tile label="Remaining">
        <div className="font-mono text-2xl font-semibold tabular-nums text-foreground">{fmtNum(totals.contentRemaining)}</div>
        {hasVolume && <div className="text-[11px] text-muted-foreground">+ {fmtNum(totals.volumeRemaining)} volume</div>}
        <div className="mt-0.5 text-[11.5px] text-muted-foreground">across {openCount} open target{openCount === 1 ? "" : "s"}</div>
      </Tile>

      {/* Behind pace */}
      <Tile label={ended ? "Missed goal" : "Behind pace"} className={cn("col-span-2 sm:col-span-1", behind && "border-l-2 border-l-warning-400")}>
        {behind ? (
          <>
            <div className="font-mono text-2xl font-semibold tabular-nums text-foreground">
              {totals.behindCount}<span className="ml-1 text-sm font-normal text-muted-foreground">/ {totals.targetCount}</span>
            </div>
            <div className="mt-0.5 line-clamp-2 text-[11.5px] text-muted-foreground">
              {behindNames.slice(0, 2).join(", ")}{behindNames.length > 2 ? ` +${behindNames.length - 2} more` : ""}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-1.5 pt-1 text-success-700 dark:text-success-400">
            <CheckCircle2 className="size-5" />
            <span className="text-sm font-medium">All on pace</span>
          </div>
        )}
      </Tile>
    </div>
  );
}
