"use client";

// Team Targets: the all-targets table, grouped by owner (this doubles as the
// per-person view). Status tabs narrow it; clicking a row opens that target's
// drawer. Verified "done" only; awaiting and failed sit beside it, never inside
// the progress bar.

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/ui-helpers";
import { isBehindStatus, type TargetStatus } from "@/lib/team-targets/period";
import { FREQUENCY_LABEL } from "@/lib/team-targets/types";
import { fmtNum, fmtPct, ProgressBar, StatusChip } from "@/components/sections/team-targets/ui";
import { TargetDrawer } from "@/components/sections/team-targets/target-drawer";
import type { DashboardTarget } from "@/lib/team-targets/types";

type Filter = "all" | "behind" | "on_track" | "ahead";
const STATUS_SEVERITY: Record<TargetStatus, number> = { missed: 0, far_behind: 1, behind: 2, short: 3, not_due: 4, na: 5, on_track: 6, met: 7, ahead: 8 };
const inFilter = (s: TargetStatus, f: Filter) =>
  f === "all" ? true : f === "behind" ? isBehindStatus(s) : f === "on_track" ? s === "on_track" : s === "ahead" || s === "met";

export function TargetsTable({
  targets, projectId, isAdmin, isOwner, currentUserId,
}: {
  targets: DashboardTarget[];
  projectId: string;
  isAdmin: boolean;
  isOwner: boolean;
  currentUserId: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [drawer, setDrawer] = useState<DashboardTarget | null>(null);

  const counts = useMemo(() => ({
    all: targets.length,
    behind: targets.filter((t) => isBehindStatus(t.status)).length,
    on_track: targets.filter((t) => t.status === "on_track").length,
    ahead: targets.filter((t) => t.status === "ahead" || t.status === "met").length,
  }), [targets]);

  const groups = useMemo(() => {
    const visible = targets.filter((t) => inFilter(t.status, filter));
    const map = new Map<string, { key: string; name: string; rows: DashboardTarget[] }>();
    for (const t of visible) {
      const key = t.ownerId ?? "none";
      const g = map.get(key) ?? { key, name: t.ownerName ?? "No owner", rows: [] };
      g.rows.push(t);
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [targets, filter]);

  const isOpen = (key: string) => openGroups[key] ?? true;
  const toggle = (key: string) => setOpenGroups((p) => ({ ...p, [key]: !isOpen(key) }));

  if (!targets.length) {
    return <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">No targets in this view.</Card>;
  }

  const TABS: { key: Filter; label: string }[] = [
    { key: "all", label: `All ${counts.all}` },
    { key: "behind", label: `Behind ${counts.behind}` },
    { key: "on_track", label: `On track ${counts.on_track}` },
    { key: "ahead", label: `Ahead ${counts.ahead}` },
  ];

  return (
    <Card className="gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Targets <span className="font-normal text-muted-foreground">· {targets.length}</span></h3>
        <div className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setFilter(t.key)} aria-pressed={filter === t.key}
              className={cn("cursor-pointer rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                filter === t.key ? "border-[#5B45E0]/40 bg-[#5B45E0]/10 text-[#5B45E0] dark:text-[#7B62FF]" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground")}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No targets match this filter.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Target</th>
                <th className="px-3 py-2 text-right font-semibold">Expected</th>
                <th className="px-3 py-2 text-right font-semibold">Done</th>
                <th className="px-3 py-2 text-right font-semibold">Awaiting</th>
                <th className="px-3 py-2 text-right font-semibold">Left</th>
                <th className="px-3 py-2 font-semibold">Progress</th>
                <th className="px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const open = isOpen(g.key);
                const comp = mean(g.rows.map((r) => r.completion));
                const pace = mean(g.rows.map((r) => r.paceCompletion));
                const worst = g.rows.map((r) => r.status).sort((a, b) => STATUS_SEVERITY[a] - STATUS_SEVERITY[b])[0] ?? "na";
                const awaiting = g.rows.reduce((a, r) => a + r.awaiting, 0);
                const failed = g.rows.reduce((a, r) => a + r.failed, 0);
                return (
                  <GroupBlock key={g.key} name={g.name} open={open} onToggle={() => toggle(g.key)}
                    comp={comp} pace={pace} worst={worst} awaiting={awaiting} failed={failed} count={g.rows.length}>
                    {open && g.rows.map((row) => (
                      <TargetRow key={row.id} row={row} onOpen={() => setDrawer(row)} />
                    ))}
                  </GroupBlock>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <TargetDrawer target={drawer} projectId={projectId} isAdmin={isAdmin} isOwner={isOwner} currentUserId={currentUserId} onClose={() => setDrawer(null)} />
    </Card>
  );
}

function mean(xs: (number | null)[]): number {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

function GroupBlock({
  name, open, onToggle, comp, pace, worst, awaiting, failed, count, children,
}: {
  name: string; open: boolean; onToggle: () => void; comp: number; pace: number;
  worst: TargetStatus; awaiting: number; failed: number; count: number; children: React.ReactNode;
}) {
  return (
    <>
      <tr className="border-b border-border/60 bg-muted/20">
        <td colSpan={7} className="px-3 py-2">
          <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 text-left">
            {open ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
            <Avatar className="size-5"><AvatarFallback className="text-[9px]">{initials(name)}</AvatarFallback></Avatar>
            <span className="text-sm font-semibold text-foreground">{name}</span>
            <span className="text-xs text-muted-foreground">{count} target{count === 1 ? "" : "s"}</span>
            <ProgressBar completion={comp} pace={pace} className="ml-2 hidden w-24 sm:block" />
            <span className="hidden font-mono text-xs tabular-nums text-foreground sm:inline">{fmtPct(comp)}</span>
            <span className="ml-auto flex items-center gap-2 text-[11px]">
              {awaiting > 0 && <span className="inline-flex items-center gap-1 text-warning-700 dark:text-warning-400"><Clock className="size-3" />{fmtNum(awaiting)}</span>}
              {failed > 0 && <span className="inline-flex items-center gap-1 text-error-700 dark:text-error-400"><AlertTriangle className="size-3" />{fmtNum(failed)}</span>}
              <StatusChip status={worst} />
            </span>
          </button>
        </td>
      </tr>
      {children}
    </>
  );
}

function TargetRow({ row, onOpen }: { row: DashboardTarget; onOpen: () => void }) {
  const awaitFrac = row.expectedPeriod > 0 ? row.awaiting / row.expectedPeriod : 0;
  return (
    <tr className="cursor-pointer border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30" onClick={onOpen}>
      <td className="px-3 py-2.5">
        <div className="font-medium text-foreground">{row.task}</div>
        <div className="text-[11px] text-muted-foreground">
          <span className="font-mono">{row.target} / {FREQUENCY_LABEL[row.frequency].replace("per ", "")}</span>
          {row.coOwnerName && <span> · with {row.coOwnerName}</span>}
        </div>
      </td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{row.expectedPeriod ? fmtNum(row.expectedPeriod) : "-"}</td>
      <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums text-foreground">{fmtNum(row.doneVerified)}</td>
      <td className="px-3 py-2.5 text-right">
        {row.awaiting > 0 ? <span className="font-mono tabular-nums text-warning-700 dark:text-warning-400">{fmtNum(row.awaiting)}</span> : <span className="text-muted-foreground">-</span>}
        {row.failed > 0 && <div className="font-mono text-[11px] tabular-nums text-error-700 dark:text-error-400">{fmtNum(row.failed)} failed</div>}
      </td>
      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{row.remaining ? fmtNum(row.remaining) : "-"}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <ProgressBar completion={row.completion} awaitingFraction={awaitFrac} pace={row.paceCompletion} className="w-24" />
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{fmtPct(row.completion)}</span>
        </div>
      </td>
      <td className="px-3 py-2.5"><StatusChip status={row.status} /></td>
    </tr>
  );
}
