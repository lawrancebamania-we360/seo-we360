"use client";

import { useTransition } from "react";
import { motion } from "motion/react";
import { ExternalLink, Check, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { priorityColor, initials } from "@/lib/ui-helpers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toggleTaskDone, deleteTask } from "@/lib/actions/tasks";
import { UrlMetricsChip } from "@/components/sections/url-metrics-chip";
import type { TaskWithAssignee } from "@/lib/data/tasks";

export function TaskRow({ task, canComplete, canDelete }: { task: TaskWithAssignee; canComplete: boolean; canDelete: boolean }) {
  const [pending, start] = useTransition();

  const onToggle = () => {
    start(async () => {
      try {
        await toggleTaskDone(task.id, !task.done);
        toast.success(task.done ? "Reopened task" : "Marked complete");
      } catch (e) {
        toast.error("Could not update task");
      }
    });
  };

  const onDelete = () => {
    if (!confirm(`Delete "${task.title}"?`)) return;
    start(async () => {
      try {
        await deleteTask(task.id);
        toast.success("Deleted");
      } catch (e) {
        toast.error("Could not delete");
      }
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "group flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50",
        task.done && "opacity-60"
      )}
    >
      <button
        onClick={onToggle}
        disabled={!canComplete || pending}
        aria-label={task.done ? "Reopen" : "Complete"}
        className={cn(
          "mt-0.5 size-4 shrink-0 rounded border transition-all",
          task.done
            ? "bg-primary border-primary text-primary-foreground flex items-center justify-center"
            : "border-input hover:border-primary"
        )}
      >
        {task.done && <Check className="size-3" />}
      </button>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-sm font-medium", task.done && "line-through")}>{task.title}</span>
          <Badge variant="outline" className={cn("font-medium", priorityColor(task.priority))}>
            {task.priority}
          </Badge>
          {task.source === "cron_audit" && (
            <Badge variant="secondary" className="text-[10px]">auto</Badge>
          )}
        </div>
        {task.issue && (
          <div className="text-xs text-muted-foreground line-clamp-2">{task.issue}</div>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {task.url && (
            <a
              href={task.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <ExternalLink className="size-3" />
              {new URL(task.url).pathname}
            </a>
          )}
          {/* Live GSC + GA4 chip — only shows once url_metrics has data for
              this URL. Lazy-fetched per row; cheap because the latest view
              is indexed and we only render when impressions > 0. */}
          {task.url && task.url.startsWith("http") && (
            <UrlMetricsChip url={task.url} />
          )}
          {task.scheduled_date && <span>Due {task.scheduled_date}</span>}
          {task.impact && <span>Impact: {task.impact}</span>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {task.assignee ? (
          <div className="flex items-center gap-1.5 text-xs">
            <Avatar className="size-5">
              <AvatarImage src={task.assignee.avatar_url ?? undefined} />
              <AvatarFallback className="text-[9px]">{initials(task.assignee.name)}</AvatarFallback>
            </Avatar>
            <span className="hidden sm:inline text-muted-foreground">{task.assignee.name}</span>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <User className="size-3" />
            Unassigned
          </div>
        )}
        {canDelete && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="opacity-0 group-hover:opacity-100"
            onClick={onDelete}
            disabled={pending}
            aria-label="Delete"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </motion.div>
  );
}
