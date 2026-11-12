"use client";

// Reddit Citations detail: the prompt/thread table. A member adds rows (each
// credits their "Reddit citations" target); Leena marks a row published (credits
// her "Publish Reddit citations" target). Prompt | Source | Reddit link |
// Examples | Owner | Published.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Loader2, ExternalLink, Pencil, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toExternalUrl } from "@/lib/url";
import {
  addRedditCitation, updateRedditCitation, deleteRedditCitation, setCitationPublished,
} from "@/lib/actions/reddit-citations";
import type { RedditCitationRow } from "@/lib/data/reddit-citations";

type Member = { id: string; name: string };
const SOURCES = ["AIO", "AI Mode", "ChatGPT", "Perplexity", "Gemini", "Copilot"];

interface Draft { prompt: string; source: string; reddit_link: string; example: string; owner_id: string }
const emptyDraft = (ownerId: string): Draft => ({ prompt: "", source: "", reddit_link: "", example: "", owner_id: ownerId });

export function CitationTable({ clusterId, items, members, currentUserId, canManage }: {
  clusterId: string; items: RedditCitationRow[]; members: Member[]; currentUserId: string; canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<RedditCitationRow | "new" | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="brand" className="gap-1.5" onClick={() => setEditing("new")}>
          <Plus className="size-3.5" /> Add citation
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2.5 font-semibold">Prompt</th>
              <th className="px-3 py-2.5 font-semibold">Source</th>
              <th className="px-3 py-2.5 font-semibold">Reddit link</th>
              <th className="px-3 py-2.5 font-semibold">Comment Content</th>
              <th className="px-3 py-2.5 font-semibold">Owner</th>
              <th className="px-3 py-2.5 font-semibold">Published</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-[13px] text-muted-foreground">No citations yet. Add the first one.</td></tr>
            )}
            {items.map((r) => {
              const link = toExternalUrl(r.redditLink);
              return (
                <tr key={r.id} className="border-b border-border/60 align-top last:border-0 hover:bg-muted/20">
                  <td className="max-w-[220px] px-3 py-2.5 font-medium text-foreground">{r.prompt}</td>
                  <td className="px-3 py-2.5 text-[12.5px] text-muted-foreground">{r.source || "—"}</td>
                  <td className="max-w-[200px] px-3 py-2.5">
                    {link ? (
                      <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 truncate text-[12.5px] text-[#5B45E0] hover:underline dark:text-[#7B62FF]">
                        <span className="truncate">{link.replace(/^https?:\/\/(www\.)?reddit\.com/i, "reddit.com")}</span><ExternalLink className="size-3 shrink-0" />
                      </a>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="max-w-[320px] px-3 py-2.5">
                    <div className="line-clamp-3 whitespace-pre-wrap text-[12.5px] text-muted-foreground" title={r.example ?? ""}>{r.example || "—"}</div>
                  </td>
                  <td className="px-3 py-2.5 text-[12.5px] text-muted-foreground">{r.ownerName ?? "—"}</td>
                  <td className="px-3 py-2.5"><PublishCell row={r} /></td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={() => setEditing(r)} title="Edit" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="size-3.5" /></button>
                      {canManage && <DeleteButton itemId={r.id} onDone={() => router.refresh()} />}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <CitationDialog
          clusterId={clusterId}
          row={editing === "new" ? null : editing}
          members={members}
          currentUserId={currentUserId}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function DeleteButton({ itemId, onDone }: { itemId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const del = async () => {
    if (busy || !confirm("Remove this citation?")) return;
    setBusy(true);
    try {
      const r = await deleteRedditCitation({ item_id: itemId });
      if (!r.ok) { toast.error(r.error ?? "Could not remove that."); return; }
      toast.success("Removed."); onDone();
    } finally { setBusy(false); }
  };
  return (
    <button type="button" onClick={del} disabled={busy} title="Remove" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-error-600">
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
    </button>
  );
}

// Leena flips this Yes/No. Yes logs the "Publish Reddit citations" target
// (done toward 15); No removes that log.
function PublishCell({ row }: { row: RedditCitationRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const set = async (published: boolean) => {
    if (busy || published === row.published) return;
    setBusy(true);
    try {
      const r = await setCitationPublished({ item_id: row.id, published });
      if (!r.ok) { toast.error(r.error ?? "Could not update that."); return; }
      router.refresh();
    } finally { setBusy(false); }
  };

  return (
    <div className="inline-flex overflow-hidden rounded-md border border-border text-xs">
      <button type="button" onClick={() => set(true)} disabled={busy}
        className={cn("px-2.5 py-1 transition-colors", row.published ? "bg-success-500/15 font-medium text-success-700 dark:text-success-400" : "text-muted-foreground hover:bg-muted")}>
        {busy && row.published ? <Loader2 className="size-3 animate-spin" /> : "Yes"}
      </button>
      <button type="button" onClick={() => set(false)} disabled={busy}
        className={cn("border-l border-border px-2.5 py-1 transition-colors", !row.published ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted")}>
        {busy && !row.published ? <Loader2 className="size-3 animate-spin" /> : "No"}
      </button>
    </div>
  );
}

function CitationDialog({ clusterId, row, members, currentUserId, onClose }: {
  clusterId: string; row: RedditCitationRow | null; members: Member[]; currentUserId: string; onClose: () => void;
}) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(row
    ? { prompt: row.prompt, source: row.source ?? "", reddit_link: row.redditLink ?? "", example: row.example ?? "", owner_id: row.ownerId ?? currentUserId }
    : emptyDraft(currentUserId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof Draft, v: string) => setD((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (busy || !d.prompt.trim()) { setError("Enter the prompt."); return; }
    setBusy(true); setError(null);
    try {
      const common = { prompt: d.prompt.trim(), source: d.source.trim() || undefined, reddit_link: d.reddit_link.trim() || undefined, example: d.example.trim() || undefined, owner_id: d.owner_id || undefined };
      const r = row
        ? await updateRedditCitation({ item_id: row.id, ...common })
        : await addRedditCitation({ cluster_id: clusterId, ...common });
      if (!r.ok) { setError(r.error ?? "Could not save that."); return; }
      toast.success(row ? "Saved." : "Citation added.");
      onClose(); router.refresh();
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{row ? "Edit citation" : "Add citation"}</DialogTitle>
          <DialogDescription>The prompt, where the AI answer came from, the Reddit thread, and the example comment.</DialogDescription>
        </DialogHeader>
        <datalist id="rc-sources">{SOURCES.map((s) => <option key={s} value={s} />)}</datalist>
        <div className="space-y-3">
          <Field label="Prompt">
            <Input value={d.prompt} onChange={(e) => set("prompt", e.target.value)} placeholder="e.g. Reddit Alternatives" maxLength={500} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Source">
              <Input list="rc-sources" value={d.source} onChange={(e) => set("source", e.target.value)} placeholder="AIO" maxLength={120} />
            </Field>
            <Field label="Owner">
              <Combobox
                items={members.map((m) => ({ value: m.id, label: m.name }))}
                value={d.owner_id}
                onValueChange={(v) => set("owner_id", v)}
                className="w-full"
              />
            </Field>
          </div>
          <Field label="Reddit link">
            <Input value={d.reddit_link} onChange={(e) => set("reddit_link", e.target.value)} placeholder="https://www.reddit.com/r/..." maxLength={2000} />
          </Field>
          <Field label="Comment Content">
            <textarea value={d.example} onChange={(e) => set("example", e.target.value)}
              placeholder="The comment to post on the Reddit thread, or a status note (e.g. removed by a Reddit filter)."
              className="h-32 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-[13px] leading-relaxed outline-none focus:border-primary/40" maxLength={8000} />
          </Field>
          {error && <p className="text-xs text-error-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="brand" onClick={submit} disabled={busy || !d.prompt.trim()} className="gap-1.5">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} {row ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
