"use client";

// Per-question check-in history: the source-share table (one row per check-in,
// one column per cited domain, plus whether the watched brand was cited) and the
// same data as a trend, so a source that is climbing or collapsing on THIS
// question is obvious at a glance.
//
// Every number here is DERIVED from runs that already happened
// (lib/ai-citation/question-tracker.ts) - a "check-in" is one dated run batch.
// The only thing the user writes is the "double down" / "declining" call on a
// source, because the trend is computable but the judgement about it is not.

import { useMemo, useState, useTransition } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { ExternalLink, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DomainFavicon } from "@/components/dashboard/domain-favicon";
import { OTHER_DOMAIN, type QuestionFlag, type QuestionHistory, type SourceMatrix } from "@/lib/ai-citation/question-tracker";
import { setQuestionSourceFlag } from "@/lib/actions/ai-visibility-questions";

// Chart styling is defined locally rather than imported from lib/chart-theme,
// and deliberately uses ONLY design tokens that already exist on main
// (--chart-1..5, --border, --muted-foreground, --font-mono). chart-theme.ts is
// richer, but it ships with the Ember revamp and is not on main yet - importing
// it would make this feature impossible to release on its own. Once the revamp
// lands, delete these five constants and import the shared theme instead.
const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"] as const;
const seriesColor = (i: number) => SERIES[i % SERIES.length];
const chartGridProps = { stroke: "var(--border)", strokeDasharray: "0", vertical: false } as const;
const chartAxisProps = {
  stroke: "var(--border)",
  tick: { fill: "var(--muted-foreground)", fontSize: 12, fontFamily: "var(--font-mono)" },
  tickLine: false, axisLine: false,
} as const;
const chartLineProps = { strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round", dot: false } as const;

// Cycle order for the one-click flag control: none -> double down -> declining.
const NEXT_FLAG: Record<string, QuestionFlag | null> = {
  none: "double_down", double_down: "declining", declining: null,
};
const FLAG_META: Record<QuestionFlag, { label: string; icon: typeof TrendingUp; cls: string }> = {
  double_down: { label: "Double down", icon: TrendingUp, cls: "text-success-600 dark:text-success-400" },
  declining: { label: "Declining", icon: TrendingDown, cls: "text-error-600 dark:text-error-400" },
};

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

export function QuestionHistoryPanel({ history, projectId, canManage }: {
  history: QuestionHistory; projectId: string; canManage: boolean;
}) {
  const [flags, setFlags] = useState<Record<string, QuestionFlag>>(history.flags);
  const [, startTransition] = useTransition();

  // domain -> pct, per check-in, for O(1) cell lookup. A domain absent from a
  // check-in reads 0% (it genuinely earned no citations then) rather than blank.
  const pctByCheckIn = useMemo(
    () => history.checkIns.map((c) => {
      const m: Record<string, number> = {};
      for (const s of c.shares) m[s.domain] = s.pct;
      return m;
    }),
    [history.checkIns],
  );

  const chartData = useMemo(
    () => history.checkIns.map((c, i) => ({
      date: shortDate(c.date),
      ...Object.fromEntries(history.domains.map((d) => [d, pctByCheckIn[i][d] ?? 0])),
    })),
    [history.checkIns, history.domains, pctByCheckIn],
  );

  function toggleFlag(domain: string) {
    if (!canManage || domain === OTHER_DOMAIN) return;
    const current = flags[domain] ?? "none";
    const next = NEXT_FLAG[current] ?? null;
    // Optimistic: the flag is a private judgement, so a failed write just reverts.
    const prev = flags;
    setFlags((f) => {
      const copy = { ...f };
      if (next) copy[domain] = next; else delete copy[domain];
      return copy;
    });
    startTransition(async () => {
      const r = await setQuestionSourceFlag({
        project_id: projectId, prompt_id: history.promptId, source_domain: domain, flag: next,
      });
      if (!r.ok) { setFlags(prev); toast.error(r.error ?? "Could not save that flag."); }
    });
  }

  if (!history.checkIns.length) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
        No check-ins recorded for this question yet. It will appear here after the next AI Visibility run.
      </div>
    );
  }

  const single = history.checkIns.length === 1;

  return (
    <div className="space-y-4">
      {/* ---- History table: one row per check-in, one column per source ---- */}
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left font-semibold text-muted-foreground">Check-in</th>
              {history.domains.map((d) => {
                const flag = flags[d];
                const meta = flag ? FLAG_META[flag] : null;
                const Icon = meta?.icon ?? Minus;
                return (
                  <th key={d} className="px-2 py-1 text-center font-semibold">
                    <span className="block max-w-[14ch] truncate" title={d}>{d}</span>
                    {d !== OTHER_DOMAIN && (
                      <button type="button" disabled={!canManage} onClick={() => toggleFlag(d)}
                        className={cn(
                          "mt-0.5 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium transition-colors",
                          meta ? meta.cls : "text-muted-foreground/50",
                          canManage ? "cursor-pointer hover:bg-muted" : "cursor-default",
                        )}
                        title={canManage
                          ? `${meta ? `Flagged "${meta.label}"` : "No flag"} - click to cycle: double down → declining → none.`
                          : meta?.label ?? "No flag"}>
                        <Icon className="size-3" />{meta ? meta.label : "Flag"}
                      </button>
                    )}
                  </th>
                );
              })}
              <th className="px-2 py-1 text-center font-semibold whitespace-nowrap">
                {history.brandLabel} cited?
              </th>
            </tr>
          </thead>
          <tbody>
            {history.checkIns.map((c, i) => (
              <tr key={c.key}>
                <td className="px-2 py-1.5 font-medium whitespace-nowrap" title={`${c.runs} answer${c.runs === 1 ? "" : "s"} sampled`}>
                  {shortDate(c.date)}
                  <span className="ml-1 text-muted-foreground/70">· {c.runs}</span>
                </td>
                {history.domains.map((d) => {
                  const v = pctByCheckIn[i][d] ?? 0;
                  const isBrandSite = c.shares.find((s) => s.domain === d)?.isBrandSite;
                  return (
                    <td key={d} className="rounded-md px-2 py-1.5 text-center tabular-nums"
                      style={{ backgroundColor: v > 0 ? `rgba(16,185,129,${0.08 + (v / 100) * 0.42})` : undefined }}
                      title={isBrandSite ? `${d} is ${history.brandLabel}'s own site` : undefined}>
                      <span className={cn(v === 0 && "text-muted-foreground/40", isBrandSite && "font-semibold")}>
                        {v}%
                      </span>
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-center">
                  {c.cited ? (
                    <span className="font-medium text-success-700 dark:text-success-400">
                      Yes{c.citedVia ? <span className="font-normal text-muted-foreground"> (via {c.citedVia})</span> : null}
                    </span>
                  ) : c.mentioned ? (
                    <span className="text-warning-700 dark:text-warning-400" title="Named in the answer, but no source was cited for it.">Named only</span>
                  ) : (
                    <span className="text-muted-foreground">No</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Each row is one AI Visibility run. Percentages are that source&apos;s share of every citation across the answers to this
        question, so a row adds up to 100%. The number after the date is how many answers were sampled.
        {" "}&quot;via&quot; is a best-effort attribution: the brand&apos;s own site when AI cited it directly, otherwise the third-party
        source most present in the answers that cited it.
      </p>

      {/* ---- Trend: the same shares over time ---- */}
      {single ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
          Only one check-in so far — the trend appears once this question has been run at least twice.
        </div>
      ) : (
        <div className="rounded-lg border p-3">
          <h4 className="mb-2 text-xs font-semibold">Source share over time</h4>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid {...chartGridProps} />
                <XAxis dataKey="date" {...chartAxisProps} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} {...chartAxisProps} />
                <Tooltip
                  formatter={(value, name) => [`${Number(value) || 0}%`, name]}
                  contentStyle={{
                    background: "var(--popover)", border: "1px solid var(--border)",
                    borderRadius: 8, fontSize: 12, color: "var(--popover-foreground)",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {history.domains.map((d, i) => (
                  <Line key={d} type="monotone" dataKey={d} name={d}
                    stroke={seriesColor(i)} {...chartLineProps} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <SourceBrandTable matrix={history.sourceMatrix} />

      {Object.keys(flags).length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Your calls:</span>
          {Object.entries(flags).map(([d, f]) => {
            const meta = FLAG_META[f];
            const Icon = meta.icon;
            return (
              <Badge key={d} variant="outline" className={cn("gap-1", meta.cls)}>
                <Icon className="size-3" />{d} · {meta.label}
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Who wins each cited source. Rows are sources (a project can accumulate 40+, and
// rows scroll where columns cannot), columns are you + every tracked competitor
// that actually appeared, plus the citations we could not tie to any brand.
//
// That last column is deliberately visible. On real data it is usually the
// biggest one - generic listicles that name a dozen operators at once - and
// hiding it would make every source look smaller than it really is.
function SourceBrandTable({ matrix }: { matrix: SourceMatrix }) {
  if (!matrix.rows.length) return null;
  const maxCitations = matrix.rows[0]?.citations || 1;

  return (
    <div className="rounded-lg border p-3">
      <h4 className="text-xs font-semibold">Who wins each source</h4>
      <p className="mb-2 text-xs text-muted-foreground">
        For every site AI pulled from, which brand the citation was actually about. Use it to spot a source that is
        feeding a competitor rather than you — that is the one to go after.
      </p>

      <div className="max-h-[26rem] overflow-auto">
        <table className="w-full border-separate border-spacing-1 text-xs">
          <thead className="sticky top-0 bg-background">
            <tr>
              <th className="px-2 py-1 text-left font-semibold text-muted-foreground">Source</th>
              <th className="px-2 py-1 text-right font-semibold text-muted-foreground" title="Total times AI cited this domain.">Cites</th>
              {matrix.brands.map((b) => (
                <th key={b.key} className="px-2 py-1 text-center font-semibold">
                  <span className="inline-flex items-center gap-1">
                    <DomainFavicon domain={b.domain} label={b.label} size={14} />
                    <span className="max-w-[12ch] truncate" title={b.label}>{b.label}</span>
                  </span>
                </th>
              ))}
              <th className="px-2 py-1 text-center font-semibold text-muted-foreground"
                title="Cited pages we could not tie to any tracked brand - usually round-ups naming many operators at once. Open these yourself.">
                Unclear
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((r) => (
              <tr key={r.domain}>
                <td className="px-2 py-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <DomainFavicon domain={r.domain} size={16} />
                    {r.sampleUrl ? (
                      <a href={r.sampleUrl} target="_blank" rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title={r.sampleTitle ?? r.sampleUrl}
                        className="inline-flex items-center gap-0.5 max-w-[22ch] truncate font-medium hover:underline">
                        {r.domain}<ExternalLink className="size-3 shrink-0 opacity-60" />
                      </a>
                    ) : (
                      <span className="max-w-[22ch] truncate font-medium" title={r.domain}>{r.domain}</span>
                    )}
                    {r.ownedBy && (
                      <Badge variant="outline" className="shrink-0 px-1 py-0 text-[10px]">
                        {matrix.brands.find((b) => b.key === r.ownedBy)?.isProject ? "your site" : "competitor"}
                      </Badge>
                    )}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  <span className="inline-block h-1.5 w-8 overflow-hidden rounded-full bg-muted align-middle">
                    <span className="block h-full rounded-full bg-foreground/30"
                      style={{ width: `${Math.max(6, Math.round((r.citations / maxCitations) * 100))}%` }} />
                  </span>
                  <span className="ml-1.5">{r.citations}</span>
                </td>
                {matrix.brands.map((b) => {
                  const v = r.byBrand[b.key] ?? 0;
                  return (
                    <td key={b.key} className="rounded-md px-2 py-1.5 text-center tabular-nums"
                      style={{ backgroundColor: v > 0 ? `rgba(16,185,129,${0.1 + (v / r.citations) * 0.45})` : undefined }}>
                      <span className={v === 0 ? "text-muted-foreground/40" : "font-semibold"}>{v}</span>
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-center tabular-nums text-muted-foreground">
                  {r.unattributed || <span className="text-muted-foreground/40">0</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        A citation is tied to a brand when the page is that brand&apos;s own site, or when the page&apos;s title names them.
        Anything else lands in <strong>Unclear</strong> — we do not guess from two things merely appearing in the same answer.
        {matrix.absentCompetitors.length > 0 && (
          <> Never cited anywhere here: <strong>{matrix.absentCompetitors.join(", ")}</strong>.</>
        )}
      </p>
    </div>
  );
}
