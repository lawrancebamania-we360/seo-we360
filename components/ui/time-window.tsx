"use client";

// URL-driven time-window preset control. A screen renders it with a `param`
// name + the current value; clicking a preset navigates to `?<param>=<value>`
// (preserving other query params) so the server page re-fetches at that range.
// Reusable across any screen whose data function accepts a window size.

import { useRouter, usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

export type TimeWindowOption = { value: number | string; label: string };

export function TimeWindow({
  param,
  value,
  options,
}: {
  param: string;
  value: number | string;
  options: TimeWindowOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const set = (v: number | string) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set(param, String(v));
    router.push(`${pathname}?${sp.toString()}`);
  };

  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1">
      {options.map((o) => {
        const active = String(o.value) === String(value);
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => set(o.value)}
            aria-pressed={active}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              active ? "bg-gradient-brand text-white" : "text-slate-600 hover:bg-muted",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
