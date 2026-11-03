"use client";

// Demo bookings panel (below Traffic sources). Non-paid sources only, for the
// page's selected range. Each source expands to the individual bookings under it
// (time, source/medium, landing page, device, location) — lazy-loaded from GA4
// via getDemoBookingDetail. Honest about GA4's limits: "Direct" is undercounted
// (Calendly wrapper + late GTM lose the source).

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BadgeCheck, CalendarCheck, ChevronDown, ChevronRight, Loader2, MousePointerClick, Plug, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/dashboard/empty-state";
import { getDemoBookingDetail } from "@/lib/actions/report-demos";
import type { Ga4DemoBookings, Ga4BookingDetailRow, Ga4DemoCta } from "@/lib/google/ga4";
import type { HubspotVerification } from "@/lib/hubspot/leads";

// GA4 booking times are wall-clock in the property timezone; HubSpot createdate is
// UTC. Convert both to a comparable "property-tz wall clock" so a booking can be
// matched to a CRM record created within MATCH_MS of it.
const MATCH_MS = 15 * 60 * 1000;
function tzWallMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(utcMs));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const h = g("hour") === "24" ? "0" : g("hour");
  return Date.UTC(+g("year"), +g("month") - 1, +g("day"), +h, +g("minute"));
}
function gaWallMs(timeStr: string): number {
  const [date, time] = timeStr.split(" ");
  if (!date || !time) return NaN;
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return Date.UTC(y, mo - 1, d, h, mi);
}

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

export function DemoBookingsPanel({ data, cta, hubspot, propertyTz, range, rangeLabel }: { data: Ga4DemoBookings; cta: Ga4DemoCta; hubspot: HubspotVerification; propertyTz: string; range: string; rangeLabel: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, DetailState>>({});
  // HubSpot meeting times (property-tz wall clock): real -> "Verified", internal/test -> drop the row.
  const verifyWall = useMemo(() => (hubspot.ok ? hubspot.verifyTimestamps.map((t) => tzWallMs(t, propertyTz)) : []), [hubspot, propertyTz]);
  const excludeWall = useMemo(() => (hubspot.ok ? hubspot.excludeTimestamps.map((t) => tzWallMs(t, propertyTz)) : []), [hubspot, propertyTz]);
  const near = (walls: number[], time: string) => { const g = gaWallMs(time); return Number.isFinite(g) && walls.some((w) => Math.abs(w - g) <= MATCH_MS); };
  const isVerified = (time: string) => near(verifyWall, time);
  const isExcluded = (time: string) => near(excludeWall, time);

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
        <h2 className="font-heading text-[19px] font-semibold tracking-[-0.01em] text-foreground">Deals captured</h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Demos booked by source · {rangeLabel.toLowerCase()} · non-paid; tagged when a HubSpot deal was captured
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
            title={`No demos booked ${rangeLabel.toLowerCase()}`}
            why="A booking is counted when a visitor reaches the post-demo “What’s Next?” page. None from non-paid sources in this window."
          />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-x-7 gap-y-2">
              <div className="flex items-end gap-2">
                <div className="font-heading text-[30px] font-bold leading-none tabular-nums text-foreground">{data.total.toLocaleString()}</div>
                <div className="pb-0.5 text-[13px] text-slate-500">demos booked</div>
                <div className="pb-0.5"><TrendChip pct={data.trendPct} /></div>
              </div>
              {hubspot.ok && (
                <div className="flex items-end gap-2">
                  <div className="font-heading text-[30px] font-bold leading-none tabular-nums text-success-strong">{hubspot.realDeals.toLocaleString()}</div>
                  <div className="pb-0.5 text-[13px] text-slate-500">deals captured</div>
                </div>
              )}
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
                                  <th className="px-2.5 py-1.5 font-semibold">Deal</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.rows.filter((r) => !(hubspot.ok && isExcluded(r.time))).map((r, i) => {
                                  const verified = hubspot.ok && isVerified(r.time);
                                  return (
                                  <tr key={i} className="border-b border-border/60 last:border-0">
                                    <td className="whitespace-nowrap px-2.5 py-1.5 font-mono tabular-nums text-foreground">{r.time}</td>
                                    <td className="px-2.5 py-1.5 text-muted-foreground">{r.sourceMedium}</td>
                                    <td className="max-w-[240px] truncate px-2.5 py-1.5 text-muted-foreground" title={r.landingPage}>{r.landingPage}</td>
                                    <td className="px-2.5 py-1.5 capitalize text-muted-foreground">{r.device}</td>
                                    <td className="px-2.5 py-1.5 text-muted-foreground">{r.location || "—"}</td>
                                    <td className="whitespace-nowrap px-2.5 py-1.5">
                                      {verified ? (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success-strong">
                                          <BadgeCheck className="size-3" /> Deal
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground/50">—</span>
                                      )}
                                    </td>
                                  </tr>
                                  );
                                })}
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

            {hubspot.ok ? (
              <p className="flex items-start gap-1.5 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-[12px] text-slate-600 dark:text-foreground/80">
                <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-success-strong" />
                <span>
                  HubSpot this period: <strong>{hubspot.realDeals.toLocaleString()}</strong> deals captured
                  {hubspot.excludedDeals > 0 ? ` · ${hubspot.excludedDeals.toLocaleString()} internal/test dropped` : ""}.
                  Expand a source — a booking is tagged <span className="font-semibold text-success-strong">Deal</span> when a HubSpot deal was created within ~15 min of it; internal/test are removed. About half of bookings become a deal; the rest stay untagged (booked, no deal yet).
                </span>
              </p>
            ) : hubspot.reason ? (
              <p className="text-[12px] text-slate-400">HubSpot verification unavailable: {hubspot.reason}</p>
            ) : null}

            <p className="pt-1 text-[12px] text-slate-400">
              “Direct” is undercounted — the Calendly wrapper + late GTM lose the original source, so real organic/referral bookings are higher. Times are collapsed when the same source/page/minute repeats.
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
