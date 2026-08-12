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
import { VisibilityHeatmaps } from "./visibility-heatmaps";

const pct = (x: number) => (x > 0 && x < 0.005 ? "<1%" : `${Math.round(x * 100)}%`);

export function BreakdownsTab({ report, configuredEngines }: {
  report: AiVisibilityReport;
  configuredEngines: { key: string; label: string }[];
}) {
  return (
    <div className="space-y-4">
      {/* Tone summary reads as a full-width banner (a short chip strip) instead of
          a short card leaving dead space next to the taller engine card. */}
      <HowAiTalks report={report} />
      {/* Two similar-height breakdowns side by side (stretched to align); the taller
          persona list runs full width below so nothing is left ragged. */}
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <EngineCoverage report={report} configuredEngines={configuredEngines} />
        <TopicBreakdown report={report} />
      </div>
      <PersonaBreakdown report={report} />
      <VisibilityHeatmaps report={report} />
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
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${hasRuns ? Math.max(2, Math.round(rate * 100)) : 0}%` }} />
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

// "By persona" — how often each buyer persona hears your name, over REAL
// report.personas rates. Status is a UI label over the measured rate. (Moved
// here from the Sample answers tab.)
function personaStatus(rate: number): { label: string; className: string } {
  if (rate >= 0.8) return { label: "Strong", className: "bg-success/10 text-success-strong" };
  if (rate >= 0.5) return { label: "Good", className: "bg-warning/10 text-warning-strong" };
  return { label: "Needs work", className: "bg-error/10 text-error-strong" };
}

function PersonaBreakdown({ report }: { report: AiVisibilityReport }) {
  const { openList } = useEvidence();
  return (
    <Card className="p-5 lg:p-6">
      <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">By persona</h2>
      <p className="mt-0.5 mb-3 text-[12.5px] text-muted-foreground">How often each buyer persona hears your name.</p>
      {!report.personas.length && <p className="text-xs text-muted-foreground">No persona data yet.</p>}
      <div className="-mx-2">
        {report.personas.map((p) => {
          const st = personaStatus(p.mentionRate);
          return (
            <button key={p.persona} type="button" onClick={() => openList({ persona: p.persona }, `Answers for "${p.persona}"`)}
              className="group flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left cursor-pointer transition-colors hover:bg-muted/40"
              title="See the actual AI answers behind this bar.">
              <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-muted text-[13px] font-bold text-muted-foreground">
                {p.persona.trim().charAt(0).toUpperCase() || "?"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[13.5px] font-bold text-foreground group-hover:underline underline-offset-2">{p.persona}</span>
                  <span className={cn("flex-none rounded-full px-2 py-0.5 text-[11px] font-bold", st.className)}>{st.label}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(2, Math.round(p.mentionRate * 100))}%` }} />
                  </div>
                  <span className="w-10 shrink-0 text-right font-mono text-[13px] font-medium tabular-nums text-foreground">{pct(p.mentionRate)}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// "By topic" — a 6-dot rating scaled from the REAL topic mention rate, with the
// measured count behind it.
function topicStatus(rate: number): { label: string; className: string } {
  if (rate >= 0.8) return { label: "Always", className: "bg-success/10 text-success-strong" };
  if (rate >= 0.5) return { label: "Usually", className: "bg-warning/10 text-warning-strong" };
  return { label: "Often missed", className: "bg-error/10 text-error-strong" };
}

function TopicBreakdown({ report }: { report: AiVisibilityReport }) {
  const { openList } = useEvidence();
  return (
    <Card className="p-5 lg:p-6">
      <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">By topic</h2>
      <p className="mt-0.5 mb-3 text-[12.5px] text-muted-foreground">How often you&apos;re named, topic by topic.</p>
      {!report.topics.length && <p className="text-xs text-muted-foreground">No topic data yet.</p>}
      <div className="-mx-2">
        {report.topics.map((t) => {
          const st = topicStatus(t.mentionRate);
          const filled = Math.round(t.mentionRate * 6);
          const named = Math.round(t.mentionRate * t.n);
          return (
            <button key={t.topic} type="button" onClick={() => openList({ topic: t.topic }, `Answers about "${t.topic}"`)}
              className="group block w-full rounded-xl px-2 py-2.5 text-left cursor-pointer transition-colors hover:bg-muted/40"
              title="See the actual AI answers behind this rating.">
              <div className="mb-2 flex items-center justify-between gap-2.5">
                <span className="truncate text-sm font-bold text-foreground group-hover:underline underline-offset-2">{t.topic}</span>
                <span className={cn("flex-none rounded-full px-2 py-0.5 text-[11px] font-bold", st.className)}>{st.label}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex gap-1.5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <span key={i} className={cn("size-2.5 rounded-full", i < filled ? "bg-primary" : "bg-muted")} />
                  ))}
                </div>
                <span className="whitespace-nowrap text-[12.5px] font-semibold text-muted-foreground">{named} of {t.n} answer{t.n === 1 ? "" : "s"}</span>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
