"use client";

// Overview rollup for the brand-sentiment tiers (feature 2): the Otterly-style
// plain-English readout - "Recommended in 4 · with caveats in 3 · dismissed in
// 1" - with a stacked bar, each segment clicking through to the underlying
// answers. Shows a shimmer while the lazy classification pass runs.

import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SentimentRollup } from "@/lib/ai-citation/report";
import { SENTIMENT_LABEL, type BrandSentiment } from "@/lib/ai-citation/trust";
import { useEvidence } from "./evidence-context";

const SEGMENTS: Array<{ tier: BrandSentiment; key: "recommended" | "withCaveats" | "dismissed"; bar: string; chip: string }> = [
  { tier: "recommended", key: "recommended", bar: "bg-success-500", chip: "bg-success-500/15 text-success-700 dark:text-success-400" },
  { tier: "with_caveats", key: "withCaveats", bar: "bg-warning-500", chip: "bg-warning-500/15 text-warning-700 dark:text-warning-400" },
  { tier: "dismissed", key: "dismissed", bar: "bg-error-500", chip: "bg-error-500/15 text-error-700 dark:text-error-400" },
];

export function SentimentRollupCard({ rollup }: { rollup: SentimentRollup }) {
  const { openList, classifying } = useEvidence();
  if (rollup.mentioned === 0) return null; // nothing named the brand - no tone to report

  const classified = rollup.recommended + rollup.withCaveats + rollup.dismissed;
  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">How AI talks about you</h3>
        <span className="text-xs text-muted-foreground">
          across the {rollup.mentioned} answer{rollup.mentioned === 1 ? "" : "s"} that named you in this run
        </span>
      </div>

      {classified > 0 && (
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
          {SEGMENTS.map(({ tier, key, bar }) => {
            const v = rollup[key];
            if (!v) return null;
            return <div key={tier} className={cn("h-full", bar)} style={{ width: `${(v / classified) * 100}%` }} />;
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {SEGMENTS.map(({ tier, key, chip }) => {
          const v = rollup[key];
          if (!v) return null;
          return (
            <button key={tier} type="button"
              onClick={() => openList({ sentiment: tier, mentioned: true }, `Answers where you were ${SENTIMENT_LABEL[tier].toLowerCase()}`)}
              className={cn("rounded-md px-2 py-1 text-xs font-medium transition-opacity hover:opacity-80 cursor-pointer", chip)}
              title="See the actual AI answers behind this count.">
              {SENTIMENT_LABEL[tier]} in {v}
            </button>
          );
        })}
        {classified === 0 && !classifying && rollup.unclassified > 0 && (
          <span className="text-xs text-muted-foreground">Not classified yet - it runs automatically when an owner or admin opens this report.</span>
        )}
        {classifying && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse">
            <Loader2 className="size-3 animate-spin" /> Classifying {rollup.unclassified} answer{rollup.unclassified === 1 ? "" : "s"}...
          </span>
        )}
        {!classifying && classified > 0 && rollup.unclassified > 0 && (
          <span className="text-xs text-muted-foreground">({rollup.unclassified} more pending)</span>
        )}
      </div>
    </Card>
  );
}
