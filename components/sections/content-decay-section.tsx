// Analytics · Pages going stale — the content-decay list. Reads the
// content_freshness snapshot (previously write-only) and shows pages whose
// traffic is fading vs their 90-day baseline, worst first, with a 3-point
// weekly-normalized sparkline and a deep-link into Blog Audit (where phase-10
// already turns decay into a refresh task — the single actioning path, so we
// don't double-action here). Empty = an honest "nothing decaying" state.

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { ContentFreshnessRow } from "@/lib/data/content-freshness";
import { Sparkline } from "@/components/ui/sparkline";
import { cn } from "@/lib/utils";

const STATUS_META: Record<
  "decaying" | "declining",
  { label: string; pill: string; spark: string; decay: string }
> = {
  decaying: {
    label: "Decaying",
    pill: "bg-error-100 text-error-700 dark:bg-error-950/40 dark:text-error-300",
    spark: "var(--color-error)",
    decay: "text-error-strong",
  },
  declining: {
    label: "Declining",
    pill: "bg-warning-100 text-warning-700 dark:bg-warning-950/40 dark:text-warning-300",
    spark: "var(--color-warning)",
    decay: "text-warning-strong",
  },
};

const GRID = "minmax(200px,2.4fr) 104px 76px 128px 104px 128px";

export function ContentDecaySection({ rows }: { rows: ContentFreshnessRow[] }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-heading text-[19px] font-semibold tracking-[-0.01em] text-foreground">Pages going stale</h2>
        <p className="mt-1 text-[13px] text-slate-500">Traffic fading vs the 90-day baseline · refreshed weekly</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lift">
        {rows.length === 0 ? (
          <div className="px-6 py-11 text-center">
            <div className="text-sm font-semibold text-slate-700 dark:text-foreground">No content decay detected 🎉</div>
            <div className="mt-1 text-[13px] text-slate-400">
              Your pages are holding their traffic. Fading pages appear here after the weekly Google sync.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: 740 }}>
              <div
                style={{ gridTemplateColumns: GRID }}
                className="grid items-center gap-4 border-b border-slate-150 bg-muted/40 px-[22px] py-3 dark:border-border"
              >
                {["Page", "Status", "Decay", "7d vs 90d", "Last 7d / 90d", ""].map((h, i) => (
                  <span
                    key={i}
                    className="font-mono text-[11.5px] font-medium uppercase tracking-[0.09em] text-slate-400"
                  >
                    {h}
                  </span>
                ))}
              </div>

              {rows.map((r) => {
                const meta = STATUS_META[r.status as "decaying" | "declining"] ?? STATUS_META.declining;
                const spark = [r.views_prior_90d / 12.86, r.views_prior_30d / 4.29, r.views_last_7d];
                return (
                  <div
                    key={r.page_path}
                    style={{ gridTemplateColumns: GRID }}
                    className="grid items-center gap-4 border-b border-slate-150 px-[22px] py-3.5 last:border-0 dark:border-border"
                  >
                    <span
                      className="min-w-0 truncate font-mono text-[12.5px] text-slate-700 dark:text-foreground/90"
                      title={r.page_path}
                    >
                      {r.page_path}
                    </span>
                    <span>
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", meta.pill)}>
                        {meta.label}
                      </span>
                    </span>
                    <span className={cn("font-mono text-[13px] font-bold tabular-nums", meta.decay)}>
                      {r.decay_pct > 0 ? "+" : ""}
                      {Math.round(r.decay_pct)}%
                    </span>
                    <span>
                      <Sparkline data={spark} width={104} height={28} color={meta.spark} />
                    </span>
                    <span className="font-mono text-[12.5px] tabular-nums text-slate-400">
                      {r.views_last_7d.toLocaleString()} / {r.views_prior_90d.toLocaleString()}
                    </span>
                    <span className="text-right">
                      <Link
                        href="/dashboard/blog-audit"
                        className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline"
                      >
                        See in audit
                        <ArrowRight className="size-3.5" />
                      </Link>
                    </span>
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
