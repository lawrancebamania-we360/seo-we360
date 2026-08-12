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
// DATA MODEL: the owner approved representative demo data so this screen stays
// POPULATED even for brand-new projects or metrics we can't measure yet. Real
// data now covers: the competitor list + names (rail, scorecard, donut, keyword
// boards), Share of voice + AI citations (per brand, from the AI Visibility
// citation runs — lib/data/competitor-citations.ts), Domain Rating (per domain,
// from the zhorex/domain-authority-checker Apify actor — already collected
// monthly by phase-9-intelligence.ts), and — as of the santhej/website-traffic-
// intel integration — the "Keyword gap" panel and each rival's ranked-keyword
// list + keyword count (lib/cron/phase-11-competitor-keywords.ts, monthly).
// Each of those falls back to the DEMO_BRANDS numbers per-brand when no real
// snapshot exists yet for that competitor (e.g. right after it's added, before
// the next monthly refresh) — never a demo KEYWORD STRING standing in as real,
// only aggregate numbers. Still demo/unmeasured: the weekly visibility trend,
// avg-position, and site health. All colours resolve to brand tokens, keeping
// this file style-drift clean.

import * as React from "react";
import { Megaphone, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { TimeRangeFilter, rangeDayLabel, type RangePreset } from "@/components/ui/time-range-filter";
import { CompanyLogo } from "@/components/dashboard/company-logo";
import { NewCompetitorDialog, DeleteCompetitorButton } from "@/components/sections/competitor-dialogs";
import type { Competitor } from "@/lib/types/database";
import type { CompetitorCitationStats } from "@/lib/data/competitor-citations";
import type { CompetitorSiteHealthRow } from "@/lib/data/competitor-site-health";
import type {
  CompetitorKeywordSnapshot,
  CompetitorKeywordGap,
  DomainRating,
} from "@/lib/data/competitor-keyword-intel";
import { formatVolume } from "@/lib/ui-helpers";

// Categorical series palette — all brand tokens (usable directly as an SVG
// stroke / conic segment; no raw hex / banned palette classes). Maps 1:1 to the
// comp's line colours: ember, blue, violet, green, amber.
// We360 brand-cohesive categorical palette (no semantic green): you = brand
// purple, then gold / violet / blue / navy / slate. Uses the app's brand-aware
// chart tokens so competitor series match the rest of the AI surfaces.
const SERIES = [
  "var(--color-ember-500)", // you — We360 purple (#7B62FF)
  "var(--color-chart-3)", // gold (#FEB800)
  "var(--color-violet-chart)", // violet (#7a5af0)
  "var(--color-info)", // blue
  "var(--color-chart-5)", // deep navy
  "var(--color-slate-400)", // slate
];

type BenchKey = "visibility" | "sov" | "avgPos" | "keywords" | "aiCitations" | "dr" | "content" | "siteHealth";
const BENCH_COLS: { key: BenchKey; label: string; asc?: boolean; fmt: (v: number) => string }[] = [
  { key: "visibility", label: "Visibility", fmt: (v) => `${v}%` },
  { key: "sov", label: "Share of voice", fmt: (v) => `${v.toFixed(1)}%` },
  { key: "aiCitations", label: "AI citations", fmt: (v) => String(v) },
  { key: "dr", label: "Domain rating", fmt: (v) => String(v) },
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
    label: "AI citations",
    value: "31",
    rank: "2nd of 5",
    delta: "+5",
    icon: <Sparkles style={{ color: "var(--color-warning)" }} />,
    tint: "var(--color-warning-50)",
  },
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

// Strip protocol/www/trailing-slash — matches the normalization phase-9 /
// phase-11 apply before writing `domain_authority.domain` and
// `competitor_keyword_snapshots.domain`, so lookups by raw competitor.url hit.
function cleanDomain(d: string): string {
  return d.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/^www\./, "");
}

export function CompetitorsScreen({
  competitors,
  projectId,
  projectName,
  projectDomain,
  canManage,
  citationStats,
  keywordSnapshots,
  keywordGaps,
  domainRatings,
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
  // Real per-competitor keyword data (santhej/website-traffic-intel, monthly)
  // and Domain Rating (zhorex/domain-authority-checker, monthly) — see
  // lib/data/competitor-keyword-intel.ts. Keyed by competitor.id / clean domain.
  keywordSnapshots: Map<string, CompetitorKeywordSnapshot>;
  keywordGaps: CompetitorKeywordGap[];
  domainRatings: Map<string, DomainRating>;
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

  // ── Weave real names/logos/metrics over the demo brand slots ──────────────
  // Slot 0 = the project ("YOU"); slots 1..n = real competitors; anything beyond
  // the real set falls back to the demo brand name so the board stays populated.
  type Brand = DemoBrand & {
    domain: string | null;
    you: boolean;
    competitorId: string | null;
    color: string;
    keywordSnapshot: CompetitorKeywordSnapshot | null;
  };
  const realSlots: { name: string; domain: string | null; competitorId: string | null }[] = [
    { name: projectName || DEMO_BRANDS[0].name, domain: projectDomain || null, competitorId: null },
    ...competitors.map((c) => ({ name: c.name, domain: c.url ?? null, competitorId: c.id })),
  ];
  const citationById = new Map(citationStats.competitors.filter((c) => c.id).map((c) => [c.id as string, c]));
  const brandCount = Math.max(DEMO_BRANDS.length, realSlots.length);
  const brands: Brand[] = Array.from({ length: brandCount }, (_, i) => {
    const demo = DEMO_BRANDS[i % DEMO_BRANDS.length];
    const real = realSlots[i];
    const competitorId = i === 0 ? null : (real?.competitorId ?? null);
    const domain = real?.domain ?? null;

    // Real Share of voice + AI citations — the project uses citationStats.project,
    // competitors match by id. Falls back to the demo number per-brand when no
    // citation run has touched this brand yet.
    const citationRow = i === 0
      ? (citationStats.hasData ? citationStats.project : null)
      : (competitorId ? citationById.get(competitorId) ?? null : null);

    // Real Domain Rating — domain_authority already covers the project domain
    // + every tracked competitor (phase-9's daTask runs for all of them).
    const drRow = domain ? domainRatings.get(cleanDomain(domain)) : undefined;

    const keywordSnapshot = competitorId ? keywordSnapshots.get(competitorId) ?? null : null;

    return {
      ...demo,
      name: real?.name ?? demo.name,
      domain,
      you: i === 0,
      competitorId,
      color: SERIES[i % SERIES.length],
      sov: citationRow?.sov ?? demo.sov,
      aiCitations: citationRow?.citations ?? demo.aiCitations,
      dr: drRow?.score ?? demo.dr,
      keywordSnapshot,
    };
  });

  // Trend + donut mirror the comp's 5-brand layout; scorecard + boards show all.
  const donutBrands = brands.slice(0, 5);

  const bestOf = (key: BenchKey, asc = false) => {
    const vals = brands.map((r) => r[key]);
    return asc ? Math.min(...vals) : Math.max(...vals);
  };

  // KPI headline + delta — real once a citation run exists. No historical
  // comparison is computed yet, so a real value gets a neutral delta rather
  // than the comp's fabricated "+3.2 pts" sitting next to a real number.
  const kpiSov = citationStats.hasData ? `${citationStats.project.sov}%` : DEMO_KPIS[0].value;
  const kpiSovDelta = citationStats.hasData ? "—" : DEMO_KPIS[0].delta;
  const kpiCitations = citationStats.hasData ? String(citationStats.project.citations) : DEMO_KPIS[1].value;
  const kpiCitationsDelta = citationStats.hasData ? "—" : DEMO_KPIS[1].delta;
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
            value={i === 0 ? kpiSov : kpiCitations}
            rank={k.rank}
            delta={i === 0 ? kpiSovDelta : kpiCitationsDelta}
            icon={k.icon}
            tint={k.tint}
          />
        ))}
      </div>

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
            <div className="grid grid-cols-[220px_repeat(5,minmax(94px,1fr))] gap-3 border-b border-border bg-muted/40 px-5 py-3.5">
              <span className="font-mono text-xs font-medium uppercase tracking-[0.1em] text-slate-400">Competitor</span>
              {BENCH_COLS.map((c) => (
                <span key={c.key} className="text-center font-mono text-xs font-medium uppercase tracking-[0.1em] text-slate-400">
                  {c.label}
                </span>
              ))}
            </div>
            {brands.map((r) => {
              return (
                <div
                  key={`${r.name}-${r.competitorId ?? "demo"}`}
                  className="grid grid-cols-[220px_repeat(5,minmax(94px,1fr))] items-center gap-3 border-b border-border/60 px-5 py-3.5 last:border-b-0"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <CompanyLogo name={r.name} domain={r.domain} size={30} rounded="rounded-full" className="shrink-0 ring-1 ring-border" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-foreground">{r.name}</div>
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
            {keywordGaps.length > 0 && (
              <span className="rounded-full bg-ember-50 px-2.5 py-0.5 text-xs font-semibold text-ember-600">
                {keywordGaps.length} opportunities
              </span>
            )}
          </div>
          <p className="mt-1 mb-2 text-[12.5px] text-slate-400">
            High-value terms rivals rank for where you&rsquo;re weak or absent.
          </p>
          {keywordGaps.length === 0 && (
            <p className="border-t border-slate-150 py-6 text-center text-[13px] text-slate-400">
              Competitor keyword gaps will appear here once rank tracking is live.
            </p>
          )}
          <div>
            {keywordGaps.map((g) => {
              const leader = brands.find((b) => b.competitorId === g.competitorId) ?? brands[0];
              const missing = g.ourPosition == null;
              const vol = formatVolume(g.volume)?.replace(/\/mo$/, "") ?? "—";
              return (
                <div key={`${g.competitorId}-${g.keyword}`} className="flex items-center gap-3 border-t border-slate-150 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold text-slate-800">{g.keyword}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-slate-400">
                      <span>{vol}/mo</span>
                      {g.intent && (
                        <>
                          <span>·</span>
                          <span>{g.intent}</span>
                        </>
                      )}
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
                    {missing ? "—" : `#${g.ourPosition}`}
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

// Green (or red) delta chip with the comp's up-arrow glyph. Renders as a plain
// neutral dash — no arrow — when there's no historical comparison yet (text === "—").
function Delta({ text, up }: { text: string; up: boolean }) {
  if (text === "—") {
    return <span className="text-[12.5px] font-semibold text-slate-400">—</span>;
  }
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
// Position pill tint for the "what they rank for" keyword rows.
function posPillClass(pos: number): string {
  if (pos <= 1) return "bg-success-50 text-success-700";
  if (pos <= 3) return "bg-info-50 text-info-700";
  return "bg-muted text-slate-500";
}

// ---- "What they rank for" per-rival board — comp shape: 34px logo, name (+ YOU
// on the project), "N keywords ranked", DR pill, then five keyword rows with a
// position pill + monthly volume. Real competitors keep their delete control.
// Domain Rating is always shown (a blended real-or-demo aggregate, like the
// scorecard column); the keyword count + row list only render together once a
// real monthly snapshot exists for this brand — never a fake keyword count
// paired with a real "coming soon" list, or vice versa.
function RivalBoard({
  brand: b,
  canManage,
}: {
  brand: DemoBrand & { domain: string | null; you: boolean; competitorId: string | null; keywordSnapshot: CompetitorKeywordSnapshot | null };
  canManage: boolean;
}) {
  const snap = b.keywordSnapshot;
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
          {snap && (
            <div className="mt-px flex items-center gap-1.5 text-xs text-slate-400">
              <span>{(snap.keywordsRanked ?? 0).toLocaleString()} keywords ranked</span>
              {snap.keywordsRankedDelta != null && snap.keywordsRankedDelta !== 0 && (
                <span className={snap.keywordsRankedDelta > 0 ? "font-semibold text-success-strong" : "font-semibold text-error"}>
                  {snap.keywordsRankedDelta > 0 ? "+" : ""}
                  {snap.keywordsRankedDelta} mo/mo
                </span>
              )}
            </div>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-slate-600">DR {b.dr}</span>
        {canManage && b.competitorId && <DeleteCompetitorButton competitorId={b.competitorId} name={b.name} />}
      </div>
      {snap ? snap.topKeywords.slice(0, 5).map((k) => (
        <div key={k.keyword} className="flex items-center gap-2.5 border-t border-slate-150 py-2.5">
          <span className={cn("flex h-6 min-w-6 items-center justify-center rounded-lg px-1.5 text-[11px] font-bold tabular-nums", posPillClass(k.position ?? 99))}>
            {k.position != null ? `#${k.position}` : "—"}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-700">{k.keyword}</span>
          <span className="shrink-0 font-mono text-xs text-slate-400">{formatVolume(k.volume) ?? "—"}</span>
        </div>
      )) : (
        <p className="border-t border-slate-150 py-4 text-center text-[12.5px] text-slate-400">
          Keyword rankings coming soon.
        </p>
      )}
    </div>
  );
}
