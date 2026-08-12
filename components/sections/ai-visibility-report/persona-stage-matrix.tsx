"use client";

// Persona x funnel-stage gap matrix (feature 3). Rows = the buyer personas the
// prompts simulate; columns = funnel stages derived from the prompts' REAL
// intent tags (informational -> Awareness, commercial/comparison ->
// Consideration, transactional -> Decision, branded reputation -> Trust).
// Cell = how often that persona sees the brand named at that stage, color-scaled
// red (gap) -> green (strong). Every cell clicks through to the actual answers.

import { Fragment } from "react";
import { Card } from "@/components/ui/card";
import type { AiVisibilityReport } from "@/lib/ai-citation/report";
import { FUNNEL_STAGE_HINT, FUNNEL_STAGE_LABEL, type FunnelStage } from "@/lib/ai-citation/trust";
import { useEvidence } from "./evidence-context";

const pct = (x: number) => (x > 0 && x < 0.005 ? "<1%" : `${Math.round(x * 100)}%`);

// Red = gap, amber = patchy, green = strong (comp lines 1424-1435). Deliberately
// NOT the emerald-only scale the heatmaps use: this matrix's whole point is
// making the gaps jump out. Foreground colour tracks the fill so the % stays
// legible on both light and saturated cells.
// Only the tint varies by tier; the number inherits `text-foreground` so it stays
// legible in both light and dark (the tints sit over the card in either theme).
function cellTone(rate: number): React.CSSProperties {
  if (rate >= 0.67) return { backgroundColor: `rgba(31,169,113,${(0.16 + rate * 0.34).toFixed(3)})` };
  if (rate >= 0.34) return { backgroundColor: "rgba(232,163,23,0.20)" };
  return { backgroundColor: `rgba(217,45,32,${(0.22 - rate * 0.2).toFixed(3)})` };
}

export function PersonaStageMatrix({ funnel }: { funnel: AiVisibilityReport["funnel"] }) {
  const { openList } = useEvidence();
  if (!funnel.rows.length) return null;

  // Comp grid (1427-1428): a leading persona-label column, then one equal
  // column per funnel stage. min-width keeps the columns readable on a phone,
  // the Card scrolls horizontally past it.
  const grid: React.CSSProperties = {
    gridTemplateColumns: `minmax(200px,1.8fr) repeat(${funnel.stages.length},minmax(96px,1fr))`,
    minWidth: funnel.stages.length * 104 + 220,
  };

  return (
    <Card className="p-6 lg:p-7 overflow-x-auto">
      <h3 className="font-heading text-lg font-semibold tracking-tight text-foreground">Where the journey breaks: persona × funnel stage</h3>
      <p className="mt-1.5 max-w-[860px] text-sm leading-relaxed text-muted-foreground">
        How often each buyer persona hears your name at each stage of their journey. Red cells are the gaps — click any cell to read the actual AI answers.
      </p>

      <div className="mt-5 grid gap-2.5" style={grid}>
        {/* Header row: blank corner + stage labels */}
        <span />
        {funnel.stages.map((s) => (
          <span key={s} className="text-center text-sm font-bold text-foreground" title={FUNNEL_STAGE_HINT[s]}>
            {FUNNEL_STAGE_LABEL[s]}
          </span>
        ))}

        {funnel.rows.map((row) => (
          <Fragment key={row.persona}>
            <span className="self-center line-clamp-2 text-[12px] font-medium leading-tight text-foreground" title={row.persona}>
              {row.persona}
            </span>
            {funnel.stages.map((s: FunnelStage) => {
              const cell = row.cells[s];
              if (!cell || cell.n === 0) {
                return (
                  <div key={s}
                    className="flex items-center justify-center rounded-lg bg-muted py-3.5 text-sm font-bold text-muted-foreground/50"
                    title="No prompts hit this persona at this stage in the latest run.">
                    –
                  </div>
                );
              }
              const rate = cell.mentioned / cell.n;
              return (
                <button key={s} type="button"
                  onClick={() => openList({ persona: row.persona, stage: s }, `${row.persona} · ${FUNNEL_STAGE_LABEL[s]}`, `${cell.mentioned} of ${cell.n} answers at this stage named you.`)}
                  className="flex items-center justify-center rounded-lg py-3.5 text-sm font-bold tabular-nums text-foreground cursor-pointer transition-transform hover:scale-[1.03] hover:shadow-sm"
                  style={cellTone(rate)}
                  title={`${cell.mentioned} of ${cell.n} answers named you. Click to read them.`}>
                  {pct(rate)}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-error" /> gap</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-warning" /> patchy</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-success" /> strong</span>
        <span className="ml-auto min-w-[200px] flex-1">Stages come from each prompt&apos;s intent: informational → Awareness, commercial/comparison → Consideration, transactional → Decision, branded reputation → Trust.</span>
      </div>
    </Card>
  );
}
