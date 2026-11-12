"use client";

// Executive dashboard: admin control to record DR / Traffic points by hand.
// DR is Ahrefs data the team reads off a dashboard; targets are leadership's
// goals. Append-only: each reading is a new row, so the charts draw a real
// trajectory. Delete removes a mistake (there is no edit). Admins only.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { addMetricPoint, deleteMetricPoint } from "@/lib/actions/metric-points";
import type { MetricPoint } from "@/lib/data/executive";

type Metric = "dr" | "traffic";
type Kind = "actual" | "target";

const todayIso = () => new Date().toISOString().slice(0, 10);

interface Listed extends MetricPoint { metric: Metric; kind: Kind }

export function MetricEditor({
  projectId, points,
}: {
  projectId: string;
  points: Listed[]; // every recorded point, for the delete list
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [metric, setMetric] = useState<Metric>("dr");
  const [kind, setKind] = useState<Kind>("actual");
  const [value, setValue] = useState("");
  const [asOf, setAsOf] = useState(todayIso());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const close = () => { if (!saving) setOpen(false); };

  // Traffic actuals come from Google Analytics automatically; only its goal is typed in.
  const effectiveKind: Kind = metric === "traffic" ? "target" : kind;

  const save = async () => {
    const v = parseFloat(value);
    if (!Number.isFinite(v)) { toast.error("Enter a number."); return; }
    setSaving(true);
    try {
      const r = await addMetricPoint({ project_id: projectId, metric, kind: effectiveKind, value: v, as_of: asOf, note: note.trim() || undefined });
      if (!r.ok) { toast.error(r.error ?? "Could not save."); return; }
      toast.success(`${metric === "dr" ? "DR" : "Traffic"} ${effectiveKind} recorded.`);
      setValue(""); setNote("");
      router.refresh();
    } catch { toast.error("Something went wrong."); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    setDeleting(id);
    try {
      const r = await deleteMetricPoint({ project_id: projectId, id });
      if (!r.ok) { toast.error(r.error ?? "Could not delete."); return; }
      toast.success("Point removed.");
      router.refresh();
    } catch { toast.error("Something went wrong."); }
    finally { setDeleting(null); }
  };

  const label = (p: Listed) =>
    `${p.metric === "dr" ? "DR" : "Traffic"} ${p.kind} · ${p.value.toLocaleString()} · ${p.date}`;

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="size-3.5" /> DR / Traffic
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Record a DR or Traffic point</DialogTitle>
            <DialogDescription>
              DR is Ahrefs data, entered by hand: add an <strong>actual</strong> each time you read a new value, and a{" "}
              <strong>target</strong> with its deadline date. Traffic actuals come from Google Analytics automatically — only its target is entered here.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Metric</Label>
              <Combobox
                items={[{ value: "dr", label: "Domain Rating" }, { value: "traffic", label: "Traffic (GA4)" }]}
                value={metric} onValueChange={(v) => setMetric(v as Metric)} className="h-9 w-full"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Combobox
                items={[{ value: "actual", label: "Actual (measured)" }, { value: "target", label: "Target (goal)" }]}
                value={effectiveKind} onValueChange={(v) => setKind(v as Kind)} disabled={metric === "traffic"} className="h-9 w-full"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{metric === "dr" ? "DR (0–100)" : "Monthly sessions"}</Label>
              <Input type="number" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)}
                placeholder={metric === "dr" ? "43" : "25000"} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{effectiveKind === "target" ? "Deadline" : "As of"}</Label>
              <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="h-9" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">Note (optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. after link push" className="h-9" />
            </div>
          </div>

          {points.length > 0 && (
            <div className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-border">
              <div className="border-b border-border bg-muted/40 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recorded points
              </div>
              <ul className="divide-y divide-border/60">
                {points.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[12.5px]">
                    <span className="min-w-0 truncate text-slate-600 dark:text-foreground/80" title={p.note ?? undefined}>{label(p)}</span>
                    <button type="button" onClick={() => remove(p.id)} disabled={deleting === p.id}
                      className="shrink-0 text-muted-foreground hover:text-error-strong disabled:opacity-50" aria-label="Delete point">
                      {deleting === p.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close} disabled={saving}>Done</Button>
            <Button type="button" variant="brand" className="gap-1.5" onClick={save} disabled={saving || !value}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Add point
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
