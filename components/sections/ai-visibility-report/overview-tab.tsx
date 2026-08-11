"use client";

// Overview tab of the AI-Visibility report — rebuilt to the SEO Blog Board v2
// comp (lines 1311-1381):
//   1. We360 purple brand-visibility hero (score ring + 2×2 stat cluster) — REAL
//      data, every stat clicks through to the answers behind it (evidence drawer).
//   2. Recommended next steps — ranked actions; real signals where available
//      (uncited mentions, top outreach gap domain, unconnected engines), DEMO
//      copy where the app can't yet derive the exact move.
//   3. AI Visibility score over time — REAL per-check composite trend (report.trend);
//      empty state until there are 2+ checks.
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
        <VisibilityPositionCard trend={report.trend} composite={report.composite} compositePrev={report.compositePrev} />
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
  //    task board — kept as a direct action. REAL, from the saved citation sources;
  //    shown only when the last check actually surfaced a gap domain.
  const gapTarget = sourceGap.targets[0];
  if (gapTarget) {
    steps.push({
      title: `Earn a mention on ${gapTarget.domain}`,
      why: `AI cited ${gapTarget.domain} ${gapTarget.citations}× in your last check${gapTarget.citesCompetitor ? " and it names a competitor" : ""}, but never sources you — land a mention there and you land in the answer too.`,
      priority: "Medium", cta: "Draft outreach", onClick: onGoSources,
    });
  }

  // 3. Content refresh — REAL. The worst-covered topic (most answers × lowest
//     mention rate, excluding well-covered/branded ones) is where deeper, citable
//     content earns the most new mentions. Content work → Blog Sprint via the modal.
  const topicGap = report.topics
    .filter((t) => t.n >= 2 && t.mentionRate < 0.6)
    .sort((a, b) => (b.n * (1 - b.mentionRate)) - (a.n * (1 - a.mentionRate)))[0];
  if (topicGap) {
    const named = Math.round(topicGap.mentionRate * topicGap.n);
    const gap: GapAction = {
      key: "refresh-content", label: `Strengthen content for "${topicGap.topic}" questions`,
      fix: `Buyers ask AI "${topicGap.topic}" questions and it names you in only ${pct(topicGap.mentionRate)} of them (${named} of ${topicGap.n}). Publish a direct, citable answer for this topic so AI names you more often.`,
      route: "blog", real: true,
      why: `AI names you in just ${named} of ${topicGap.n} "${topicGap.topic}" answers — deeper, citable content here earns mentions on high-intent questions.`,
    };
    steps.push({ title: gap.label, why: gap.why, priority: "Medium", cta: "Create content", gap, onClick: openGap(gap) });
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

// ── AI Visibility score over time — REAL data (report.trend: the stored per-check
// composite scores). Shows an empty state until there are 2+ checks so we never
// draw a fabricated trend. Raw hex is used only inside the inline SVG (allowed).
const CHART_W = 560, CHART_TOP = 10, CHART_BOT = 140, CHART_VH = 150;

function seriesPath(vals: number[]): string {
  return vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * CHART_W;
    const y = CHART_BOT - v * (CHART_BOT - CHART_TOP);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

function fmtPeriod(p: string): string {
  try { return new Date(p).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
  catch { return p; }
}

function VisibilityPositionCard({ trend, composite, compositePrev }: {
  trend: Array<{ period: string; composite: number }>;
  composite: number;
  compositePrev: number | null;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const header = (
    <div className="mb-3.5 flex items-center gap-2">
      <span className="flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <TrendingUp className="size-3.5" />
      </span>
      <div>
        <span className="font-heading text-[15px] font-bold text-foreground">AI Visibility score</span>{" "}
        <span className="text-[12.5px] text-muted-foreground">· are you rising in AI answers?</span>
      </div>
    </div>
  );

  // Need at least two checks to draw a line — otherwise an empty state.
  if (trend.length < 2) {
    return (
      <Card className="p-5 lg:p-6">
        {header}
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-12 text-center">
          <TrendingUp className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Not enough history yet</p>
          <p className="max-w-xs text-[13px] text-muted-foreground">
            Your score trend appears once you&apos;ve run at least two AI-visibility checks.
            {trend.length === 1 ? " One check recorded so far." : ""}
          </p>
        </div>
      </Card>
    );
  }

  const vals = trend.map((t) => Math.max(0, Math.min(100, t.composite)) / 100);
  const labels = trend.map((t) => fmtPeriod(t.period));
  const n = vals.length;
  const xAt = (i: number) => (i / (n - 1)) * CHART_W;
  const yAt = (v: number) => CHART_BOT - v * (CHART_BOT - CHART_TOP);
  const line = seriesPath(vals);
  const area = `${line} L${CHART_W} ${CHART_BOT} L0 ${CHART_BOT} Z`;
  const delta = compositePrev != null ? composite - compositePrev : null;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    setHover(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))));
  };
  const leftPct = hover != null ? (hover / (n - 1)) * 100 : 0;
  const flip = leftPct > 56;

  return (
    <Card className="p-5 lg:p-6">
      {header}

      <div className="mb-3.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-[32px] font-medium leading-none tabular-nums text-foreground">
          {composite}<span className="text-lg text-muted-foreground">/100</span>
        </span>
        {delta != null && delta !== 0 && (
          <span className={cn("inline-flex items-center gap-0.5 text-[13px] font-bold tabular-nums", delta > 0 ? "text-success-strong" : "text-error")}>
            {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} vs last check
          </span>
        )}
      </div>

      <div className="relative" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${CHART_W} ${CHART_VH}`} preserveAspectRatio="none" className="block h-[180px] w-full" role="img" aria-label="AI Visibility composite score over time">
          <defs>
            <linearGradient id="aivVisFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7B62FF" stopOpacity="0.20" />
              <stop offset="100%" stopColor="#7B62FF" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[10, 42, 75, 108, 140].map((y) => (
            <line key={y} x1="0" x2={CHART_W} y1={y} y2={y} stroke="var(--color-slate-100)" strokeWidth="1" />
          ))}
          <path d={area} fill="url(#aivVisFill)" />
          <path d={line} fill="none" stroke="#7B62FF" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {hover != null && (
            <>
              <line x1={xAt(hover)} x2={xAt(hover)} y1={CHART_TOP} y2={CHART_BOT} stroke="var(--color-slate-300)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <circle cx={xAt(hover)} cy={yAt(vals[hover])} r="4.5" fill="#7B62FF" stroke="var(--color-slate-0)" strokeWidth="2" />
            </>
          )}
        </svg>
        {hover != null && (
          <div
            className="pointer-events-none absolute top-1.5 z-10 w-[9rem] rounded-xl border border-border bg-popover px-3 py-2.5 shadow-overlay"
            style={{ left: `${leftPct}%`, transform: flip ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}
          >
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-foreground">
              <Calendar className="size-3 text-muted-foreground" />{labels[hover]}
            </div>
            <div className="flex items-center justify-between gap-2.5">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full" style={{ backgroundColor: "#7B62FF" }} />Score
              </span>
              <span className="text-[12.5px] font-bold tabular-nums text-foreground">{trend[hover].composite}/100</span>
            </div>
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-between">
        {labels.map((m, i) => <span key={i} className="font-mono text-[10.5px] text-slate-300">{m}</span>)}
      </div>
    </Card>
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
