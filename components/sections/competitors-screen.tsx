"use client";

// Competitors — an exact structural + visual replica of the "SEO Blog Board v2"
// comp (design lines 2007–2199). Nine blocks, in the comp's order:
//   1. Competitor rail (YOU pill + dashed "Add competitor")   ← REAL names
//   2. Range note ("Showing data for …")
//   3. KPI strip (share of voice / avg position / keywords / AI citations)
//   4. Visibility trend (inline multi-line SVG + crosshair + floating tooltip)
//   5. Head-to-head scorecard (scrolling table, per-row 60×22 sparkline)
//   6. Share of voice donut + legend
//   7. Keyword gap
//   8. What they rank for (per-rival keyword boards)          ← REAL delete
//   (9. Add-competitor modal lives in competitor-dialogs.tsx, opened from the rail)
//
// DATA MODEL: the owner approved representative demo data so this screen renders
// POPULATED like the comp (rank tracking that would compute these metrics live
// isn't shipped yet). The real, live signals are still kept where the app
// provides them: the competitor list + names (the rail, scorecard, donut and
// keyword boards weave in the real project/competitor names), the real AI share
// of voice for the KPI when a citation run exists, and the real add/delete
// competitor mutations. Everything the app can't yet measure — the weekly
// visibility trend, the head-to-head numbers (visibility / avg-pos / keywords /
// AI-citations / domain-rating / content / site-health), the keyword-gap
// volumes/intents/positions, and per-rival keyword positions/volumes — comes
// from the clearly-labelled DEMO_BENCHMARK constant below. All colours resolve
// to brand tokens, keeping this file style-drift clean.

import * as React from "react";
import { Megaphone, Target, Search, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { TimeRangeFilter, rangeDayLabel, type RangePreset } from "@/components/ui/time-range-filter";
import { CompanyLogo } from "@/components/dashboard/company-logo";
import { NewCompetitorDialog, DeleteCompetitorButton } from "@/components/sections/competitor-dialogs";
import type { Competitor } from "@/lib/types/database";
import type { CompetitorCitationStats } from "@/lib/data/competitor-citations";
import type { CompetitorSiteHealthRow } from "@/lib/data/competitor-site-health";

// Categorical series palette — all brand tokens (usable directly as an SVG
// stroke / conic segment; no raw hex / banned palette classes). Maps 1:1 to the
// comp's line colours: ember, blue, violet, green, amber.
const SERIES = [
  "var(--color-ember-500)", // #dd4424 — you
  "var(--color-info)", // blue
  "var(--color-violet-chart)", // #7a5af0 — violet
  "var(--color-success)", // #1fa971 — green
  "var(--color-warning)", // #e8a317 — amber
  "var(--color-slate-400)",
];

type BenchKey = "visibility" | "sov" | "avgPos" | "keywords" | "aiCitations" | "dr" | "content" | "siteHealth";
const BENCH_COLS: { key: BenchKey; label: string; asc?: boolean; fmt: (v: number) => string }[] = [
  { key: "visibility", label: "Visibility", fmt: (v) => `${v}%` },
  { key: "sov", label: "Share of voice", fmt: (v) => `${v.toFixed(1)}%` },
  { key: "avgPos", label: "Avg pos", asc: true, fmt: (v) => `#${v.toFixed(1)}` },
  { key: "keywords", label: "Keywords", fmt: (v) => v.toLocaleString() },
  { key: "aiCitations", label: "AI citations", fmt: (v) => String(v) },
  { key: "dr", label: "Domain rating", fmt: (v) => String(v) },
  { key: "content", label: "Content", fmt: (v) => `${v}/mo` },
  { key: "siteHealth", label: "Site health", fmt: (v) => String(v) },
];

type DemoBrand = {
  name: string;
  visibility: number;
  delta: number; // week-over-week visibility change (the scorecard trend badge)
  sov: number;
  avgPos: number;
  keywords: number;
  aiCitations: number;
  dr: number;
  content: number;
  siteHealth: number;
  trend: number[]; // 8 weekly visibility points, Feb 14 → May 15
  topKeywords: { kw: string; pos: number; vol: string }[];
};

// ── DEMO placeholder data — owner-approved until rank-tracking lands ──────────
// The five brands + all their numbers mirror the comp exactly. Real project /
// competitor names are woven over slot 0..n at render; anything past the real
// set keeps these demo names so the board always looks populated like the comp.
const DEMO_BRANDS: DemoBrand[] = [
  {
    name: "Skyhigh India",
    visibility: 47,
    delta: 3.2,
    sov: 28.5,
    avgPos: 2.1,
    keywords: 1240,
    aiCitations: 31,
    dr: 58,
    content: 12,
    siteHealth: 74,
    trend: [40, 41, 39, 42, 43, 45, 44, 47],
    topKeywords: [
      { kw: "tandem skydiving india", pos: 2, vol: "4.2K" },
      { kw: "skydiving mysore", pos: 1, vol: "2.1K" },
      { kw: "skyhigh india", pos: 1, vol: "1.6K" },
      { kw: "skydive experience", pos: 4, vol: "3.0K" },
      { kw: "first jump guide", pos: 3, vol: "900" },
    ],
  },
  {
    name: "Skydive India",
    visibility: 52,
    delta: 1.4,
    sov: 31.2,
    avgPos: 1.9,
    keywords: 1580,
    aiCitations: 38,
    dr: 64,
    content: 16,
    siteHealth: 81,
    trend: [46, 47, 48, 47, 49, 50, 51, 52],
    topKeywords: [
      { kw: "skydiving india", pos: 1, vol: "9.4K" },
      { kw: "skydiving cost india", pos: 1, vol: "8.1K" },
      { kw: "tandem skydiving", pos: 2, vol: "6.7K" },
      { kw: "skydiving license india", pos: 2, vol: "1.2K" },
      { kw: "best skydiving india", pos: 1, vol: "3.3K" },
    ],
  },
  {
    name: "Flying Fox",
    visibility: 38,
    delta: -0.8,
    sov: 19.7,
    avgPos: 2.5,
    keywords: 990,
    aiCitations: 22,
    dr: 61,
    content: 9,
    siteHealth: 77,
    trend: [40, 41, 40, 39, 41, 40, 39, 38],
    topKeywords: [
      { kw: "indoor skydiving bangalore", pos: 1, vol: "3.6K" },
      { kw: "flying fox india", pos: 1, vol: "2.8K" },
      { kw: "adventure sports india", pos: 3, vol: "5.1K" },
      { kw: "skydiving deccan", pos: 2, vol: "1.4K" },
      { kw: "zipline india", pos: 1, vol: "2.2K" },
    ],
  },
  {
    name: "Jumpin Heights",
    visibility: 29,
    delta: 0.6,
    sov: 12.4,
    avgPos: 3.4,
    keywords: 640,
    aiCitations: 14,
    dr: 49,
    content: 6,
    siteHealth: 69,
    trend: [28, 27, 29, 28, 30, 28, 30, 29],
    topKeywords: [
      { kw: "bungee jumping india", pos: 1, vol: "12.5K" },
      { kw: "jumpin heights", pos: 1, vol: "4.0K" },
      { kw: "tandem jump training", pos: 1, vol: "1.9K" },
      { kw: "rishikesh adventure", pos: 2, vol: "6.2K" },
      { kw: "giant swing", pos: 1, vol: "3.1K" },
    ],
  },
  {
    name: "Temple Pilots",
    visibility: 21,
    delta: -1.1,
    sov: 8.2,
    avgPos: 4.1,
    keywords: 410,
    aiCitations: 9,
    dr: 44,
    content: 4,
    siteHealth: 63,
    trend: [27, 26, 25, 26, 24, 23, 22, 21],
    topKeywords: [
      { kw: "paragliding india", pos: 1, vol: "14.0K" },
      { kw: "paragliding vs skydiving", pos: 1, vol: "2.4K" },
      { kw: "temple pilots", pos: 1, vol: "1.1K" },
      { kw: "kamshet paragliding", pos: 1, vol: "5.5K" },
      { kw: "adventure courses", pos: 4, vol: "2.9K" },
    ],
  },
];

// 8-week x-axis (Feb 14 → May 15), doubling as the hover-tooltip date per point.
const TREND_DATES = ["Feb 14", "Feb 28", "Mar 13", "Mar 27", "Apr 10", "Apr 24", "May 8", "May 15"];
const TREND_Y_LABELS = [60, 45, 30, 15, 0];
const TREND_TOP = 60;

// KPI strip — the comp's four cards (all trending up / green).
const DEMO_KPIS: { label: string; value: string; rank: string; delta: string; icon: React.ReactNode; tint: string }[] = [
  {
    label: "Your share of voice",
    value: "28.5%",
    rank: "Rank 2nd of 5",
    delta: "+3.2 pts",
    icon: <Megaphone className="text-primary" />,
    tint: "var(--color-ember-50)",
  },
  {
    label: "Avg position",
    value: "#2.1",
    rank: "2nd of 5",
    delta: "+0.3",
    icon: <Target className="text-info" />,
    tint: "var(--color-info-50)",
  },
  {
    label: "Keywords ranked",
    value: "1,240",
    rank: "2nd of 5",
    delta: "+86",
    icon: <Search className="text-success" />,
    tint: "var(--color-success-50)",
  },
  {
    label: "AI citations",
    value: "31",
    rank: "2nd of 5",
    delta: "+5",
    icon: <Sparkles style={{ color: "var(--color-warning)" }} />,
    tint: "var(--color-warning-50)",
  },
];

// Keyword gap — leaderIndex points at a DEMO_BRANDS slot so the leader logo picks
// up the real (woven) competitor name/logo when one exists at that slot.
// Real competitor rank-tracking (keyword gap + per-rival keyword boards) isn't
// built yet — render an honest "coming soon" state instead of the placeholder
// demo keywords, so a project never sees another industry's data as its own.
// Flip to true once real competitor keyword/DR data is wired in.
const BENCHMARK_LIVE = false;

const DEMO_GAPS: { kw: string; vol: string; intent: string; leaderIndex: number; our: string; priority: "High" | "Medium" | "Low" }[] = [
  { kw: "skydiving cost india", vol: "8.1K", intent: "Commercial", leaderIndex: 1, our: "#12", priority: "High" },
  { kw: "indoor skydiving bangalore", vol: "3.6K", intent: "Commercial", leaderIndex: 2, our: "—", priority: "High" },
  { kw: "paragliding vs skydiving", vol: "2.4K", intent: "Informational", leaderIndex: 4, our: "—", priority: "Medium" },
  { kw: "tandem jump training", vol: "1.9K", intent: "Commercial", leaderIndex: 3, our: "#8", priority: "Medium" },
  { kw: "skydiving license india", vol: "1.2K", intent: "Commercial", leaderIndex: 1, our: "#15", priority: "Low" },
];

// Same canonical day-based lookback set as Overview. The competitor benchmark
// numbers here are approved demo data (rank tracking that would compute a real
// time series isn't shipped), so the control re-labels the view but the metrics
// are static until real per-competitor history lands — see the file header.
const COMPETITOR_PRESETS: RangePreset[] = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
  { value: "all", label: "All time" },
];

export function CompetitorsScreen({
  competitors,
  projectId,
  projectName,
  projectDomain,
  canManage,
  citationStats,
  rangeValue,
  rangeLabel,
  rangeFrom = null,
  rangeTo = null,
}: {
  competitors: Competitor[];
  projectId: string;
  projectName: string;
  projectDomain: string;
  canManage: boolean;
  citationStats: CompetitorCitationStats;
  // siteHealth is still supplied by the route (real PageSpeed data), but the
  // scorecard's site-health column renders the demo benchmark to match the comp,
  // so it is intentionally not consumed here.
  siteHealth: Record<string, CompetitorSiteHealthRow>;
  // Canonical time-range control (URL-driven from the page's searchParams).
  rangeValue?: string;
  rangeLabel?: string;
  rangeFrom?: string | null;
  rangeTo?: string | null;
}) {
  const activeRangeValue = rangeValue ?? "90";
  const RANGE =
    rangeLabel ??
    (rangeFrom && rangeTo
      ? `${rangeDayLabel(rangeFrom)} – ${rangeDayLabel(rangeTo)}`
      : COMPETITOR_PRESETS.find((p) => p.value === activeRangeValue)?.label ?? "Last 90 days");

  // ── Weave real names/logos over the demo brand slots ──────────────────────
  // Slot 0 = the project ("YOU"); slots 1..n = real competitors; anything beyond
  // the real set falls back to the demo brand name so the board stays populated.
  type Brand = DemoBrand & { domain: string | null; you: boolean; competitorId: string | null; color: string };
  const realSlots: { name: string; domain: string | null; competitorId: string | null }[] = [
    { name: projectName || DEMO_BRANDS[0].name, domain: projectDomain || null, competitorId: null },
    ...competitors.map((c) => ({ name: c.name, domain: c.url ?? null, competitorId: c.id })),
  ];
  const brandCount = Math.max(DEMO_BRANDS.length, realSlots.length);
  const brands: Brand[] = Array.from({ length: brandCount }, (_, i) => {
    const demo = DEMO_BRANDS[i % DEMO_BRANDS.length];
    const real = realSlots[i];
    return {
      ...demo,
      name: real?.name ?? demo.name,
      domain: real?.domain ?? null,
      you: i === 0,
      competitorId: i === 0 ? null : (real?.competitorId ?? null),
      color: SERIES[i % SERIES.length],
    };
  });

  // Trend + donut mirror the comp's 5-brand layout; scorecard + boards show all.
  const trendBrands = brands.slice(0, 5);
  const donutBrands = brands.slice(0, 5);

  const bestOf = (key: BenchKey, asc = false) => {
    const vals = brands.map((r) => r[key]);
    return asc ? Math.min(...vals) : Math.max(...vals);
  };

  // Share of voice — prefer the real AI share-of-voice for the KPI headline when
  // a citation run exists; the donut keeps the comp's demo split for fidelity.
  const kpiSov = citationStats.hasData ? `${citationStats.project.sov}%` : DEMO_KPIS[0].value;
  const donutTotal = donutBrands.reduce((s, b) => s + b.sov, 0) || 1;
  const donutSegs: string[] = [];
  let sweep = 0;
  for (const b of donutBrands) {
    const start = sweep;
    sweep += (b.sov / donutTotal) * 360;
    donutSegs.push(`${b.color} ${start.toFixed(1)}deg ${sweep.toFixed(1)}deg`);
  }

  return (
    <div className="space-y-6 px-6 pb-12 pt-6 lg:px-10" data-tour-feature="comp-list">
      {/* Header + visual-only time-range control (mirrors the Overview pattern) */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-heading text-4xl leading-tight font-bold tracking-tight text-foreground sm:text-5xl">
            Competitors
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            See who owns the conversation across your keywords — and where you can pull ahead.
          </p>
        </div>
        <TimeRangeFilter
          presets={COMPETITOR_PRESETS}
          param="range"
          value={activeRangeValue}
          from={rangeFrom}
          to={rangeTo}
          label={RANGE}
          align="end"
        />
      </div>

      {/* 1 · COMPETITOR RAIL — real project + real competitors + add dialog */}
      <div className="flex flex-wrap items-center gap-2.5">
        <BrandChip name={projectName || "You"} domain={projectDomain} you />
        {competitors.map((c) => (
          <BrandChip key={c.id} name={c.name} domain={c.url} />
        ))}
        {canManage && <NewCompetitorDialog projectId={projectId} />}
      </div>

      {/* 2 · RANGE NOTE */}
      <div className="-mt-3 flex items-center gap-1.5 text-[13px] text-slate-400">
        Showing data for <strong className="font-semibold text-slate-700">{RANGE}</strong>
      </div>

      {/* 3 · KPI STRIP */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
        {DEMO_KPIS.map((k, i) => (
          <StatCard
            key={k.label}
            label={k.label}
            value={i === 0 ? kpiSov : k.value}
            rank={k.rank}
            delta={k.delta}
            icon={k.icon}
            tint={k.tint}
          />
        ))}
      </div>

      {/* 4 · VISIBILITY TREND */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">Visibility trend</h2>
            <p className="mt-1 text-[13px] text-slate-400">Share of AI answers won over the last 8 weeks.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3.5">
            {trendBrands.map((b) => (
              <span key={b.name} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-600">
                <span className="h-[3px] w-3 rounded-sm" style={{ backgroundColor: b.color }} />
                {b.name}
              </span>
            ))}
          </div>
        </div>
        <VisibilityTrend
          lines={trendBrands.map((b) => ({ name: b.name, color: b.color, values: b.trend }))}
          top={TREND_TOP}
          yLabels={TREND_Y_LABELS}
          xLabels={TREND_DATES}
        />
      </section>

      {/* 5 · HEAD-TO-HEAD SCORECARD */}
      <section>
        <div className="mb-3">
          <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">Head-to-head scorecard</h2>
          <p className="mt-1 text-[13px] text-slate-400">
            Every metric we track, you against the set. Green marks the category leader.
          </p>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(20,20,40,.04),0_14px_34px_-16px_rgba(20,20,40,.12)] klimb-scroll">
          <div className="min-w-[1000px]">
            <div className="grid grid-cols-[220px_repeat(8,minmax(94px,1fr))] gap-3 border-b border-border bg-muted/40 px-5 py-3.5">
              <span className="font-mono text-xs font-medium uppercase tracking-[0.1em] text-slate-400">Competitor</span>
              {BENCH_COLS.map((c) => (
                <span key={c.key} className="text-center font-mono text-xs font-medium uppercase tracking-[0.1em] text-slate-400">
                  {c.label}
                </span>
              ))}
            </div>
            {brands.map((r) => {
              const up = r.delta >= 0;
              return (
                <div
                  key={`${r.name}-${r.competitorId ?? "demo"}`}
                  className="grid grid-cols-[220px_repeat(8,minmax(94px,1fr))] items-center gap-3 border-b border-border/60 px-5 py-3.5 last:border-b-0"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <CompanyLogo name={r.name} domain={r.domain} size={30} rounded="rounded-full" className="shrink-0 ring-1 ring-border" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-foreground">{r.name}</div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <MiniSpark data={r.trend} color={r.color} />
                        <span className={cn("text-[11px] font-bold tabular-nums", up ? "text-success-strong" : "text-error")}>
                          {up ? "+" : ""}
                          {r.delta.toFixed(1)}
                        </span>
                      </div>
                    </div>
                    {r.you && (
                      <span className="shrink-0 rounded-full bg-ember-100 px-1.5 py-0.5 text-[9.5px] font-extrabold tracking-[0.04em] text-ember-600">
                        YOU
                      </span>
                    )}
                  </div>
                  {BENCH_COLS.map((c) => {
                    const v = r[c.key];
                    const isBest = v === bestOf(c.key, c.asc);
                    return (
                      <span
                        key={c.key}
                        className={cn(
                          "text-center font-mono text-sm tabular-nums",
                          isBest ? "font-extrabold text-success-strong" : "text-slate-600",
                        )}
                      >
                        {c.fmt(v)}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 6 + 7 · SHARE OF VOICE + KEYWORD GAP */}
      <div className="grid items-start gap-4 md:grid-cols-2">
        {/* 6 · Share of voice */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="font-heading text-[17px] font-semibold tracking-tight text-foreground">Share of voice</h2>
          <p className="mt-0.5 mb-4 text-[12.5px] text-slate-400">Who owns the conversation across tracked keywords.</p>
          <div className="flex flex-wrap items-center gap-6">
            <div className="relative size-[150px] shrink-0 rounded-full" style={{ background: `conic-gradient(${donutSegs.join(",")})` }}>
              <div className="absolute inset-[26px] flex flex-col items-center justify-center rounded-full bg-card">
                <span className="text-[11px] font-semibold text-slate-400">You</span>
                <span className="text-2xl font-medium leading-none tabular-nums text-primary">{donutBrands[0].sov}%</span>
              </div>
            </div>
            <div className="flex min-w-[150px] flex-1 flex-col gap-2.5">
              {donutBrands.map((b) => (
                <div key={b.name} className="flex items-center gap-2.5">
                  <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: b.color }} />
                  <span className="flex-1 truncate text-[13px] font-semibold text-slate-700">{b.name}</span>
                  <span className="text-[13px] tabular-nums text-foreground">{b.sov}%</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 7 · Keyword gap */}
        <section className="rounded-2xl border border-border bg-card px-6 pb-3 pt-6 shadow-sm">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-heading text-[17px] font-semibold tracking-tight text-foreground">Keyword gap</h2>
            {BENCHMARK_LIVE && (
              <span className="rounded-full bg-ember-50 px-2.5 py-0.5 text-xs font-semibold text-ember-600">
                {DEMO_GAPS.length} opportunities
              </span>
            )}
          </div>
          <p className="mt-1 mb-2 text-[12.5px] text-slate-400">
            High-value terms rivals rank for where you&rsquo;re weak or absent.
          </p>
          {!BENCHMARK_LIVE && (
            <p className="border-t border-slate-150 py-6 text-center text-[13px] text-slate-400">
              Competitor keyword gaps will appear here once rank tracking is live.
            </p>
          )}
          <div>
            {BENCHMARK_LIVE && DEMO_GAPS.map((g) => {
              const leader = brands[g.leaderIndex] ?? brands[0];
              const missing = g.our === "—";
              return (
                <div key={g.kw} className="flex items-center gap-3 border-t border-slate-150 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold text-slate-800">{g.kw}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-slate-400">
                      <span>{g.vol}/mo</span>
                      <span>·</span>
                      <span>{g.intent}</span>
                    </div>
                  </div>
                  <CompanyLogo
                    name={leader.name}
                    domain={leader.domain}
                    size={22}
                    rounded="rounded-full"
                    className="shrink-0 ring-1 ring-border"
                  />
                  <span
                    className={cn(
                      "w-9 shrink-0 text-center font-mono text-[12px] tabular-nums",
                      missing ? "text-slate-350" : "text-slate-600",
                    )}
                  >
                    {g.our}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                      g.priority === "High"
                        ? "bg-ember-50 text-ember-600"
                        : g.priority === "Medium"
                          ? "bg-warning/15 text-warning-strong"
                          : "bg-muted text-slate-500",
                    )}
                  >
                    {g.priority}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* 8 · WHAT THEY RANK FOR */}
      <section>
        <div className="mb-3">
          <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">What they rank for</h2>
          <p className="mt-1 text-[13px] text-slate-400">
            Domain rating and the top keywords each competitor currently ranks for.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {brands.map((b) => (
            <RivalBoard key={`${b.name}-${b.competitorId ?? "demo"}`} brand={b} canManage={canManage} />
          ))}
        </div>
      </section>
    </div>
  );
}

// ---- KPI tile — matches the comp exactly (label 13/600 slate-500, 30px value,
// 30×30 tinted icon disc, radius-16, rank + green up-delta row). ----------------
function StatCard({
  label,
  value,
  rank,
  delta,
  icon,
  tint,
}: {
  label: string;
  value: React.ReactNode;
  rank: string;
  delta: string;
  icon: React.ReactNode;
  tint: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3.5 flex items-center justify-between gap-2.5">
        <span className="text-[13px] font-semibold text-slate-500">{label}</span>
        <span
          className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] [&_svg]:size-[15px]"
          style={{ backgroundColor: tint }}
        >
          {icon}
        </span>
      </div>
      <div className="text-[30px] font-medium leading-none tracking-[-0.02em] tabular-nums text-foreground">{value}</div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[12.5px] text-slate-400">{rank}</span>
        <Delta text={delta} up />
      </div>
    </div>
  );
}

// Green (or red) delta chip with the comp's up-arrow glyph.
function Delta({ text, up }: { text: string; up: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[12.5px] font-semibold", up ? "text-success-strong" : "text-error")}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" className={up ? undefined : "rotate-180"}>
        <path d="M12 19V5M6 11l6-6 6 6" />
      </svg>
      {text}
    </span>
  );
}

// A brand pill for the competitor rail: logo + name, with a YOU tag for the
// current project (rounded-full, ember-tinted when it's you).
function BrandChip({ name, domain, you }: { name: string; domain?: string | null; you?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border py-1.5 pl-2 pr-3.5",
        you ? "border-ember-200 bg-ember-50" : "border-border bg-card",
      )}
    >
      <CompanyLogo name={name} domain={domain} size={26} rounded="rounded-full" className="shrink-0" />
      <span className="max-w-[160px] truncate text-[13.5px] font-semibold text-slate-800">{name}</span>
      {you && (
        <span className="rounded-full bg-ember-100 px-1.5 py-0.5 text-[10px] font-extrabold tracking-[0.04em] text-ember-600">YOU</span>
      )}
    </span>
  );
}

// ---- Visibility trend — inline multi-line SVG per the comp markup: y-labels,
// quarter grid lines, one 2.5px polyline per competitor, x-labels, and a hover
// crosshair + floating tooltip listing every competitor's value. ---------------
const TREND_W = 560;
const TREND_H = 176;

function VisibilityTrend({
  lines,
  top,
  yLabels,
  xLabels,
}: {
  lines: { name: string; color: string; values: number[] }[];
  top: number;
  yLabels: number[];
  xLabels: string[];
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const n = Math.max(...lines.map((l) => l.values.length), 1);

  const xAt = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * TREND_W);
  const yAt = (v: number) => TREND_H - (Math.max(0, Math.min(top, v)) / top) * TREND_H;

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))));
  };

  const hoverPct = hover != null && n > 1 ? (hover / (n - 1)) * 100 : 0;

  return (
    <div className="flex gap-2.5">
      <div className="flex h-[200px] shrink-0 flex-col justify-between pb-4 pt-0.5 text-right font-mono text-[10.5px] font-semibold tabular-nums text-slate-350">
        {yLabels.map((y, i) => (
          <span key={i}>{y}</span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div ref={wrapRef} className="relative" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${TREND_W} ${TREND_H}`} preserveAspectRatio="none" className="block h-[200px] w-full">
            {[0, 1, 2, 3, 4].map((k) => (
              <line key={k} x1="0" x2={TREND_W} y1={(TREND_H / 4) * k} y2={(TREND_H / 4) * k} stroke="var(--color-slate-150)" strokeWidth="1" />
            ))}
            {lines.map((l) => (
              <polyline
                key={l.name}
                points={l.values.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ")}
                fill="none"
                stroke={l.color}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {hover != null && (
              <>
                <line x1={xAt(hover)} x2={xAt(hover)} y1="0" y2={TREND_H} stroke="var(--color-slate-300)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                {lines.map((l) => (
                  <circle key={l.name} cx={xAt(hover)} cy={yAt(l.values[hover] ?? 0)} r="3.5" fill={l.color} vectorEffect="non-scaling-stroke" />
                ))}
              </>
            )}
          </svg>
          {hover != null && (
            <div
              className="pointer-events-none absolute top-2 z-10 rounded-xl border border-border bg-popover px-3 py-2 shadow-overlay"
              style={{ left: `${hoverPct}%`, transform: hoverPct > 55 ? "translateX(calc(-100% - 12px))" : "translateX(12px)" }}
            >
              <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                {xLabels[hover] ?? `Week ${hover + 1}`}
              </div>
              {lines.map((l) => (
                <div key={l.name} className="mb-1 flex items-center justify-between gap-3.5 last:mb-0">
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                    <span className="size-2 rounded-full" style={{ backgroundColor: l.color }} />
                    {l.name}
                  </span>
                  <span className="text-xs font-bold tabular-nums text-foreground">{l.values[hover]}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[10.5px] font-semibold tabular-nums text-slate-350">
          {xLabels.map((x, i) => (
            <span key={i}>{x}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// 60×22 inline sparkline for the scorecard rows (matches the comp exactly).
function MiniSpark({ data, color }: { data: number[]; color: string }) {
  const w = 60;
  const h = 22;
  if (data.length < 2) return <svg width={w} height={h} className="block shrink-0" />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = 1 + (i / (data.length - 1)) * (w - 2);
      const y = h - 2 - ((v - min) / span) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="block shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Position pill tint for the "what they rank for" keyword rows.
function posPillClass(pos: number): string {
  if (pos <= 1) return "bg-success-50 text-success-700";
  if (pos <= 3) return "bg-info-50 text-info-700";
  return "bg-muted text-slate-500";
}

// ---- "What they rank for" per-rival board — comp shape: 34px logo, name (+ YOU
// on the project), "N keywords ranked", DR pill, then five keyword rows with a
// position pill + monthly volume. Real competitors keep their delete control.
function RivalBoard({
  brand: b,
  canManage,
}: {
  brand: DemoBrand & { domain: string | null; you: boolean; competitorId: string | null };
  canManage: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2.5">
        <CompanyLogo name={b.name} domain={b.domain} size={34} rounded="rounded-[9px]" className="shrink-0 ring-1 ring-border" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-bold text-foreground">{b.name}</span>
            {b.you && (
              <span className="shrink-0 rounded-full bg-ember-100 px-1.5 py-0.5 text-[9.5px] font-extrabold tracking-[0.04em] text-ember-600">
                YOU
              </span>
            )}
          </div>
          {BENCHMARK_LIVE && <div className="mt-px text-xs text-slate-400">{b.keywords.toLocaleString()} keywords ranked</div>}
        </div>
        {BENCHMARK_LIVE && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-slate-600">DR {b.dr}</span>}
        {canManage && b.competitorId && <DeleteCompetitorButton competitorId={b.competitorId} name={b.name} />}
      </div>
      {BENCHMARK_LIVE ? b.topKeywords.map((k) => (
        <div key={k.kw} className="flex items-center gap-2.5 border-t border-slate-150 py-2.5">
          <span className={cn("flex h-6 min-w-6 items-center justify-center rounded-lg px-1.5 text-[11px] font-bold tabular-nums", posPillClass(k.pos))}>
            #{k.pos}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-700">{k.kw}</span>
          <span className="shrink-0 font-mono text-xs text-slate-400">{k.vol}/mo</span>
        </div>
      )) : (
        <p className="border-t border-slate-150 py-4 text-center text-[12.5px] text-slate-400">
          Keyword rankings coming soon.
        </p>
      )}
    </div>
  );
}
