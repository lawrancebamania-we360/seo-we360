"use client";

// Breakdowns tab — comp lines 1384-1436.
//   • "How AI talks about you" — theme/sentiment chips (green = good, red = gap),
//      driven by the REAL post-hoc brand-sentiment rollup; each chip opens the
//      answers behind it.
//   • "Coverage by AI engine" — the REAL per-engine mention rate for configured
//      engines; unconfigured engines show the connect / weekly-pass hint.
//   • Persona × funnel-stage gap matrix (real), preserved from the report.
// No fabricated data — engines/personas/topics/funnel are all measured.

import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ENGINE_LABEL, type AiEngine } from "@/lib/ai-citation/types";
import type { AiVisibilityReport } from "@/lib/ai-citation/report";
import { SENTIMENT_LABEL, type BrandSentiment } from "@/lib/ai-citation/trust";
import { EngineLogo } from "@/components/icons/engines/engine-logo";
import { useEvidence } from "./evidence-context";
import { PersonaStageMatrix } from "./persona-stage-matrix";

const pct = (x: number) => (x > 0 && x < 0.005 ? "<1%" : `${Math.round(x * 100)}%`);

export function BreakdownsTab({ report, configuredEngines }: {
  report: AiVisibilityReport;
  configuredEngines: { key: string; label: string }[];
}) {
  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <HowAiTalks report={report} />
        <EngineCoverage report={report} configuredEngines={configuredEngines} />
      </div>
      <PersonaStageMatrix funnel={report.funnel} />
    </div>
  );
}

// "How AI talks about you" — the brand-sentiment tiers as green/amber/red chips.
const SENTIMENT_CHIP: Record<BrandSentiment, { dot: string; className: string }> = {
  recommended: { dot: "bg-success", className: "border-success/30 bg-success/10 text-success-strong" },
  with_caveats: { dot: "bg-warning", className: "border-warning/30 bg-warning/10 text-warning-strong" },
  dismissed: { dot: "bg-error", className: "border-error/30 bg-error/10 text-error-strong" },
};

function HowAiTalks({ report }: { report: AiVisibilityReport }) {
  const { openList, classifying } = useEvidence();
  const r = report.sentimentRollup;
  const tiers: { tier: BrandSentiment; key: "recommended" | "withCaveats" | "dismissed" }[] = [
    { tier: "recommended", key: "recommended" },
    { tier: "with_caveats", key: "withCaveats" },
    { tier: "dismissed", key: "dismissed" },
  ];
  const anyClassified = r.recommended + r.withCaveats + r.dismissed > 0;

  return (
    <Card className="p-5 lg:p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">How AI talks about you</h2>
        <span className="text-[13px] text-muted-foreground">
          {r.mentioned > 0 ? `across ${r.mentioned} answer${r.mentioned === 1 ? "" : "s"} that named you` : "no mentions yet"}
        </span>
      </div>
      {r.mentioned === 0 ? (
        <p className="text-sm text-muted-foreground">AI hasn&apos;t named your brand in this run yet — nothing to characterize.</p>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {tiers.map(({ tier, key }) => {
            const v = r[key];
            if (!v) return null;
            const meta = SENTIMENT_CHIP[tier];
            return (
              <button key={tier} type="button"
                onClick={() => openList({ sentiment: tier, mentioned: true }, `Answers where you were ${SENTIMENT_LABEL[tier].toLowerCase()}`)}
                className={cn("inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-opacity hover:opacity-80 cursor-pointer", meta.className)}
                title="See the actual AI answers behind this count.">
                <span className={cn("size-[7px] rounded-full", meta.dot)} />
                {SENTIMENT_LABEL[tier]} in {v}
              </button>
            );
          })}
          {classifying && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse">
              <Loader2 className="size-3 animate-spin" /> Reading {r.unclassified} answer{r.unclassified === 1 ? "" : "s"}...
            </span>
          )}
          {!classifying && !anyClassified && r.unclassified > 0 && (
            <span className="text-xs text-muted-foreground">Tone is classified automatically when an owner or admin opens this report.</span>
          )}
          {!classifying && anyClassified && r.unclassified > 0 && (
            <span className="inline-flex items-center text-xs text-muted-foreground">{r.unclassified} more pending</span>
          )}
        </div>
      )}
    </Card>
  );
}

// "Coverage by AI engine" — real mention rate for the engines that ran; a
// connect / weekly-pass hint for the rest. ChatGPT runs today; Claude &
// Perplexity light up when their key is added; Google is a weekly managed pass.
const ALL_ENGINES: AiEngine[] = ["chatgpt", "claude", "perplexity", "google_aio"];
const ENGINE_MODEL: Record<AiEngine, string> = {
  chatgpt: "GPT-4o", claude: "Claude", perplexity: "Perplexity", google_aio: "AI Overviews",
};

function EngineCoverage({ report, configuredEngines }: {
  report: AiVisibilityReport; configuredEngines: { key: string; label: string }[];
}) {
  const { openList } = useEvidence();
  const onKeys = new Set(configuredEngines.map((e) => e.key));
  const byEngine = new Map(report.engines.map((e) => [e.engine, e]));

  return (
    <Card className="flex flex-col p-5 lg:p-6">
      <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">Coverage by AI engine</h2>
      <p className="mt-1 mb-4 text-[13px] text-muted-foreground">Mention rate per engine. Connect more to compare.</p>
      <div className="-mx-2 space-y-0.5">
        {ALL_ENGINES.map((e) => {
          const data = byEngine.get(e);
          const managed = e === "google_aio";
          const on = onKeys.has(e) || managed;
          const rate = data?.mentionRate ?? 0;
          const hasRuns = (data?.n ?? 0) > 0;
          const clickable = hasRuns;
          const sub = hasRuns
            ? `${ENGINE_MODEL[e]} · ${data!.n} answer${data!.n === 1 ? "" : "s"}`
            : managed ? "Runs weekly — no key needed" : `Add ${ENGINE_LABEL[e]} API key to compare`;

          const inner = (
            <div className="flex items-center gap-3 rounded-xl px-2 py-3 transition-colors">
              <span className={cn("flex size-9 flex-none items-center justify-center rounded-lg", on ? "bg-muted" : "bg-muted/50")}>
                <EngineLogo engine={e} size={18} className={cn(!hasRuns && "grayscale opacity-60")} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">{ENGINE_LABEL[e]}</span>
                  <span className="font-mono text-sm font-medium tabular-nums text-foreground">{hasRuns ? pct(rate) : "—"}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-success-500 transition-all" style={{ width: `${hasRuns ? Math.max(2, Math.round(rate * 100)) : 0}%` }} />
                </div>
                <div className="mt-1.5 text-[11.5px] text-slate-350">{sub}</div>
              </div>
            </div>
          );

          return clickable ? (
            <button key={e} type="button" onClick={() => openList({ engine: e }, `Answers from ${ENGINE_LABEL[e]}`)}
              className="block w-full text-left cursor-pointer rounded-xl hover:bg-muted/40" title="See the actual AI answers from this engine.">
              {inner}
            </button>
          ) : (
            <div key={e} className="opacity-90">{inner}</div>
          );
        })}
      </div>
    </Card>
  );
}
