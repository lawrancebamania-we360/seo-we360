"use client";

// Combobox - a type-to-filter dropdown, built on this kit's existing Popover
// + Command (cmdk) primitives. Drop-in replacement for the common
// `<Select items={...} value onValueChange>` shape used across this app:
// same props, one component instead of Select/SelectTrigger/SelectContent/
// SelectItem, so scrolling a long list to find an option becomes typing to
// filter it instead.

import { useState, type ReactNode } from "react";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export interface ComboboxItem {
  value: string;
  label: string;
  // Optional leading element (e.g. an avatar-initials badge) shown only in
  // the dropdown list, not in the collapsed trigger - matches how the old
  // Select-based assignee pickers rendered avatars in SelectItem but plain
  // text in the trigger.
  icon?: ReactNode;
}

export function Combobox({
  items, value, onValueChange, placeholder = "Select...", searchPlaceholder, emptyText = "No results.",
  className, disabled, id,
}: {
  items: ComboboxItem[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = items.find((i) => i.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            id={id}
            disabled={disabled}
            className={cn(
              "flex h-9 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm whitespace-nowrap transition-colors outline-none select-none hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 dark:hover:bg-input/50",
              className,
            )}
          >
            <span className={cn("min-w-0 truncate text-left", !selected && "text-muted-foreground")}>
              {selected ? selected.label : placeholder}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        }
      />
      <PopoverContent align="start" className="w-(--anchor-width) min-w-56 p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder ?? `Search ${placeholder.toLowerCase()}...`} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.value}
                  value={item.label}
                  data-checked={item.value === value}
                  onSelect={() => { onValueChange(item.value); setOpen(false); }}
                >
                  {item.icon ? (
                    <span className="inline-flex items-center gap-1.5">
                      {item.icon}
                      {item.label}
                    </span>
                  ) : (
                    item.label
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
