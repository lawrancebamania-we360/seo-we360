// Team Targets: previous / next week arrows around the shown range. The week
// lives in the URL (?week=YYYY-MM-DD, a Monday) so a link to a week can be
// shared and the page stays a plain server render. The next arrow stops at the
// current week: a week that hasn't started can't be reported on.

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDays, formatWeekRange } from "@/lib/team-targets/week";

const BASE = "/dashboard/team-targets";
const arrow = "inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors";

export function WeekSwitcher({ weekStart, currentWeek }: { weekStart: string; currentWeek: string }) {
  const isCurrent = weekStart === currentWeek;
  const prev = addDays(weekStart, -7);
  const next = addDays(weekStart, 7);

  return (
    <div className="flex items-center gap-1.5">
      <Link href={`${BASE}?week=${prev}`} aria-label="Previous week" className={cn(arrow, "hover:bg-muted hover:text-foreground")}>
        <ChevronLeft className="size-4" />
      </Link>
      <div className="min-w-[170px] text-center">
        <div className="text-sm font-medium tabular-nums text-foreground">{formatWeekRange(weekStart)}</div>
        <div className="text-[11px] text-muted-foreground">{isCurrent ? "This week" : "Past week"}</div>
      </div>
      {isCurrent ? (
        <span aria-label="Next week (not started yet)" className={cn(arrow, "cursor-not-allowed opacity-40")}>
          <ChevronRight className="size-4" />
        </span>
      ) : (
        <Link href={`${BASE}?week=${next}`} aria-label="Next week" className={cn(arrow, "hover:bg-muted hover:text-foreground")}>
          <ChevronRight className="size-4" />
        </Link>
      )}
      {!isCurrent && (
        <Link href={BASE} className="ml-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          This week
        </Link>
      )}
    </div>
  );
}
