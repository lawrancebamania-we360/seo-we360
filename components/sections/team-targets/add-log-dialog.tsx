"use client";

// Team Targets: "+ Add" - log one achievement (a link, or a quantity for the
// count tasks), with a "Bulk import" link inside that pastes many rows and shows
// a review step before saving. Same two-step shape as Backlink Submissions. New
// link logs are handed to the background AI checker.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { safely } from "@/lib/team-targets/safely";
import {
  addTeamTargetLog, commitTeamLogsImport, previewTeamLogsImport,
  type LogTargetOption, type PreviewLogRow,
} from "@/lib/actions/team-targets";
import { dispatchVerify } from "@/components/sections/team-targets/verification-floater";
import type { LoggableTarget } from "@/lib/team-targets/types";

type View = "form" | "paste" | "review";
interface ReviewRow extends PreviewLogRow { skip: boolean }
const todayLocal = () => new Date().toLocaleDateString("en-CA");

export function AddLogDialog({ projectId, targets }: { projectId: string; targets: LoggableTarget[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // single form
  const [targetId, setTargetId] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [link, setLink] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");

  // bulk
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [options, setOptions] = useState<LogTargetOption[]>([]);

  const selected = useMemo(() => targets.find((t) => t.id === targetId), [targets, targetId]);
  const isCount = selected?.logMode === "count";
  const targetItems = targets.map((t) => ({ value: t.id, label: t.ownerName ? `${t.task} - ${t.ownerName}` : t.task }));

  const reset = () => {
    setView("form"); setError(null); setTargetId(""); setDate(todayLocal());
    setLink(""); setQuantity(""); setNote(""); setText(""); setRows([]); setOptions([]);
  };
  const close = () => { if (!busy) { setOpen(false); reset(); } };

  const formValid = targetId && date && (isCount ? /^\d+$/.test(quantity.trim()) && Number(quantity) > 0 : link.trim().length > 0);

  const submitOne = async () => {
    if (!formValid || busy) return;
    setBusy(true); setError(null);
    const r = await safely(addTeamTargetLog({
      project_id: projectId, target_id: targetId, log_date: date,
      link: link.trim() || undefined,
      quantity: isCount ? Number(quantity.trim()) : undefined,
      note: note.trim() || undefined,
    }));
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Could not save that."); return; }
    if (r.checkable && r.logId) dispatchVerify({ projectId, logIds: [r.logId] });
    toast.success(isCount ? "Logged." : "Logged. Checking the link now.");
    setOpen(false); reset(); router.refresh();
  };

  const runPreview = async () => {
    if (!text.trim() || busy) return;
    setBusy(true); setError(null);
    const r = await safely(previewTeamLogsImport({ project_id: projectId, pasted_text: text }));
    setBusy(false);
    if (!r.ok || !r.rows) { setError(r.error ?? "Could not read that paste."); return; }
    setOptions(r.options ?? []);
    setRows(r.rows.map((row) => ({ ...row, skip: false })));
    setView("review");
  };

  const importable = rows.filter((r) => !r.skip && r.targetId);
  const commit = async () => {
    if (!importable.length || busy) return;
    setBusy(true); setError(null);
    const r = await safely(commitTeamLogsImport({
      project_id: projectId,
      rows: importable.map((row) => ({ target_id: row.targetId!, log_date: row.date, link: row.link, note: row.note || undefined })),
    }));
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Could not import those."); return; }
    if (r.logIds?.length) dispatchVerify({ projectId, logIds: r.logIds });
    toast.success(`Imported ${r.created ?? 0}${r.skipped ? `, ${r.skipped} skipped` : ""}. Checking links now.`);
    setOpen(false); reset(); router.refresh();
  };

  const patch = (tempId: string, change: Partial<ReviewRow>) => setRows((p) => p.map((r) => (r.tempId === tempId ? { ...r, ...change } : r)));

  return (
    <>
      <Button size="sm" variant="brand" className="gap-1.5" onClick={() => setOpen(true)} disabled={!targets.length}>
        <Plus className="size-3.5" /> Add
      </Button>
      <Dialog open={open} onOpenChange={(v) => { if (!v) close(); else setOpen(true); }}>
        <DialogContent className={view === "review" ? "sm:max-w-[760px]" : "sm:max-w-[460px]"}>
          {view === "form" && (
            <>
              <DialogHeader>
                <DialogTitle>Log what you did</DialogTitle>
                <DialogDescription>Pick the task and paste the link to your work. It gets an AI check automatically.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <Field label="Task">
                  <Combobox items={targetItems} value={targetId} onValueChange={(v) => { setTargetId(v); setError(null); }} placeholder="Pick a task" searchPlaceholder="Search tasks" className="h-9 w-full" />
                </Field>
                <Field label="Date">
                  <Input type="date" max={todayLocal()} value={date} onChange={(e) => setDate(e.target.value)} className="h-9" />
                </Field>
                {isCount ? (
                  <>
                    <Field label="How many">
                      <Input type="number" inputMode="numeric" min={1} step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="e.g. 120" className="h-9" />
                    </Field>
                    <Field label="Proof link (optional)">
                      <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Sheet or folder link" className="h-9" />
                    </Field>
                  </>
                ) : (
                  <Field label="Link">
                    <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." className="h-9" autoFocus />
                  </Field>
                )}
                <Field label="Note (optional)">
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} />
                </Field>
                {isCount && <p className="text-[11px] text-muted-foreground">Counts can&apos;t be checked by AI, so the owner verifies this one.</p>}
                {error && <p className="text-xs text-error-600">{error}</p>}
              </div>
              <DialogFooter className="sm:justify-between">
                <button type="button" onClick={() => { setView("paste"); setError(null); }} className="text-xs font-medium text-muted-foreground hover:text-foreground">Bulk import</button>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
                  <Button variant="brand" onClick={submitOne} disabled={!formValid || busy} className="gap-1.5">
                    {busy && <Loader2 className="size-3.5 animate-spin" />} Log
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}

          {view === "paste" && (
            <>
              <DialogHeader>
                <DialogTitle>Bulk import</DialogTitle>
                <DialogDescription>Paste rows from your sheet. Columns: Task, Date, Link, Note. The header row is optional. You review before anything is saved.</DialogDescription>
              </DialogHeader>
              <Textarea autoFocus rows={10} value={text} onChange={(e) => setText(e.target.value)}
                placeholder={"Task\tDate\tLink\tNote\nListicles\t19-10-2026\thttps://...\t"} className="font-mono text-xs" />
              {error && <p className="text-xs text-error-600">{error}</p>}
              <DialogFooter className="sm:justify-between">
                <button type="button" onClick={() => { setView("form"); setError(null); }} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3" /> Back</button>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
                  <Button variant="brand" onClick={runPreview} disabled={!text.trim() || busy} className="gap-1.5">{busy && <Loader2 className="size-3.5 animate-spin" />} Review</Button>
                </div>
              </DialogFooter>
            </>
          )}

          {view === "review" && (
            <>
              <DialogHeader>
                <DialogTitle>Check each row before importing</DialogTitle>
                <DialogDescription>{rows.length} row{rows.length === 1 ? "" : "s"} read. Confirm the task for each; a row with no task is left out.</DialogDescription>
              </DialogHeader>
              <div className="max-h-[380px] overflow-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 text-left font-semibold">Task</th>
                      <th className="px-2 py-2 text-left font-semibold">Date</th>
                      <th className="px-2 py-2 text-left font-semibold">Link</th>
                      <th className="px-2 py-2 text-left font-semibold">Skip</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {rows.map((row) => (
                      <tr key={row.tempId} className={row.skip ? "opacity-45" : undefined}>
                        <td className="w-56 px-2 py-1.5">
                          <Combobox items={options} value={row.targetId ?? ""} onValueChange={(v) => patch(row.tempId, { targetId: v })} placeholder={`Pick (pasted "${row.taskText}")`} searchPlaceholder="Search tasks" className="h-7" disabled={row.skip} />
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{row.date}</td>
                        <td className="max-w-[200px] truncate px-2 py-1.5 text-muted-foreground" title={row.link}>{row.link}</td>
                        <td className="px-2 py-1.5"><Checkbox checked={row.skip} onCheckedChange={(v) => patch(row.tempId, { skip: !!v })} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {error && <p className="text-xs text-error-600">{error}</p>}
              <DialogFooter className="sm:justify-between">
                <button type="button" onClick={() => { setView("paste"); setError(null); }} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3" /> Back</button>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
                  <Button variant="brand" onClick={commit} disabled={!importable.length || busy} className="gap-1.5">{busy && <Loader2 className="size-3.5 animate-spin" />} Import {importable.length}</Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
