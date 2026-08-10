import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Reusable in-project empty state. Every empty surface should answer three
// things at a glance:
//   • WHY this matters (`why`)
//   • the ONE next thing to do (`action` - a caller-supplied button/link)
//   • when it fills itself, if it ever does (`hint`)
//
// Presentational Server Component (no "use client", no hooks): the `action` is
// passed in as a node so it works from both server pages and client components
// without crossing the server→client function boundary. Distinct from
// `empty-project.tsx`, which is the whole-page "you have no active project" state.
export function EmptyState({
  icon: Icon,
  title,
  why,
  hint,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  /** One line on why this surface matters — the payoff of filling it. */
  why?: string;
  /** When/how it populates on its own (e.g. "auto-discovered weekly"). */
  hint?: string;
  /** The single primary action — a Button/Link supplied by the caller. */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-dashed p-10 text-center", className)}>
      <div className="mx-auto max-w-sm space-y-3">
        {Icon && (
          <div className="mx-auto flex size-11 items-center justify-center rounded-xl bg-muted">
            <Icon className="size-5 text-muted-foreground" />
          </div>
        )}
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">{title}</h3>
          {why && <p className="text-sm text-muted-foreground leading-relaxed">{why}</p>}
        </div>
        {action && <div className="flex items-center justify-center gap-2 pt-1">{action}</div>}
        {hint && <p className="text-xs text-muted-foreground/80 leading-relaxed">{hint}</p>}
      </div>
    </div>
  );
}
