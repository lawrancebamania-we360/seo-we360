"use client";

// Backlinks: taking a website off the list and putting it back. Removing never
// deletes anything: the website keeps every submission logged against it (see
// removeBacklinkWebsite), so the confirm copy says so and Restore is one click.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { removeBacklinkWebsite, restoreBacklinkWebsite } from "@/lib/actions/backlinks";

export function RemoveWebsiteButton({ projectId, websiteId, domain }: { projectId: string; websiteId: string; domain: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    const r = await removeBacklinkWebsite({ project_id: projectId, website_id: websiteId });
    setBusy(false);
    if (!r.ok) { toast.error(r.error ?? "Could not remove that website."); return; }
    setOpen(false);
    toast.success(`${domain} removed. Its submissions are kept, and you can restore it from Removed websites.`);
    router.refresh();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Remove ${domain} from this list`}
        aria-label={`Remove ${domain} from this list`}
        className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-error-500/10 hover:text-error-600"
      >
        <Trash2 className="size-3.5" />
      </button>
      <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Remove {domain}?</DialogTitle>
            <DialogDescription>
              It leaves the Backlinks list and the website picker. Every submission already logged for it is kept, and you can bring it back any time from Removed websites. Pasting or adding the same website again restores it too.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={confirm} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RestoreWebsiteButton({ projectId, websiteId, domain }: { projectId: string; websiteId: string; domain: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const restore = async () => {
    if (busy) return;
    setBusy(true);
    const r = await restoreBacklinkWebsite({ project_id: projectId, website_id: websiteId });
    setBusy(false);
    if (!r.ok) { toast.error(r.error ?? "Could not restore that website."); return; }
    toast.success(`${domain} is back on the list with its submissions.`);
    router.refresh();
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={restore} disabled={busy} className="gap-1.5">
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />} Restore
    </Button>
  );
}
