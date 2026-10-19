"use client";

// Team Targets: the two global filters (timeline + person). Both live in the URL
// so a view is shareable and the page stays a plain server render; every KPI,
// chart and table row responds to them.

import { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";

const PERIODS: { key: string; label: string }[] = [
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "last_3_months", label: "Last 3 months" },
  { key: "this_quarter", label: "This quarter" },
  { key: "this_year", label: "This year" },
  { key: "custom", label: "Custom range" },
];

export function DashboardFilters({
  period, start, end, person, people,
}: {
  period: string;
  start: string;
  end: string;
  person: string;
  people: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k); else next.set(k, v);
    }
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  };

  const personItems = [{ value: "all", label: "Everyone" }, ...people.map((p) => ({ value: p.id, label: p.name }))];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Combobox
        items={PERIODS.map((p) => ({ value: p.key, label: p.label }))}
        value={period}
        onValueChange={(v) => update(v === "custom" ? { period: v } : { period: v, start: null, end: null })}
        placeholder="This month"
        className="h-8 w-[150px]"
      />
      {period === "custom" && (
        <>
          <Input type="date" value={start} onChange={(e) => update({ period: "custom", start: e.target.value })} className="h-8 w-36 text-xs" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" value={end} onChange={(e) => update({ period: "custom", end: e.target.value })} className="h-8 w-36 text-xs" />
        </>
      )}
      <Combobox
        items={personItems}
        value={person || "all"}
        onValueChange={(v) => update({ person: v === "all" ? null : v })}
        placeholder="Everyone"
        searchPlaceholder="Search people"
        className="h-8 w-[160px]"
      />
      {pending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
    </div>
  );
}
