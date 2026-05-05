"use client";

import { useTransition } from "react";
import { Play, Loader2, FileSearch, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface AuditResponse {
  pages_checked: number;
  findings: number;
  seo_gaps_added: number;
  new_tasks: number;
}

export function RunAuditButton({ projectId, label = "Run audit now" }: { projectId: string; label?: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = () => {
    start(async () => {
      const t = toast.loading("Crawling site, running 13 skills...");
      try {
        const res = await fetch("/api/audit/run-now", {
          method: "POST",
          headers: { "content-type": "application/json" },
          // Crawls up to 50 URLs per run — covers most of a small/mid site in one pass.
          // Endpoint clamps to [5, 100] so this stays within Vercel's 60s budget.
          body: JSON.stringify({ project_id: projectId, max_urls: 50 }),
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(err.slice(0, 200));
        }
        const body = (await res.json()) as AuditResponse;
        toast.success(
          <span className="inline-flex flex-col gap-1">
            <span className="font-medium">Audit complete · {body.pages_checked} pages checked</span>
            <span className="inline-flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <FileSearch className="size-3 text-violet-500" />
                {body.seo_gaps_added} SEO gap{body.seo_gaps_added === 1 ? "" : "s"}
              </span>
              <span className="inline-flex items-center gap-1">
                <ListChecks className="size-3 text-emerald-500" />
                {body.new_tasks} web task{body.new_tasks === 1 ? "" : "s"}
              </span>
            </span>
          </span>,
          { id: t, duration: 7000 }
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Audit failed", { id: t });
      }
    });
  };

  return (
    <Button size="sm" onClick={run} disabled={pending}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
      {label}
    </Button>
  );
}
