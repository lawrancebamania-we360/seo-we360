"use client";

// Overview "Competitive standing" card — comp lines 1370-1378. A share-of-voice
// header + a ranked ledger of the project against every tracked brand, with the
// project row highlighted amber.
//
// REAL: the VISIBILITY column (each brand's measured mention rate) and the rank
// (position by that rate). Also REAL: the "Why do they get cited?" explainer for
// any rival that out-cites us (a metered page-diff, preserved from the old
// Competitors tab).
// DEMO (owner-approved): SOV, SENTIMENT (a face + 0-100 score) and AVG POS are
// not computed per competitor yet, so they are deterministic, rank-anchored
// representative values that stay coherent with the real ordering. The SOV
// header value + its delta are DEMO too; the rank is real.

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, BarChart3, ChevronDown, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AiVisibilityReport } from "@/lib/ai-citation/report";
import { explainCompetitorCitations } from "@/lib/actions/ai-visibility";
import type { CitationGap, WhyCitedResult } from "@/lib/ai-citation/why-cited";
import { classifyGapRoute, type GapAction } from "@/lib/ai-citation/gap-tasks";
import { GapActionModal } from "@/components/sections/ai-visibility-report/gap-action-modal";
import { useEvidence } from "./evidence-context";

const pct = (x: number) => (x > 0 && x < 0.005 ? "<1%" : `${Math.round(x * 100)}%`);
const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][(n % 100 - n % 10 === 10 ? 0 : n % 10)] ?? "th"}`;

// DEMO (owner-approved) — deterministic, rank-anchored representative values so
// the table matches the comp. Coherent with the REAL ordering (rank 1 = strongest).
const DEMO_SOV = [31.2, 24.8, 18.5, 12.7, 8.4, 5.4, 3.1, 2.2]; // % of AI answers, by rank
const DEMO_AVG_POS = [1.9, 2.1, 2.6, 3.0, 3.4, 3.9, 4.3, 4.7]; // mean answer position, by rank
const DEMO_SENTIMENT = [94, 92, 90, 88, 84, 82, 80, 78]; // 0-100 tone score, by rank
const demoAt = <T,>(arr: T[], rank: number): T => arr[Math.min(rank - 1, arr.length - 1)];

type Brand = { id: string | null; name: string; mention: number; citation: number; you: boolean; canExplain: boolean };

// Comp grid (line 1376): # · BRAND · VISIBILITY · SOV · SENTIMENT · AVG POS.
const COLS = "44px minmax(130px,1.5fr) 92px 74px 96px 74px";

export function CompetitiveStanding({ report, projectId, canManage }: {
  report: AiVisibilityReport; projectId: string; canManage: boolean;
}) {
  const ranked: Brand[] = [
    { id: null, name: report.projectLabel, mention: report.mentionRate, citation: report.citationRate, you: true, canExplain: false },
    ...report.competitors.map((c) => ({
      id: c.id, name: c.name, mention: c.mentionRate, citation: c.citationRate, you: false,
      canExplain: canManage && c.citationRate > report.citationRate,
    })),
  ].sort((a, b) => b.mention - a.mention);

  const total = ranked.length;
  const youRank = ranked.findIndex((b) => b.you) + 1;
  const youSov = demoAt(DEMO_SOV, youRank); // DEMO

  return (
    <Card className="flex flex-col overflow-hidden p-0">
      <div className="p-5 pb-3.5">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-ember-50 text-ember-600 dark:bg-ember-950/40">
            <BarChart3 className="size-3.5" />
          </span>
          <div>
            <span className="font-heading text-[15px] font-bold text-foreground">Competitive standing</span>{" "}
            <span className="text-xs text-muted-foreground">· share of voice &amp; rankings</span>
          </div>
        </div>
        {/* SOV header (DEMO value + delta; rank is real). */}
        <div className="font-mono text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">Your share of voice</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-mono text-[28px] font-medium leading-none tracking-tight tabular-nums text-foreground">{youSov.toFixed(1)}%</span>
          <span className="inline-flex items-center gap-0.5 text-[13px] font-bold text-success-strong">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" aria-hidden><path d="M6 15l6-6 6 6" /></svg>2.3%
          </span>
          <span className="text-xs text-slate-350">· you rank {ordinal(youRank)} of {total} tracked brand{total === 1 ? "" : "s"}</span>
        </div>
      </div>

      {/* Header row */}
      <div className="grid items-center border-y border-border bg-slate-50 text-[10px] font-bold uppercase tracking-[0.04em] text-muted-foreground dark:bg-muted/40"
        style={{ gridTemplateColumns: COLS }}>
        <span className="border-r border-border px-1 py-2.5 text-center">#</span>
        <span className="border-r border-border px-3.5 py-2.5">Brand</span>
        <span className="border-r border-border px-1 py-2.5 text-center">Visibility</span>
        <span className="border-r border-border px-1 py-2.5 text-center">SOV</span>
        <span className="border-r border-border px-1 py-2.5 text-center">Sentiment</span>
        <span className="px-1 py-2.5 text-center">Avg pos</span>
      </div>

      <div>
        {ranked.map((b, i) => (
          <StandingRow key={b.name + i} rank={i + 1} brand={b} projectId={projectId} canManage={canManage} />
        ))}
      </div>

      {!report.competitors.length ? (
        <p className="px-5 py-3.5 text-xs text-muted-foreground">
          No competitors surfaced yet.{" "}
          <Link href="/dashboard/competitors" className="font-medium text-foreground underline underline-offset-2">Add competitors</Link> to compare.
        </p>
      ) : (
        <p className="px-5 py-3 text-[11.5px] leading-relaxed text-muted-foreground">
          Visibility is measured (how often AI names each brand). Share-of-voice, sentiment and average position are representative estimates, not yet computed per competitor.
        </p>
      )}
    </Card>
  );
}

function StandingRow({ rank, brand, projectId, canManage }: { rank: number; brand: Brand; projectId: string; canManage: boolean }) {
  const { openList } = useEvidence();
  const [open, setOpen] = useState(false);
  const [loading, start] = useTransition();
  const [result, setResult] = useState<WhyCitedResult | null>(null);
  const initial = brand.name.trim().charAt(0).toUpperCase() || "?";
  const sov = demoAt(DEMO_SOV, rank);          // DEMO
  const avgPos = demoAt(DEMO_AVG_POS, rank);   // DEMO
  const sent = demoAt(DEMO_SENTIMENT, rank);   // DEMO
  const sentColor = sent >= 85 ? "text-success-strong" : sent >= 70 ? "text-warning-strong" : "text-error-strong";
  const sentStroke = sent >= 85 ? "#137a52" : sent >= 70 ? "#8a6d0e" : "#b42318";

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !result && !loading && brand.id) {
      start(async () => {
        const r = await explainCompetitorCitations({ project_id: projectId, competitor_id: brand.id, competitor_name: brand.name });
        setResult(r);
        if (!r.ok) toast.error(r.error ?? "Could not analyze this competitor.");
      });
    }
  };

  return (
    <div className={cn("border-b border-border last:border-b-0", brand.you && "bg-warning-500/[0.06]", open && "bg-muted/20")}>
      <div className="grid items-center" style={{ gridTemplateColumns: COLS }}>
        <span className="flex items-center justify-center self-stretch border-r border-border py-3 text-[12.5px] font-bold text-slate-350">{rank}</span>
        <div className="flex min-w-0 items-center gap-2.5 self-stretch border-r border-border px-3.5 py-3">
          <span className={cn(
            "flex size-6 flex-none items-center justify-center rounded-md text-[11px] font-bold",
            brand.you ? "bg-warning-500/15 text-warning-strong" : "bg-muted text-muted-foreground",
          )}>{initial}</span>
          <span className={cn("truncate text-[13px] font-semibold", brand.you ? "text-warning-strong" : "text-foreground")}>{brand.name}</span>
          {brand.you && <span className="flex-none rounded-full bg-warning-500/15 px-1.5 py-0.5 text-[10px] font-bold text-warning-strong">You</span>}
        </div>
        {/* VISIBILITY is the one REAL column — the measured mention rate — so it
            clicks through to the actual AI answers behind it (evidence drawer),
            matching the report-wide "click any number" idiom. The DEMO columns
            (SOV / sentiment / avg pos) stay static. */}
        <button type="button"
          onClick={() => brand.you
            ? openList({ mentioned: true }, "Answers that named your brand", `${pct(brand.mention)} of AI answers named you`)
            : openList({ competitor: brand.name }, `Answers that named ${brand.name}`, `${pct(brand.mention)} of AI answers named ${brand.name}`)}
          className="flex items-center justify-center self-stretch border-r border-border py-3 text-[13px] font-bold tabular-nums text-foreground cursor-pointer transition-colors hover:bg-ember-500/10 hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ember-500/40"
          aria-label={brand.you ? "Read the AI answers that named your brand" : `Read the AI answers that named ${brand.name}`}
          title="Click to read the actual AI answers behind this visibility number.">
          {pct(brand.mention)}
        </button>
        <span className="flex items-center justify-center self-stretch border-r border-border py-3 text-[13px] font-semibold tabular-nums text-slate-600">{sov.toFixed(1)}%</span>
        <span className="flex items-center justify-center gap-1.5 self-stretch border-r border-border py-3">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={sentStroke} strokeWidth="1.9" aria-hidden>
            <circle cx="12" cy="12" r="9" /><path d="M8.5 14.5a4 4 0 007 0" /><path d="M9 9.5h.01M15 9.5h.01" />
          </svg>
          <span className={cn("text-[13px] font-bold tabular-nums", sentColor)}>{sent}</span>
        </span>
        <span className="py-3 text-center text-[13px] tabular-nums text-muted-foreground">#{avgPos.toFixed(1)}</span>
      </div>

      {brand.canExplain && (
        <div className="px-3.5 pb-3 pl-[54px]">
          <button type="button" onClick={toggle}
            className="inline-flex items-center gap-1 rounded-md bg-ember-500/10 px-2 py-1 text-xs font-medium text-ember-700 transition-colors hover:bg-ember-500/20 cursor-pointer dark:text-ember-400">
            <Sparkles className="size-3" /> Why do they get cited?
            <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
          </button>
          {open && (
            <div className="mt-2 rounded-lg border p-3">
              {loading || !result ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Auditing {brand.name}&apos;s cited pages...
                </p>
              ) : (
                <WhyCitedPanel result={result} competitorName={brand.name} projectId={projectId} canManage={canManage} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WhyCitedPanel({ result, competitorName, projectId, canManage }: { result: WhyCitedResult; competitorName: string; projectId: string; canManage: boolean }) {
  // Each real page-diff gap can be turned into a decision-ready task via the shared
  // GapActionModal (open-existing-or-add). Only the gaps[] branch has actionable
  // gaps; the other branches keep their in-app nudge.
  const [activeGap, setActiveGap] = useState<GapAction | null>(null);

  // A real gap → a GapAction: measured page-diff, so real:true, routed by key, and
  // the plain-English "why they get cited" line the modal surfaces.
  const toGapAction = (g: CitationGap): GapAction => ({
    key: g.key,
    label: g.label,
    fix: g.fix,
    route: classifyGapRoute(g.key),
    real: true,
    why: `Measured across ${competitorName}'s cited pages: their page does this and your comparable page doesn't — a concrete, verifiable reason AI pulls them into answers over you.`,
    competitor: competitorName,
    exampleUrl: g.examples[0] ?? null,
  });

  if (!result.ok) return <p className="text-xs text-error-600">{result.error ?? "Could not analyze this competitor."}</p>;
  if (result.noData) {
    return (
      <p className="text-xs text-muted-foreground">
        We don&apos;t have {competitorName}&apos;s cited page URLs yet. Run a fresh AI check, then open this again.
      </p>
    );
  }
  if (result.notComparable) {
    return (
      <div className="space-y-2 text-xs">
        <p className="text-muted-foreground">
          {competitorName}&apos;s cited pages are mostly homepages or landing pages, so a page-by-page comparison would not be meaningful. Their edge here is being cited more often, not how their pages are built.
        </p>
        <Link href="/dashboard/sprint" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground transition-colors hover:bg-primary/90">
          Write content that gets cited <ExternalLink className="size-3" />
        </Link>
      </div>
    );
  }
  const n = result.pagesAudited ?? 0;
  if (!result.gaps?.length) {
    return (
      <div className="space-y-2 text-xs">
        <p className="text-muted-foreground">
          Good news: across the {n} cited page{n === 1 ? "" : "s"} we audited, your pages already cover what {competitorName} does. The gap is getting AI to test you on more questions.
        </p>
        <Link href="/dashboard/sprint" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground transition-colors hover:bg-primary/90">
          Write content that gets cited <ExternalLink className="size-3" />
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Based on {n} of {competitorName}&apos;s cited page{n === 1 ? "" : "s"}, here is what their pages do that yours don&apos;t:
      </p>
      {(result.yourPagesAudited ?? 0) === 0 && (
        <p className="text-xs text-muted-foreground/80">
          We couldn&apos;t find a comparable article on your site to diff against, so this reflects what {competitorName}&apos;s cited pages do well.
        </p>
      )}
      <ul className="space-y-2">
        {result.gaps.map((g) => {
          // Each gap routes to a board by its factor key: schema/technical → Web
          // Tasks, content → Blog Sprint. The Fix action opens the shared modal.
          const web = classifyGapRoute(g.key) === "web";
          return (
            <li key={g.key} className="rounded-lg border p-2.5">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Sparkles className="size-3.5 shrink-0 text-ember-600 dark:text-ember-400" /> {g.label}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{g.fix}</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                {/* ONE link per gap — the primary example page (dedupe fix). */}
                {g.examples[0] ? (
                  <a href={g.examples[0]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground/80 hover:text-foreground">
                    <ExternalLink className="size-3" /> See their page
                  </a>
                ) : <span />}
                <button
                  type="button"
                  onClick={() => setActiveGap(toGapAction(g))}
                  className="inline-flex items-center gap-1 rounded-md bg-ember-500/10 px-2 py-1 text-xs font-semibold text-ember-700 transition-colors hover:bg-ember-500/20 dark:text-ember-400"
                >
                  {web ? "Fix in Web Tasks" : "Draft for Blog Sprint"} <ArrowRight className="size-3" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {result.shared && result.shared.length > 0 && (
        <p className="text-xs text-muted-foreground/80">You already match them on: {result.shared.join(", ")}.</p>
      )}
      <GapActionModal gap={activeGap} projectId={projectId} canManage={canManage} onOpenChange={(o) => { if (!o) setActiveGap(null); }} />
    </div>
  );
}
