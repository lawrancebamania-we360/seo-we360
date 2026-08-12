"use client";

// "Visibility heatmaps" — comp lines 1413-1420. One heatmap with a mode toggle:
// Persona × Competitor / Topic × Competitor / Persona × Topic. All three grids
// are driven by REAL report.heatmaps data (mention rate + the raw num/den behind
// each cell). Every cell clicks through to the actual AI answers via the evidence
// drawer. Restyled from the old Competitors-tab heatmaps; no fabricated data.

import { Fragment, useState } from "react";
import { Card } from "@/components/ui/card";
import { HeatCell } from "@/components/ui/heat-cell";
import { cn } from "@/lib/utils";
import type { AiVisibilityReport, HeatCellValue } from "@/lib/ai-citation/report";
import { useEvidence } from "./evidence-context";

type Mode = "personaBrand" | "topicBrand" | "personaTopic";

const MODES: { key: Mode; label: string }[] = [
  { key: "personaBrand", label: "Persona × Competitor" },
  { key: "topicBrand", label: "Topic × Competitor" },
  { key: "personaTopic", label: "Persona × Topic" },
];

const MODE_DESC: Record<Mode, string> = {
  personaBrand: "How often each brand is mentioned, by buyer persona — spot the personas where a rival out-shows you.",
  topicBrand: "Mentions by buying-decision topic — the topics where AI names a competitor but not you are your gaps.",
  personaTopic: "Where you show up, persona by topic — the coldest cells are the questions to go win.",
};

export function VisibilityHeatmaps({ report }: { report: AiVisibilityReport }) {
  const h = report.heatmaps;
  const [mode, setMode] = useState<Mode>("personaBrand");

  const view =
    mode === "personaBrand" ? { cols: h.brands, rows: h.personaByBrand, projectLabel: report.projectLabel, rowKind: "persona" as const }
      : mode === "topicBrand" ? { cols: h.brands, rows: h.topicByBrand, projectLabel: report.projectLabel, rowKind: "topic" as const }
        : { cols: h.personaByTopic.topics, rows: h.personaByTopic.rows, projectLabel: "", rowKind: "persona" as const };

  const hasData = view.rows.length > 0 && view.cols.length > 0;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">Visibility heatmaps</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your brand&apos;s visibility for each persona and topic — click any cell to read the answers behind it.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button key={m.key} type="button" onClick={() => setMode(m.key)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors cursor-pointer",
              mode === m.key ? "border-ember-200 bg-ember-50 text-ember-700 dark:border-ember-900 dark:bg-ember-950/40 dark:text-ember-400" : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="max-w-[860px] text-[13.5px] text-muted-foreground">{MODE_DESC[mode]}</p>

      <Card className="overflow-x-auto p-4 lg:p-5">
        {!hasData ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Not enough data for this view yet — run more checks to fill the grid.</p>
        ) : (
          <HeatGrid cols={view.cols} rows={view.rows} projectLabel={view.projectLabel} rowKind={view.rowKind} colKind={mode === "personaTopic" ? "topic" : "brand"} />
        )}
      </Card>
    </section>
  );
}

function HeatGrid({ cols, rows, projectLabel, rowKind, colKind }: {
  cols: string[];
  rows: { row: string; cells: Record<string, HeatCellValue> }[];
  projectLabel: string;
  rowKind: "persona" | "topic";
  colKind: "brand" | "topic";
}) {
  const { openList } = useEvidence();
  const n = cols.length;
  return (
    <div
      className="grid gap-2"
      style={{ minWidth: n * 88 + 220, gridTemplateColumns: `minmax(200px,1.8fr) repeat(${n},minmax(72px,1fr))` }}
    >
      <div />
      {cols.map((c) => (
        <div key={c} className={cn("self-end px-1 pb-1 text-center text-xs font-semibold", c === projectLabel ? "text-warning-strong" : "text-muted-foreground")}>
          {c === projectLabel ? `${c} · you` : c}
        </div>
      ))}
      {rows.map((r, i) => (
        <Fragment key={`${r.row}-${i}`}>
          <div className="flex items-center pr-2">
            <span className="line-clamp-2 text-[12px] font-medium leading-tight text-foreground" title={r.row}>{r.row}</span>
          </div>
          {cols.map((c) => {
            const cell = r.cells[c] ?? { rate: 0, num: 0, den: 0 };
            const p = Math.round(cell.rate * 100);
            const isYou = c === projectLabel;
            const filter = colKind === "brand"
              ? (isYou ? { [rowKind]: r.row, mentioned: true } : { [rowKind]: r.row, competitor: c })
              : { persona: r.row, topic: c };
            const title = colKind === "brand" && !isYou ? c : `${r.row} · ${c}`;
            return (
              <HeatCell key={c} pct={p}
                onClick={() => openList(filter, title, `${cell.num} of ${cell.den} answers`)}
                className={cn("flex-col gap-0.5 py-3 cursor-pointer transition-transform hover:scale-[1.03] hover:shadow-sm", isYou && "ring-1 ring-warning-300/60")}
                title="Click to read the actual AI answers behind this cell.">
                <span className="text-sm font-bold">{p}%</span>
                <span className="text-[0.6875rem] font-medium opacity-70">{cell.num}/{cell.den}</span>
              </HeatCell>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
