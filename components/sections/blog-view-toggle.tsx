"use client";

// URL-driven Board / List / Calendar / Timeline switcher for the Blog Sprint.
// Writes ?view=<v> (drops it for the default board) so the view deep-links and
// shares the board's filters. Mirrors Klimb's Content-Sprint view toggle, but
// over We360's own board + task shape.

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { LayoutGrid, List, CalendarDays, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";

export type BlogView = "board" | "list" | "calendar" | "timeline";

const VIEWS: { key: BlogView; label: string; icon: typeof LayoutGrid }[] = [
  { key: "board", label: "Board", icon: LayoutGrid },
  { key: "list", label: "List", icon: List },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "timeline", label: "Timeline", icon: GitBranch },
];

export function BlogViewToggle({ value }: { value: BlogView }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const set = (v: BlogView) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (v === "board") sp.delete("view");
    else sp.set("view", v);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1">
      {VIEWS.map((v) => {
        const active = value === v.key;
        return (
          <button
            key={v.key}
            type="button"
            onClick={() => set(v.key)}
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <v.icon className="size-3.5" />
            <span className="hidden sm:inline">{v.label}</span>
          </button>
        );
      })}
    </div>
  );
}
