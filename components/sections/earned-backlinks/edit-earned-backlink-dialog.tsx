"use client";

// Edit one earned backlink. Opened from the row's pencil button in
// EarnedBacklinkActions, which mounts this only while editing - so useState
// seeds fresh from the row each time and no re-seeding effect is needed.
// Same single-entry fields as the Add form (website / date / DR / link /
// cost / assignee), pre-filled from the row.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { updateEarnedBacklink } from "@/lib/actions/earned-backlinks";
import type { EarnedBacklinkRow } from "@/lib/data/earned-backlinks";
import type { Member } from "@/components/sections/assignee-picker";

const UNASSIGNED = "__unassigned__";
const CURRENCY_ITEMS = [{ value: "USD", label: "USD" }, { value: "INR", label: "INR" }];

export function EditEarnedBacklinkDialog({ open, onOpenChange, projectId, backlink, members }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  backlink: EarnedBacklinkRow;
  members: Member[];
}) {
  const router = useRouter();
  const [website, setWebsite] = useState(backlink.website);
  const [date, setDate] = useState(backlink.acquiredDate);
  const [dr, setDr] = useState(backlink.domainRating == null ? "" : String(backlink.domainRating));
  const [link, setLink] = useState(backlink.backlinkUrl);
  const [assignedTo, setAssignedTo] = useState(backlink.assignedTo ?? UNASSIGNED);
  const [amount, setAmount] = useState(backlink.amountPaid == null ? "" : String(backlink.amountPaid));
  const [currency, setCurrency] = useState<"USD" | "INR">(backlink.currency);
  const [isFree, setIsFree] = useState(backlink.isFree);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const memberItems = [{ value: UNASSIGNED, label: "Unassigned" }, ...members.map((m) => ({ value: m.id, label: m.name }))];

  const save = async () => {
    if (!website.trim() || !link.trim() || busy) return;
    setBusy(true);
    setError(null);
    const r = await updateEarnedBacklink({
      project_id: projectId,
      backlink_id: backlink.id,
      website: website.trim(),
      acquired_date: date,
      domain_rating: dr.trim() || undefined,
      backlink_url: link.trim(),
      assigned_to: assignedTo === UNASSIGNED ? null : assignedTo,
      is_free: isFree,
      amount_paid: isFree ? undefined : (amount.trim() || undefined),
      currency,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Could not save your changes."); return; }
    toast.success("Backlink updated.");
    onOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit backlink</DialogTitle>
          <DialogDescription>Update any detail of this logged backlink.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="eb-edit-website">Website</label>
            <Input id="eb-edit-website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="techcrunch.com" className="h-9" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="eb-edit-date">Date</label>
            <Input id="eb-edit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="eb-edit-dr">DR (optional)</label>
            <Input id="eb-edit-dr" type="number" min={0} max={100} value={dr} onChange={(e) => setDr(e.target.value)} placeholder="0-100" className="h-9" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="eb-edit-link">Backlink link</label>
            <Input id="eb-edit-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." className="h-9" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="eb-edit-amount">Amount paid (optional)</label>
            <div className="flex items-center gap-1.5">
              <Input
                id="eb-edit-amount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                disabled={isFree}
                className="h-9"
              />
              <Combobox
                items={CURRENCY_ITEMS}
                value={currency}
                onValueChange={(v) => setCurrency(v as "USD" | "INR")}
                disabled={isFree}
                className="h-9 w-24 shrink-0"
              />
            </div>
            <label className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox checked={isFree} onCheckedChange={(v) => { setIsFree(!!v); if (v) setAmount(""); }} />
              This was a free backlink
            </label>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="eb-edit-assignee">Assign to (optional)</label>
            <Combobox
              id="eb-edit-assignee"
              items={memberItems}
              value={assignedTo}
              onValueChange={setAssignedTo}
              placeholder="Unassigned"
              className="h-9 w-full"
            />
          </div>
          {error && <p className="text-xs text-error-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="brand" onClick={save} disabled={busy || !website.trim() || !link.trim()} className="gap-1.5">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
