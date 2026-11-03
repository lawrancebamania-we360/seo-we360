"use client";

// Content -> demo funnels (Blogs / Guides / Marketing pages). Each card shows the
// 3-step sequential funnel (read content -> view /demo/ -> book via /next-steps/).
// "View details" opens a modal with a GA4-style funnel chart (numbers on top of
// the bars) and the full per-page table (entered -> viewed demo -> booked -> rate).

import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Ga4ContentFunnel } from "@/lib/google/ga4";

export type FunnelCard = Ga4ContentFunnel & { label: string; step1Label: string };

const stepLabel = (f: FunnelCard, i: number, name: string) => (i === 0 ? f.step1Label : name);

export function ContentFunnels({ funnels, rangeLabel }: { funnels: FunnelCard[]; rangeLabel: string }) {
  const [detail, setDetail] = useState<FunnelCard | null>(null);
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-heading text-[19px] font-semibold tracking-[-0.01em] text-foreground">Content → demo funnels</h2>
        <p className="mt-1 text-[13px] text-slate-500">Read content → view the demo page → book a demo · {rangeLabel.toLowerCase()}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {funnels.map((f) => <FunnelCardView key={f.segment} f={f} onOpen={() => setDetail(f)} />)}
      </div>
      <p className="text-[12px] text-slate-400">Sequential funnel — users who did each step in order (GA4). Directional for small counts.</p>
      {detail && <FunnelModal f={detail} onClose={() => setDetail(null)} />}
    </section>
  );
}

function FunnelCardView({ f, onOpen }: { f: FunnelCard; onOpen: () => void }) {
  const noData = f.steps.every((s) => s.users === 0);
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-lift">
      <div className="mb-3 font-heading text-[15px] font-semibold text-foreground">{f.label}</div>
      {!f.connected ? (
        <p className="text-[12.5px] text-muted-foreground">{f.reason ?? "GA4 not connected."}</p>
      ) : noData ? (
        <p className="text-[12.5px] text-muted-foreground">No funnel data in this range.</p>
      ) : (
        <>
          <div className="space-y-2.5">
            {f.steps.map((s, i) => (
              <div key={i}>
                <div className="mb-0.5 flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="min-w-0 truncate text-slate-700 dark:text-foreground">{i + 1}. {stepLabel(f, i, s.name)}</span>
                  <span className="shrink-0 font-mono tabular-nums text-slate-500">{s.users.toLocaleString()} · {s.completionRate}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-[#5B45E0]" style={{ width: `${Math.max(2, s.completionRate)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={onOpen}
            className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-[#5B45E0] hover:underline dark:text-[#7B62FF]">
            <BarChart3 className="size-3.5" /> View details
          </button>
        </>
      )}
    </div>
  );
}

function FunnelModal({ f, onClose }: { f: FunnelCard; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[min(900px,60vw)]">
        <DialogHeader>
          <DialogTitle>{f.label} — content → demo funnel</DialogTitle>
          <DialogDescription>Read content → view the demo page → book a demo. Numbers are users who completed each step in order.</DialogDescription>
        </DialogHeader>

        {/* GA4-style funnel chart — bars sized by completion %, numbers on top */}
        <div className="rounded-xl border border-border bg-muted/20 px-4 pb-4 pt-5">
          <div className="flex items-end justify-around gap-6">
            {f.steps.map((s, i) => (
              <div key={i} className="flex w-full max-w-[150px] flex-col items-center">
                <div className="mb-1 text-center">
                  <div className="font-heading text-[18px] font-bold leading-none tabular-nums text-foreground">{s.users.toLocaleString()}</div>
                  <div className="mt-0.5 text-[11px] font-semibold text-[#5B45E0] dark:text-[#7B62FF]">{s.completionRate}%</div>
                </div>
                <div className="flex h-[180px] w-full items-end">
                  <div className="w-full rounded-t-md bg-gradient-to-t from-[#5B45E0] to-[#7B62FF]" style={{ height: `${Math.max(2, s.completionRate)}%` }} />
                </div>
                <div className="mt-2 text-center text-[12px] font-medium text-foreground">{i + 1}. {stepLabel(f, i, s.name)}</div>
                {i < f.steps.length - 1 && (
                  <div className="mt-0.5 text-center text-[10.5px] text-error-strong">↓ {s.abandonmentRate}% drop</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Per-page breakdown */}
        <div className="mt-4">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">By page</div>
          {f.pages.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">No per-page breakdown available.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[480px] text-[12.5px]">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-2.5 py-2 font-semibold">Page</th>
                    <th className="px-2.5 py-2 text-right font-semibold">Entered</th>
                    <th className="px-2.5 py-2 text-right font-semibold">Viewed demo</th>
                    <th className="px-2.5 py-2 text-right font-semibold">Booked</th>
                    <th className="px-2.5 py-2 text-right font-semibold">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {f.pages.map((p, i) => (
                    <tr key={i} className="border-b border-border/60 last:border-0">
                      <td className="max-w-[260px] truncate px-2.5 py-2 text-muted-foreground" title={p.page}>{p.page}</td>
                      <td className="px-2.5 py-2 text-right font-mono tabular-nums text-foreground">{p.entered.toLocaleString()}</td>
                      <td className="px-2.5 py-2 text-right font-mono tabular-nums text-foreground">{p.viewedDemo.toLocaleString()}</td>
                      <td className="px-2.5 py-2 text-right font-mono tabular-nums text-foreground">{p.booked.toLocaleString()}</td>
                      <td className="px-2.5 py-2 text-right font-mono tabular-nums text-slate-500">{p.completionRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
