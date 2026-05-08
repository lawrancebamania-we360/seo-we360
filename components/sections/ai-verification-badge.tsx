"use client";

import { ShieldCheck, ShieldAlert, Loader2, FileWarning, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Renders the small AI verification chip on a kanban card. Three goals:
//   1. State is glanceable (color + icon)
//   2. Score and delta visible at first glance for verified/failed
//   3. Tooltips reveal the summary so the writer knows why before clicking
//      into the detail dialog.

interface Props {
  status:
    | "queued"
    | "running"
    | "verified"
    | "failed"
    | "doc_missing"
    | null;
  score: number | null;
  delta: number | null;
  summary: string | null;
  verifiedAt: string | null;
  size?: "sm" | "md";
  className?: string;
}

export function AiVerificationBadge({
  status, score, delta, summary, verifiedAt, size = "sm", className,
}: Props) {
  if (!status) return null;

  const compact = size === "sm";
  const cfg = STATE_CONFIG[status];

  const tooltipBody = summary ?? cfg.defaultSummary;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className={cn(
              "inline-flex items-center gap-1 rounded-md border font-medium",
              compact ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1",
              cfg.classes,
              className,
            )}
          >
            <cfg.Icon className={cn(compact ? "size-3" : "size-3.5", cfg.iconClass, status === "running" && "animate-spin")} />
            <span>{cfg.label}</span>
            {(status === "verified" || status === "failed") && score !== null && (
              <span className="font-semibold tabular-nums">· {score}</span>
            )}
            {(status === "verified" || status === "failed") && delta !== null && delta !== 0 && (
              <span
                className={cn(
                  "tabular-nums",
                  delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                )}
              >
                {delta > 0 ? "↑" : "↓"}{Math.abs(delta)}
              </span>
            )}
          </div>
        }
      />
      <TooltipContent side="top" className="max-w-xs">
        <div className="space-y-1">
          <div className="font-medium">{cfg.tooltipTitle}</div>
          <div className="text-[11px] opacity-90">{tooltipBody}</div>
          {verifiedAt && (
            <div className="text-[10px] opacity-60">
              Last checked {new Date(verifiedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

const STATE_CONFIG: Record<NonNullable<Props["status"]>, {
  Icon: typeof ShieldCheck;
  iconClass: string;
  label: string;
  classes: string;
  defaultSummary: string;
  tooltipTitle: string;
}> = {
  queued: {
    Icon: Hourglass,
    iconClass: "text-[#5B45E0] dark:text-[#7B62FF]",
    label: "AI review queued",
    classes: "bg-[#5B45E0]/8 text-[#5B45E0] dark:text-[#7B62FF] border-[#5B45E0]/20",
    defaultSummary: "Verification will run at the next 10am IST window.",
    tooltipTitle: "Queued for AI verification",
  },
  running: {
    Icon: Loader2,
    iconClass: "text-[#5B45E0] dark:text-[#7B62FF]",
    label: "Verifying…",
    classes: "bg-[#5B45E0]/10 text-[#5B45E0] dark:text-[#7B62FF] border-[#5B45E0]/30",
    defaultSummary: "AI is reading the doc and running checks now.",
    tooltipTitle: "Verification in progress",
  },
  verified: {
    Icon: ShieldCheck,
    iconClass: "text-emerald-600 dark:text-emerald-400",
    label: "AI verified",
    classes: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900",
    defaultSummary: "All hard checks passed. Ready for publish.",
    tooltipTitle: "AI verified · ready for publish",
  },
  failed: {
    Icon: ShieldAlert,
    iconClass: "text-rose-600 dark:text-rose-400",
    label: "AI verification failed",
    classes: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900",
    defaultSummary: "One or more hard checks failed. Open the card for details.",
    tooltipTitle: "AI verification failed",
  },
  doc_missing: {
    Icon: FileWarning,
    iconClass: "text-rose-600 dark:text-rose-400",
    label: "Doc link missing",
    classes: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900",
    defaultSummary: "Paste a Google Doc URL into the Supporting links section, then re-trigger.",
    tooltipTitle: "Doc link missing",
  },
};

// Helper used by the kanban card to decide whether to draw a red ring
// around the whole card (failed verification or missing doc).
export function shouldFlagCardRed(status: Props["status"]): boolean {
  return status === "failed" || status === "doc_missing";
}
