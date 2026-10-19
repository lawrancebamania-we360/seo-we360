"use client";

// Team Targets: the board for one week. Targets are grouped under their owner
// so each person can find their own block; "Mine" narrows it to the targets
// they own or co-own. Each row shows the goal, what was reported, how far that
// gets, and where it stands in verification, with the actions the viewer is
// actually allowed to take (the server enforces the same rules).

import { useMemo, useState } from "react";
import { CheckCircle2, Clock, ExternalLink, Pencil, Plus, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toExternalUrl } from "@/lib/url";
import { FREQUENCY_LABEL, STATUS_LABEL, type EntryStatus } from "@/lib/team-targets/types";
import type { TargetEntry, TargetRow, TeamTargetsBoard } from "@/lib/data/team-targets";
import { ReportNumberDialog } from "@/components/sections/team-targets/report-number-dialog";
import { SendBackDialog, VerifyButton } from "@/components/sections/team-targets/review-actions";
import { RemoveTargetDialog, TargetFormDialog, type MemberOption } from "@/components/sections/team-targets/target-form-dialog";

type Filter = "all" | "mine" | "review";
type Dialog =
  | { kind: "report"; row: TargetRow }
  | { kind: "sendBack"; row: TargetRow }
  | { kind: "edit"; row: TargetRow }
  | { kind: "remove"; row: TargetRow };

// Fixed zone so the server render and the browser agree on the day.
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Asia/Kolkata" });

const STATUS_STYLE: Record<EntryStatus, string> = {
  pending: "border-warning-300/60 bg-warning-500/5 text-warning-700 dark:text-warning-400",
  verified: "border-success-300/60 bg-success-500/5 text-success-700 dark:text-success-400",
  sent_back: "border-error-300/60 bg-error-500/5 text-error-700 dark:text-error-400",
};
const BAR_STYLE: Record<EntryStatus, string> = {
  pending: "bg-[#7B62FF]",
  verified: "bg-success-500",
  sent_back: "bg-muted-foreground/40",
};

function progressOf(row: TargetRow): { pct: number; done: number; of: number } {
  const counted = row.entry && row.entry.status !== "sent_back" ? row.entry.achieved : 0;
  if (row.frequency === "monthly") {
    const done = row.monthSoFar ?? 0;
    return { pct: Math.min(100, (done / row.target) * 100), done, of: row.target };
  }
  const of = row.expectedThisWeek ?? row.target;
  return { pct: Math.min(100, (counted / of) * 100), done: counted, of };
}

export function TargetsBoard({
  board, projectId, members, currentUserId, isAdmin,
}: {
  board: TeamTargetsBoard;
  projectId: string;
  members: MemberOption[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const { targets, weekStart } = board;

  const isMine = (t: TargetRow) => t.ownerId === currentUserId || t.coOwnerId === currentUserId;
  const needsMyReview = (t: TargetRow) => t.entry?.status === "pending" && t.entry.reportedBy !== currentUserId;

  const summary = useMemo(() => {
    const due = targets.filter((t) => t.frequency !== "monthly");
    const by = (s: EntryStatus) => targets.filter((t) => t.entry?.status === s).length;
    return {
      notReported: due.filter((t) => !t.entry).length,
      pending: by("pending"),
      verified: by("verified"),
      sentBack: by("sent_back"),
    };
  }, [targets]);

  const reviewCount = targets.filter(needsMyReview).length;

  const groups = useMemo(() => {
    const visible = targets.filter((t) => (filter === "mine" ? isMine(t) : filter === "review" ? needsMyReview(t) : true));
    const map = new Map<string, { key: string; name: string; mine: boolean; rows: TargetRow[] }>();
    for (const t of visible) {
      const key = t.ownerId ?? "none";
      const g = map.get(key) ?? { key, name: t.ownerName ?? "No owner", mine: t.ownerId === currentUserId, rows: [] };
      g.rows.push(t);
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => Number(b.mine) - Number(a.mine) || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, filter, currentUserId]);

  if (!targets.length) {
    return (
      <Card className="border-dashed p-10 text-center text-sm text-muted-foreground">
        {isAdmin
          ? "No targets yet. Use Import targets to paste your sheet, or Add target to start with one."
          : "No targets have been set up yet. An admin will add them."}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Not reported yet" value={summary.notReported} />
        <Stat label="Awaiting verification" value={summary.pending} tone="warning" />
        <Stat label="Verified" value={summary.verified} tone="success" />
        <Stat label="Sent back" value={summary.sentBack} tone="error" />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>Everyone</FilterButton>
        <FilterButton active={filter === "mine"} onClick={() => setFilter("mine")}>Mine</FilterButton>
        {isAdmin && (
          <FilterButton active={filter === "review"} onClick={() => setFilter("review")}>
            To verify{reviewCount ? ` (${reviewCount})` : ""}
          </FilterButton>
        )}
      </div>

      {groups.length === 0 ? (
        <Card className="border-dashed p-8 text-center text-sm text-muted-foreground">
          {filter === "mine" ? "You don't own or co-own any targets." : "Nothing is waiting for you to verify."}
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5 font-semibold">Task</th>
                <th className="px-3 py-2.5 font-semibold">Goal</th>
                <th className="px-3 py-2.5 font-semibold">This week</th>
                <th className="px-3 py-2.5 font-semibold">Progress</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 text-right font-semibold"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const due = g.rows.filter((r) => r.frequency !== "monthly");
                return (
                  <GroupRows key={g.key} name={g.name} mine={g.mine}
                    reported={due.filter((r) => r.entry).length} due={due.length}
                    verified={g.rows.filter((r) => r.entry?.status === "verified").length}>
                    {g.rows.map((row) => (
                      <TargetTableRow
                        key={row.id} row={row} projectId={projectId} isAdmin={isAdmin} currentUserId={currentUserId}
                        onReport={() => setDialog({ kind: "report", row })}
                        onSendBack={() => setDialog({ kind: "sendBack", row })}
                        onEdit={() => setDialog({ kind: "edit", row })}
                        onRemove={() => setDialog({ kind: "remove", row })}
                      />
                    ))}
                  </GroupRows>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.kind === "report" && <ReportNumberDialog row={dialog.row} projectId={projectId} weekStart={weekStart} onClose={() => setDialog(null)} />}
      {dialog?.kind === "sendBack" && <SendBackDialog row={dialog.row} projectId={projectId} onClose={() => setDialog(null)} />}
      {dialog?.kind === "edit" && <TargetFormDialog target={dialog.row} projectId={projectId} members={members} onClose={() => setDialog(null)} />}
      {dialog?.kind === "remove" && <RemoveTargetDialog row={dialog.row} projectId={projectId} onClose={() => setDialog(null)} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warning" | "success" | "error" }) {
  const color = tone === "warning" ? "text-warning-700 dark:text-warning-400" : tone === "success" ? "text-success-700 dark:text-success-400" : tone === "error" ? "text-error-700 dark:text-error-400" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className={cn("text-xl font-semibold tabular-nums", color)}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      className={cn(
        "cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "border-[#5B45E0]/40 bg-[#5B45E0]/10 text-[#5B45E0] dark:text-[#7B62FF]" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function GroupRows({ name, mine, reported, due, verified, children }: {
  name: string; mine: boolean; reported: number; due: number; verified: number; children: React.ReactNode;
}) {
  return (
    <>
      <tr className="border-b border-border/60 bg-muted/20">
        <td colSpan={6} className="px-3 py-2">
          <span className="text-sm font-semibold text-foreground">{name}</span>
          {mine && <span className="ml-1.5 rounded bg-[#5B45E0]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#5B45E0] dark:text-[#7B62FF]">You</span>}
          <span className="ml-2 text-xs text-muted-foreground">
            {reported} of {due} reported this week, {verified} verified
          </span>
        </td>
      </tr>
      {children}
    </>
  );
}

function TargetTableRow({ row, projectId, isAdmin, currentUserId, onReport, onSendBack, onEdit, onRemove }: {
  row: TargetRow; projectId: string; isAdmin: boolean; currentUserId: string;
  onReport: () => void; onSendBack: () => void; onEdit: () => void; onRemove: () => void;
}) {
  const e = row.entry;
  const canReport = isAdmin || row.ownerId === currentUserId || row.coOwnerId === currentUserId;
  const canReview = isAdmin && e?.status === "pending" && e.reportedBy !== currentUserId;
  const { pct, done, of } = progressOf(row);

  return (
    <tr className="border-b border-border/60 align-top last:border-0 transition-colors hover:bg-muted/30">
      <td className="px-3 py-2.5">
        <div className="font-medium text-foreground">{row.task}</div>
        {row.coOwnerName && <div className="text-xs text-muted-foreground">with {row.coOwnerName}</div>}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
        <div>{row.target.toLocaleString()} {FREQUENCY_LABEL[row.frequency]}</div>
        {row.frequency === "daily" && row.expectedThisWeek != null && (
          <div className="text-xs">{row.expectedThisWeek.toLocaleString()} for the week</div>
        )}
      </td>
      <td className="px-3 py-2.5">
        {e ? <ReportedCell entry={e} /> : <span className="text-muted-foreground">{row.frequency === "monthly" ? "Optional this week" : "Not reported"}</span>}
        {row.frequency === "monthly" && (
          <div className="text-xs text-muted-foreground">Month so far: {(row.monthSoFar ?? 0).toLocaleString()} of {row.target.toLocaleString()}</div>
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
          <div className={cn("h-full rounded-full", e ? BAR_STYLE[e.status] : "bg-[#7B62FF]")} style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 text-xs tabular-nums text-muted-foreground">{done.toLocaleString()} / {of.toLocaleString()}</div>
      </td>
      <td className="px-3 py-2.5">
        {e ? <StatusCell entry={e} /> : <span className="text-xs text-muted-foreground">-</span>}
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center justify-end gap-1">
          {canReview && e && (
            <>
              <VerifyButton projectId={projectId} entryId={e.id} />
              <Button type="button" size="sm" variant="outline" onClick={onSendBack} className="h-7 gap-1 px-2 text-xs">
                <Undo2 className="size-3" /> Send back
              </Button>
            </>
          )}
          {canReport && (
            <Button type="button" size="sm" variant={e ? "ghost" : "brand"} onClick={onReport} className="h-7 gap-1 px-2 text-xs">
              {e ? <Pencil className="size-3" /> : <Plus className="size-3" />} {e ? "Edit" : "Report"}
            </Button>
          )}
          {isAdmin && (
            <>
              <button type="button" onClick={onEdit} title="Edit this target" aria-label={`Edit target ${row.task}`}
                className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <Pencil className="size-3.5" />
              </button>
              <button type="button" onClick={onRemove} title="Remove this target" aria-label={`Remove target ${row.task}`}
                className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-error-500/10 hover:text-error-600">
                <Trash2 className="size-3.5" />
              </button>
            </>
          )}
        </div>
        {isAdmin && e?.status === "pending" && e.reportedBy === currentUserId && (
          <div className="mt-1 text-right text-[11px] text-muted-foreground">Another admin verifies this</div>
        )}
      </td>
    </tr>
  );
}

function ReportedCell({ entry }: { entry: TargetEntry }) {
  const proof = entry.proofUrl ? toExternalUrl(entry.proofUrl) : null;
  return (
    <div>
      <div className="font-semibold tabular-nums text-foreground">{entry.achieved.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground">
        {entry.reportedByName ?? "Someone"} on {fmtDate(entry.reportedAt)}
        {proof && (
          <a href={proof} target="_blank" rel="noopener noreferrer" className="ml-1.5 inline-flex items-center gap-0.5 hover:text-foreground hover:underline">
            proof <ExternalLink className="size-3" />
          </a>
        )}
      </div>
      {entry.note && <div className="mt-0.5 max-w-[220px] truncate text-xs text-muted-foreground" title={entry.note}>{entry.note}</div>}
    </div>
  );
}

function StatusCell({ entry }: { entry: TargetEntry }) {
  const Icon = entry.status === "verified" ? CheckCircle2 : entry.status === "sent_back" ? Undo2 : Clock;
  return (
    <div>
      <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] font-medium", STATUS_STYLE[entry.status])}>
        <Icon className="size-3" /> {STATUS_LABEL[entry.status]}
      </span>
      {entry.status === "verified" && entry.reviewedByName && (
        <div className="mt-1 text-xs text-muted-foreground">by {entry.reviewedByName}{entry.reviewedAt ? ` on ${fmtDate(entry.reviewedAt)}` : ""}</div>
      )}
      {entry.status === "sent_back" && (
        <div className="mt-1 max-w-[240px] text-xs text-error-700 dark:text-error-400">
          {entry.reviewedByName ? `${entry.reviewedByName}: ` : ""}{entry.reviewNote}
        </div>
      )}
    </div>
  );
}
