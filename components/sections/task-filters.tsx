"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { FilterShell, FilterSidebar } from "@/components/sections/filter-shell";
import type { Profile } from "@/lib/types/database";
import { initials } from "@/lib/ui-helpers";

interface HeaderProps {
  members: Pick<Profile, "id" | "name" | "avatar_url">[];
  countsLabel: React.ReactNode;
}

interface SidebarProps {
  members: Pick<Profile, "id" | "name" | "avatar_url">[];
}

// Select.Value only auto-resolves a label when Select.Root gets an `items`
// map - without it, the trigger shows the raw value (e.g. "all" instead of
// "All pillars").
const PILLAR_ITEMS = [
  { value: "all", label: "All pillars" },
  { value: "SEO", label: "SEO" },
  { value: "AEO", label: "AEO" },
  { value: "GEO", label: "GEO" },
  { value: "SXO", label: "SXO" },
  { value: "AIO", label: "AIO" },
];
const PRIORITY_ITEMS = [
  { value: "all", label: "All priorities" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];
const RANGE_ITEMS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming 7d" },
  { value: "overdue", label: "Overdue" },
  { value: "custom", label: "Custom" },
];

function useFilterState() {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const pillar = params.get("pillar") ?? "all";
  const priority = params.get("priority") ?? "all";
  const assignee = params.get("assignee") ?? "all";
  const range = params.get("range") ?? "all";
  const start = params.get("start") ?? "";
  const end = params.get("end") ?? "";

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    startTransition(() => router.replace(`?${next.toString()}`, { scroll: false }));
  };
  const clearAll = () => startTransition(() => router.replace("?", { scroll: false }));

  const activeCount =
    [pillar, priority, range, assignee].filter((v) => v && v !== "all").length +
    (range === "custom" && (start || end) ? 1 : 0);

  return { pillar, priority, assignee, range, start, end, update, clearAll, activeCount };
}

function FilterFields({ members, state }: { members: HeaderProps["members"]; state: ReturnType<typeof useFilterState> }) {
  const assigneeItems = [
    { value: "all", label: "Everyone" },
    { value: "unassigned", label: "Unassigned" },
    ...members.map((m) => ({
      value: m.id,
      label: m.name,
      icon: (
        <span className="size-4 rounded-full bg-muted text-[8px] inline-flex items-center justify-center font-medium">
          {initials(m.name)}
        </span>
      ),
    })),
  ];

  return (
    <>
      <Field label="Pillar">
        <Combobox
          items={PILLAR_ITEMS}
          value={state.pillar}
          onValueChange={(v) => state.update("pillar", v)}
          placeholder="All pillars"
          className="h-8 w-full"
        />
      </Field>

      <Field label="Priority">
        <Combobox
          items={PRIORITY_ITEMS}
          value={state.priority}
          onValueChange={(v) => state.update("priority", v)}
          placeholder="All priorities"
          className="h-8 w-full"
        />
      </Field>

      <Field label="Assigned to">
        <Combobox
          items={assigneeItems}
          value={state.assignee}
          onValueChange={(v) => state.update("assignee", v)}
          placeholder="Everyone"
          className="h-8 w-full"
        />
      </Field>

      <Field label="Date range">
        <Combobox
          items={RANGE_ITEMS}
          value={state.range}
          onValueChange={(v) => state.update("range", v)}
          placeholder="All time"
          className="h-8 w-full"
        />
      </Field>

      {state.range === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Start">
            <Input type="date" value={state.start} onChange={(e) => state.update("start", e.target.value)} className="h-8 text-xs" />
          </Field>
          <Field label="End">
            <Input type="date" value={state.end} onChange={(e) => state.update("end", e.target.value)} className="h-8 text-xs" />
          </Field>
        </div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block">
        {label}
      </Label>
      {children}
    </div>
  );
}

// Mobile/tablet: counts row + filter button opening a bottom sheet. Sits inside the content column.
export function TaskFiltersHeader({ members, countsLabel }: HeaderProps) {
  const state = useFilterState();
  return (
    <FilterShell activeCount={state.activeCount} onClear={state.clearAll} countsLabel={countsLabel}>
      <FilterFields members={members} state={state} />
    </FilterShell>
  );
}

// Desktop: sticky right-side panel. Sits as a sibling of the kanban content column.
export function TaskFiltersSidebar({ members }: SidebarProps) {
  const state = useFilterState();
  return (
    <FilterSidebar activeCount={state.activeCount} onClear={state.clearAll}>
      <FilterFields members={members} state={state} />
    </FilterSidebar>
  );
}
