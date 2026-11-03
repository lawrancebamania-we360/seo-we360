"use client";

// Content -> demo funnels (Blogs / Guides / Marketing pages). Each card shows the
// 3-step sequential funnel (read content -> view /demo/ -> book via /next-steps/)
// and expands to a per-page breakdown. Data is pre-fetched server-side; the card
// only toggles the drill-down.

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Ga4ContentFunnel } from "@/lib/google/ga4";

export type FunnelCard = Ga4ContentFunnel & { label: string; step1Label: string };

export function ContentFunnels({ funnels, rangeLabel }: { funnels: FunnelCard[]; rangeLabel: string }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-heading text-[19px] font-semibold tracking-[-0.01em] text-foreground">Content → demo funnels</h2>
        <p className="mt-1 text-[13px] text-slate-500">Read content → view the demo page → book a demo · {rangeLabel.toLowerCase()}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {funnels.map((f) => <FunnelCardView key={f.segment} f={f} />)}
      </div>
      <p className="text-[12px] text-slate-400">Sequential funnel — users who did each step in order (GA4). Directional for small counts.</p>
    </section>
  );
}

function FunnelCardView({ f }: { f: FunnelCard }) {
  const [open, setOpen] = useState(false);
  const noData = f.steps.every((s) => s.users === 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-lift">
      <div className="mb-3 font-heading text-[15px] font-semibold text-foreground">{f.label}</div>
      {!f.connected ? (
        <p className="text-[12.5px] text-muted-foreground">{f.reason ?? "GA4 not connected."}</p>
      ) : noData ? (
        <div className="space-y-1">
          <p className="text-[12.5px] text-muted-foreground">No funnel data in this range.</p>
          {f.debug && <p className="break-all font-mono text-[9.5px] leading-tight text-slate-400">{f.debug}</p>}
        </div>
      ) : (
        <>
          <div className="space-y-2.5">
            {f.steps.map((s, i) => (
              <div key={i}>
                <div className="mb-0.5 flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="min-w-0 truncate text-slate-700 dark:text-foreground">{i + 1}. {i === 0 ? f.step1Label : s.name}</span>
                  <span className="shrink-0 font-mono tabular-nums text-slate-500">{s.users.toLocaleString()} · {s.completionRate}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-[#5B45E0]" style={{ width: `${Math.max(2, s.completionRate)}%` }} />
                </div>
              </div>
            ))}
          </div>

          <button type="button" onClick={() => setOpen((o) => !o)}
            className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-[#5B45E0] hover:underline dark:text-[#7B62FF]">
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />} {open ? "Hide pages" : "View pages"}
          </button>

          {open && (
            f.pages.length === 0 ? (
              <p className="mt-2 text-[12px] text-muted-foreground">No per-page breakdown available.</p>
            ) : (
              <div className="mt-2 overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[320px] text-[12px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-2 py-1.5 font-semibold">Page</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Entered</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Booked</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.pages.map((p, i) => (
                      <tr key={i} className="border-b border-border/60 last:border-0">
                        <td className="max-w-[180px] truncate px-2 py-1.5 text-muted-foreground" title={p.page}>{p.page}</td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums text-foreground">{p.entered.toLocaleString()}</td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums text-foreground">{p.booked.toLocaleString()}</td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums text-slate-500">{p.completionRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
