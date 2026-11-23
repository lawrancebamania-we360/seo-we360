"use client";

// Small confirm modal for the GSC queries panel: a title, a plain-words body,
// and Confirm / Cancel. Stays open (with a spinner) while the action runs.

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function ConfirmDialog({ open, onOpenChange, title, summary, children, confirmLabel, tone = "brand", pending, onConfirm, confirmDisabled }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** One-line plain summary, read out as the dialog's description. */
  summary: ReactNode;
  /** Extra details under the summary. */
  children?: ReactNode;
  confirmLabel: string;
  tone?: "brand" | "danger";
  pending?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!pending) onOpenChange(o); }}>
      <DialogContent className="gap-3 sm:max-w-md">
        <DialogHeader className="pr-6">
          <DialogTitle className="text-[15px] font-semibold leading-snug">{title}</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed text-foreground">{summary}</DialogDescription>
        </DialogHeader>
        {children && <div className="space-y-2 text-[12.5px] leading-relaxed text-muted-foreground">{children}</div>}
        <DialogFooter className="mt-1">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button variant={tone === "danger" ? "destructive" : "brand"} onClick={onConfirm} disabled={pending || confirmDisabled}
            className={cn("gap-1.5", tone === "danger" && "bg-error-600 text-white hover:bg-error-700 dark:bg-error-600 dark:hover:bg-error-700")}>
            {pending && <Loader2 className="size-3.5 animate-spin" />} {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
