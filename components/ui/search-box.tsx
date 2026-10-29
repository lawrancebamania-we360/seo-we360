"use client";

// A compact client-side search input: an icon, a clearable field. Used to filter
// an already-loaded list in place (cluster cards, cluster posts, the publish
// queue) - no server round-trip, so typing filters instantly.

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function SearchBox({ value, onChange, placeholder = "Search...", className, autoFocus }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-7 text-[13px] outline-none transition-colors focus:border-primary/40 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button" onClick={() => onChange("")} aria-label="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

// Case-insensitive "do all typed words appear somewhere in these fields" match,
// so "work remote" finds "Remote & Hybrid Work". Empty query matches everything.
export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = fields.filter(Boolean).join(" \u0001 ").toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}
