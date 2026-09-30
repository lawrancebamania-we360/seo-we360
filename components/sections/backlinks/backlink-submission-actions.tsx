"use client";

// Backlinks (Tickets 23-25): the interactive cluster on each submission row -
// AI verification (fetch the live link + ask the platform LLM whether it
// discusses the logged topic), who's responsible for it, and deleting a
// miskeyed row. Kept as one client island so the rest of the list can stay
// server-rendered.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2, User, CheckCircle2, XCircle, HelpCircle, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { initials } from "@/lib/ui-helpers";
import { deleteBacklinkSubmission, assignBacklinkSubmission, verifyBacklinkSubmission } from "@/lib/actions/backlinks";
import type { Member } from "@/components/sections/assignee-picker";

const STATUS_META: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
  unverified: { label: "Verify", icon: ShieldQuestion, className: "text-muted-foreground border-border" },
  verified: { label: "AI verified", icon: CheckCircle2, className: "text-success-700 dark:text-success-400 border-success-300/60 bg-success-500/5" },
  topic_mismatch: { label: "Topic mismatch", icon: HelpCircle, className: "text-warning-700 dark:text-warning-400 border-warning-300/60 bg-warning-500/5" },
  not_found: { label: "Not found", icon: XCircle, className: "text-error-700 dark:text-error-400 border-error-300/60 bg-error-500/5" },
  inconclusive: { label: "Inconclusive", icon: HelpCircle, className: "text-muted-foreground border-border" },
};

export function BacklinkSubmissionActions({
  projectId, submissionId, topicName, verificationStatus, verificationNote, assignedTo, members, canManage,
}: {
  projectId: string;
  submissionId: string;
  topicName: string | null;
  verificationStatus: string;
  verificationNote: string | null;
  assignedTo: string | null;
  members: Member[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [verifying, setVerifying] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const meta = STATUS_META[verificationStatus] ?? STATUS_META.unverified;
  const StatusIcon = meta.icon;
  const currentAssignee = members.find((m) => m.id === assignedTo) ?? null;

  const runVerify = async () => {
    if (verifying) return;
    if (!topicName || !topicName.trim()) {
      toast.error("No topic logged for this submission - add a Topic before verifying.");
      return;
    }
    setVerifying(true);
    const r = await verifyBacklinkSubmission({ project_id: projectId, submission_id: submissionId });
    setVerifying(false);
    if (!r.ok) { toast.error(r.error ?? "Verification failed."); return; }
    toast.success(r.note ?? "Verified.");
    router.refresh();
  };

  const pickAssignee = async (id: string | null) => {
    if (assigning) return;
    setAssigning(true);
    const r = await assignBacklinkSubmission({ project_id: projectId, submission_id: submissionId, team_member_id: id });
    setAssigning(false);
    if (!r.ok) { toast.error(r.error ?? "Could not assign this submission."); return; }
    toast.success(id ? `Assigned to ${members.find((m) => m.id === id)?.name ?? "member"}` : "Unassigned");
    setAssignOpen(false);
    router.refresh();
  };

  const confirmDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    const r = await deleteBacklinkSubmission({ project_id: projectId, submission_id: submissionId });
    setDeleting(false);
    if (!r.ok) { toast.error(r.error ?? "Could not delete that submission."); return; }
    toast.success("Submission deleted.");
    router.refresh();
  };

  if (confirmingDelete) {
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="text-[11.5px] text-error-600">Delete?</span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11.5px]" onClick={() => setConfirmingDelete(false)} disabled={deleting}>Cancel</Button>
        <Button variant="destructive" size="sm" className="h-6 gap-1 px-2 text-[11.5px]" onClick={confirmDelete} disabled={deleting}>
          {deleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />} Delete
        </Button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={runVerify}
        disabled={verifying}
        title={verificationNote ?? "Fetch the live link and check it discusses this topic"}
        className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] font-medium transition-colors hover:bg-muted disabled:opacity-60", meta.className)}
      >
        {verifying ? <Loader2 className="size-3 animate-spin" /> : <StatusIcon className="size-3" />}
        {meta.label}
      </button>

      {canManage && (
        <Popover open={assignOpen} onOpenChange={setAssignOpen}>
          <PopoverTrigger render={
            <button
              type="button"
              disabled={assigning}
              title={currentAssignee ? `Assigned to ${currentAssignee.name} - click to change` : "Assign to team member"}
              className="inline-flex items-center rounded-md border border-border p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
            >
              {currentAssignee ? (
                <Avatar className="size-4"><AvatarFallback className="text-[8px]">{initials(currentAssignee.name)}</AvatarFallback></Avatar>
              ) : (
                <User className="size-3.5" />
              )}
            </button>
          } />
          <PopoverContent className="w-56 p-1" align="end">
            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Assign to</div>
            <button type="button" onClick={() => pickAssignee(null)} disabled={assigning}
              className={cn("w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-muted flex items-center gap-2 disabled:opacity-50", !assignedTo && "bg-muted")}>
              <User className="size-3.5 text-muted-foreground" /> Unassigned
            </button>
            <div className="my-1 h-px bg-border" />
            {members.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No team members yet.</div>
            ) : (
              members.map((m) => (
                <button key={m.id} type="button" onClick={() => pickAssignee(m.id)} disabled={assigning}
                  className={cn("w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-muted flex items-center gap-2 disabled:opacity-50", assignedTo === m.id && "bg-muted")}>
                  <Avatar className="size-5"><AvatarFallback className="text-[9px]">{initials(m.name)}</AvatarFallback></Avatar>
                  <span className="truncate">{m.name}</span>
                </button>
              ))
            )}
          </PopoverContent>
        </Popover>
      )}

      {canManage && (
        <Button variant="ghost" size="icon-sm" onClick={() => setConfirmingDelete(true)} title="Delete this submission">
          <Trash2 className="size-3.5 text-muted-foreground" />
        </Button>
      )}
    </div>
  );
}
