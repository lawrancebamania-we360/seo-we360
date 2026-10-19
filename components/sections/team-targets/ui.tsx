// Team Targets: small presentational pieces shared across the dashboard - the
// status chip, the per-link verification badge, and number/percent formatters.
// No hooks, so these render on the server or the client.

import { Check, CircleDashed, Clock, Minus, ShieldCheck, TrendingDown, TrendingUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TargetStatus } from "@/lib/team-targets/period";
import type { LogVerification } from "@/lib/team-targets/types";

export const BRAND = "text-[#5B45E0] dark:text-[#7B62FF]";
export const BRAND_BG = "bg-[#5B45E0] dark:bg-[#7B62FF]";

export function fmtNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
export function fmtPct(fraction: number | null): string {
  if (fraction == null) return "-";
  return `${Math.round(fraction * 100)}%`;
}

const STATUS_META: Record<TargetStatus, { label: string; icon: typeof Check; cls: string }> = {
  ahead:      { label: "Ahead",       icon: TrendingUp,   cls: "border-success-300/60 bg-success-500/10 text-success-700 dark:text-success-400" },
  on_track:   { label: "On track",    icon: Minus,        cls: "border-border bg-muted/60 text-foreground" },
  behind:     { label: "Behind",      icon: TrendingDown, cls: "border-warning-300/60 bg-warning-500/10 text-warning-700 dark:text-warning-400" },
  far_behind: { label: "Behind",      icon: TrendingDown, cls: "border-error-300/60 bg-error-500/10 text-error-700 dark:text-error-400" },
  not_due:    { label: "Not due yet", icon: CircleDashed, cls: "border-dashed border-border text-muted-foreground" },
  na:         { label: "N/A",         icon: Minus,        cls: "border-border text-muted-foreground" },
  met:        { label: "Met",         icon: Check,        cls: "border-success-300/60 bg-success-500/10 text-success-700 dark:text-success-400" },
  short:      { label: "Short",       icon: TrendingDown, cls: "border-warning-300/60 bg-warning-500/10 text-warning-700 dark:text-warning-400" },
  missed:     { label: "Missed",      icon: X,            cls: "border-error-300/60 bg-error-500/10 text-error-700 dark:text-error-400" },
};

export function StatusChip({ status, className }: { status: TargetStatus; className?: string }) {
  const m = STATUS_META[status];
  const Icon = m.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium", m.cls, className)}>
      <Icon className="size-3" /> {m.label}
    </span>
  );
}

const VERIFY_META: Record<LogVerification, { label: string; icon: typeof Check; cls: string }> = {
  pending:        { label: "Awaiting",       icon: Clock,       cls: "border-warning-300/60 bg-warning-500/10 text-warning-700 dark:text-warning-400" },
  ai_verified:    { label: "AI verified",    icon: ShieldCheck, cls: "border-success-300/60 bg-success-500/10 text-success-700 dark:text-success-400" },
  owner_verified: { label: "Owner verified", icon: Check,       cls: "border-success-300/60 bg-success-500/10 text-success-700 dark:text-success-400" },
  not_found:      { label: "Not found",      icon: X,           cls: "border-error-300/60 bg-error-500/10 text-error-700 dark:text-error-400" },
  mismatch:       { label: "Doesn't match",  icon: X,           cls: "border-error-300/60 bg-error-500/10 text-error-700 dark:text-error-400" },
  unreachable:    { label: "Couldn't check", icon: CircleDashed,cls: "border-border bg-muted/60 text-muted-foreground" },
  failed:         { label: "Couldn't check", icon: CircleDashed,cls: "border-border bg-muted/60 text-muted-foreground" },
};

export function VerificationBadge({ status, className }: { status: LogVerification; className?: string }) {
  const m = VERIFY_META[status];
  const Icon = m.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium", m.cls, className)}>
      <Icon className="size-3" /> {m.label}
    </span>
  );
}

/**
 * The layered progress bar used in the table and the person chart: neutral track
 * (= full-period goal), purple verified fill, a hatched amber awaiting segment
 * stacked after it, and a dark vertical pace tick at expected-to-date.
 */
export function ProgressBar({
  completion, awaitingFraction = 0, pace, className,
}: {
  completion: number | null;   // verified done / expected (0..1, may exceed 1)
  awaitingFraction?: number;    // awaiting / expected (0..1)
  pace: number | null;          // expected-to-date / expected (0..1)
  className?: string;
}) {
  if (completion == null) {
    return <div className={cn("h-2 rounded-full bg-muted", className)} aria-hidden />;
  }
  const done = Math.min(1, Math.max(0, completion));
  const awaiting = Math.min(1 - done, Math.max(0, awaitingFraction));
  return (
    <div className={cn("relative h-2 overflow-hidden rounded-full bg-muted", className)} role="img"
      aria-label={`${Math.round(completion * 100)}% done${pace != null ? `, pace ${Math.round(pace * 100)}%` : ""}`}>
      <div className={cn("absolute inset-y-0 left-0 rounded-full", BRAND_BG)} style={{ width: `${done * 100}%` }} />
      {awaiting > 0 && (
        <div className="absolute inset-y-0" title="Awaiting verification"
          style={{ left: `${done * 100}%`, width: `${awaiting * 100}%`, backgroundImage: "repeating-linear-gradient(45deg, rgba(245,158,11,0.5) 0 3px, transparent 3px 6px)" }} />
      )}
      {pace != null && pace > 0 && pace <= 1 && (
        <div className="absolute inset-y-0 w-0.5 bg-foreground/80" style={{ left: `calc(${Math.min(1, pace) * 100}% - 1px)` }} title={`Pace: should be at ${Math.round(pace * 100)}%`} />
      )}
    </div>
  );
}
