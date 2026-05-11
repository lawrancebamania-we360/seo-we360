"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, UserCheck } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toggleTaskReviewed } from "@/lib/actions/tasks";
import type { TaskStatus } from "@/lib/types/database";

// Chip + quick action for the kanban card.
//
// Three modes, picked based on context:
//   1. Reviewed + admin     → clickable green chip, click toggles off
//   2. Reviewed + non-admin → read-only green chip
//   3. Unreviewed + admin + task in Done/Published → small "Review" button
//      (so admins can sign off without opening the dialog)
//   4. Unreviewed + non-admin → nothing rendered
//
// Stops propagation on click so toggling doesn't also open the task dialog.

interface Props {
  reviewerName: string | null;
  reviewedAt: string | null;
  // Interactive mode props
  taskId?: string;
  taskStatus?: TaskStatus;
  canReview?: boolean;
  onChanged?: (next: { reviewer: { id: string; name: string } | null; reviewedAt: string | null }) => void;
  className?: string;
}

export function ReviewerChip({
  reviewerName, reviewedAt, taskId, taskStatus, canReview = false, onChanged, className,
}: Props) {
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useState<{ name: string | null; at: string | null } | null>(null);

  const nameLive = optimistic?.name ?? reviewerName;
  const atLive = optimistic?.at ?? reviewedAt;
  const isReviewed = !!(nameLive && atLive);

  // Only show the quick action button when the task has reached Done or
  // Published. Reviewing a card still in Idea/In progress doesn't make sense.
  const taskIsReviewable = taskStatus === "review" || taskStatus === "done";

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canReview || !taskId) return;
    const next = !isReviewed;
    setOptimistic({
      name: next ? "You" : null,
      at: next ? new Date().toISOString() : null,
    });
    start(async () => {
      try {
        await toggleTaskReviewed(taskId, next);
        toast.success(next ? "Marked as reviewed" : "Review removed");
        onChanged?.({
          reviewer: next ? { id: "me", name: "You" } : null,
          reviewedAt: next ? new Date().toISOString() : null,
        });
      } catch (err) {
        setOptimistic(null);
        toast.error(err instanceof Error ? err.message : "Failed");
      }
    });
  };

  // --- Reviewed: green chip (clickable for admins, read-only for members) ---
  if (isReviewed) {
    const chipContent = (
      <div
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900 text-[10px] font-medium px-1.5 py-0.5",
          canReview && taskId && "cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-950/50 transition-colors",
          className,
        )}
        onClick={canReview && taskId ? toggle : undefined}
        role={canReview && taskId ? "button" : undefined}
      >
        {pending ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
        <span>Reviewed by {(nameLive ?? "").split(" ")[0] || "editor"}</span>
      </div>
    );
    return (
      <Tooltip>
        <TooltipTrigger render={chipContent} />
        <TooltipContent side="top">
          Reviewed by {nameLive} · {atLive && formatDistanceToNow(new Date(atLive), { addSuffix: true })}
          {canReview && taskId && <div className="text-[10px] opacity-70 mt-0.5">Click to undo</div>}
        </TooltipContent>
      </Tooltip>
    );
  }

  // --- Unreviewed + admin + task in Done/Published: quick "Review" button ---
  if (canReview && taskId && taskIsReviewable) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={toggle}
              disabled={pending}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border border-dashed border-emerald-300 dark:border-emerald-800 text-[10px] font-medium px-1.5 py-0.5 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors",
                className,
              )}
            >
              {pending ? <Loader2 className="size-3 animate-spin" /> : <UserCheck className="size-3" />}
              <span>Review</span>
            </button>
          }
        />
        <TooltipContent side="top">Mark as reviewed by you</TooltipContent>
      </Tooltip>
    );
  }

  // --- Anything else: render nothing ---
  return null;
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
