"use client";

// Demo bookings panel (below Traffic sources). Non-paid sources only, for the
// page's selected range. Each source expands to the individual bookings under it
// (time, source/medium, landing page, device, location) — lazy-loaded from GA4
// via getDemoBookingDetail. Honest about GA4's limits: "Direct" is undercounted
// (Calendly wrapper + late GTM lose the source).

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarCheck, ChevronDown, ChevronRight, Loader2, Plug, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/dashboard/empty-state";
import { getDemoBookingDetail } from "@/lib/actions/report-demos";
import type { Ga4DemoBookings, Ga4BookingDetailRow } from "@/lib/google/ga4";

const CHANNEL_COLOR: Record<string, string> = {
  "Organic Search": "var(--color-chart-1)",
  Direct: "var(--color-chart-6)",
  "Organic Social": "var(--color-chart-3)",
  "Organic Video": "var(--color-chart-7)",
  Referral: "var(--color-chart-2)",
  Email: "var(--color-chart-5)",
  "AI Assistant": "var(--color-chart-4)",
};
const colorFor = (c: string) => CHANNEL_COLOR[c] ?? "var(--color-slate-300)";

function TrendChip({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const up = pct >= 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11.5px] font-bold tabular-nums",
      up ? "bg-success/15 text-success-strong" : "bg-error/15 text-error-strong")}>
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}{up ? "+" : ""}{pct}%
    </span>
  );
}

type DetailState = { loading: boolean; rows?: Ga4BookingDetailRow[]; error?: string };

export function DemoBookingsPanel({ data, range, rangeLabel }: { data: Ga4DemoBookings; range: string; rangeLabel: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, DetailState>>({});

  const toggle = async (channel: string) => {
    if (open === channel) { setOpen(null); return; }
    setOpen(channel);
    if (!cache[channel]) {
      setCache((c) => ({ ...c, [channel]: { loading: true } }));
      try {
        const r = await getDemoBookingDetail(range, channel);
        setCache((c) => ({ ...c, [channel]: { loading: false, rows: r.ok ? r.rows : undefined, error: r.ok ? undefined : (r.reason ?? "Couldn't load the bookings.") } }));
      } catch {
        setCache((c) => ({ ...c, [channel]: { loading: false, error: "Something went wrong loading the bookings." } }));
      }
    }
  };

  const max = data.byChannel.reduce((m, c) => Math.max(m, c.bookings), 0) || 1;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-heading text-[19px] font-semibold tracking-[-0.01em] text-foreground">Demo bookings</h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Sessions that reached the post-demo page · {rangeLabel.toLowerCase()} · non-paid sources only
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-lift">
        {!data.connected ? (
          <EmptyState
            icon={Plug}
            title="Connect GA4 to see demo bookings"
            why={data.reason ?? "Google Analytics isn’t connected for this project yet."}
            action={
              <Link href="/dashboard/integrations" className="inline-flex items-center gap-1.5 rounded-[10px] bg-gradient-brand px-3.5 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-y-0.5">
                Connect Google <ArrowUpRight className="size-3.5" />
              </Link>
            }
          />
        ) : data.total === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title={`No demo bookings ${rangeLabel.toLowerCase()}`}
            why="A booking is counted when a visitor reaches the post-demo “What’s Next?” page. None from non-paid sources in this window."
          />
        ) : (
          <div className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="font-heading text-[30px] font-bold leading-none tabular-nums text-foreground">{data.total.toLocaleString()}</div>
              <div className="pb-0.5 text-[13px] text-slate-500">bookings</div>
              <div className="pb-0.5"><TrendChip pct={data.trendPct} /></div>
            </div>

            <div className="space-y-1">
              {data.byChannel.map((c) => {
                const pct = data.total > 0 ? Math.round((c.bookings / data.total) * 100) : 0;
                const isOpen = open === c.channel;
                const detail = cache[c.channel];
                return (
                  <div key={c.channel} className="rounded-lg border border-transparent hover:border-border">
                    <button type="button" onClick={() => toggle(c.channel)} aria-expanded={isOpen}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted/40">
                      {isOpen ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: colorFor(c.channel) }} />
                      <span className="w-[150px] shrink-0 truncate text-[13.5px] font-medium text-slate-700 dark:text-foreground">{c.channel}</span>
                      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(3, (c.bookings / max) * 100)}%`, background: colorFor(c.channel) }} />
                      </div>
                      <span className="w-12 shrink-0 text-right font-mono text-[12.5px] tabular-nums text-slate-500">{c.bookings.toLocaleString()}</span>
                      <span className="w-9 shrink-0 text-right font-mono text-[12.5px] font-semibold tabular-nums text-slate-700 dark:text-foreground/90">{pct}%</span>
                      <span className="w-[52px] shrink-0 text-right"><TrendChip pct={c.deltaPct} /></span>
                    </button>

                    {isOpen && (
                      <div className="px-2 pb-3 pl-9">
                        {detail?.loading ? (
                          <div className="flex items-center gap-2 py-3 text-[12.5px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Loading bookings…</div>
                        ) : detail?.error ? (
                          <div className="py-3 text-[12.5px] text-error-strong">{detail.error}</div>
                        ) : !detail?.rows?.length ? (
                          <div className="py-3 text-[12.5px] text-muted-foreground">No individual bookings to show.</div>
                        ) : (
                          <div className="overflow-x-auto rounded-lg border border-border">
                            <table className="w-full min-w-[640px] text-[12.5px]">
                              <thead>
                                <tr className="border-b border-border bg-muted/40 text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
                                  <th className="px-2.5 py-1.5 font-semibold">Time</th>
                                  <th className="px-2.5 py-1.5 font-semibold">Source / medium</th>
                                  <th className="px-2.5 py-1.5 font-semibold">Landing page</th>
                                  <th className="px-2.5 py-1.5 font-semibold">Device</th>
                                  <th className="px-2.5 py-1.5 font-semibold">Location</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.rows.map((r, i) => (
                                  <tr key={i} className="border-b border-border/60 last:border-0">
                                    <td className="whitespace-nowrap px-2.5 py-1.5 font-mono tabular-nums text-foreground">{r.time}</td>
                                    <td className="px-2.5 py-1.5 text-muted-foreground">{r.sourceMedium}</td>
                                    <td className="max-w-[240px] truncate px-2.5 py-1.5 text-muted-foreground" title={r.landingPage}>{r.landingPage}</td>
                                    <td className="px-2.5 py-1.5 capitalize text-muted-foreground">{r.device}</td>
                                    <td className="px-2.5 py-1.5 text-muted-foreground">{r.location || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="pt-1 text-[12px] text-slate-400">
              “Direct” is undercounted — the Calendly wrapper + late GTM lose the original source, so real organic/referral bookings are higher. Times are collapsed when the same source/page/minute repeats.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
