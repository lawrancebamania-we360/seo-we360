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

  const priority = params.get("priority") ?? "all";
  const competition = params.get("competition") ?? "all";
  const intent = params.get("intent") ?? "all";
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
    [priority, competition, intent, range, assignee].filter((v) => v && v !== "all").length +
    (range === "custom" && (start || end) ? 1 : 0);

  return { priority, competition, intent, assignee, range, start, end, update, clearAll, activeCount };
}

function FilterFields({ members, state }: { members: HeaderProps["members"]; state: ReturnType<typeof useFilterState> }) {
  return (
    <>
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

      <Field label="Competition">
        <Select value={state.competition} onValueChange={(v) => v && state.update("competition", v)}>
          <SelectTrigger className="w-full h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any competition</SelectItem>
            <SelectItem value="Low Competition">Low — quick wins</SelectItem>
            <SelectItem value="Medium Competition">Medium</SelectItem>
            <SelectItem value="High Competition">High — longer content</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field label="Intent">
        <Select value={state.intent} onValueChange={(v) => v && state.update("intent", v)}>
          <SelectTrigger className="w-full h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any intent</SelectItem>
            <SelectItem value="informational">Informational</SelectItem>
            <SelectItem value="commercial">Commercial</SelectItem>
            <SelectItem value="transactional">Transactional</SelectItem>
            <SelectItem value="navigational">Navigational</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field label="Assigned to">
        <Select value={state.assignee} onValueChange={(v) => v && state.update("assignee", v)}>
          <SelectTrigger className="w-full h-8">
            {/*
              Base UI's Select.Value renders the selected value verbatim by
              default — so member assignees show as raw UUIDs. Passing a
              render-function child resolves the value to a human label.
              `label` on each SelectItem (below) is for keyboard typeahead,
              not for trigger display — that's a separate concern.
             */}
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

      <Field label="Due window">
        <Select value={state.range} onValueChange={(v) => v && state.update("range", v)}>
          <SelectTrigger className="w-full h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="upcoming">This week</SelectItem>
            <SelectItem value="30d">Next 30 days</SelectItem>
            <SelectItem value="60d">Next 60 days</SelectItem>
            <SelectItem value="90d">Next 90 days</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="custom">Custom range</SelectItem>
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

export function BlogFiltersHeader({ members, countsLabel }: HeaderProps) {
  const state = useFilterState();
  return (
    <FilterShell activeCount={state.activeCount} onClear={state.clearAll} countsLabel={countsLabel}>
      <FilterFields members={members} state={state} />
    </FilterShell>
  );
}

export function BlogFiltersSidebar({ members }: SidebarProps) {
  const state = useFilterState();
  return (
    <FilterSidebar activeCount={state.activeCount} onClear={state.clearAll}>
      <FilterFields members={members} state={state} />
    </FilterSidebar>
  );
}
