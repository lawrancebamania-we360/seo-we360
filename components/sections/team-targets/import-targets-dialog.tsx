"use client";

// Team Targets: paste the sheet, check who each row belongs to, then save.
// Nothing is written until "Confirm and import". Owner names are matched to
// team members by first name; any row the match could not settle gets an
// empty picker, and a row with no owner chosen is left out of the import
// rather than guessed.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { commitTeamTargetsImport, previewTeamTargetsImport, type PreviewTargetRow } from "@/lib/actions/team-targets";
import type { SkippedLine } from "@/lib/team-targets/parse";
import { safely } from "@/lib/team-targets/safely";
import type { MemberOption } from "@/components/sections/team-targets/target-form-dialog";

const NONE = "__none__";
type View = "paste" | "review";
interface ReviewRow extends PreviewTargetRow { skip: boolean; owner: string; coOwner: string }

// Controlled dialog (always open while mounted) so a parent menu can own it.
export function ImportTargetsDialog({ projectId, members, onClose }: { projectId: string; members: MemberOption[]; onClose: () => void }) {
  const router = useRouter();
  const [view, setView] = useState<View>("paste");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [skipped, setSkipped] = useState<SkippedLine[]>([]);

  const ownerItems = members.map((m) => ({ value: m.id, label: m.name }));
  const coOwnerItems = [{ value: NONE, label: "No co-owner" }, ...ownerItems];

  const reset = () => { setView("paste"); setText(""); setError(null); setRows([]); setSkipped([]); };
  const close = () => { if (!busy) { reset(); onClose(); } };
  const patch = (tempId: string, change: Partial<ReviewRow>) =>
    setRows((prev) => prev.map((r) => (r.tempId === tempId ? { ...r, ...change } : r)));

  const preview = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    const r = await safely(previewTeamTargetsImport({ project_id: projectId, pasted_text: text }));
    setBusy(false);
    setSkipped(r.skipped ?? []);
    if (!r.ok || !r.rows) { setError(r.error ?? "Could not read that paste."); return; }
    setRows(r.rows.map((row) => ({ ...row, skip: false, owner: row.ownerId ?? "", coOwner: row.coOwnerId ?? NONE })));
    setView("review");
  };

  const importable = rows.filter((r) => !r.skip && r.owner);
  const needsOwner = rows.filter((r) => !r.skip && !r.owner).length;

  const confirm = async () => {
    if (!importable.length || busy) return;
    setBusy(true);
    setError(null);
    const r = await safely(commitTeamTargetsImport({
      project_id: projectId,
      rows: importable.map((row) => ({
        task: row.task,
        owner_id: row.owner,
        co_owner_id: row.coOwner === NONE || row.coOwner === row.owner ? null : row.coOwner,
        target: row.target,
        frequency: row.frequency,
      })),
    }));
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Could not import those targets."); return; }
    const parts = [
      r.created ? `${r.created} added` : null,
      r.updated ? `${r.updated} updated` : null,
      r.restored ? `${r.restored} restored` : null,
      r.skipped ? `${r.skipped} skipped` : null,
    ].filter(Boolean);
    toast.success(`Targets imported: ${parts.join(", ") || "nothing changed"}.`);
    reset();
    onClose();
    router.refresh();
  };

  return (
      <Dialog open onOpenChange={(v) => { if (!v) close(); }}>
        <DialogContent className={view === "review" ? "sm:max-w-[920px]" : "sm:max-w-[560px]"}>
          {view === "paste" && (
            <>
              <DialogHeader>
                <DialogTitle>Import targets from your sheet</DialogTitle>
                <DialogDescription>
                  Copy the rows from your sheet and paste them here. Columns: Task, Owner, Co-Owner, Target, Frequency. The header row is optional. You review everything before it is saved.
                </DialogDescription>
              </DialogHeader>
              <Textarea
                autoFocus rows={10} value={text} onChange={(e) => setText(e.target.value)}
                placeholder={"Task\tOwner\tCo-Owner\tTarget\tFrequency\nListicles\tLokesh\t\t4\tdaily"}
                className="font-mono text-xs"
              />
              {error && <p className="text-xs text-error-600">{error}</p>}
              {skipped.length > 0 && <SkippedList skipped={skipped} />}
              <DialogFooter>
                <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
                <Button variant="brand" onClick={preview} disabled={!text.trim() || busy} className="gap-1.5">
                  {busy && <Loader2 className="size-3.5 animate-spin" />} Review
                </Button>
              </DialogFooter>
            </>
          )}

          {view === "review" && (
            <>
              <DialogHeader>
                <DialogTitle>Check owners before importing</DialogTitle>
                <DialogDescription>
                  {rows.length} row{rows.length === 1 ? "" : "s"} read. Owners were matched to team members by first name. Fix any that are empty, or skip a row. Nothing is saved until you confirm.
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[380px] overflow-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 text-left font-semibold">Task</th>
                      <th className="px-2 py-2 text-left font-semibold">Owner</th>
                      <th className="px-2 py-2 text-left font-semibold">Co-owner</th>
                      <th className="px-2 py-2 text-left font-semibold">Goal</th>
                      <th className="px-2 py-2 text-left font-semibold">Skip</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {rows.map((row) => (
                      <tr key={row.tempId} className={row.skip ? "opacity-45" : undefined}>
                        <td className="max-w-[240px] px-2 py-1.5">
                          <div className="truncate font-medium text-foreground" title={row.task}>{row.task}</div>
                          {row.exists && <div className="text-[11px] text-muted-foreground">Already exists, will be updated</div>}
                        </td>
                        <td className="w-44 px-2 py-1.5">
                          <Combobox items={ownerItems} value={row.owner} onValueChange={(v) => patch(row.tempId, { owner: v })}
                            placeholder={`Pick (pasted "${row.ownerName}")`} searchPlaceholder="Search people" className="h-7" disabled={row.skip} />
                        </td>
                        <td className="w-40 px-2 py-1.5">
                          <Combobox items={coOwnerItems} value={row.coOwner} onValueChange={(v) => patch(row.tempId, { coOwner: v })}
                            placeholder="No co-owner" searchPlaceholder="Search people" className="h-7" disabled={row.skip} />
                          {row.coOwnerName && !row.coOwnerId && row.coOwner === NONE && (
                            <div className="text-[11px] text-warning-700 dark:text-warning-400">No match for &quot;{row.coOwnerName}&quot;</div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">{row.target.toLocaleString()} {row.frequency}</td>
                        <td className="px-2 py-1.5"><Checkbox checked={row.skip} onCheckedChange={(v) => patch(row.tempId, { skip: !!v })} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {skipped.length > 0 && <SkippedList skipped={skipped} />}
              {needsOwner > 0 && (
                <p className="text-xs text-warning-700 dark:text-warning-400">
                  {needsOwner} row{needsOwner === 1 ? " has" : "s have"} no owner chosen and will be left out.
                </p>
              )}
              {error && <p className="text-xs text-error-600">{error}</p>}
              <DialogFooter className="sm:justify-between">
                <button type="button" onClick={() => { setView("paste"); setError(null); }} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="size-3" /> Back
                </button>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
                  <Button variant="brand" onClick={confirm} disabled={!importable.length || busy} className="gap-1.5">
                    {busy && <Loader2 className="size-3.5 animate-spin" />} Confirm and import {importable.length}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
  );
}

// Thin button wrapper, kept for any direct use.
export function ImportTargetsButton({ projectId, members }: { projectId: string; members: MemberOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <FileUp className="size-3.5" /> Import targets
      </Button>
      {open && <ImportTargetsDialog projectId={projectId} members={members} onClose={() => setOpen(false)} />}
    </>
  );
}

function SkippedList({ skipped }: { skipped: SkippedLine[] }) {
  return (
    <details className="rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer font-medium">{skipped.length} line{skipped.length === 1 ? "" : "s"} could not be read</summary>
      <ul className="mt-1.5 space-y-1">
        {skipped.slice(0, 20).map((s) => (
          <li key={s.line}>Line {s.line}: {s.reason}</li>
        ))}
        {skipped.length > 20 && <li>and {skipped.length - 20} more</li>}
      </ul>
    </details>
  );
}
