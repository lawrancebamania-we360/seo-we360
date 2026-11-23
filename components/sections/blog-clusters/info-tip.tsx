"use client";

// Small (i) help icon. Opens on hover and on click/tap (a popover, not a
// tooltip, so it also works on touch screens and with the keyboard).

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function InfoTip({ children, label = "More info", side = "top", className }: {
  children: ReactNode;
  /** Accessible name of the icon button, e.g. "About the Action column". */
  label?: string;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={120}
        closeDelay={80}
        render={
          <button
            type="button"
            aria-label={label}
            className={cn(
              "inline-flex size-4 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground/70 transition-colors",
              "hover:text-[#5B45E0] focus-visible:text-[#5B45E0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5B45E0]/40 dark:hover:text-[#7B62FF]",
              className,
            )}
          />
        }
      >
        <Info className="size-3.5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent side={side} className="w-auto max-w-72 gap-1.5 p-3 text-[12px] font-normal normal-case leading-relaxed tracking-normal text-popover-foreground">
        {children}
      </PopoverContent>
    </Popover>
  );
}
