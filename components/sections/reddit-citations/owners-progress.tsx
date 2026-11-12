// Reddit Citations: the owner-progress panel on a month. Contributors show their
// added count vs their 5/month goal; the publisher (Leena) shows published vs 15.
// Counts are this month's rows in this cluster - the Team Targets tab holds the
// verified monthly rollup.

import { cn } from "@/lib/utils";
import type { OwnerProgress } from "@/lib/data/reddit-citations";

export function OwnersProgress({ owners }: { owners: OwnerProgress[] }) {
  if (!owners.length) return null;
  const contributors = owners.filter((o) => o.kind === "contributor");
  const publishers = owners.filter((o) => o.kind === "publisher");

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Owners this month</div>
      <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {contributors.map((o) => <Row key={`c-${o.personId}`} o={o} tone="contributor" />)}
        {publishers.map((o) => <Row key={`p-${o.personId}`} o={o} tone="publisher" />)}
      </div>
    </div>
  );
}

function Row({ o, tone }: { o: OwnerProgress; tone: "contributor" | "publisher" }) {
  const target = o.target ?? 0;
  const pct = target > 0 ? Math.min(100, Math.round((o.done / target) * 100)) : o.done > 0 ? 100 : 0;
  const met = target > 0 && o.done >= target;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-[13px]">
        <span className="truncate font-medium text-foreground">{o.name}</span>
        <span className={cn("shrink-0 tabular-nums", met ? "text-success-700 dark:text-success-400" : "text-muted-foreground")}>
          {o.done}{o.target != null ? ` / ${o.target}` : ""}
          <span className="ml-1 text-[11px] text-muted-foreground">{tone === "publisher" ? "published" : "added"}</span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", met ? "bg-success-500" : tone === "publisher" ? "bg-[#FEB800]" : "bg-[#7B62FF]")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
