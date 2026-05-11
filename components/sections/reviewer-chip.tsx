"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, UserCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toggleTaskReviewed } from "@/lib/actions/tasks";

// Small chip for the kanban card. Shows "✓ Reviewed by Lokesh" when the
// task has a human reviewer sign-off. Tooltip reveals the timestamp.
export function ReviewerChip({
  reviewerName,
  reviewedAt,
  className,
}: {
  reviewerName: string | null;
  reviewedAt: string | null;
  className?: string;
}) {
  if (!reviewerName || !reviewedAt) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className={cn(
              "inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900 text-[10px] font-medium px-1.5 py-0.5",
              className,
            )}
          >
            <CheckCircle2 className="size-3" />
            <span>Reviewed by {reviewerName.split(" ")[0]}</span>
          </div>
        }
      />
      <TooltipContent side="top">
        Reviewed by {reviewerName} · {formatDistanceToNow(new Date(reviewedAt), { addSuffix: true })}
      </TooltipContent>
    </Tooltip>
  );
}

// Button for the task detail dialog. Admins toggle the reviewer sign-off
// here. Non-admins see the chip read-only.
export function ReviewerToggleButton({
  taskId,
  reviewer,
  reviewedAt,
  canReview,
  onChanged,
}: {
  taskId: string;
  reviewer: { id: string; name: string } | null;
  reviewedAt: string | null;
  canReview: boolean;     // admin only
  onChanged: (next: { reviewer: { id: string; name: string } | null; reviewedAt: string | null }) => void;
}) {
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useState<{ reviewer: typeof reviewer; reviewedAt: string | null } | null>(null);

  const reviewerLive = optimistic?.reviewer ?? reviewer;
  const reviewedAtLive = optimistic?.reviewedAt ?? reviewedAt;
  const isReviewed = !!reviewerLive;

  const toggle = () => {
    if (!canReview) return;
    const next = !isReviewed;
    // Optimistic update so the chip flips instantly.
    setOptimistic({
      reviewer: next ? { id: "me", name: "You" } : null,
      reviewedAt: next ? new Date().toISOString() : null,
    });
    start(async () => {
      try {
        await toggleTaskReviewed(taskId, next);
        toast.success(next ? "Marked as reviewed" : "Removed reviewer sign-off");
        onChanged({
          reviewer: next ? { id: "me", name: "You" } : null,
          reviewedAt: next ? new Date().toISOString() : null,
        });
      } catch (e) {
        setOptimistic(null);
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  if (!canReview && !isReviewed) return null;     // nothing to show

  if (!canReview) {
    // Read-only view for non-admins (members see the badge but can't toggle).
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900 text-xs font-medium px-2 py-1">
        <CheckCircle2 className="size-3.5" />
        <span>Reviewed by {reviewerLive?.name ?? "editor"}</span>
        {reviewedAtLive && (
          <span className="text-[10px] opacity-70">
            · {formatDistanceToNow(new Date(reviewedAtLive), { addSuffix: true })}
          </span>
        )}
      </div>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={isReviewed ? "outline" : "outline"}
      onClick={toggle}
      disabled={pending}
      className={cn(
        "gap-1.5",
        isReviewed && "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900",
      )}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : isReviewed ? <CheckCircle2 className="size-3.5" /> : <UserCheck className="size-3.5" />}
      {isReviewed
        ? `Reviewed by ${reviewerLive?.name ?? "you"}${reviewedAtLive ? ` · ${formatDistanceToNow(new Date(reviewedAtLive), { addSuffix: true })}` : ""}`
        : "Mark as reviewed"}
    </Button>
  );
}
