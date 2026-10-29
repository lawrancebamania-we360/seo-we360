"use client";

// Edit a calculator (and upload/replace its .zip bundle) from outside the cluster
// drawer — e.g. the To Publish › Calculators view. Same spec form + browser→
// Storage bundle upload as the drawer's editor; a tool is shared, so a save here
// changes it on every post it's linked to.

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { TOOL_BUNDLE_BUCKET, TOOL_BUNDLE_MAX_BYTES, type ContentTool, type ContentToolSpec } from "@/lib/content-pipeline/tool";
import { updateContentTool } from "@/lib/actions/content-tools";
import { ToolForm } from "@/components/sections/content-pipeline/tool-editor";

export function ToolEditDialog({ projectId, tool, onClose, onDone }: {
  projectId: string; tool: ContentTool; onClose: () => void; onDone: () => void;
}) {
  // Seeded once from the tool prop — the dialog is mounted fresh per edit, so no
  // re-seed effect is needed (which keeps react-hooks/set-state-in-effect happy).
  const [spec, setSpec] = useState<ContentToolSpec>({
    name: tool.name, content: tool.content ?? "", inputs: tool.inputs ?? "",
    output: tool.output ?? "", formula: tool.formula ?? "", embedUrl: tool.embedUrl ?? "",
  });
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

  const save = async () => {
    if (saving) return;
    if (!spec.name.trim()) { toast.error("Give the tool a name."); return; }
    setSaving(true);
    try {
      // A new .zip (if chosen) goes straight to private Storage from the browser;
      // the action only records its path. No file = keep the current bundle.
      let bundle: { bundle_path: string; bundle_name: string } | undefined;
      if (file) {
        const supabase = createClient();
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
        const path = `${projectId}/${crypto.randomUUID()}-${safe}`;
        const { error } = await supabase.storage.from(TOOL_BUNDLE_BUCKET).upload(path, file, { upsert: false, contentType: file.type || "application/zip" });
        if (error) { toast.error(`Bundle upload failed: ${error.message}`); return; }
        bundle = { bundle_path: path, bundle_name: file.name };
      }
      const r = await updateContentTool({
        tool_id: tool.id, project_id: projectId,
        name: spec.name, content: spec.content, inputs: spec.inputs, output: spec.output, formula: spec.formula, embed_url: spec.embedUrl,
        ...(bundle ?? {}),
      });
      if (!r.ok) { toast.error(r.error ?? "Could not save the tool."); return; }
      toast.success("Calculator updated.");
      onDone();
    } catch { toast.error("Something went wrong. Try again."); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Edit calculator</DialogTitle>
          <DialogDescription>Changes apply everywhere this tool is used. Upload a .zip here if the bundle wasn&apos;t added from the post.</DialogDescription>
        </DialogHeader>
        <ToolForm spec={spec} set={set} file={file} pickFile={pickFile} fileRef={fileRef} currentBundle={tool.bundleName} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" variant="brand" onClick={save} disabled={saving} className="gap-1.5">{saving && <Loader2 className="size-3.5 animate-spin" />} Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
