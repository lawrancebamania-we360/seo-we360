"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  return (
    <>
      <Field label="Pillar">
        <Select value={state.pillar} onValueChange={(v) => v && state.update("pillar", v)}>
          <SelectTrigger className="w-full h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All pillars</SelectItem>
            <SelectItem value="SEO">SEO</SelectItem>
            <SelectItem value="AEO">AEO</SelectItem>
            <SelectItem value="GEO">GEO</SelectItem>
            <SelectItem value="SXO">SXO</SelectItem>
            <SelectItem value="AIO">AIO</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field label="Priority">
        <Select value={state.priority} onValueChange={(v) => v && state.update("priority", v)}>
          <SelectTrigger className="w-full h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field label="Assigned to">
        <Select value={state.assignee} onValueChange={(v) => v && state.update("assignee", v)}>
          <SelectTrigger className="w-full h-8">
            {/* Same Select.Value render-function fix as the Blog Sprint
                filter — without it, Base UI shows the raw UUID in the
                collapsed trigger when the SelectItem children is JSX. */}
            <SelectValue>
              {(value: string | null) => {
                if (!value || value === "all") return "Everyone";
                if (value === "unassigned") return "Unassigned";
                return members.find((m) => m.id === value)?.name ?? value;
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id} label={m.name}>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-4 rounded-full bg-muted text-[8px] inline-flex items-center justify-center font-medium">
                    {initials(m.name)}
                  </span>
                  {m.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Date range">
        <Select value={state.range} onValueChange={(v) => v && state.update("range", v)}>
          <SelectTrigger className="w-full h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="upcoming">Upcoming 7d</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
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
