"use client";

// Analytics · Page engagement — the "are people sticking?" table. Renders the
// per-page GA4 depth already carried on url_metrics (bounce, avg engagement
// time, engagement rate, conversions). A row expands to reveal that page's top
// referrers. Bounce > 60% is flagged red — a healthy content page keeps 45-60%.
// Window is URL-driven (30/60/90d) via the screen's TimeWindow control.

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import type { MetricWindow, UrlMetricWindow } from "@/lib/data/url-metrics";
import { hostFromUrl, pathFromUrl } from "@/lib/url";
import { cn } from "@/lib/utils";

const GRID = "minmax(200px,2.4fr) 84px 80px 96px 84px 64px 40px";

function titleFromUrl(url: string): string {
  const path = pathFromUrl(url, url);
  const last = path.split("?")[0].replace(/\/+$/, "").split("/").filter(Boolean).pop();
  if (!last) return "Homepage";
  const words = decodeURIComponent(last).replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
function hostPath(url: string): string {
  const host = hostFromUrl(url);
  const path = pathFromUrl(url, "");
  return `${host}${path === "/" ? "" : path}`;
}
function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function PageEngagementSection({
  rows,
  window,
  headerRight,
}: {
  rows: UrlMetricWindow[];
  window: MetricWindow;
  /** The screen injects the TimeWindow control here (it scopes only this table). */
  headerRight?: ReactNode;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (url: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-[19px] font-semibold tracking-[-0.01em] text-foreground">Page engagement</h2>
          <p className="mt-1 text-[13px] text-slate-500">How well each page holds visitors · last {window}</p>
        </div>
        {headerRight}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lift">
        {rows.length === 0 ? (
          <div className="px-6 py-11 text-center">
            <div className="text-sm font-semibold text-slate-700 dark:text-foreground">No page engagement yet</div>
            <div className="mt-1 text-[13px] text-slate-400">
              Page-level engagement fills in after the daily snapshot, once pages have GA4 traffic.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: 820 }}>
              <div
                style={{ gridTemplateColumns: GRID }}
                className="grid items-center gap-4 border-b border-slate-150 bg-muted/40 px-[22px] py-3 dark:border-border"
              >
                {["Page", "Sessions", "Bounce", "Avg time", "Engaged", "Conv.", ""].map((h, i) => (
                  <span
                    key={i}
                    className={cn(
                      "font-mono text-[11.5px] font-medium uppercase tracking-[0.09em] text-slate-400",
                      i >= 1 && i <= 5 && "text-right",
                    )}
                  >
                    {h}
                  </span>
                ))}
              </div>

              {rows.map((m) => {
                const bounce = Math.round(m.ga_bounce_rate * 100);
                const engaged = Math.round(m.ga_engagement_rate * 100);
                const isOpen = expanded.has(m.url);
                return (
                  <div key={m.url} className="border-b border-slate-150 last:border-0 dark:border-border">
                    <div
                      style={{ gridTemplateColumns: GRID }}
                      className="grid items-center gap-4 px-[22px] py-3.5 transition-colors hover:bg-muted/30"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[13.5px] font-semibold text-slate-800 dark:text-foreground">
                          {titleFromUrl(m.url)}
                        </div>
                        <div className="truncate font-mono text-[11.5px] text-slate-400" title={m.url}>
                          {hostPath(m.url)}
                        </div>
                      </div>
                      <span className="text-right font-mono text-[13px] font-semibold tabular-nums text-slate-700 dark:text-foreground/90">
                        {m.ga_sessions.toLocaleString()}
                      </span>
                      <span
                        className={cn(
                          "text-right font-mono text-[13px] font-semibold tabular-nums",
                          bounce > 60 ? "text-error-strong" : "text-slate-600 dark:text-foreground/80",
                        )}
                      >
                        {bounce}%
                      </span>
                      <span className="text-right font-mono text-[12.5px] tabular-nums text-slate-500">
                        {fmtDuration(m.ga_avg_engagement_time)}
                      </span>
                      <span className="text-right font-mono text-[12.5px] tabular-nums text-slate-500">{engaged}%</span>
                      <span className="text-right font-mono text-[12.5px] tabular-nums text-slate-500">
                        {m.ga_conversions.toLocaleString()}
                      </span>
                      <span className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => toggle(m.url)}
                          aria-label={isOpen ? "Collapse" : "See referrers"}
                          className="grid size-8 shrink-0 place-items-center rounded-[9px] border border-border bg-card text-slate-500"
                        >
                          <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} strokeWidth={2.2} />
                        </button>
                      </span>
                    </div>

                    {isOpen && (
                      <div className="bg-muted/40 px-[22px] pb-4 pl-[60px] pt-1">
                        <div className="mb-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-slate-400">
                          Top referrers
                        </div>
                        {m.ga_top_referrers.length === 0 ? (
                          <p className="text-[12.5px] text-slate-400">
                            No referring sites — visits to this page came straight from search or direct.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {m.ga_top_referrers.map((r) => (
                              <span
                                key={r.source}
                                className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[12px] font-medium text-slate-600 dark:bg-muted dark:text-foreground/80"
                              >
                                {r.source} <span className="tabular-nums text-slate-400">({r.sessions})</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
