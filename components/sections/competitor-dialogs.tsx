"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Loader2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createCompetitor, deleteCompetitor } from "@/lib/actions/competitors";

export function NewCompetitorDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [da, setDa] = useState("");
  const [traffic, setTraffic] = useState("");
  const [notes, setNotes] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      try {
        await createCompetitor({
          project_id: projectId,
          name: name.trim(),
          url: url.trim(),
          da: da ? parseInt(da, 10) : null,
          traffic: traffic ? parseInt(traffic, 10) : null,
          notes: notes.trim() || null,
        });
        toast.success(`Added ${name} — running auto-analysis in background`);
        setOpen(false);
        setName(""); setUrl(""); setDa(""); setTraffic(""); setNotes("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to add competitor");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button><Plus className="size-4" />Add competitor</Button>} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add competitor</DialogTitle>
          <DialogDescription>
            On save, we run our 8 SEO skills on their homepage + pull their top keywords via Apify.
            You&apos;ll see a &ldquo;we can beat them at X&rdquo; analysis in ~30s.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="c-name">
              Name <span className="text-rose-600">*</span>
            </Label>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Thrillophilia" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-url">
              URL <span className="text-rose-600">*</span>
            </Label>
            <Input id="c-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://thrillophilia.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-da" className="text-xs">DA (optional)</Label>
              <Input id="c-da" type="number" min="0" max="100" value={da} onChange={(e) => setDa(e.target.value)} placeholder="72" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-traffic" className="text-xs">Monthly traffic (optional)</Label>
              <Input id="c-traffic" type="number" min="0" value={traffic} onChange={(e) => setTraffic(e.target.value)} placeholder="2800000" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-notes" className="text-xs">Notes (optional)</Label>
            <Textarea id="c-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Known strengths, positioning, things to watch..." />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending || !name.trim() || !url.trim()}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Add & analyze
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteCompetitorButton({ competitorId, name }: { competitorId: string; name: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, start] = useTransition();

  const del = () => {
    start(async () => {
      try {
        await deleteCompetitor(competitorId);
        toast.success(`Removed ${name}`);
        setConfirmOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
      }
    });
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={(e) => { e.stopPropagation(); setConfirmOpen(true); }}
        aria-label="Delete competitor"
        title="Delete competitor"
        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
      >
        <Trash2 className="size-3.5" />
      </Button>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                <Trash2 className="size-4" />
              </div>
              Remove {name}?
            </DialogTitle>
            <DialogDescription>
              Deletes this competitor and its analysis from the project. You can re-add them any time.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={pending}>Cancel</Button>
            <Button onClick={del} disabled={pending} className="bg-rose-600 hover:bg-rose-700 text-white">
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
