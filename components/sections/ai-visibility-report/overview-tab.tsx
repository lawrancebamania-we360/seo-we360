"use client";

// Overview tab of the AI-Visibility report — rebuilt to the SEO Blog Board v2
// comp (lines 1311-1381):
//   1. Ember brand-visibility hero (score ring + 2×2 stat cluster) — REAL data,
//      every stat clicks through to the answers behind it (evidence drawer).
//   2. Recommended next steps — ranked actions; real signals where available
//      (uncited mentions, top outreach gap domain, unconnected engines), DEMO
//      copy where the app can't yet derive the exact move.
//   3. Visibility & position over time — DEMO area+line chart (the app doesn't
//      compute a per-check visibility/position timeseries yet).
//   4. Competitive standing — real visibility, DEMO SOV/sentiment/avg-pos.
//
// The evidence-drawer wiring and all REAL rates are preserved; DEMO spots are
// flagged inline and owner-approved.

import { useState, type PointerEvent } from "react";
import Link from "next/link";
import { ArrowRight, Calendar, Sparkles, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AiVisibilityHeroBand, type AiVisibilityHeroStat, type AiVisibilityHeroDelta } from "@/components/ui/ai-visibility-hero-band";
import { cn } from "@/lib/utils";
import { ENGINE_LABEL, type AiEngine } from "@/lib/ai-citation/types";
import type { AiVisibilityReport } from "@/lib/ai-citation/report";
import type { SourceGapReport } from "@/lib/ai-citation/source-gap";
import type { Ga4AiReferral } from "@/lib/google/ga4";
import { type GapAction } from "@/lib/ai-citation/gap-tasks";
import { GapActionModal } from "@/components/sections/ai-visibility-report/gap-action-modal";
import { useEvidence } from "./evidence-context";
import { CompetitiveStanding } from "./competitive-standing";

const pct = (x: number) => (x > 0 && x < 0.005 ? "<1%" : `${Math.round(x * 100)}%`);

export function OverviewTab({ report, aiReferral, configuredEngines, sourceGap, projectId, canManage, onGoSources, onOpenSetup }: {
  report: AiVisibilityReport;
  aiReferral: Ga4AiReferral;
  configuredEngines: { key: string; label: string }[];
  sourceGap: SourceGapReport;
  projectId: string;
  canManage: boolean;
  onGoSources: () => void;
  onOpenSetup: () => void;
}) {
  return (
    <div className="space-y-5">
      <VisibilityHero report={report} />
      <RecommendedNextSteps report={report} configuredEngines={configuredEngines} sourceGap={sourceGap} projectId={projectId} canManage={canManage} onGoSources={onGoSources} onOpenSetup={onOpenSetup} />
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <VisibilityPositionCard />
        <CompetitiveStanding report={report} projectId={projectId} canManage={canManage} />
      </div>
      <AiReferralStrip data={aiReferral} />
    </div>
  );
}

// One-line, honest headline derived from the real mention/citation split.
function heroHeadline(report: AiVisibilityReport): string {
  const m = report.mentionRate;
  const c = report.citationRate;
  if (m === 0) return "AI isn't naming you yet.";
  if (m >= 0.4 && c < m * 0.5) return "You're mentioned often, but rarely cited.";
  if (c >= 0.4) return "You're getting named and cited by AI.";
  if (m < 0.2) return "You rarely show up in AI answers.";
  return "You're on AI's radar — with room to grow.";
}

// Ember brand-visibility hero: the composite score ring + a 2×2 stat cluster,
// each stat clicking through to the underlying AI answers (evidence drawer).
function VisibilityHero({ report }: { report: AiVisibilityReport }) {
  const { openList } = useEvidence();
  const seeAnswers = "See the actual AI answers behind this number.";
  const stats: AiVisibilityHeroStat[] = [
    { label: "Cited", value: pct(report.citationRate), sub: "AI used your site as a source", title: seeAnswers, onClick: () => openList({ cited: true }, "Answers that cited your site") },
    { label: "Mentioned", value: pct(report.mentionRate), sub: "AI named your brand", title: seeAnswers, onClick: () => openList({ mentioned: true }, "Answers that named your brand") },
    { label: "Answers checked", value: String(report.totalRuns), sub: "across engines, sampled", title: "See every AI answer in this run.", onClick: () => openList({}, "All answers in this run") },
    { label: "Prompts", value: String(report.promptCount), sub: "buyer questions tested", title: "See every AI answer in this run.", onClick: () => openList({}, "All answers in this run") },
  ];
  // Score delta: REAL when a previous batch score exists; else a DEMO -12 so the
  // comp's directional "▾12" reads (owner-approved).
  const rawDelta = report.compositePrev != null ? report.composite - report.compositePrev : -12; // DEMO fallback
  const delta: AiVisibilityHeroDelta | undefined = rawDelta === 0 ? undefined : { value: String(Math.abs(rawDelta)), direction: rawDelta < 0 ? "down" : "up" };
  return (
    <div className="space-y-2">
      <AiVisibilityHeroBand
        score={report.composite}
        scoreLabel="AI Visibility (directional)"
        delta={delta}
        headline={heroHeadline(report)}
        detail={
          <>
            AI names <strong className="font-bold text-white">{report.projectLabel}</strong> in {pct(report.mentionRate)} of answers but only pulls your site as a source {pct(report.citationRate)} of the time — that gap is your opportunity.
          </>
        }
        stats={stats}
      />
      <p className="px-1 text-xs text-muted-foreground">Directional, sampled across runs. Click any number to read the actual AI answers behind it.</p>
    </div>
  );
}

// ── Recommended next steps (comp 1329-1341) ────────────────────────────────
type Priority = "High" | "Medium";
// A step's CTA is either a route Link (href), an in-page action (onClick), or a
// gap that opens the shared GapActionModal (open-existing-or-add on a board).
type NextStep = { title: string; why: string; priority: Priority; cta: string; href?: string; onClick?: () => void; gap?: GapAction; demo?: boolean };

function RecommendedNextSteps({ report, configuredEngines, sourceGap, projectId, canManage, onGoSources, onOpenSetup }: {
  report: AiVisibilityReport;
  configuredEngines: { key: string; label: string }[];
  sourceGap: SourceGapReport;
  projectId: string;
  canManage: boolean;
  onGoSources: () => void;
  onOpenSetup: () => void;
}) {
  // Steps that ARE task-board work (publish/refresh content) open the shared
  // GapActionModal → real-gap-style explanation → open-existing-or-add. Steps that
  // belong to a different subsystem (off-site outreach, engine keys) stay as their
  // dedicated in-page actions — the note in item 4 not to force the pattern onto
  // purely-navigational elements.
  const [activeGap, setActiveGap] = useState<GapAction | null>(null);
  const openGap = (gap: GapAction): NextStep["onClick"] => () => setActiveGap(gap);

  const steps: NextStep[] = [];

  // 1. Mentioned but not cited → publish a citable page. Real signal, inferred
  //    move (no page-diff) → "likely reason" in the modal. Routes to Blog Sprint.
  if (report.mentionRate > report.citationRate) {
    const gap: GapAction = {
      key: "getcited", label: "Publish a page AI can cite",
      fix: "Create a clear, citable page that directly answers a buyer question — a self-contained answer up top, sourced stats, and citability schema.",
      route: "blog", real: false,
      why: `AI names you in ${pct(report.mentionRate)} of answers but only sources your site ${pct(report.citationRate)} of the time — a clear, citable page closes that gap.`,
    };
    steps.push({ title: gap.label, why: gap.why, priority: "High", cta: "Get cited", gap, onClick: openGap(gap) });
  }

  // 2. Top outreach-gap domain → earn a mention. Off-site (Sources tab), NOT a
  //    task board — kept as a direct action. Real when a gap exists, else DEMO.
  const gapDomain = sourceGap.targets[0]?.domain ?? "skydiveguides.com"; // DEMO fallback domain
  steps.push({
    title: `Earn a mention on ${gapDomain}`,
    why: "This third-party page already feeds AI answers and cites a competitor, but never cites you — land a mention and you land in the answer too.",
    priority: "Medium", cta: "Draft outreach", onClick: onGoSources,
    demo: sourceGap.targets.length === 0,
  });

  // 3. Content refresh — DEMO topic (the app doesn't infer the exact page yet).
  //    Content work → Blog Sprint via the modal.
  {
    const gap: GapAction = {
      key: "refresh-content", label: "Refresh your safety & first-jump content",
      fix: "Deepen the pages buyers ask AI about (safety, what to expect) with direct answers and structure so they earn mentions on high-intent questions.",
      route: "blog", real: false,
      why: "Buyers ask AI about safety and what to expect first — depth here earns mentions on high-intent questions.",
    };
    steps.push({ title: gap.label, why: gap.why, priority: "Medium", cta: "Create content", gap, onClick: openGap(gap), demo: true });
  }

  // 4. Unconnected engines → add keys. Engine setup, NOT a task board — direct action.
  const onKeys = new Set(configuredEngines.map((e) => e.key));
  const missing = (["claude", "perplexity"] as AiEngine[]).filter((e) => !onKeys.has(e));
  if (missing.length) {
    steps.push({
      title: `Connect ${missing.map((e) => ENGINE_LABEL[e]).join(" & ")}`,
      why: "You're only measuring the engines with keys connected. Add these to see your visibility across more of where buyers ask.",
      priority: "Medium", cta: "Add keys", onClick: onOpenSetup,
    });
  }

  return (
    <Card className="p-5 lg:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-ember-50 text-ember-600 dark:bg-ember-950/40">
          <Sparkles className="size-3.5" />
        </span>
        <div>
          <span className="font-heading text-base font-bold text-foreground">Recommended next steps</span>{" "}
          <span className="text-[13px] text-muted-foreground">· ranked by impact on your visibility</span>
        </div>
      </div>
      <div className="-my-1">
        {steps.map((s, i) => (
          <div key={i} className={cn("flex items-center gap-3.5 py-3.5", i < steps.length - 1 && "border-b border-slate-150 dark:border-border")}>
            <span className="flex size-[34px] flex-none items-center justify-center rounded-[9px] bg-muted text-muted-foreground">
              <ArrowRight className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-foreground">{s.title}</span>
                <PriorityPill priority={s.priority} />
                {s.demo && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground" title="Representative — not yet derived from your data.">Demo</span>}
              </div>
              <div className="text-[12.5px] leading-relaxed text-muted-foreground">{s.why}</div>
            </div>
            <NextStepCta step={s} />
          </div>
        ))}
      </div>
      <GapActionModal gap={activeGap} projectId={projectId} canManage={canManage} onOpenChange={(o) => { if (!o) setActiveGap(null); }} />
    </Card>
  );
}

// A single interactive CTA per row — Link (route), button (in-page action / gap
// modal); never nested inside another interactive element.
function NextStepCta({ step }: { step: NextStep }) {
  const cls = "flex flex-none cursor-pointer items-center gap-1.5 rounded-[10px] border border-ember-100 bg-ember-50 px-3.5 py-2 text-[13px] font-semibold text-ember-600 transition-colors hover:bg-ember-100 dark:border-ember-900 dark:bg-ember-950/40 dark:text-ember-400";
  const body = <>{step.cta}<ArrowRight className="size-3.5" /></>;
  return step.href
    ? <Link href={step.href} className={cls}>{body}</Link>
    : <button type="button" onClick={step.onClick} className={cls}>{body}</button>;
}

function PriorityPill({ priority }: { priority: Priority }) {
  return (
    <span className={cn(
      "rounded-full px-2 py-0.5 text-[11px] font-bold",
      priority === "High" ? "bg-error/10 text-error-strong" : "bg-warning/10 text-warning-strong",
    )}>
      {priority}
    </span>
  );
}

// ── Visibility & position over time (comp 1346-1368) — DEMO ────────────────
// The app doesn't compute a per-check visibility/position timeseries yet, so the
// series, the two headline stats and their deltas are representative (owner-
// approved). Raw hex is used only inside the inline SVG stroke/fill (allowed).
const VIS_SERIES = [0.30, 0.42, 0.36, 0.55, 0.68, 0.80]; // normalized visibility, rising
const POS_SERIES = [0.28, 0.34, 0.30, 0.44, 0.52, 0.58]; // normalized "position score" (higher = better)
// Per-point DISPLAY values for the hover tooltip — representative, coherent with
// the two headline stats (ends at Visibility 35.1% and Avg position #4.6) and with
// the plotted line shapes (the idx-2 dip mirrors the series dip).
const VIS_PCT = [13.2, 18.5, 15.8, 24.2, 29.9, 35.1]; // visibility %, rising
const POS_NUM = [7.4, 6.6, 7.0, 5.6, 5.0, 4.6];        // avg answer position (lower = better)
const VIS_MONTHS = ["Feb", "Mar", "Apr", "May", "Jun", "Jul"];
const CHART_W = 560, CHART_TOP = 10, CHART_BOT = 140, CHART_VH = 150;

function seriesPath(vals: number[]): string {
  return vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * CHART_W;
    const y = CHART_BOT - v * (CHART_BOT - CHART_TOP);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

const visX = (i: number) => (i / (VIS_SERIES.length - 1)) * CHART_W;
const visY = (v: number) => CHART_BOT - v * (CHART_BOT - CHART_TOP);

function VisibilityPositionCard() {
  const line = seriesPath(VIS_SERIES);
  const area = `${line} L${CHART_W} ${CHART_BOT} L0 ${CHART_BOT} Z`;
  const posLine = seriesPath(POS_SERIES);
  // Hover crosshair + floating tooltip (matches the Wins/Competitors chart style).
  const n = VIS_SERIES.length;
  const [hover, setHover] = useState<number | null>(null);
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    setHover(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))));
  };
  const leftPct = hover != null ? (hover / (n - 1)) * 100 : 0;
  const flip = leftPct > 56;
  return (
    <Card className="p-5 lg:p-6">
      <div className="mb-3.5 flex items-center gap-2">
        <span className="flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-success-50 text-success-strong dark:bg-success-950/40">
          <TrendingUp className="size-3.5" />
        </span>
        <div>
          <span className="font-heading text-[15px] font-bold text-foreground">Visibility &amp; position</span>{" "}
          <span className="text-[12.5px] text-muted-foreground">· are you rising in AI answers?</span>
        </div>
      </div>

      <div className="mb-3.5 flex flex-wrap gap-x-6 gap-y-3">
        <TimeStat label="Visibility" value="35.1%" delta="11.9%" />
        <div className="border-l border-slate-150 pl-6 dark:border-border">
          <TimeStat label="Avg position" value="#4.6" delta="0.4" />
        </div>
      </div>

      <div className="mb-1.5 flex flex-wrap gap-4 text-[11.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="h-[3px] w-3 rounded-sm" style={{ background: "#1fa971" }} />Visibility %</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-[3px] w-3 rounded-sm" style={{ background: "#dd4424" }} />Avg position (higher = better)</span>
      </div>

      {/* Relative wrapper captures hover; the crosshair + dots live in the SVG, the
          floating tooltip is an HTML overlay positioned by percentage. */}
      <div className="relative" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${CHART_W} ${CHART_VH}`} preserveAspectRatio="none" className="block h-[180px] w-full" role="img" aria-label="Directional visibility and position trend (representative)">
          <defs>
            <linearGradient id="aivVisFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1fa971" stopOpacity="0.20" />
              <stop offset="100%" stopColor="#1fa971" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[10, 42, 75, 108, 140].map((y) => (
            <line key={y} x1="0" x2={CHART_W} y1={y} y2={y} stroke="var(--color-slate-100)" strokeWidth="1" />
          ))}
          <path d={area} fill="url(#aivVisFill)" />
          <path d={line} fill="none" stroke="#1fa971" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d={posLine} fill="none" stroke="#dd4424" strokeWidth="2.5" strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {hover != null && (
            <>
              <line x1={visX(hover)} x2={visX(hover)} y1={CHART_TOP} y2={CHART_BOT} stroke="var(--color-slate-300)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <circle cx={visX(hover)} cy={visY(VIS_SERIES[hover])} r="4.5" fill="#1fa971" stroke="var(--color-slate-0)" strokeWidth="2" />
              <circle cx={visX(hover)} cy={visY(POS_SERIES[hover])} r="4.5" fill="#dd4424" stroke="var(--color-slate-0)" strokeWidth="2" />
            </>
          )}
        </svg>
        {hover != null && (
          <div
            className="pointer-events-none absolute top-1.5 z-10 w-[10.5rem] rounded-xl border border-border bg-popover px-3 py-2.5 shadow-overlay"
            style={{ left: `${leftPct}%`, transform: flip ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}
          >
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-foreground">
              <Calendar className="size-3 text-muted-foreground" />{VIS_MONTHS[hover]}
            </div>
            <div className="mb-1.5 flex items-center justify-between gap-2.5">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full" style={{ backgroundColor: "#1fa971" }} />Visibility
              </span>
              <span className="text-[12.5px] font-bold tabular-nums text-foreground">{VIS_PCT[hover].toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between gap-2.5">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full" style={{ backgroundColor: "#dd4424" }} />Avg position
              </span>
              <span className="text-[12.5px] font-bold tabular-nums text-foreground">#{POS_NUM[hover].toFixed(1)}</span>
            </div>
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-between">
        {VIS_MONTHS.map((m) => <span key={m} className="font-mono text-[10.5px] text-slate-300">{m}</span>)}
      </div>
    </Card>
  );
}

function TimeStat({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <div>
      <div className="font-mono text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-mono text-[28px] font-medium leading-none tracking-tight tabular-nums text-foreground">{value}</span>
        <span className="inline-flex items-center gap-0.5 text-[13px] font-bold text-success-strong">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" aria-hidden><path d="M6 15l6-6 6 6" /></svg>{delta}
        </span>
      </div>
    </div>
  );
}

// Is being cited actually SENDING traffic? GA4 sessions/conversions/revenue
// attributed to AI assistants. Hidden when GA4 isn't connected or there are no AI
// sessions yet. REAL data.
function AiReferralStrip({ data }: { data: Ga4AiReferral }) {
  if (!data.connected || data.sessions === 0) return null;
  const trendUp = (data.trendPct ?? 0) >= 0;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-heading text-[15px] font-bold text-foreground flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-ember-500" /> Traffic AI is actually sending you
        </h3>
        <span className="text-xs text-muted-foreground">last 28 days, from GA4</span>
      </div>
      <div className="mt-3 grid gap-3 grid-cols-2 sm:grid-cols-4">
        <div>
          <div className="font-mono text-xl font-semibold tabular-nums flex items-center gap-1.5">
            {data.sessions.toLocaleString()}
            {data.trendPct != null && (
              <span className={cn("text-xs font-medium", trendUp ? "text-success-600 dark:text-success-400" : "text-error-600 dark:text-error-400")}>
                {trendUp ? "+" : ""}{data.trendPct}%
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">AI-referred sessions</div>
        </div>
        <div>
          <div className="font-mono text-xl font-semibold tabular-nums">{data.conversions.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Conversions from AI</div>
        </div>
        {data.revenue != null && data.revenue > 0 && (
          <div>
            <div className="font-mono text-xl font-semibold tabular-nums">{data.revenue.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Revenue from AI</div>
          </div>
        )}
        {data.bySource.length > 0 && (
          <div className="col-span-2 sm:col-span-1 min-w-0">
            <div className="text-xs text-muted-foreground mb-1">Top AI sources</div>
            <div className="flex flex-wrap gap-1">
              {data.bySource.slice(0, 3).map((s) => (
                <span key={s.source} className="text-xs rounded bg-muted px-1.5 py-0.5 truncate max-w-full">{s.source} · {s.sessions}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
