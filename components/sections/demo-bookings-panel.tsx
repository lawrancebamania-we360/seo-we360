"use client";

// "Deals captured" panel (below Traffic sources). Shows UNIQUE deals attributed
// to an organic source: each organic demo booking (GA4) matched to a real HubSpot
// deal created within ~15 min of it, de-duplicated, grouped by channel. The
// matching is done server-side (lib/analytics/organic-deals); this just renders.
// Below it, the Demo CTA clicks block (unchanged).

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, ChevronRight, MousePointerClick, Plug, Trophy } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import type { OrganicDeals } from "@/lib/analytics/organic-deals";
import type { Ga4DemoCta } from "@/lib/google/ga4";

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

export function DemoBookingsPanel({ organic, gaOk, gaReason, hsOk, hsReason, cta, rangeLabel }: {
  organic: OrganicDeals;
  gaOk: boolean;
  gaReason?: string;
  hsOk: boolean;
  hsReason?: string;
  cta: Ga4DemoCta;
  rangeLabel: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const max = organic.byChannel.reduce((m, c) => Math.max(m, c.count), 0) || 1;
  const toggle = (channel: string) => setOpen((o) => (o === channel ? null : channel));

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-heading text-[19px] font-semibold tracking-[-0.01em] text-foreground">Deals captured</h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Unique deals from organic sources · {rangeLabel.toLowerCase()} · each deal matched to its demo booking’s source
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-lift">
        {!gaOk ? (
          <EmptyState
            icon={Plug}
            title="Connect GA4 to see deals by source"
            why={gaReason ?? "Google Analytics isn’t connected for this project yet."}
            action={
              <Link href="/dashboard/integrations" className="inline-flex items-center gap-1.5 rounded-[10px] bg-gradient-brand px-3.5 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-y-0.5">
                Connect Google <ArrowUpRight className="size-3.5" />
              </Link>
            }
          />
        ) : !hsOk ? (
          <EmptyState icon={Plug} title="HubSpot not connected" why={`${hsReason ?? "No HubSpot token on the server."} Deals can’t be matched without it.`} />
        ) : organic.total === 0 ? (
          <EmptyState
            icon={Trophy}
            title={`No organic deals ${rangeLabel.toLowerCase()}`}
            why="A deal is counted when an organic demo booking matched a HubSpot deal created within ~15 min. None in this window — try a longer range (deals are low-volume)."
          />
        ) : (
          <div className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="font-heading text-[30px] font-bold leading-none tabular-nums text-success-strong">{organic.total.toLocaleString()}</div>
              <div className="pb-0.5 text-[13px] text-slate-500">deals captured from organic</div>
            </div>

            {organic.ambiguous > 0 && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12px] text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
                {organic.ambiguous} of these are attributed with low confidence — another source booked within ~15 min, so the channel is a best guess.
              </p>
            )}

            <div className="space-y-1">
              {organic.byChannel.map((c) => {
                const pct = organic.total > 0 ? Math.round((c.count / organic.total) * 100) : 0;
                const isOpen = open === c.channel;
                return (
                  <div key={c.channel} className="rounded-lg border border-transparent hover:border-border">
                    <button type="button" onClick={() => toggle(c.channel)} aria-expanded={isOpen}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted/40">
                      {isOpen ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: colorFor(c.channel) }} />
                      <span className="w-[150px] shrink-0 truncate text-[13.5px] font-medium text-slate-700 dark:text-foreground">{c.channel}</span>
                      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${Math.max(3, (c.count / max) * 100)}%`, background: colorFor(c.channel) }} />
                      </div>
                      <span className="w-12 shrink-0 text-right font-mono text-[12.5px] tabular-nums text-slate-500">{c.count.toLocaleString()}</span>
                      <span className="w-9 shrink-0 text-right font-mono text-[12.5px] font-semibold tabular-nums text-slate-700 dark:text-foreground/90">{pct}%</span>
                    </button>

                    {isOpen && (
                      <div className="px-2 pb-3 pl-9">
                        <div className="overflow-x-auto rounded-lg border border-border">
                          <table className="w-full min-w-[560px] text-[12.5px]">
                            <thead>
                              <tr className="border-b border-border bg-muted/40 text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
                                <th className="px-2.5 py-1.5 font-semibold">Booking time</th>
                                <th className="px-2.5 py-1.5 font-semibold">Landing page</th>
                                <th className="px-2.5 py-1.5 font-semibold">Device</th>
                                <th className="px-2.5 py-1.5 font-semibold">Location</th>
                              </tr>
                            </thead>
                            <tbody>
                              {c.deals.map((d, i) => (
                                <tr key={i} className="border-b border-border/60 last:border-0">
                                  <td className="whitespace-nowrap px-2.5 py-1.5 font-mono tabular-nums text-foreground">{d.time}</td>
                                  <td className="max-w-[240px] truncate px-2.5 py-1.5 text-muted-foreground" title={d.landingPage}>{d.landingPage}</td>
                                  <td className="px-2.5 py-1.5 capitalize text-muted-foreground">{d.device}</td>
                                  <td className="px-2.5 py-1.5 text-muted-foreground">{d.location || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="pt-1 text-[12px] text-slate-400">
              A deal counts here when a HubSpot deal was created within ~15 min of an organic demo booking, matched by the minute (≈96% of minutes have a single booking). Paid, internal and test are excluded.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-lift">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <MousePointerClick className="size-4 text-muted-foreground" />
          <h3 className="text-[15px] font-semibold text-foreground">Demo CTA clicks</h3>
          <span className="text-[12px] text-slate-400">which button & page drive demos</span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Tracking since 2 Nov 2026</span>
        </div>
        {!cta.connected ? (
          <p className="text-[13px] text-muted-foreground">{cta.reason ?? "GA4 not connected."}</p>
        ) : cta.beforeCta ? (
          <p className="text-[13px] text-muted-foreground">Button tracking started 2 Nov 2026 — no CTA data for this range.</p>
        ) : cta.totalClicks === 0 ? (
          <p className="text-[13px] text-muted-foreground">No demo-CTA clicks in this range (tracking began 2 Nov 2026).</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-6">
              <Stat label="Demo CTA clicks" value={cta.totalClicks.toLocaleString()} />
              <Stat label="Bookings (since 2 Nov)" value={cta.bookingsSince.toLocaleString()} />
              <Stat label="Click → booking" value={cta.totalClicks > 0 ? `${Math.round((cta.bookingsSince / cta.totalClicks) * 1000) / 10}%` : "—"} />
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">By placement</div>
              {(() => {
                const maxLoc = cta.byLocation.reduce((m, l) => Math.max(m, l.clicks), 0) || 1;
                return cta.byLocation.map((l) => (
                  <div key={l.location} className="flex items-center gap-3">
                    <span className="w-[140px] shrink-0 truncate text-[13px] text-slate-700 dark:text-foreground">{l.location}</span>
                    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-[#5B45E0]" style={{ width: `${Math.max(3, (l.clicks / maxLoc) * 100)}%` }} />
                    </div>
                    <span className="w-12 shrink-0 text-right font-mono text-[12.5px] tabular-nums text-slate-500">{l.clicks.toLocaleString()}</span>
                  </div>
                ));
              })()}
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[560px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-2.5 py-1.5 font-semibold">Button</th>
                    <th className="px-2.5 py-1.5 font-semibold">Placement</th>
                    <th className="px-2.5 py-1.5 font-semibold">Page</th>
                    <th className="px-2.5 py-1.5 text-right font-semibold">Clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {cta.byButton.slice(0, 25).map((r, i) => (
                    <tr key={i} className="border-b border-border/60 last:border-0">
                      <td className="px-2.5 py-1.5 text-foreground">{r.ctaText}</td>
                      <td className="px-2.5 py-1.5 text-muted-foreground">{r.location}</td>
                      <td className="max-w-[220px] truncate px-2.5 py-1.5 text-muted-foreground" title={r.page}>{r.page}</td>
                      <td className="px-2.5 py-1.5 text-right font-mono tabular-nums text-foreground">{r.clicks.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[12px] text-slate-400">
              Aggregate only — the rate is bookings ÷ demo-CTA clicks over the same window (2 Nov onward), not per button (per-button attribution needs BigQuery). Not every booking comes from a tracked button, so it can exceed 100%.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-heading text-[22px] font-bold leading-none tabular-nums text-foreground">{value}</div>
      <div className="mt-1 text-[11.5px] text-slate-500">{label}</div>
    </div>
  );
}
