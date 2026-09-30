"use client";

// Backlinks (Ticket 3): the date-range filter shared by the list and detail
// pages. Nine presets is too many for Reports' pill-row style, so this uses a
// Select instead - same range/start/end URL-param pattern as task-filters.tsx
// (custom reveals two <Input type="date"> fields), just scoped to one field
// instead of a whole filter sidebar. A server round-trip on every change
// (router.push, not client-side re-filtering) because the counts themselves
// are computed server-side for the selected range.

import { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const PRESETS: { key: string; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "yesterday", label: "Yesterday" },
  { key: "today", label: "Today" },
  { key: "this_week", label: "This week" },
  { key: "this_month", label: "This month" },
  { key: "last_3_months", label: "Last 3 months" },
  { key: "last_6_months", label: "Last 6 months" },
  { key: "this_year", label: "This year" },
  { key: "last_year", label: "Last year" },
  { key: "custom", label: "Custom" },
];

export function BacklinkDateFilter({ range, start, end }: { range: string; start: string; end: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value || value === "all") next.delete(key);
      else next.set(key, value);
    }
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">Date filter</span>
      <Select items={PRESETS.map((p) => ({ value: p.key, label: p.label }))} value={range} onValueChange={(v) => v && update(v === "custom" ? { range: v } : { range: v, start: null, end: null })}>
        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
        <SelectContent>
          {PRESETS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
        </SelectContent>
      </Select>

      {range === "custom" && (
        <>
          <Input type="date" value={start} onChange={(e) => update({ range: "custom", start: e.target.value })} className="h-8 w-36 text-xs" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" value={end} onChange={(e) => update({ range: "custom", end: e.target.value })} className="h-8 w-36 text-xs" />
        </>
      )}

      {pending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
    </div>
  );
}
