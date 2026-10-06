"use client";

// MultiCombobox - the multi-select sibling of Combobox: a type-to-filter dropdown
// (Popover + cmdk Command) where each pick toggles and the popover stays open,
// with the picks shown as removable chips under the trigger. Optional `min` (the
// last pick can't be removed) and `max` (once reached, the rest are disabled).
// Selection order is kept, so value[0] is the "primary" pick.

import { useRef, useState, type ReactNode } from "react";
import { ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export interface MultiComboboxItem {
  value: string;
  label: string;
  /** Extra text the search also matches (e.g. an ISO code). */
  keywords?: string[];
  /** Optional leading element, shown in the list only. */
  icon?: ReactNode;
}

// cmdk's default fuzzy match is noisy for names ("ia" matches half the alphabet).
// Rank instead: label starts with the query > a keyword (code) starts with it >
// a word in the label starts with it > the label contains it. Else hidden.
function rank(label: string, search: string, keywords?: string[]): number {
  const s = search.trim().toLowerCase();
  if (!s) return 1;
  const l = label.toLowerCase();
  if (l.startsWith(s)) return 1;
  if (keywords?.some((k) => k.toLowerCase().startsWith(s))) return 0.9;
  if (l.split(/[\s\-(),]+/).some((w) => w.startsWith(s))) return 0.7;
  if (l.includes(s)) return 0.4;
  return 0;
}

export function MultiCombobox({
  items, value, onValueChange, placeholder = "Select...", searchPlaceholder, emptyText = "No results.",
  min = 0, max, disabled, id, className, ariaLabel,
}: {
  items: MultiComboboxItem[];
  value: string[];
  onValueChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** The last `min` picks can't be removed. */
  min?: number;
  /** Once this many are picked, the remaining items are disabled. */
  max?: number;
  disabled?: boolean;
  id?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const labelOf = (v: string) => items.find((i) => i.value === v)?.label ?? v;
  const atMax = max != null && value.length >= max;
  const atMin = value.length <= min;

  const toggle = (v: string) => {
    if (value.includes(v)) {
      if (atMin) return;
      onValueChange(value.filter((x) => x !== v));
    } else {
      if (atMax) return;
      onValueChange([...value, v]);
    }
    // Clicking an item pulls focus out of the search box. Keep it there, so the
    // next Escape closes just this dropdown instead of falling through to an
    // enclosing dialog (which would close it and throw away the picks).
    searchRef.current?.focus();
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              id={id}
              disabled={disabled}
              aria-label={ariaLabel}
              className={cn(
                "flex h-9 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm whitespace-nowrap transition-colors outline-none select-none hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50",
                className,
              )}
            >
              <span className={cn("min-w-0 truncate text-left", value.length === 0 && "text-muted-foreground")}>
                {value.length === 0 ? placeholder : `${value.length} selected${max != null ? ` of ${max} max` : ""}`}
              </span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
            </button>
          }
        />
        <PopoverContent align="start" className="w-(--anchor-width) min-w-64 p-0">
          <Command
            filter={rank}
            onKeyDown={(e) => {
              // Escape closes this dropdown only; never let it reach a parent dialog.
              if (e.key === "Escape") { e.stopPropagation(); setOpen(false); }
            }}
          >
            <CommandInput ref={searchRef} placeholder={searchPlaceholder ?? `Search ${placeholder.toLowerCase()}...`} />
            <CommandList aria-multiselectable="true">
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {items.map((item) => {
                  const checked = value.includes(item.value);
                  return (
                    <CommandItem
                      key={item.value}
                      value={item.label}
                      keywords={[item.value, ...(item.keywords ?? [])]}
                      data-checked={checked}
                      aria-checked={checked}
                      disabled={!checked && atMax}
                      onSelect={() => toggle(item.value)}
                    >
                      {item.icon ? (
                        <span className="inline-flex items-center gap-1.5">{item.icon}{item.label}</span>
                      ) : (
                        item.label
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
            {atMax && (
              <div className="border-t border-border px-3 py-1.5 text-[11.5px] text-muted-foreground">
                Up to {max} selected. Remove one to pick another.
              </div>
            )}
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected">
          {value.map((v, i) => (
            <li
              key={v}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pl-2.5 pr-1 text-[12px] font-medium text-foreground"
            >
              {labelOf(v)}
              {i === 0 && value.length > 1 && <span className="text-[10px] font-normal text-muted-foreground">first</span>}
              <button
                type="button"
                disabled={disabled || atMin}
                aria-label={`Remove ${labelOf(v)}`}
                title={atMin ? "At least one is required" : `Remove ${labelOf(v)}`}
                onClick={() => toggle(v)}
                className="grid size-4 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div role="status" aria-live="polite" className="sr-only">
        {atMax ? `Up to ${max} selected.` : ""}
      </div>
    </div>
  );
}
