"use client";

// Executive dashboard: the single global date-range filter. Lives in the URL
// (?range=) so the whole server-rendered page — every KPI and chart — responds
// to it and the view stays shareable. Default is this month.

import { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Combobox } from "@/components/ui/combobox";
import { TRAFFIC_RANGE_PRESETS } from "@/lib/data/executive";

export function ExecutiveRangeFilter({ rangeKey }: { rangeKey: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const update = (value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (!value || value === "this_month") next.delete("range");
    else next.set("range", value);
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  };

  return (
    <div className="flex items-center gap-2">
      <Combobox
        items={TRAFFIC_RANGE_PRESETS.map((p) => ({ value: p.key, label: p.label }))}
        value={rangeKey}
        onValueChange={update}
        placeholder="This month"
        className="h-8 w-[150px]"
      />
      {pending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
    </div>
  );
}
