"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FilterShell, FilterSidebar } from "@/components/sections/filter-shell";
import { useGlobalLoading } from "@/components/dashboard/global-loading";
import type { Profile } from "@/lib/types/database";
import { initials } from "@/lib/ui-helpers";

type Member = Pick<Profile, "id" | "name" | "avatar_url">;

interface HeaderProps {
  members: Member[];
  reviewers: Member[];
  countsLabel: React.ReactNode;
}

interface SidebarProps {
  members: Member[];
  reviewers: Member[];
}

// Due-window value → human label. Base UI's <SelectValue> renders the raw
// value otherwise (so picking "This week" showed "upcoming" on the trigger).
const RANGE_LABELS: Record<string, string> = {
  all: "All",
  today: "Today",
  upcoming: "This week",
  "30d": "Next 30 days",
  "60d": "Next 60 days",
  "90d": "Next 90 days",
  overdue: "Overdue",
  custom: "Custom range",
};

function useFilterState() {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Tie filter navigation to the global loading bar — selecting a reviewer
  // or due window triggers a server round-trip with a visible delay.
  const { begin, end } = useGlobalLoading();
  const wasPending = useRef(false);
  useEffect(() => {
    if (isPending && !wasPending.current) { wasPending.current = true; begin(); }
    else if (!isPending && wasPending.current) { wasPending.current = false; end(); }
  }, [isPending, begin, end]);

  const assignee = params.get("assignee") ?? "all";
  const range = params.get("range") ?? "all";
  const start = params.get("start") ?? "";
  const end_ = params.get("end") ?? "";
  // Multi-select reviewedBy — comma-separated in the URL.
  const reviewedBy = (params.get("reviewedBy") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    startTransition(() => router.replace(`?${next.toString()}`, { scroll: false }));
  };

  // Toggle one reviewer id (or "ai") in/out of the reviewedBy list.
  const toggleReviewer = (id: string) => {
    const set = new Set(reviewedBy);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    const next = new URLSearchParams(params.toString());
    if (set.size === 0) next.delete("reviewedBy");
    else next.set("reviewedBy", [...set].join(","));
    startTransition(() => router.replace(`?${next.toString()}`, { scroll: false }));
  };

  const clearAll = () => startTransition(() => router.replace("?", { scroll: false }));

  const activeCount =
    [range, assignee].filter((v) => v && v !== "all").length +
    (reviewedBy.length > 0 ? 1 : 0) +
    (range === "custom" && (start || end_) ? 1 : 0);

  return { assignee, range, start, end: end_, reviewedBy, update, toggleReviewer, clearAll, activeCount };
}

function FilterFields({
  members, reviewers, state,
}: {
  members: Member[];
  reviewers: Member[];
  state: ReturnType<typeof useFilterState>;
}) {
  return (
    <>
      {/* Reviewed by — multi-select toggle chips (human reviewers + AI) */}
      <Field label="Reviewed by">
        <div className="flex flex-wrap gap-1.5">
          {reviewers.map((r) => (
            <ReviewerChip
              key={r.id}
              label={r.name}
              icon={<ShieldCheck className="size-3" />}
              active={state.reviewedBy.includes(r.id)}
              onClick={() => state.toggleReviewer(r.id)}
            />
          ))}
          <ReviewerChip
            label="AI verified"
            icon={<Sparkles className="size-3" />}
            active={state.reviewedBy.includes("ai")}
            onClick={() => state.toggleReviewer("ai")}
          />
          {reviewers.length === 0 && (
            <span className="text-[11px] text-muted-foreground">No reviewers yet.</span>
          )}
        </div>
      </Field>

      <Field label="Assigned to">
        <Select value={state.assignee} onValueChange={(v) => v && state.update("assignee", v)}>
          <SelectTrigger className="w-full h-8">
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
          <SelectTrigger className="w-full h-8">
            {/* Render-function maps the raw value to its human label. */}
            <SelectValue>
              {(value: string | null) => RANGE_LABELS[value ?? "all"] ?? "All"}
            </SelectValue>
          </SelectTrigger>
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

function ReviewerChip({
  label, icon, active, onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-[#5B45E0] text-white border-[#5B45E0]"
          : "bg-muted/30 text-muted-foreground border-border hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
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

export function BlogFiltersHeader({ members, reviewers, countsLabel }: HeaderProps) {
  const state = useFilterState();
  return (
    <FilterShell activeCount={state.activeCount} onClear={state.clearAll} countsLabel={countsLabel}>
      <FilterFields members={members} reviewers={reviewers} state={state} />
    </FilterShell>
  );
}

export function BlogFiltersSidebar({ members, reviewers }: SidebarProps) {
  const state = useFilterState();
  return (
    <FilterSidebar activeCount={state.activeCount} onClear={state.clearAll}>
      <FilterFields members={members} reviewers={reviewers} state={state} />
    </FilterSidebar>
  );
}
