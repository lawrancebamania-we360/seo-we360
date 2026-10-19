"use client";

// Team Targets: a target's drawer - its logged items with each one's AI verdict,
// plus the actions the viewer may take. Re-check (anyone who can log) re-runs the
// AI check; Verify (owner only, never your own) hand-approves what the AI could
// not; Delete removes a miskeyed row.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ExternalLink, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toExternalUrl } from "@/lib/url";
import { formatDay } from "@/lib/format-datetime";
import { FREQUENCY_LABEL, isVerified } from "@/lib/team-targets/types";
import { safely } from "@/lib/team-targets/safely";
import { deleteTeamTargetLog, ownerVerifyTeamTargetLog, verifyTeamTargetLog } from "@/lib/actions/team-targets";
import type { DashboardTarget, TargetLog } from "@/lib/team-targets/types";
import { fmtNum, VerificationBadge } from "@/components/sections/team-targets/ui";

const NEEDS_FIRST: Record<string, number> = { not_found: 0, mismatch: 0, failed: 0, unreachable: 1, pending: 2, ai_verified: 3, owner_verified: 3 };

export function TargetDrawer({
  target, projectId, isAdmin, isOwner, currentUserId, onClose,
}: {
  target: DashboardTarget | null;
  projectId: string;
  isAdmin: boolean;
  isOwner: boolean;
  currentUserId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!target) return null;
  const canLog = isAdmin || target.ownerId === currentUserId || target.coOwnerId === currentUserId;
  const logs = target.logs.slice().sort((a, b) => (NEEDS_FIRST[a.status] ?? 5) - (NEEDS_FIRST[b.status] ?? 5));

  const run = async (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    setBusyId(id);
    const r = await safely(fn());
    setBusyId(null);
    if (!r.ok) { toast.error(r.error ?? "Something went wrong."); return; }
    toast.success(okMsg);
    router.refresh();
  };

  return (
    <Sheet open onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-[460px]">
        <SheetHeader>
          <SheetTitle>{target.task}</SheetTitle>
          <SheetDescription>
            {target.ownerName ?? "No owner"}{target.coOwnerName ? ` · with ${target.coOwnerName}` : ""} · goal {target.target.toLocaleString()} {FREQUENCY_LABEL[target.frequency]}
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-3 gap-2 px-4 pb-3">
          {[["Done", target.doneVerified], ["Expected", target.expectedPeriod], ["Left", target.remaining]].map(([l, v]) => (
            <div key={l as string} className="rounded-lg border border-border bg-muted/30 px-2.5 py-2">
              <div className="font-mono text-base font-semibold tabular-nums text-foreground">{fmtNum(v as number)}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{l}</div>
            </div>
          ))}
        </div>

        <div className="border-t border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {logs.length} logged this period
        </div>

        {logs.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing logged yet for this period.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {logs.map((log) => (
              <LogRow key={log.id} log={log} target={target} projectId={projectId} canLog={canLog} isOwner={isOwner} currentUserId={currentUserId} busyId={busyId} run={run} />
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}

function LogRow({
  log, target, projectId, canLog, isOwner, currentUserId, busyId, run,
}: {
  log: TargetLog;
  target: DashboardTarget;
  projectId: string;
  canLog: boolean;
  isOwner: boolean;
  currentUserId: string;
  busyId: string | null;
  run: (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => Promise<void>;
}) {
  const href = log.link ? toExternalUrl(log.link) : null;
  const busy = busyId === log.id;
  const canRecheck = canLog && target.logMode === "link" && !!log.link;
  const canOwnerVerify = isOwner && log.reportedBy !== currentUserId && !isVerified(log.status);
  const canDelete = canLog && (log.reportedBy === currentUserId || isOwner || canLog);

  return (
    <li className="px-4 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-foreground hover:underline">
              <span className="max-w-[240px] truncate">{log.link}</span><ExternalLink className="size-3 shrink-0 text-muted-foreground" />
            </a>
          ) : (
            <span className="text-[13px] font-medium text-foreground">Quantity: {log.quantity.toLocaleString()}</span>
          )}
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {formatDay(log.logDate)}{log.reportedByName ? ` · ${log.reportedByName}` : ""}{target.logMode === "count" ? ` · ${log.quantity.toLocaleString()}` : ""}
          </div>
        </div>
        <VerificationBadge status={log.status} />
      </div>
      {log.reason && <p className="mt-1 text-[11px] text-muted-foreground">{log.reason}</p>}
      {log.note && <p className="mt-0.5 text-[11px] italic text-muted-foreground">&ldquo;{log.note}&rdquo;</p>}
      {(canRecheck || canOwnerVerify || canDelete) && (
        <div className="mt-1.5 flex items-center gap-1.5">
          {canRecheck && (
            <Button type="button" size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" disabled={busy}
              onClick={() => run(log.id, () => verifyTeamTargetLog({ project_id: projectId, log_id: log.id }), "Re-checked.")}>
              {busy ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} Re-check
            </Button>
          )}
          {canOwnerVerify && (
            <Button type="button" size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" disabled={busy}
              onClick={() => run(log.id, () => ownerVerifyTeamTargetLog({ project_id: projectId, log_id: log.id }), "Verified.")}>
              <Check className="size-3 text-success-600" /> Verify
            </Button>
          )}
          {canDelete && (
            <Button type="button" size="icon-sm" variant="ghost" className="size-6" disabled={busy} title="Remove this log"
              onClick={() => run(log.id, () => deleteTeamTargetLog({ project_id: projectId, log_id: log.id }), "Removed.")}>
              <Trash2 className="size-3 text-muted-foreground" />
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
