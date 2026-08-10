import * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * MoverList — a compact, read-only "what changed" card (weekly gainers / losers,
 * rank movers). Reuses the shared table-card chrome (rounded-2xl border bg-card
 * shadow-lift, mono uppercase header, slate-150 row dividers).
 *
 * The caller decides `direction` (up = good/green, down = bad/red) and the
 * `deltaLabel` string, so a rank improvement (#14 → #8, a smaller number) still
 * reads as "up". Pass `format:"position"` to render values as `#8`.
 */
export type MoverItem = {
  /** Query text or page path. */
  primary: string;
  /** Optional page path shown under a query. */
  secondary?: string;
  from: number;
  to: number;
  /** Pre-formatted delta, e.g. "+45%" or "+6" or "New". */
  deltaLabel: string;
  direction: "up" | "down";
  format?: "count" | "position";
};

export function MoverList({
  title,
  subtitle,
  items,
  emptyCopy,
}: {
  title: string;
  subtitle?: string;
  items: MoverItem[];
  emptyCopy: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-lift">
      <div className="border-b border-slate-150 px-[22px] py-3.5 dark:border-border">
        <div className="font-mono text-[11.5px] font-medium uppercase tracking-[0.09em] text-slate-400">{title}</div>
        {subtitle && <div className="mt-0.5 text-[12px] text-slate-400">{subtitle}</div>}
      </div>
      {items.length === 0 ? (
        <div className="px-[22px] py-8 text-center text-[13px] text-slate-400">{emptyCopy}</div>
      ) : (
        <div>
          {items.map((it, i) => {
            const up = it.direction === "up";
            const fmt = (n: number) => (it.format === "position" ? `#${Math.round(n)}` : n.toLocaleString());
            return (
              <div
                key={`${it.primary}-${i}`}
                className="flex items-center justify-between gap-3 border-b border-slate-150 px-[22px] py-3 last:border-0 dark:border-border"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13.5px] font-semibold text-slate-800 dark:text-foreground">{it.primary}</div>
                  {it.secondary && <div className="truncate font-mono text-[11.5px] text-slate-400">{it.secondary}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <span className="font-mono text-[12.5px] tabular-nums text-slate-400">
                    {fmt(it.from)} → {fmt(it.to)}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11.5px] font-bold tabular-nums",
                      up ? "bg-success/15 text-success-strong" : "bg-error/15 text-error-strong",
                    )}
                  >
                    {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                    {it.deltaLabel}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
