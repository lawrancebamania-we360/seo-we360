// Team Targets: completion by person - one bullet bar each, verified done vs the
// pace tick, so unlike units stay comparable. The single purple fill keeps it
// quiet; status colour lives on the table's chips, not here.

import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/ui-helpers";
import { fmtPct, firstName, ProgressBar } from "@/components/sections/team-targets/ui";
import type { PersonRollup } from "@/lib/team-targets/types";

export function CompletionByPersonChart({ people }: { people: PersonRollup[] }) {
  if (!people.length) {
    return (
      <Card className="gap-2 p-4">
        <h3 className="text-sm font-semibold text-foreground">Completion by person</h3>
        <div className="flex h-[160px] items-center justify-center text-sm text-muted-foreground">No one has targets in this view.</div>
      </Card>
    );
  }
  return (
    <Card className="gap-3 p-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Completion by person</h3>
        <p className="text-[11.5px] text-muted-foreground">Each person&apos;s mean target completion · verified only</p>
      </div>
      <div className="space-y-2.5">
        {people.map((p) => (
          <div key={p.personId} className="flex items-center gap-2.5">
            <div className="flex w-28 min-w-0 shrink-0 items-center gap-1.5">
              <Avatar className="size-5 shrink-0"><AvatarFallback className="text-[9px]">{initials(p.name)}</AvatarFallback></Avatar>
              <span className="truncate text-xs text-foreground" title={p.name}>{firstName(p.name)}</span>
            </div>
            <ProgressBar value={p.completion} className="flex-1" />
            <div className="flex w-16 shrink-0 items-center justify-end gap-1">
              <span className="font-mono text-xs tabular-nums text-foreground">{fmtPct(p.completion)}</span>
              {p.failed > 0 && <AlertTriangle className="size-3 text-error-600" aria-label={`${p.failed} failed`} />}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
