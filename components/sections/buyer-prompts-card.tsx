"use client";

// Shared "Your buyer prompts" card - used by both the Setup drawer (SetupTab)
// and the run-test modal's "Set up Personas" step, so edit/add work
// identically in both places instead of drifting apart. Lets a manager:
//   - regenerate / run the check (buttons passed in as callbacks so each
//     caller keeps its own busy/label semantics)
//   - add a hand-typed question, tagged with a persona + topic so it groups
//     and reports correctly instead of landing in "Other" untagged
//   - edit an existing question's text/persona/topic inline (pencil icon)

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Play, Plus, Check, X, Pencil, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { PersonaRow } from "@/lib/data/personas";
import type { PromptRow } from "@/components/sections/ai-visibility-client";

const DEMAND_TONE: Record<string, string> = {
  high: "border-success-300 text-success-700",
  medium: "border-warning-300 text-warning-700",
  low: "border-muted-foreground/30 text-muted-foreground",
};

// Same vocabulary the AI generator's INTENT_BUCKETS uses (lib/ai-citation/
// prompts.ts) plus "reputation" (the separate branded-reputation check) -
// keeps manual/edited prompts in the same topic breakdowns as generated ones.
const TOPIC_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "best-of", label: "Best-of" },
  { value: "comparison", label: "Comparison" },
  { value: "alternatives", label: "Alternatives" },
  { value: "use-case", label: "Use-case" },
  { value: "integration", label: "Integration" },
  { value: "vertical", label: "Vertical / segment" },
  { value: "pricing-roi", label: "Pricing / ROI" },
  { value: "reputation", label: "Reputation" },
];

type PromptFields = { text: string; persona: string; topic: string };
type ActionResult = { ok: boolean; error?: string };

function PersonaSelect({ value, onChange, personas, id }: { value: string; onChange: (v: string) => void; personas: PersonaRow[]; id: string }) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      <option value="">Other / unassigned</option>
      {personas.filter((p) => p.active).map((p) => (
        <option key={p.id} value={p.label}>{p.label}</option>
      ))}
    </select>
  );
}

function TopicSelect({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      <option value="">No topic</option>
      {TOPIC_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
    </select>
  );
}

export function BuyerPromptsCard({
  prompts, personas, canManage, busy, pending, onGen, onRun, runLabel, runDisabled, onAdd, onEdit, onDelete, onToggle,
}: {
  prompts: PromptRow[];
  personas: PersonaRow[];
  canManage: boolean;
  busy: "run" | "gen" | null;
  pending: boolean;
  onGen: () => void;
  /** Omit when the caller has its own Run action elsewhere (e.g. the run-test
   *  modal's own footer button) - the card then shows Regenerate + Add only. */
  onRun?: () => void;
  runLabel?: string;
  runDisabled?: boolean;
  onAdd: (fields: PromptFields) => Promise<ActionResult>;
  onEdit: (promptId: string, fields: PromptFields) => Promise<ActionResult>;
  onDelete: (promptId: string) => Promise<ActionResult>;
  onToggle: (promptId: string, active: boolean) => Promise<ActionResult>;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [addFields, setAddFields] = useState<PromptFields>({ text: "", persona: "", topic: "" });
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<PromptFields>({ text: "", persona: "", topic: "" });
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [toggleBusyId, setToggleBusyId] = useState<string | null>(null);

  const byPersona = new Map<string, PromptRow[]>();
  for (const p of prompts) {
    const k = p.persona || "Other";
    byPersona.set(k, [...(byPersona.get(k) ?? []), p]);
  }

  const submitAdd = async () => {
    const text = addFields.text.trim();
    if (!text || addBusy) return;
    setAddBusy(true);
    setAddError(null);
    const r = await onAdd({ ...addFields, text });
    setAddBusy(false);
    if (r.ok) { setAddFields({ text: "", persona: "", topic: "" }); setAddOpen(false); }
    else setAddError(r.error ?? "Could not add that question.");
  };

  const startEdit = (p: PromptRow) => {
    setEditingId(p.id);
    setEditFields({ text: p.text, persona: p.persona ?? "", topic: p.topic ?? "" });
    setEditError(null);
  };
  const submitEdit = async () => {
    const text = editFields.text.trim();
    if (!text || !editingId || editBusy) return;
    setEditBusy(true);
    setEditError(null);
    const r = await onEdit(editingId, { ...editFields, text });
    setEditBusy(false);
    if (r.ok) setEditingId(null);
    else setEditError(r.error ?? "Could not save that edit.");
  };

  const confirmDelete = async (promptId: string) => {
    if (deleteBusy) return;
    setDeleteBusy(true);
    const r = await onDelete(promptId);
    setDeleteBusy(false);
    if (r.ok) setDeletingId(null);
    else toast.error(r.error ?? "Could not delete that prompt.");
  };

  const flipToggle = async (p: PromptRow) => {
    if (toggleBusyId) return;
    setToggleBusyId(p.id);
    const r = await onToggle(p.id, !p.active);
    setToggleBusyId(null);
    if (!r.ok) toast.error(r.error ?? "Could not update that prompt.");
  };

  const activeCount = prompts.filter((p) => p.active).length;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(20,20,40,0.04)]">
      <div className="mb-1.5 flex items-center gap-2.5">
        <span className="text-[15.5px] font-bold text-foreground">Your buyer prompts</span>
        <span className="rounded-full bg-ember-50 px-2.5 py-0.5 text-xs font-bold text-ember-600 dark:bg-ember-950/40 dark:text-ember-400">{prompts.length}</span>
      </div>
      <p className="mb-4 max-w-prose text-[13px] leading-relaxed text-muted-foreground">
        Real, human-sounding questions across personas and topics. We run these across every configured AI engine, sampled for a confidence band.
      </p>
      {canManage && (
        <div className="mb-4 flex flex-wrap gap-2.5">
          <Button variant="outline" size="sm" disabled={pending} onClick={onGen} className="gap-1.5">
            {busy === "gen" ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
            {prompts.length ? "Regenerate" : "Generate prompts"}
          </Button>
          {onRun && (
            <Button variant="brand" size="sm" disabled={pending || activeCount === 0 || runDisabled} onClick={onRun} className="gap-1.5">
              {busy === "run" ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
              {runLabel}
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={pending} onClick={() => setAddOpen((v) => !v)} className="gap-1.5">
            <Plus className="size-3.5" /> Add prompt
          </Button>
        </div>
      )}

      {canManage && addOpen && (
        <div className="mb-4 space-y-2 rounded-xl border border-border bg-muted/30 p-3">
          <Input
            value={addFields.text}
            onChange={(e) => setAddFields((f) => ({ ...f, text: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitAdd(); } }}
            placeholder="Type a question to ask exactly as worded, e.g. best employee monitoring software for remote teams"
            maxLength={300}
            className="text-sm"
            autoFocus
          />
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted-foreground" htmlFor="add-persona">Persona</label>
            <PersonaSelect id="add-persona" value={addFields.persona} onChange={(v) => setAddFields((f) => ({ ...f, persona: v }))} personas={personas} />
            <label className="text-xs text-muted-foreground" htmlFor="add-topic">Topic</label>
            <TopicSelect id="add-topic" value={addFields.topic} onChange={(v) => setAddFields((f) => ({ ...f, topic: v }))} />
            <div className="ml-auto flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => { setAddOpen(false); setAddError(null); }}>Cancel</Button>
              <Button type="button" variant="brand" size="sm" disabled={addBusy || !addFields.text.trim()} onClick={submitAdd} className="gap-1.5">
                {addBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Add
              </Button>
            </div>
          </div>
          {addError && <p className="text-xs text-error-600">{addError}</p>}
        </div>
      )}

      {!prompts.length && <p className="text-sm text-muted-foreground">No prompts yet. Generate a set or add one above.</p>}
      <div className="space-y-3">
        {[...byPersona.entries()].map(([persona, list]) => (
          <div key={persona} className="rounded-xl border border-slate-150 bg-slate-50 p-4 dark:border-border dark:bg-muted/30">
            <div className="mb-3 text-[13px] font-bold text-foreground">{persona}</div>
            <ul className="divide-y divide-border/60">
              {list.map((p) => (
                <li key={p.id} className="py-3 first:pt-0 last:pb-0">
                  {editingId === p.id ? (
                    <div className="space-y-2 rounded-lg border border-primary/30 bg-background p-2.5">
                      <Input
                        value={editFields.text}
                        onChange={(e) => setEditFields((f) => ({ ...f, text: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitEdit(); } if (e.key === "Escape") setEditingId(null); }}
                        maxLength={300}
                        className="text-sm"
                        autoFocus
                      />
                      <p className="text-xs text-muted-foreground">Editing changes future checks only. Past answers keep the wording that was asked.</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-xs text-muted-foreground" htmlFor={`edit-persona-${p.id}`}>Persona</label>
                        <PersonaSelect id={`edit-persona-${p.id}`} value={editFields.persona} onChange={(v) => setEditFields((f) => ({ ...f, persona: v }))} personas={personas} />
                        <label className="text-xs text-muted-foreground" htmlFor={`edit-topic-${p.id}`}>Topic</label>
                        <TopicSelect id={`edit-topic-${p.id}`} value={editFields.topic} onChange={(v) => setEditFields((f) => ({ ...f, topic: v }))} />
                        <div className="ml-auto flex items-center gap-1.5">
                          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setEditingId(null)} title="Cancel"><X className="size-3.5" /></Button>
                          <Button type="button" variant="brand" size="icon-sm" disabled={editBusy || !editFields.text.trim()} onClick={submitEdit} title="Save">
                            {editBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                          </Button>
                        </div>
                      </div>
                      {editError && <p className="text-xs text-error-600">{editError}</p>}
                    </div>
                  ) : deletingId === p.id ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-error-300/60 bg-error-500/5 p-2.5">
                      <span className="text-[13px] text-error-700 dark:text-error-400">
                        Delete this prompt? Any AI answers already recorded for it will be deleted too — this can&apos;t be undone. To keep the history but stop running it, use the on/off toggle instead.
                      </span>
                      <div className="ml-auto flex shrink-0 items-center gap-1.5">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setDeletingId(null)} disabled={deleteBusy}>Cancel</Button>
                        <Button type="button" variant="destructive" size="sm" onClick={() => confirmDelete(p.id)} disabled={deleteBusy} className="gap-1.5">
                          {deleteBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Delete
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className={cn("flex items-start justify-between gap-2.5 text-sm", !p.active && "opacity-50")}>
                      <div className="min-w-0 space-y-1.5">
                        <span className="block text-[13px] leading-relaxed text-foreground">
                          {p.text}
                          {!p.active && <span className="ml-1.5 text-[11px] font-medium text-warning-600 dark:text-warning-400">(off)</span>}
                        </span>
                        {(p.topic || p.demand) && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {p.topic && (
                              <span className="inline-flex shrink-0 items-center rounded-full bg-muted px-2.5 py-1 text-[11.5px] font-semibold text-muted-foreground">{p.topic}</span>
                            )}
                            {p.demand && (
                              <span className={cn("inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11.5px] font-semibold capitalize", DEMAND_TONE[p.demand] ?? "border-border text-muted-foreground")} title="Estimated demand (directional)">
                                {p.demand}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      {canManage && (
                        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                          <Switch
                            checked={p.active}
                            onCheckedChange={() => flipToggle(p)}
                            disabled={toggleBusyId === p.id}
                            size="sm"
                            title={p.active ? "Turn off (won't run, keeps history)" : "Turn back on"}
                          />
                          <button
                            type="button"
                            onClick={() => startEdit(p)}
                            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                            title="Edit this question"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingId(p.id)}
                            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-error-500/10 hover:text-error-600 cursor-pointer"
                            title="Delete this question"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
