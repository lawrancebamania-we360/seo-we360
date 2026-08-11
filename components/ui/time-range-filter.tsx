"use client";

// Canonical dashboard time-range control. ONE component, used everywhere a
// screen exposes a timeline / date-range filter (Overview, Wins, Competitors,
// and — via <RangeCalendarBody> — the Web Tasks Filter dropdown's custom range).
//
// Shape + interaction are a 1:1 port of the approved Wins time-filter (the
// reference): a pill button (icon · label · chevron) that opens a preset list
// with an active checkmark, plus a "Custom range…" entry that swaps to a
// two-month range calendar with Cancel / Apply.
//
// URL-DRIVEN: picking a preset navigates to `?<param>=<value>` (clearing the
// custom from/to); applying a custom range navigates to `?<fromParam>=…&<toParam>=…`
// (clearing the preset). All other query params are preserved, so the server
// page re-fetches at the chosen window — the filter is functional, not cosmetic,
// on any screen whose data reads honor the param.
//
// The PRESET LIST is a prop: a weekly score timeline (Wins) and a rolling
// lookback window (Overview/Competitors) have genuinely different natural
// presets, but the control, the custom-date calendar, the styling and the
// behavior are identical everywhere.

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Calendar as CalendarIcon,
  ChevronDown as ChevronDownIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Check as CheckIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type RangePreset = { value: string; label: string };

/** "Mon D" label for an ISO (yyyy-mm-dd) day, rendered in UTC to stay SSR-safe. */
export const rangeDayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function TimeRangeFilter({
  presets,
  value,
  from = null,
  to = null,
  label,
  param = "range",
  fromParam = "from",
  toParam = "to",
  align = "start",
  icon: Icon = CalendarIcon,
}: {
  presets: RangePreset[];
  /** Currently-active preset value (compared as a string). Ignored while a custom range is set. */
  value: string;
  from?: string | null;
  to?: string | null;
  /** Button label (screen decides how to phrase the active window). */
  label: string;
  /** Query param the preset value writes to. */
  param?: string;
  fromParam?: string;
  toParam?: string;
  /** Which edge the dropdown/calendar anchors to. Use "end" for a top-right header control. */
  align?: "start" | "end";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const [calMode, setCalMode] = React.useState(false);
  const isCustom = from != null && to != null;

  const close = () => {
    setOpen(false);
    setCalMode(false);
  };
  const goPreset = (v: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set(param, v);
    sp.delete(fromParam);
    sp.delete(toParam);
    router.push(`${pathname}?${sp.toString()}`);
    close();
  };
  const goCustom = (f: string, t: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set(fromParam, f);
    sp.set(toParam, t);
    sp.delete(param);
    router.push(`${pathname}?${sp.toString()}`);
    close();
  };

  const anchor = align === "end" ? "right-0" : "left-0";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        className="inline-flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2.5 text-[13.5px] font-semibold text-slate-700 transition-colors hover:bg-muted"
      >
        <Icon className="size-[15px] text-slate-500" />
        {label}
        <ChevronDownIcon className="size-3 text-slate-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={close} />
          {!calMode ? (
            <div className={cn("absolute top-full z-[61] mt-2 w-[15.375rem] rounded-2xl border border-border bg-popover p-[7px] shadow-overlay", anchor)}>
              {presets.map((p) => {
                const active = !isCustom && String(value) === p.value;
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => goPreset(p.value)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-[13.5px] font-semibold transition-colors",
                      active ? "bg-ember-50 text-primary" : "text-slate-700 hover:bg-muted",
                    )}
                  >
                    {p.label}
                    {active && <CheckIcon className="size-[15px] text-primary" strokeWidth={2.4} />}
                  </button>
                );
              })}
              <div className="mx-2 my-1.5 h-px bg-slate-150" />
              <button
                type="button"
                onClick={() => setCalMode(true)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13.5px] font-semibold transition-colors",
                  isCustom ? "bg-ember-50 text-primary" : "text-slate-700 hover:bg-muted",
                )}
              >
                <CalendarIcon className="size-[15px]" />
                Custom range…
              </button>
            </div>
          ) : (
            <RangeCalendar
              align={align}
              initialFrom={from}
              initialTo={to}
              onCancel={() => setCalMode(false)}
              onApply={goCustom}
            />
          )}
        </>
      )}
    </div>
  );
}

/** Absolute-positioned custom-range calendar (used by TimeRangeFilter's popover). */
export function RangeCalendar({
  align = "start",
  initialFrom,
  initialTo,
  onCancel,
  onApply,
}: {
  align?: "start" | "end";
  initialFrom: string | null;
  initialTo: string | null;
  onCancel: () => void;
  onApply: (from: string, to: string) => void;
}) {
  const anchor = align === "end" ? "right-0" : "left-0";
  return (
    <div className={cn("absolute top-full z-[61] mt-2 w-[37.5rem] max-w-[92vw] rounded-[18px] border border-border bg-popover p-5 shadow-overlay", anchor)}>
      <RangeCalendarBody initialFrom={initialFrom} initialTo={initialTo} onCancel={onCancel} onApply={onApply} />
    </div>
  );
}

/**
 * The bare custom-range calendar (heading · month nav · two month grids · Cancel /
 * Apply). No positioning wrapper, so it drops cleanly into any container — e.g.
 * the Web Tasks Filter dropdown renders it inside its own popover so the custom
 * date UI matches every other screen exactly.
 */
export function RangeCalendarBody({
  initialFrom,
  initialTo,
  onCancel,
  onApply,
}: {
  initialFrom: string | null;
  initialTo: string | null;
  onCancel: () => void;
  onApply: (from: string, to: string) => void;
}) {
  const startBase = initialFrom ? new Date(initialFrom) : new Date();
  const [viewMonth, setViewMonth] = React.useState(
    () => new Date(Date.UTC(startBase.getUTCFullYear(), startBase.getUTCMonth(), 1)),
  );
  const [selFrom, setSelFrom] = React.useState<string | null>(initialFrom);
  const [selTo, setSelTo] = React.useState<string | null>(initialTo);

  const shiftMonth = (n: number) =>
    setViewMonth((d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)));
  const rightMonth = new Date(Date.UTC(viewMonth.getUTCFullYear(), viewMonth.getUTCMonth() + 1, 1));

  const pick = (iso: string) => {
    if (!selFrom || (selFrom && selTo)) {
      setSelFrom(iso);
      setSelTo(null);
      return;
    }
    if (iso < selFrom) {
      setSelTo(selFrom);
      setSelFrom(iso);
      return;
    }
    setSelTo(iso);
  };

  const heading = selFrom ? `${rangeDayLabel(selFrom)} – ${selTo ? rangeDayLabel(selTo) : "…"}` : "Select a range";

  return (
    <>
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <div>
          <div className="mb-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">
            Custom range
          </div>
          <div className="text-base font-bold tracking-tight text-foreground">{heading}</div>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="flex size-[34px] items-center justify-center rounded-[9px] border border-border bg-card hover:bg-muted"
          >
            <ChevronLeftIcon className="size-4 text-slate-500" />
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="flex size-[34px] items-center justify-center rounded-[9px] border border-border bg-card hover:bg-muted"
          >
            <ChevronRightIcon className="size-4 text-slate-500" />
          </button>
        </div>
      </div>
      <div className="flex gap-6">
        <MonthGrid month={viewMonth} selFrom={selFrom} selTo={selTo} onPick={pick} />
        <MonthGrid month={rightMonth} selFrom={selFrom} selTo={selTo} onPick={pick} />
      </div>
      <div className="mt-4 flex items-center justify-end gap-3 border-t border-slate-150 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-border bg-card px-[1.125rem] py-2.5 text-[13.5px] font-semibold text-slate-700 hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!selFrom || !selTo}
          onClick={() => selFrom && selTo && onApply(selFrom, selTo)}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-brand px-[1.125rem] py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50"
        >
          <CheckIcon className="size-[15px]" strokeWidth={2.4} />
          Apply range
        </button>
      </div>
    </>
  );
}

function MonthGrid({
  month,
  selFrom,
  selTo,
  onPick,
}: {
  month: Date;
  selFrom: string | null;
  selTo: string | null;
  onPick: (iso: string) => void;
}) {
  const y = month.getUTCFullYear();
  const m = month.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1));
  const startDow = first.getUTCDay();
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10));

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-2.5 text-center text-sm font-bold text-slate-800">
        {month.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
      </div>
      <div className="mb-1 grid grid-cols-7">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="text-center font-mono text-[10.5px] font-semibold text-slate-350">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((iso, i) => {
          if (!iso) return <div key={i} />;
          const isStart = iso === selFrom;
          const isEnd = iso === selTo;
          const inRange = selFrom && selTo && iso > selFrom && iso < selTo;
          const endpoint = isStart || isEnd;
          return (
            <div key={i} className={cn("py-0.5 text-center", inRange && "bg-ember-50")}>
              <button
                type="button"
                onClick={() => onPick(iso)}
                className={cn(
                  "mx-auto flex size-8 items-center justify-center rounded-full text-[12.5px] font-medium transition-colors",
                  endpoint ? "bg-gradient-brand text-white" : inRange ? "text-primary" : "text-slate-700 hover:bg-muted",
                )}
              >
                {Number(iso.slice(8, 10))}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
