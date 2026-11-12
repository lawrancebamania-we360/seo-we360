"use client";

// Reddit Citations: "New month" dialog (admin). Pick a month (defaults to the
// current one) and an optional label, then it opens on success.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { createRedditCluster } from "@/lib/actions/reddit-citations";

function thisMonth(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
}

export function NewMonthButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(thisMonth());
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy || !month) return;
    setBusy(true); setError(null);
    try {
      const r = await createRedditCluster({ project_id: projectId, month_key: month, title: title.trim() || undefined });
      if (!r.ok || !r.clusterId) { setError(r.error ?? "Could not add that month."); return; }
      toast.success("Month added.");
      setOpen(false); setTitle("");
      router.push(`/dashboard/reddit-citations/${r.clusterId}`);
    } finally { setBusy(false); }
  };

  return (
    <>
      <Button size="sm" variant="brand" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> New month
      </Button>
      <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>New month</DialogTitle>
            <DialogDescription>A monthly cluster of Reddit citations. One per month.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="rc-month">Month</label>
              <Input id="rc-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="rc-title">Label (optional)</label>
              <Input id="rc-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Defaults to e.g. Oct 26" maxLength={120} />
            </div>
            {error && <p className="text-xs text-error-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="brand" onClick={submit} disabled={busy || !month} className="gap-1.5">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Add month
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
