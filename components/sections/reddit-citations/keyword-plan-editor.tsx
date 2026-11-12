"use client";

// Reddit Citations: the month's keyword plan handed to Leena. Setting the link
// credits the "Keyword plan to Leena (Reddit citations)" target (best-effort).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Loader2, ExternalLink, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toExternalUrl } from "@/lib/url";
import { setClusterKeywordPlan } from "@/lib/actions/reddit-citations";

export function KeywordPlanEditor({ clusterId, url }: { clusterId: string; url: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(url ?? "");
  const [busy, setBusy] = useState(false);
  const live = toExternalUrl(url);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await setClusterKeywordPlan({ cluster_id: clusterId, url: value.trim() || undefined });
      if (!r.ok) { toast.error(r.error ?? "Could not save that."); return; }
      toast.success("Keyword plan saved."); setEditing(false); router.refresh();
    } finally { setBusy(false); }
  };

  if (!editing) {
    return (
      <div className="inline-flex items-center gap-1.5 text-[12.5px]">
        <FileText className="size-3.5 text-muted-foreground" />
        {live ? (
          <a href={live} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#5B45E0] hover:underline dark:text-[#7B62FF]">Keyword plan <ExternalLink className="size-3" /></a>
        ) : <span className="text-muted-foreground">No keyword plan yet</span>}
        <button type="button" onClick={() => setEditing(true)} className="rounded p-0.5 text-muted-foreground hover:text-foreground" title="Edit"><Pencil className="size-3" /></button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Keyword plan doc link" className="h-7 w-64 text-[12.5px]"
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }} />
      <Button size="sm" variant="brand" className="h-7 px-2 text-xs" onClick={save} disabled={busy}>{busy ? <Loader2 className="size-3 animate-spin" /> : "Save"}</Button>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setEditing(false); setValue(url ?? ""); }} disabled={busy}>Cancel</Button>
    </div>
  );
}
