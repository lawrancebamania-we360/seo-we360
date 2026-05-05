"use client";

import { useState, type ReactNode } from "react";
import { Filter, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface Props {
  children: ReactNode;
  activeCount: number;
  onClear: () => void;
  countsLabel: ReactNode;
}

/**
 * Responsive filter container:
 * - Desktop (lg+): sticky right-side panel, top offset matches content padding
 * - Mobile / tablet (<lg): "Filters (N)" button that opens a bottom sheet with the same form
 */
export function FilterShell({ children, activeCount, onClear, countsLabel }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Counts + mobile filter trigger row */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">{countsLabel}</div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button variant="outline" size="sm" className="lg:hidden gap-2">
                <Filter className="size-3.5" />
                Filters
                {activeCount > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 h-4">
                    {activeCount}
                  </Badge>
                )}
              </Button>
            }
          />
          <SheetContent side="bottom" className="max-h-[88svh] overflow-y-auto">
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
                  <Filter className="size-3.5" />
                  Filters
                </div>
                {activeCount > 0 && (
                  <Button variant="ghost" size="xs" onClick={() => { onClear(); setOpen(false); }}>
                    <X className="size-3" />
                    Clear all
                  </Button>
                )}
              </div>
              {children}
              <div className="pt-2 border-t">
                <Button size="sm" className="w-full" onClick={() => setOpen(false)}>
                  Apply & close
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

/**
 * Desktop-only sticky panel. Use alongside FilterShell.
 */
export function FilterSidebar({ children, activeCount, onClear }: { children: ReactNode; activeCount: number; onClear: () => void }) {
  return (
    <Card className="hidden lg:flex lg:flex-col lg:w-[240px] shrink-0 lg:sticky lg:top-0 lg:self-start lg:max-h-[calc(100svh-4rem)] lg:overflow-y-auto p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
          <Filter className="size-3.5" />
          Filters
        </div>
        {activeCount > 0 && (
          <Button variant="ghost" size="xs" onClick={onClear}>
            <X className="size-3" />
            Clear <Badge variant="secondary" className="ml-1 text-[10px]">{activeCount}</Badge>
          </Button>
        )}
      </div>
      {children}
    </Card>
  );
}
