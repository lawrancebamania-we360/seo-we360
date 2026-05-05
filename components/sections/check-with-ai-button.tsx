"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface Props {
  taskId: string;
  // "icon" = compact icon-only button (used on cards)
  // "full" = full button with label (used in modal header)
  variant?: "icon" | "full";
}

export function CheckWithAIButton({ taskId, variant = "icon" }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    start(async () => {
      const t = toast.loading("Re-running SEO skills on this URL...");
      try {
        const res = await fetch(`/api/tasks/${taskId}/verify`, { method: "POST" });
        if (!res.ok) throw new Error(await res.text());
        const body = (await res.json()) as { verified: boolean; reason: string };
        if (body.verified) {
          toast.success(
            <div>
              <CheckCircle2 className="inline size-3.5 mr-1 text-emerald-500" />
              Verified — issue resolved. Task closed.
            </div>,
            { id: t, duration: 4000 }
          );
          router.refresh();
        } else {
          toast.warning(
            <div className="flex items-start gap-1.5">
              <XCircle className="size-3.5 shrink-0 mt-0.5 text-amber-500" />
              <span>{body.reason}</span>
            </div>,
            { id: t, duration: 5000 }
          );
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Verification failed", { id: t });
      }
    });
  };

  if (variant === "full") {
    return (
      <Button size="sm" variant="outline" onClick={run} disabled={pending}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-violet-500" />}
        Check with AI
      </Button>
    );
  }

  return (
    <Button
      size="icon-sm"
      variant="outline"
      onClick={run}
      disabled={pending}
      title="Check with AI if this task is resolved"
      aria-label="Check with AI"
      className="hover:bg-violet-50 hover:text-violet-700 hover:border-violet-200 dark:hover:bg-violet-950/40 dark:hover:text-violet-400"
    >
      {pending ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
    </Button>
  );
}
