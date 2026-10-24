"use client";

// Team Targets: the all-targets board, grouped by owner (this is the per-person
// view too). Built on ONE css-grid column template shared by the header, the
// person summary rows, and the child target rows, so everything lines up and the
// column gaps are even. Each row has exactly one progress bar. A person's summary
// row carries their totals + one bar + a status chip right next to the name, so
// you see where everyone stands without expanding. Groups are expanded by
// default; clicking a target row opens its drawer.

import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/ui-helpers";
import { isBehindStatus, targetStatus, type TargetStatus } from "@/lib/team-targets/period";
import { FREQUENCY_LABEL } from "@/lib/team-targets/types";
import { fmtNum, fmtPctFloor, firstName, ProgressBar, StatusChip } from "@/components/sections/team-targets/ui";
import { TargetDrawer } from "@/components/sections/team-targets/target-drawer";
import type { DashboardTarget } from "@/lib/team-targets/types";

type Filter = "all" | "behind" | "on_track" | "ahead";
const inFilter = (s: TargetStatus, f: Filter) =>
  f === "all" ? true : f === "behind" ? isBehindStatus(s) : f === "on_track" ? s === "on_track" : s === "ahead" || s === "met";

// The single source of truth for column widths. Header, group and child rows all
// use this exact template, so cells can never drift out of alignment.
const GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(240px,1fr) 80px 80px 88px 80px 168px 112px",
  columnGap: 16,
  alignItems: "center",
};

export function TargetsTable({
  targets, projectId, isAdmin, isOwner, currentUserId, ended,
}: {
  targets: DashboardTarget[];
  projectId: string;
  isAdmin: boolean;
  isOwner: boolean;
  currentUserId: string;
  ended: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});   // default: all collapsed
  const [drawer, setDrawer] = useState<DashboardTarget | null>(null);

  const counts = useMemo(() => ({
    all: targets.length,
    behind: targets.filter((t) => isBehindStatus(t.status)).length,
    on_track: targets.filter((t) => t.status === "on_track").length,
    ahead: targets.filter((t) => t.status === "ahead" || t.status === "met").length,
  }), [targets]);

  // First name only; add a last initial only when two owners share a first name.
  const nameFor = useMemo(() => {
    const firstCounts = new Map<string, number>();
    for (const t of targets) {
      if (!t.ownerName) continue;
      const f = t.ownerName.trim().split(/\s+/)[0].toLowerCase();
      firstCounts.set(f, (firstCounts.get(f) ?? 0) + (firstCounts.has(f) ? 0 : 1));
    }
    // Count distinct owners per first name.
    const seen = new Map<string, Set<string>>();
    for (const t of targets) {
      if (!t.ownerId || !t.ownerName) continue;
      const f = t.ownerName.trim().split(/\s+/)[0].toLowerCase();
      const set = seen.get(f) ?? new Set<string>();
      set.add(t.ownerId);
      seen.set(f, set);
    }
    return (name: string) => firstName(name, (seen.get(name.trim().split(/\s+/)[0].toLowerCase())?.size ?? 1) > 1);
  }, [targets]);

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

  const isOpen = (key: string) => !!openKeys[key];
  const toggle = (key: string) => setOpenKeys((p) => ({ ...p, [key]: !p[key] }));
  const allOpen = groups.length > 0 && groups.every((g) => isOpen(g.key));
  const setAll = (open: boolean) => setOpenKeys(Object.fromEntries(groups.map((g) => [g.key, open])));

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
        <div className="flex flex-wrap items-center gap-2">
          <Legend />
          <button type="button" onClick={() => setAll(!allOpen)} className="rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setFilter(t.key)} aria-pressed={filter === t.key}
            className={cn("cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              filter === t.key ? "border-[#5B45E0]/40 bg-[#5B45E0]/10 text-[#5B45E0] dark:text-[#7B62FF]" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground")}>
            {t.label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No targets match this filter.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <div className="min-w-[940px]">
            {/* Header */}
            <div style={GRID} className="border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <div>Target</div>
              <div className="text-right">Expected</div>
              <div className="text-right">Done</div>
              <div className="text-right">Awaiting</div>
              <div className="text-right">Left</div>
              <div>Progress</div>
              <div>Status</div>
            </div>

            {groups.map((g) => {
              const open = isOpen(g.key);
              const sum = (f: (r: DashboardTarget) => number) => g.rows.reduce((a, r) => a + f(r), 0);
              const expected = sum((r) => r.expectedPeriod);
              const done = sum((r) => r.doneVerified);
              const awaiting = sum((r) => r.awaiting);
              const left = sum((r) => r.remaining);
              const expToDate = sum((r) => r.expectedToDate);
              const ratio = expected > 0 ? done / expected : null;
              const gStatus = targetStatus(done, expected, expToDate, ended);
              return (
                <div key={g.key}>
                  {/* Group summary row (also the expand/collapse toggle) */}
                  <button type="button" onClick={() => toggle(g.key)} aria-expanded={open}
                    style={GRID} className="w-full border-t border-border bg-muted/50 px-4 py-2.5 text-left transition-colors hover:bg-muted/70">
                    <div className="flex min-w-0 items-center gap-2">
                      {open ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
                      <Avatar className="size-6 shrink-0"><AvatarFallback className="text-[9px]">{initials(g.name)}</AvatarFallback></Avatar>
                      <span className="shrink-0 text-sm font-semibold text-foreground">{nameFor(g.name)}</span>
                      <StatusChip status={gStatus} className="shrink-0" />
                      <span className="truncate text-xs text-muted-foreground">{g.rows.length} target{g.rows.length === 1 ? "" : "s"}</span>
                    </div>
                    <Num v={expected} />
                    <Num v={done} strong />
                    <Num v={awaiting} amber={awaiting > 0} />
                    <Num v={left} strong />
                    <ProgressCell ratio={ratio} awaitingFraction={expected > 0 ? awaiting / expected : 0} strong />
                    <div />{/* status lives next to the name */}
                  </button>

                  {/* Child target rows */}
                  {open && g.rows.map((row) => (
                    <TargetRow key={row.id} row={row} onOpen={() => setDrawer(row)} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <TargetDrawer target={drawer} projectId={projectId} isAdmin={isAdmin} isOwner={isOwner} currentUserId={currentUserId} onClose={() => setDrawer(null)} />
    </Card>
  );
}

function Legend() {
  return (
    <div className="hidden items-center gap-3 text-[11px] text-muted-foreground sm:flex">
      <span className="inline-flex items-center gap-1"><span className="inline-block size-2.5 rounded-sm bg-[#5B45E0] dark:bg-[#7B62FF]" /> Verified</span>
      <span className="inline-flex items-center gap-1"><span className="inline-block size-2.5 rounded-sm" style={{ backgroundImage: "repeating-linear-gradient(45deg, rgba(123,98,255,0.5) 0 3px, transparent 3px 6px)" }} /> Awaiting</span>
    </div>
  );
}

function Num({ v, strong, amber }: { v: number; strong?: boolean; amber?: boolean }) {
  return (
    <div className={cn("text-right font-mono text-[13px] tabular-nums",
      amber ? "text-warning-700 dark:text-warning-400" : strong ? "font-medium text-foreground" : "text-muted-foreground")}>
      {fmtNum(v)}
    </div>
  );
}

function ProgressCell({ ratio, awaitingFraction, strong, label }: { ratio: number | null; awaitingFraction: number; strong?: boolean; label?: string }) {
  const complete = ratio != null && ratio >= 1;
  return (
    <div className="flex items-center gap-2">
      <ProgressBar value={ratio} awaitingFraction={awaitingFraction} strong={strong} className="flex-1" ariaLabel={label} />
      <span className="flex w-11 shrink-0 items-center justify-end gap-0.5 font-mono text-xs tabular-nums text-foreground">
        {complete && <Check className="size-3 text-success-600" />}{fmtPctFloor(ratio)}
      </span>
    </div>
  );
}

function TargetRow({ row, onOpen }: { row: DashboardTarget; onOpen: () => void }) {
  const ratio = row.expectedPeriod > 0 ? row.doneVerified / row.expectedPeriod : null;
  const awaitFrac = row.expectedPeriod > 0 ? row.awaiting / row.expectedPeriod : 0;
  const cadence = `${row.target} / ${FREQUENCY_LABEL[row.frequency].replace("per ", "")}`;
  return (
    <div
      role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      style={GRID}
      className="cursor-pointer border-t border-border/60 px-4 py-2.5 transition-colors hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5B45E0]/60"
    >
      <div className="relative min-w-0 pl-[46px]">
        <span className="absolute left-[11px] top-[-10px] bottom-[-10px] w-px bg-border" aria-hidden />
        <div className="truncate text-[13px] font-medium text-foreground" title={row.task}>{row.task}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          <span className="font-mono">{cadence}</span>{row.coOwnerName && <span> · with {row.coOwnerName}</span>}
        </div>
      </div>
      <Num v={row.expectedPeriod} />
      <Num v={row.doneVerified} strong />
      <Num v={row.awaiting} amber={row.awaiting > 0} />
      <Num v={row.remaining} />
      <ProgressCell ratio={ratio} awaitingFraction={awaitFrac} label={`${row.task}: ${row.doneVerified} of ${row.expectedPeriod} verified`} />
      <div><StatusChip status={row.status} /></div>
    </div>
  );
}
