"use client";

// Team Targets: runs the AI link checks in the background with a progress bar.
// Logging work or importing a batch dispatches a "tt-verify" window event with
// the new log ids; this widget (mounted once on the page) drains the queue one
// link at a time, so a big import doesn't fire dozens of fetches at once, and
// shows a small fixed card with progress. The page refreshes as results land.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { verifyTeamTargetLog } from "@/lib/actions/team-targets";
import { safely } from "@/lib/team-targets/safely";

export interface VerifyRequest { projectId: string; logIds: string[] }

export function dispatchVerify(req: VerifyRequest) {
  if (req.logIds.length) window.dispatchEvent(new CustomEvent<VerifyRequest>("tt-verify", { detail: req }));
}

export function VerificationFloater() {
  const router = useRouter();
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const queue = useRef<{ projectId: string; logId: string }[]>([]);
  const running = useRef(false);

  const drain = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    let processedSinceRefresh = 0;
    while (queue.current.length) {
      const next = queue.current.shift()!;
      await safely(verifyTeamTargetLog({ project_id: next.projectId, log_id: next.logId }));
      setDone((d) => d + 1);
      // Refresh periodically so the board fills in as checks land, not just at the end.
      if (++processedSinceRefresh >= 3 || queue.current.length === 0) { processedSinceRefresh = 0; router.refresh(); }
    }
    running.current = false;
    // Clear the bar shortly after finishing.
    setTimeout(() => { if (!queue.current.length && !running.current) { setTotal(0); setDone(0); } }, 2500);
  }, [router]);

  useEffect(() => {
    const onVerify = (e: Event) => {
      const { projectId, logIds } = (e as CustomEvent<VerifyRequest>).detail;
      if (!logIds?.length) return;
      queue.current.push(...logIds.map((logId) => ({ projectId, logId })));
      setTotal((t) => t + logIds.length);
      void drain();
    };
    window.addEventListener("tt-verify", onVerify);
    return () => window.removeEventListener("tt-verify", onVerify);
  }, [drain]);

  if (total === 0) return null;
  const complete = done >= total;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 rounded-xl border border-border bg-popover p-3 shadow-lg">
      <div className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground">
        {complete ? <ShieldCheck className="size-4 text-success-600" /> : <Loader2 className="size-4 animate-spin text-[#5B45E0] dark:text-[#7B62FF]" />}
        {complete ? "Links checked" : "Checking links"}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-[#5B45E0] transition-all dark:bg-[#7B62FF]" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{done} of {total} checked</div>
    </div>
  );
}
