"use client";

// Calculator / Tool section in the guide/blog drawer. A tool is reusable: the
// dialog lets you attach one that already exists in the project's library or
// create a new one (free-text spec + an uploaded HTML bundle .zip). The .zip
// uploads straight to private Storage from the browser; the server action only
// records its path. Editing a tool changes it on every post it's linked to.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Calculator, Download, ExternalLink, FileArchive, Loader2, Pencil, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { toExternalUrl } from "@/lib/url";
import { TOOL_BUNDLE_BUCKET, TOOL_BUNDLE_MAX_BYTES, MAX_TOOLS_PER_ITEM, EMPTY_TOOL_SPEC, type ContentTool, type ContentToolSpec } from "@/lib/content-pipeline/tool";
import { listContentTools, createContentTool, updateContentTool, attachToolToItem, detachToolFromItem, signBundleUrl } from "@/lib/actions/content-tools";

async function download(path: string) {
  const url = await signBundleUrl(path);
  if (!url) { toast.error("Couldn't get the download link."); return; }
  window.open(url, "_blank", "noopener,noreferrer");
}

function SpecLine({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[72px_1fr] gap-2 text-[12.5px]">
      <div className="pt-px text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="min-w-0 whitespace-pre-wrap break-words text-foreground">{value}</div>
    </div>
  );
}

export function ToolEditor({ projectId, itemId, tools }: { projectId: string; itemId: string; tools: ContentTool[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ContentTool | null>(null); // edit this tool's spec vs. add/attach
  const [busyId, setBusyId] = useState<string | null>(null);

  const atCap = tools.length >= MAX_TOOLS_PER_ITEM;
  const openAdd = () => { setEditing(null); setOpen(true); };
  const openEdit = (tool: ContentTool) => { setEditing(tool); setOpen(true); };

  const remove = async (tool: ContentTool) => {
    if (busyId) return;
    setBusyId(tool.id);
    try {
      const r = await detachToolFromItem({ item_id: itemId, tool_id: tool.id });
      if (!r.ok) { toast.error(r.error ?? "Could not remove the tool."); return; }
      toast.success("Calculator removed from this post. The tool is still in your library.");
      router.refresh();
    } catch { toast.error("Something went wrong. Try again."); }
    finally { setBusyId(null); }
  };

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
          <Calculator className="size-3.5" /> Calculators
          {tools.length > 0 && <span className="text-muted-foreground/70">({tools.length}/{MAX_TOOLS_PER_ITEM})</span>}
        </div>
        {!atCap && <button type="button" onClick={openAdd} className="text-[11px] font-medium text-[#5B45E0] hover:underline dark:text-[#7B62FF]">Add</button>}
      </div>

      {tools.length > 0 ? (
        <div className="space-y-2.5">
          {tools.map((tool) => (
            <div key={tool.id} className="space-y-2 rounded-md border border-border/70 p-2.5">
              <div className="text-[13px] font-medium text-foreground">{tool.name}</div>
              <div className="space-y-1.5">
                <SpecLine label="Content" value={tool.content} />
                <SpecLine label="Inputs" value={tool.inputs} />
                <SpecLine label="Output" value={tool.output} />
                <SpecLine label="Formula" value={tool.formula} />
              </div>
              <div className="flex flex-wrap items-center gap-3 pt-0.5 text-[12.5px]">
                {tool.bundlePath && (
                  <button type="button" onClick={() => download(tool.bundlePath!)} className="inline-flex items-center gap-1.5 text-foreground hover:underline">
                    <FileArchive className="size-3.5 text-muted-foreground" /> <span className="truncate max-w-[200px]">{tool.bundleName ?? "HTML bundle"}</span> <Download className="size-3 text-muted-foreground" />
                  </button>
                )}
                {toExternalUrl(tool.embedUrl) && (
                  <a href={toExternalUrl(tool.embedUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-foreground hover:underline">
                    <ExternalLink className="size-3.5 text-muted-foreground" /> External
                  </a>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button type="button" size="sm" variant="outline" onClick={() => openEdit(tool)} className="h-7 gap-1.5 text-xs"><Pencil className="size-3" /> Edit</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => remove(tool)} disabled={busyId === tool.id} className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-error-600">{busyId === tool.id ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />} Remove</Button>
              </div>
            </div>
          ))}
          {atCap && <p className="text-[11.5px] text-muted-foreground">Up to {MAX_TOOLS_PER_ITEM} calculators per post — remove one to add another.</p>}
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">No calculator yet. Attach an existing tool or create a new one with its inputs, output, formula and HTML bundle.</p>
      )}

      {open && (
        <ToolDialog
          projectId={projectId} itemId={itemId} editing={editing} attachedIds={tools.map((t) => t.id)}
          onClose={() => setOpen(false)}
          onDone={() => { setOpen(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

function ToolDialog({ projectId, itemId, editing, attachedIds, onClose, onDone }: {
  projectId: string; itemId: string; editing: ContentTool | null; attachedIds: string[]; onClose: () => void; onDone: () => void;
}) {
  const isEdit = !!editing;
  const [tab, setTab] = useState<"existing" | "new">(isEdit ? "new" : "existing");

  // --- "Use existing" state --- (loading is simply "tools not fetched yet").
  // Tools already on this post are filtered out so the picker only offers new ones.
  const [tools, setTools] = useState<ContentTool[] | null>(null);
  const [attaching, setAttaching] = useState(false);

  // Fetch the project's tool library once when the add dialog opens. Skipped in
  // edit mode (no picker there). setState lives only in the async callback.
  useEffect(() => {
    if (isEdit) return;
    let cancelled = false;
    listContentTools(projectId).then((r) => {
      if (cancelled) return;
      if (!r.ok) toast.error(r.error ?? "Could not load tools.");
      setTools(r.tools.filter((t) => !attachedIds.includes(t.id)));
    });
    return () => { cancelled = true; };
  }, [isEdit, projectId, attachedIds]);

  const attach = async (toolId: string) => {
    if (attaching) return;
    setAttaching(true);
    try {
      const r = await attachToolToItem({ item_id: itemId, tool_id: toolId });
      if (!r.ok) { toast.error(r.error ?? "Could not attach the tool."); return; }
      toast.success("Calculator attached.");
      onDone();
    } catch { toast.error("Something went wrong. Try again."); }
    finally { setAttaching(false); }
  };

  // --- "Create new" / edit state ---
  const [spec, setSpec] = useState<ContentToolSpec>(editing
    ? { name: editing.name, content: editing.content ?? "", inputs: editing.inputs ?? "", output: editing.output ?? "", formula: editing.formula ?? "", embedUrl: editing.embedUrl ?? "" }
    : EMPTY_TOOL_SPEC);
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof ContentToolSpec, v: string) => setSpec((s) => ({ ...s, [k]: v }));

  const pickFile = (f: File | null) => {
    if (!f) { setFile(null); return; }
    if (!/\.zip$/i.test(f.name)) { toast.error("Upload a .zip bundle."); return; }
    if (f.size > TOOL_BUNDLE_MAX_BYTES) { toast.error("That .zip is larger than 10MB."); return; }
    setFile(f);
  };

  const uploadBundle = async (): Promise<{ path: string; name: string } | null | "error"> => {
    if (!file) return null;
    const supabase = createClient();
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const path = `${projectId}/${crypto.randomUUID()}-${safe}`;
    const { error } = await supabase.storage.from(TOOL_BUNDLE_BUCKET).upload(path, file, { upsert: false, contentType: file.type || "application/zip" });
    if (error) { toast.error(`Bundle upload failed: ${error.message}`); return "error"; }
    return { path, name: file.name };
  };

  const save = async () => {
    if (saving) return;
    if (!spec.name.trim()) { toast.error("Give the tool a name."); return; }
    setSaving(true);
    try {
      const uploaded = await uploadBundle();
      if (uploaded === "error") return;
      const bundle = uploaded ? { bundle_path: uploaded.path, bundle_name: uploaded.name } : {};
      const base = { name: spec.name, content: spec.content, inputs: spec.inputs, output: spec.output, formula: spec.formula, embed_url: spec.embedUrl };

      if (isEdit && editing) {
        const r = await updateContentTool({ tool_id: editing.id, project_id: projectId, ...base, ...bundle });
        if (!r.ok) { toast.error(r.error ?? "Could not save the tool."); return; }
        toast.success("Tool updated.");
      } else {
        const r = await createContentTool({ project_id: projectId, item_id: itemId, ...base, ...bundle });
        if (!r.ok) { toast.error(r.error ?? "Could not create the tool."); return; }
        toast.success("Calculator created and attached.");
      }
      onDone();
    } catch { toast.error("Something went wrong. Try again."); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !saving && !attaching) onClose(); }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit calculator" : "Add a calculator"}</DialogTitle>
          <DialogDescription>{isEdit ? "Changes apply everywhere this tool is used." : "Reuse a tool from your library, or create a new one."}</DialogDescription>
        </DialogHeader>

        {isEdit ? (
          <ToolForm spec={spec} set={set} file={file} pickFile={pickFile} fileRef={fileRef} currentBundle={editing?.bundleName ?? null} />
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as "existing" | "new")}>
            <TabsList className="w-full">
              <TabsTrigger value="existing" className="flex-1">Use existing</TabsTrigger>
              <TabsTrigger value="new" className="flex-1">Create new</TabsTrigger>
            </TabsList>
            <TabsContent value="existing" className="mt-3">
              {tools === null ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="size-4 animate-spin" /></div>
              ) : tools.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-muted-foreground">No other tools to add. Switch to <strong>Create new</strong>.</p>
              ) : (
                <div className="max-h-[320px] space-y-1.5 overflow-y-auto">
                  {tools.map((t) => (
                    <button key={t.id} type="button" disabled={attaching} onClick={() => attach(t.id)}
                      className="flex w-full items-start gap-2 rounded-lg border border-border p-2.5 text-left transition-colors hover:border-[#5B45E0]/40 hover:bg-[#5B45E0]/5 disabled:opacity-60">
                      <Calculator className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium text-foreground">{t.name}</div>
                        <div className="truncate text-[11.5px] text-muted-foreground">
                          {[t.output && `Output: ${t.output}`, t.bundlePath && "has bundle"].filter(Boolean).join(" · ") || "No spec yet"}
                        </div>
                      </div>
                      {attaching && <Loader2 className="ml-auto size-3.5 animate-spin text-muted-foreground" />}
                    </button>
                  ))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="new" className="mt-3">
              <ToolForm spec={spec} set={set} file={file} pickFile={pickFile} fileRef={fileRef} currentBundle={null} />
            </TabsContent>
          </Tabs>
        )}

        {(isEdit || tab === "new") && (
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="button" variant="brand" onClick={save} disabled={saving} className="gap-1.5">{saving && <Loader2 className="size-3.5 animate-spin" />} {isEdit ? "Save changes" : "Create & attach"}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ToolForm({ spec, set, file, pickFile, fileRef, currentBundle }: {
  spec: ContentToolSpec; set: (k: keyof ContentToolSpec, v: string) => void;
  file: File | null; pickFile: (f: File | null) => void; fileRef: React.RefObject<HTMLInputElement | null>; currentBundle: string | null;
}) {
  return (
    <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-0.5">
      <Field label="Tool name" required>
        <Input value={spec.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Employee Turnover Rate Calculator" className="h-9 text-[13px]" />
      </Field>
      <Field label="Content in the tool">
        <Textarea value={spec.content} onChange={(e) => set("content", e.target.value)} placeholder="Intro / explainer copy shown inside the calculator." rows={2} className="text-[13px]" />
      </Field>
      <Field label="Input(s)">
        <Textarea value={spec.inputs} onChange={(e) => set("inputs", e.target.value)} placeholder="One per line, e.g.&#10;Employees who left&#10;Average headcount" rows={2} className="text-[13px]" />
      </Field>
      <Field label="Output(s)">
        <Textarea value={spec.output} onChange={(e) => set("output", e.target.value)} placeholder="e.g. Turnover rate (%)" rows={2} className="text-[13px]" />
      </Field>
      <Field label="Formula used">
        <Textarea value={spec.formula} onChange={(e) => set("formula", e.target.value)} placeholder="e.g. (Employees who left / Average headcount) × 100" rows={2} className="text-[13px]" />
      </Field>
      <Field label="HTML bundle (.zip)">
        <input ref={fileRef} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} className="h-8 gap-1.5 text-xs"><Upload className="size-3.5" /> {file ? "Change file" : "Choose .zip"}</Button>
          <span className="truncate text-[12px] text-muted-foreground">
            {file ? file.name : currentBundle ? `Current: ${currentBundle}` : "No file chosen · max 10MB"}
          </span>
        </div>
      </Field>
      <Field label="External URL (optional)">
        <Input value={spec.embedUrl} onChange={(e) => set("embedUrl", e.target.value)} placeholder="If the calculator is hosted elsewhere" className="h-9 text-[13px]" />
      </Field>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}{required && <span className="text-error-600"> *</span>}</Label>
      {children}
    </div>
  );
}
