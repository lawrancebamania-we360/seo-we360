"use client";

// Influencer Collabs: the single entry point - same form/paste/review
// three-view shape as Backlink Submissions' AddSubmissionButton / Earned
// Backlinks' AddEarnedBacklinkButton. Field order (Influencer Name, Platform,
// Profile Link, Date of Closing, Post Date, Amount Paid, Post Link, Assignee)
// is a deliberate call: closing the deal logically precedes the content
// going live, so Date of Closing sits before Post Date even though the
// user's own verbatim list had them the other way around.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { addInfluencerCollab, previewInfluencerCollabsImport, commitInfluencerCollabsImport } from "@/lib/actions/influencer-collabs";
import type { Member } from "@/components/sections/assignee-picker";

const UNASSIGNED = "__unassigned__";
const PLATFORM_ITEMS = ["YouTube", "Instagram", "Facebook", "Twitter", "LinkedIn"].map((p) => ({ value: p, label: p }));
const CURRENCY_ITEMS = [{ value: "INR", label: "INR" }, { value: "USD", label: "USD" }];
const today = (): string => new Date().toISOString().slice(0, 10);

type ParsedRow = {
  tempId: string; influencer_name: string; profile_link: string; platform: string; post_date: string;
  closing_date: string; amount_paid: string; currency: string; is_free: string; post_link: string;
};
type View = "form" | "paste" | "review";

export function AddInfluencerCollabButton({ projectId, members }: { projectId: string; members: Member[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("form");

  // Single-entry form state
  const [influencerName, setInfluencerName] = useState("");
  const [platform, setPlatform] = useState("YouTube");
  const [profileLink, setProfileLink] = useState("");
  const [closingDate, setClosingDate] = useState(today());
  const [postDate, setPostDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"USD" | "INR">("INR");
  const [isFree, setIsFree] = useState(false);
  const [postLink, setPostLink] = useState("");
  const [assignedTo, setAssignedTo] = useState(UNASSIGNED);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bulk paste + review state
  const [pastedText, setPastedText] = useState("");
  const [pasteBusy, setPasteBusy] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [rowAssignments, setRowAssignments] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAssignTarget, setBulkAssignTarget] = useState(UNASSIGNED);
  const [commitBusy, setCommitBusy] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  const memberItems = [{ value: UNASSIGNED, label: "Unassigned" }, ...members.map((m) => ({ value: m.id, label: m.name }))];

  const reset = () => {
    setView("form");
    setInfluencerName(""); setPlatform("YouTube"); setProfileLink("");
    setClosingDate(today()); setPostDate(today());
    setAmount(""); setCurrency("INR"); setIsFree(false);
    setPostLink(""); setAssignedTo(UNASSIGNED);
    setError(null);
    setPastedText(""); setPasteError(null);
    setRows([]); setRowAssignments({}); setSelected(new Set());
    setBulkAssignTarget(UNASSIGNED); setCommitError(null);
  };

  const submitSingle = async () => {
    if (!influencerName.trim() || !profileLink.trim() || busy) return;
    setBusy(true);
    setError(null);
    const r = await addInfluencerCollab({
      project_id: projectId,
      influencer_name: influencerName.trim(),
      profile_link: profileLink.trim(),
      platform: platform as "YouTube" | "Instagram" | "Facebook" | "Twitter" | "LinkedIn",
      post_date: postDate,
      closing_date: closingDate || undefined,
      is_free: isFree,
      amount_paid: isFree ? undefined : (amount.trim() || undefined),
      currency,
      post_link: postLink.trim() || undefined,
      assigned_to: assignedTo === UNASSIGNED ? null : assignedTo,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Could not add that collab."); return; }
    toast.success("Collab added.");
    setOpen(false);
    reset();
    router.refresh();
  };

  const runPreview = async () => {
    if (!pastedText.trim() || pasteBusy) return;
    setPasteBusy(true);
    setPasteError(null);
    const r = await previewInfluencerCollabsImport({ pasted_text: pastedText });
    setPasteBusy(false);
    if (!r.ok || !r.rows) { setPasteError(r.error ?? "Could not read that paste."); return; }
    setRows(r.rows);
    setRowAssignments(Object.fromEntries(r.rows.map((row) => [row.tempId, UNASSIGNED])));
    setSelected(new Set());
    setView("review");
  };

  const toggleSelected = (tempId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tempId)) next.delete(tempId); else next.add(tempId);
      return next;
    });
  };

  const applyBulkAssign = (target: string = bulkAssignTarget) => {
    if (!selected.size) return;
    setRowAssignments((prev) => {
      const next = { ...prev };
      for (const id of selected) next[id] = target;
      return next;
    });
  };

  const pickBulkTarget = (v: string) => {
    setBulkAssignTarget(v);
    applyBulkAssign(v);
  };

  const confirmImport = async () => {
    if (!rows.length || commitBusy) return;
    setCommitBusy(true);
    setCommitError(null);
    const r = await commitInfluencerCollabsImport({
      project_id: projectId,
      rows: rows.map((row) => ({
        influencer_name: row.influencer_name,
        profile_link: row.profile_link,
        platform: row.platform,
        post_date: row.post_date,
        closing_date: row.closing_date,
        amount_paid: row.amount_paid,
        currency: row.currency,
        is_free: row.is_free,
        post_link: row.post_link,
        assigned_to: rowAssignments[row.tempId] === UNASSIGNED ? null : (rowAssignments[row.tempId] ?? null),
      })),
    });
    setCommitBusy(false);
    if (!r.ok) { setCommitError(r.error ?? "Could not import that batch."); return; }
    const skippedNote = r.itemsSkipped ? ` (${r.itemsSkipped} row${r.itemsSkipped === 1 ? "" : "s"} skipped)` : "";
    toast.success(`Imported ${r.itemsCreated ?? 0} collab${(r.itemsCreated ?? 0) === 1 ? "" : "s"}${skippedNote}.`);
    setOpen(false);
    reset();
    router.refresh();
  };

  return (
    <>
      <Button size="sm" variant="brand" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> Add collab
      </Button>
      <Dialog open={open} onOpenChange={(v) => { if (!busy && !pasteBusy && !commitBusy) { setOpen(v); if (!v) reset(); } }}>
        <DialogContent className={view === "review" ? "sm:max-w-[800px]" : "sm:max-w-[480px]"}>
          {view === "form" && (
            <>
              <DialogHeader>
                <DialogTitle>Add a collab</DialogTitle>
                <DialogDescription>For logging one influencer collab at a time instead of pasting a batch.</DialogDescription>
              </DialogHeader>
              <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="ic-name">Influencer name</label>
                  <Input id="ic-name" value={influencerName} onChange={(e) => setInfluencerName(e.target.value)} placeholder="Jane Doe" className="h-9" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="ic-platform">Platform</label>
                  <Combobox id="ic-platform" items={PLATFORM_ITEMS} value={platform} onValueChange={setPlatform} placeholder="Pick a platform" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="ic-profile">Profile link</label>
                  <Input id="ic-profile" value={profileLink} onChange={(e) => setProfileLink(e.target.value)} placeholder="https://..." className="h-9" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="ic-closing">Date of closing</label>
                  <Input id="ic-closing" type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} className="h-9" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="ic-post-date">Post date</label>
                  <Input id="ic-post-date" type="date" value={postDate} onChange={(e) => setPostDate(e.target.value)} className="h-9" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="ic-amount">Amount paid (optional)</label>
                  <div className="flex items-center gap-1.5">
                    <Input
                      id="ic-amount"
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
                    This was a free collab
                  </label>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="ic-post-link">Post link (optional)</label>
                  <Input id="ic-post-link" value={postLink} onChange={(e) => setPostLink(e.target.value)} placeholder="https://... (if already live)" className="h-9" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="ic-assignee">Assign to (optional)</label>
                  <Combobox id="ic-assignee" items={memberItems} value={assignedTo} onValueChange={setAssignedTo} placeholder="Unassigned" />
                </div>
                {error && <p className="text-xs text-error-600">{error}</p>}
              </div>
              <DialogFooter className="sm:justify-between">
                <Button type="button" variant="outline" size="sm" onClick={() => setView("paste")}>
                  Bulk import instead
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
                  <Button variant="brand" onClick={submitSingle} disabled={busy || !influencerName.trim() || !profileLink.trim()} className="gap-1.5">
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Add
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}

          {view === "paste" && (
            <>
              <DialogHeader>
                <DialogTitle>Paste collabs from your tracking sheet</DialogTitle>
                <DialogDescription>
                  Select the header row + every data row in your sheet, copy, and paste below. Columns are matched by name, so order doesn&apos;t matter. Expected columns: Influencer Name, Profile Link, Platform, Post Date, Date of Closing, Amount Paid, Currency, Free, Post Link (Amount/Currency/Free are optional - leave Free blank unless the collab didn&apos;t cost anything).
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={"Influencer Name\tProfile Link\tPlatform\tPost Date\tDate of Closing\tAmount Paid\tCurrency\tFree\tPost Link"}
                  className="h-64 w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-[11px] leading-relaxed outline-none focus:border-primary/40"
                />
                {pasteError && <p className="text-xs text-error-600">{pasteError}</p>}
              </div>
              <DialogFooter className="sm:justify-between">
                <button type="button" onClick={() => setView("form")} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="size-3" /> Back
                </button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={pasteBusy}>Cancel</Button>
                  <Button variant="brand" onClick={runPreview} disabled={pasteBusy || !pastedText.trim()} className="gap-1.5">
                    {pasteBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Import
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}

          {view === "review" && (
            <>
              <DialogHeader>
                <DialogTitle>Assign before importing</DialogTitle>
                <DialogDescription>{rows.length} collab{rows.length === 1 ? "" : "s"} parsed - assign each one, or select several and assign them to one person at once. Nothing is saved until you confirm.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2">
                  <span className="text-xs font-medium text-muted-foreground">{selected.size} selected</span>
                  <Combobox items={memberItems} value={bulkAssignTarget} onValueChange={pickBulkTarget} placeholder="Unassigned" className="h-7 w-44" />
                  <Button type="button" size="sm" variant="outline" disabled={!selected.size} onClick={() => applyBulkAssign()} title="Re-apply the picked name to whatever's currently checked">
                    Apply to selected
                  </Button>
                </div>
                <div className="max-h-[360px] overflow-y-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="w-8 px-2 py-2">
                          <Checkbox
                            checked={rows.length > 0 && selected.size === rows.length}
                            onCheckedChange={(v) => setSelected(v ? new Set(rows.map((r) => r.tempId)) : new Set())}
                          />
                        </th>
                        <th className="px-2 py-2 text-left font-semibold">Influencer</th>
                        <th className="px-2 py-2 text-left font-semibold">Platform</th>
                        <th className="px-2 py-2 text-left font-semibold">Post date</th>
                        <th className="px-2 py-2 text-left font-semibold">Assign</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {rows.map((row) => (
                        <tr key={row.tempId}>
                          <td className="px-2 py-1.5"><Checkbox checked={selected.has(row.tempId)} onCheckedChange={() => toggleSelected(row.tempId)} /></td>
                          <td className="max-w-[140px] truncate px-2 py-1.5 font-medium text-foreground" title={row.influencer_name}>{row.influencer_name}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{row.platform}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{row.post_date}</td>
                          <td className="px-2 py-1.5">
                            <Combobox
                              items={memberItems}
                              value={rowAssignments[row.tempId] ?? UNASSIGNED}
                              onValueChange={(v) => setRowAssignments((prev) => ({ ...prev, [row.tempId]: v }))}
                              placeholder="Unassigned"
                              className="h-7"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {commitError && <p className="text-xs text-error-600">{commitError}</p>}
              </div>
              <DialogFooter className="sm:justify-between">
                <button type="button" onClick={() => setView("paste")} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="size-3" /> Back
                </button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={commitBusy}>Cancel</Button>
                  <Button variant="brand" onClick={confirmImport} disabled={commitBusy} className="gap-1.5">
                    {commitBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Confirm &amp; import
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
