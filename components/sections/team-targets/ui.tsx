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
/** Floor, not round, so 99.6% reads "99%" (not a premature "100%"). */
export function fmtPctFloor(ratio: number | null): string {
  if (ratio == null) return "-";
  return `${Math.floor(ratio * 100)}%`;
}
/** First name only for the table. Pass `disambiguate` to append a last initial
 *  (used only when two people share a first name). */
export function firstName(full: string, disambiguate = false): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return disambiguate ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
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
 * The progress bar used everywhere on this page. Fills from the LEFT with the
 * verified-done share; an awaiting (logged-but-unchecked) share is hatched and
 * sits AFTER the done fill, never solid. At 0% the bar is a plain empty track
 * (no mid-bar pace tick, which used to read as a half-fill). Turns green once
 * done reaches the goal. `value` is done/expected (may exceed 1); null = no goal.
 */
export function ProgressBar({
  value, awaitingFraction = 0, strong = false, className, ariaLabel,
}: {
  value: number | null;
  awaitingFraction?: number;
  strong?: boolean;          // stronger track for group summary rows
  className?: string;
  ariaLabel?: string;
}) {
  const track = strong ? "bg-slate-300 dark:bg-white/15" : "bg-slate-200 dark:bg-white/10";
  if (value == null) {
    return <div className={cn("h-2 rounded-full", track, className)} aria-hidden />;
  }
  const done = Math.min(1, Math.max(0, value));
  const complete = value >= 1;
  const awaiting = complete ? 0 : Math.min(1 - done, Math.max(0, awaitingFraction));
  return (
    <div
      className={cn("relative h-2 overflow-hidden rounded-full ring-1 ring-inset ring-black/5 dark:ring-white/10", track, className)}
      role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(done * 100)} aria-label={ariaLabel}
    >
      {done > 0 && (
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-150",
            complete ? "bg-success-500 dark:bg-success-400" : BRAND_BG)}
          style={{ width: `${done * 100}%` }}
        />
      )}
      {awaiting > 0 && (
        <div className="absolute inset-y-0" title="Awaiting verification"
          style={{ left: `${done * 100}%`, width: `${awaiting * 100}%`, backgroundImage: "repeating-linear-gradient(45deg, rgba(123,98,255,0.5) 0 4px, transparent 4px 8px)" }} />
      )}
    </div>
  );
}
