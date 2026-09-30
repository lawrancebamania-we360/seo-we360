"use client";

// Backlinks (Tickets 31-36): the single entry point - "+ Add submission"
// replaces the old 3-button header (Add platform / Add submission / New
// submissions). One form for a single submission (with an inline "+ Add new
// platform" escape hatch in the Website dropdown, folding in what the old
// standalone button did), a "Bulk import" link next to Cancel for pasting a
// batch, and paste is two steps: parse-only preview, then a review screen
// where every parsed row gets assigned to someone (individually, or select
// several and assign them to one person at once) before anything is saved.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addBacklinkSubmission, addBacklinkWebsite, previewBacklinksImport, commitBacklinksImport } from "@/lib/actions/backlinks";
import type { Member } from "@/components/sections/assignee-picker";

const UNASSIGNED = "__unassigned__";
const ADD_NEW = "__add_new__";
const today = (): string => new Date().toISOString().slice(0, 10);

type Website = { id: string; domain: string };
type ParsedRow = { tempId: string; website: string; submission_date: string; submission_url: string; blog_post: string; topic_name: string };
type View = "form" | "paste" | "review";

export function AddSubmissionButton({ projectId, websites, members, defaultWebsiteId }: {
  projectId: string;
  websites: Website[];
  members: Member[];
  defaultWebsiteId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("form");
  const [localWebsites, setLocalWebsites] = useState<Website[]>(websites);

  // Single-submission form state
  const [websiteId, setWebsiteId] = useState(defaultWebsiteId ?? "");
  const [addingPlatform, setAddingPlatform] = useState(false);
  const [newPlatformName, setNewPlatformName] = useState("");
  const [platformBusy, setPlatformBusy] = useState(false);
  const [date, setDate] = useState(today());
  const [link, setLink] = useState("");
  const [blogPost, setBlogPost] = useState("");
  const [topic, setTopic] = useState("");
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

  const reset = () => {
    setView("form");
    setWebsiteId(defaultWebsiteId ?? "");
    setAddingPlatform(false); setNewPlatformName("");
    setDate(today()); setLink(""); setBlogPost(""); setTopic(""); setAssignedTo(UNASSIGNED);
    setError(null);
    setPastedText(""); setPasteError(null);
    setRows([]); setRowAssignments({}); setSelected(new Set());
    setBulkAssignTarget(UNASSIGNED); setCommitError(null);
  };

  const createPlatform = async () => {
    if (!newPlatformName.trim() || platformBusy) return;
    setPlatformBusy(true);
    const r = await addBacklinkWebsite({ project_id: projectId, name: newPlatformName.trim() });
    setPlatformBusy(false);
    if (!r.ok || !r.id) { toast.error(r.error ?? "Could not add that platform."); return; }
    if (!localWebsites.some((w) => w.id === r.id)) {
      setLocalWebsites((prev) => [...prev, { id: r.id!, domain: r.domain ?? newPlatformName.trim() }]);
    }
    setWebsiteId(r.id);
    setAddingPlatform(false);
    setNewPlatformName("");
    toast.success(`${r.domain} added.`);
  };

  const submitSingle = async () => {
    if (!websiteId || !link.trim() || busy) return;
    setBusy(true);
    setError(null);
    const r = await addBacklinkSubmission({
      project_id: projectId,
      website_id: websiteId,
      submission_date: date,
      submission_url: link.trim(),
      blog_post: blogPost.trim() || undefined,
      topic_name: topic.trim() || undefined,
      assigned_to: assignedTo === UNASSIGNED ? null : assignedTo,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Could not add that submission."); return; }
    toast.success("Submission added.");
    setOpen(false);
    reset();
    router.refresh();
  };

  const runPreview = async () => {
    if (!pastedText.trim() || pasteBusy) return;
    setPasteBusy(true);
    setPasteError(null);
    const r = await previewBacklinksImport({ project_id: projectId, pasted_text: pastedText });
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

  const applyBulkAssign = () => {
    if (!selected.size) return;
    setRowAssignments((prev) => {
      const next = { ...prev };
      for (const id of selected) next[id] = bulkAssignTarget;
      return next;
    });
  };

  const confirmImport = async () => {
    if (!rows.length || commitBusy) return;
    setCommitBusy(true);
    setCommitError(null);
    const r = await commitBacklinksImport({
      project_id: projectId,
      rows: rows.map((row) => ({
        website: row.website,
        submission_date: row.submission_date,
        submission_url: row.submission_url,
        blog_post: row.blog_post,
        topic_name: row.topic_name,
        assigned_to: rowAssignments[row.tempId] === UNASSIGNED ? null : (rowAssignments[row.tempId] ?? null),
      })),
    });
    setCommitBusy(false);
    if (!r.ok) { setCommitError(r.error ?? "Could not import that batch."); return; }
    const skippedNote = r.itemsSkipped ? ` (${r.itemsSkipped} row${r.itemsSkipped === 1 ? "" : "s"} skipped)` : "";
    const websitesNote = r.websitesCreated ? ` across ${r.websitesCreated} new website${r.websitesCreated === 1 ? "" : "s"}` : "";
    toast.success(`Imported ${r.itemsCreated ?? 0} submission${(r.itemsCreated ?? 0) === 1 ? "" : "s"}${websitesNote}${skippedNote}.`);
    setOpen(false);
    reset();
    router.refresh();
  };

  const memberName = (id: string): string => (id === UNASSIGNED ? "Unassigned" : members.find((m) => m.id === id)?.name ?? "Unassigned");

  return (
    <>
      <Button size="sm" variant="brand" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> Add submission
      </Button>
      <Dialog open={open} onOpenChange={(v) => { if (!busy && !pasteBusy && !commitBusy) { setOpen(v); if (!v) reset(); } }}>
        <DialogContent className={view === "review" ? "sm:max-w-[760px]" : "sm:max-w-[480px]"}>
          {view === "form" && (
            <>
              <DialogHeader>
                <DialogTitle>Add a submission</DialogTitle>
                <DialogDescription>For logging one submission at a time instead of pasting a batch.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="add-submission-website">Website</label>
                  {addingPlatform ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        autoFocus
                        value={newPlatformName}
                        onChange={(e) => setNewPlatformName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createPlatform(); } if (e.key === "Escape") setAddingPlatform(false); }}
                        placeholder="Platform name"
                        className="h-9"
                      />
                      <Button type="button" size="sm" variant="brand" disabled={platformBusy || !newPlatformName.trim()} onClick={createPlatform}>
                        {platformBusy ? <Loader2 className="size-3.5 animate-spin" /> : "Add"}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setAddingPlatform(false)} disabled={platformBusy}>Cancel</Button>
                    </div>
                  ) : (
                    <Select value={websiteId} onValueChange={(v) => { if (v === ADD_NEW) setAddingPlatform(true); else if (v) setWebsiteId(v); }}>
                      <SelectTrigger id="add-submission-website" className="h-9 w-full"><SelectValue placeholder="Pick a platform" /></SelectTrigger>
                      <SelectContent>
                        {localWebsites.map((w) => <SelectItem key={w.id} value={w.id}>{w.domain}</SelectItem>)}
                        <SelectItem value={ADD_NEW}>+ Add new platform</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="add-submission-date">Submission date</label>
                  <Input id="add-submission-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="add-submission-link">Submission link</label>
                  <Input id="add-submission-link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." className="h-9" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="add-submission-blog">Blog post (optional)</label>
                  <Input id="add-submission-blog" value={blogPost} onChange={(e) => setBlogPost(e.target.value)} placeholder="Matched against your sitemap, same as pasting" className="h-9" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="add-submission-topic">Topic (optional)</label>
                  <Input id="add-submission-topic" value={topic} onChange={(e) => setTopic(e.target.value)} className="h-9" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="add-submission-assignee">Assign to (optional)</label>
                  <Select value={assignedTo} onValueChange={(v) => v && setAssignedTo(v)}>
                    <SelectTrigger id="add-submission-assignee" className="h-9 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                      {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {error && <p className="text-xs text-error-600">{error}</p>}
              </div>
              <DialogFooter className="sm:justify-between">
                <button type="button" onClick={() => setView("paste")} className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                  Bulk import instead
                </button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
                  <Button variant="brand" onClick={submitSingle} disabled={busy || !websiteId || !link.trim()} className="gap-1.5">
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Add
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}

          {view === "paste" && (
            <>
              <DialogHeader>
                <DialogTitle>Paste submissions from your tracking sheet</DialogTitle>
                <DialogDescription>
                  Select the header row + every data row in your sheet, copy, and paste below. Columns are matched by name, so order doesn&apos;t matter. Expected columns: Website, Submission Date, Submission Link, Blog Post, Topic.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={"Website\tSubmission Date\tSubmission Link\tBlog Post\tTopic"}
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
                <DialogDescription>{rows.length} submission{rows.length === 1 ? "" : "s"} parsed - assign each one, or select several and assign them to one person at once. Nothing is saved until you confirm.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2">
                  <span className="text-xs font-medium text-muted-foreground">{selected.size} selected</span>
                  <Select value={bulkAssignTarget} onValueChange={(v) => v && setBulkAssignTarget(v)}>
                    <SelectTrigger className="h-7"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                      {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button type="button" size="sm" variant="outline" disabled={!selected.size} onClick={applyBulkAssign}>Apply to selected</Button>
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
                        <th className="px-2 py-2 text-left font-semibold">Website</th>
                        <th className="px-2 py-2 text-left font-semibold">Date</th>
                        <th className="px-2 py-2 text-left font-semibold">Link</th>
                        <th className="px-2 py-2 text-left font-semibold">Assign</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {rows.map((row) => (
                        <tr key={row.tempId}>
                          <td className="px-2 py-1.5"><Checkbox checked={selected.has(row.tempId)} onCheckedChange={() => toggleSelected(row.tempId)} /></td>
                          <td className="max-w-[110px] truncate px-2 py-1.5 font-medium text-foreground" title={row.website}>{row.website}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{row.submission_date}</td>
                          <td className="max-w-[160px] truncate px-2 py-1.5 text-muted-foreground" title={row.submission_url}>{row.submission_url}</td>
                          <td className="px-2 py-1.5">
                            <Select value={rowAssignments[row.tempId] ?? UNASSIGNED} onValueChange={(v) => v && setRowAssignments((prev) => ({ ...prev, [row.tempId]: v }))}>
                              <SelectTrigger className="h-7 w-full"><SelectValue>{memberName(rowAssignments[row.tempId] ?? UNASSIGNED)}</SelectValue></SelectTrigger>
                              <SelectContent>
                                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                                {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
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
